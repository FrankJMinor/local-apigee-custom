"""Validación, extracción y registro de bundles en el workspace local.

El workspace (``src/main/apigee`` del repositorio) es la *source of truth*: lo que
se escribe aquí es lo que VS Code muestra, lo que versiona Git y lo que se envía
al emulador. Este módulo replica lo que hace la opción "Proxy bundle" del asistente
"Build a Proxy" de Apigee: recibe un ZIP, comprueba que sea un bundle válido, lo
deja en disco con el nombre elegido y lo registra en el ``deployments.json`` del
environment.

Proxies y shared flows solo se diferencian en nombres de carpeta y de etiquetas
XML, así que toda la lógica está parametrizada por :class:`ArtifactKind` en vez de
duplicada. Las funciones públicas aceptan ``kind`` y usan :data:`PROXY` por defecto.
"""

import io
import json
import logging
import os
import posixpath
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)

# Misma restricción que aplica la consola de Apigee al nombre del artefacto.
PROXY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


class ArtifactKind(NamedTuple):
    """Diferencias entre un API proxy y un shared flow dentro del workspace."""

    key: str  # identificador interno
    label: str  # cómo se nombra en los mensajes de error
    dir_name: str  # carpeta bajo src/main/apigee
    bundle_root: str  # carpeta raíz obligatoria dentro del ZIP
    descriptor_tag: str  # etiqueta XML del descriptor raíz
    manifest_key: str  # clave dentro de deployments.json
    flow_dir: str  # subcarpeta con los endpoints o flujos
    flow_tag: str  # etiqueta XML de esos flujos
    ui_action: str  # botón de la UI que da de alta este tipo
    checks_basepaths: bool  # los shared flows no exponen basepath


PROXY = ArtifactKind(
    key="proxy",
    label="proxy",
    dir_name="apiproxies",
    bundle_root="apiproxy",
    descriptor_tag="APIProxy",
    manifest_key="proxies",
    flow_dir="proxies",
    flow_tag="ProxyEndpoint",
    ui_action="+ Nuevo Proxy",
    checks_basepaths=True,
)

SHAREDFLOW = ArtifactKind(
    key="sharedflow",
    label="shared flow",
    dir_name="sharedflows",
    bundle_root="sharedflowbundle",
    descriptor_tag="SharedFlowBundle",
    manifest_key="sharedflows",
    flow_dir="sharedflows",
    flow_tag="SharedFlow",
    ui_action="+ Nuevo Flow",
    checks_basepaths=False,
)


class BundleError(ValueError):
    """El ZIP recibido no es un bundle válido, o la operación no es posible."""


def artifacts_dir(kind: ArtifactKind = PROXY) -> str:
    """Ruta a ``src/main/apigee/<apiproxies|sharedflows>`` dentro del contenedor."""
    return os.path.join(settings.APIGEE_SOURCE_ROOT, "main", "apigee", kind.dir_name)


def proxies_dir() -> str:
    """Atajo histórico para la carpeta de proxies."""
    return artifacts_dir(PROXY)


def deployments_file(environment: Optional[str] = None) -> str:
    """Ruta al manifiesto ``deployments.json`` del environment indicado."""
    env = environment or settings.APIGEE_ENVIRONMENT
    return os.path.join(
        settings.APIGEE_SOURCE_ROOT, "main", "apigee", "environments", env, "deployments.json"
    )


def validate_proxy_name(name: str) -> str:
    """Normaliza y valida el nombre tal como lo hace la consola de Apigee."""
    clean = (name or "").strip()

    if not clean:
        raise BundleError("El nombre es obligatorio.")

    if not PROXY_NAME_PATTERN.match(clean):
        raise BundleError(
            "Nombre inválido. Solo se permiten letras, números, guion (-) y guion bajo (_)."
        )

    return clean


def _safe_member_path(name: str) -> str:
    """Rechaza rutas absolutas o con '..' para evitar zip-slip al extraer."""
    normalized = name.replace("\\", "/").lstrip("/")

    if posixpath.normpath(normalized).startswith(("..", "/")):
        raise BundleError(f"El bundle contiene una ruta no permitida: '{name}'")

    return normalized


def read_bundle(raw_zip: bytes, kind: ArtifactKind = PROXY) -> Dict[str, bytes]:
    """Extrae en memoria el contenido de un bundle, relativo a su carpeta raíz.

    Acepta tanto el formato estándar de Apigee (``apiproxy/...`` o
    ``sharedflowbundle/...`` en la raíz del ZIP) como el que genera comprimir la
    carpeta del artefacto (``MiProxy/apiproxy/...``).

    Args:
        raw_zip: Contenido binario del archivo ZIP subido.
        kind: Tipo de artefacto, que determina la carpeta raíz esperada.

    Returns:
        Dict[str, bytes]: Rutas relativas a la carpeta raíz y su contenido.

    Raises:
        BundleError: Si el archivo no es un ZIP o no tiene la estructura esperada.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw_zip))
    except zipfile.BadZipFile as exc:
        raise BundleError("El archivo enviado no es un ZIP válido.") from exc

    with archive:
        if archive.testzip() is not None:
            raise BundleError("El ZIP está dañado; alguna entrada no se puede leer.")

        # Localizamos el prefijo que antecede a la carpeta raíz del bundle.
        prefix = None
        for member in archive.namelist():
            parts = _safe_member_path(member).split("/")
            if kind.bundle_root in parts:
                prefix = "/".join(parts[: parts.index(kind.bundle_root)])
                break

        if prefix is None:
            raise BundleError(
                f"El bundle no contiene una carpeta '{kind.bundle_root}'. "
                f"Un bundle de {kind.label} de Apigee debe tener la estructura "
                f"'{kind.bundle_root}/<Nombre>.xml'."
            )

        base = f"{prefix}/{kind.bundle_root}/" if prefix else f"{kind.bundle_root}/"
        files: Dict[str, bytes] = {}

        for info in archive.infolist():
            if info.is_dir():
                continue

            member = _safe_member_path(info.filename)
            if not member.startswith(base):
                continue

            rel_path = member[len(base) :]
            if rel_path:
                files[rel_path] = archive.read(info)

    if not files:
        raise BundleError(f"La carpeta '{kind.bundle_root}' del bundle está vacía.")

    return files


def _parse_xml(content: bytes) -> Optional[ET.Element]:
    try:
        return ET.fromstring(content)
    except ET.ParseError:
        return None


def describe_bundle(files: Dict[str, bytes], kind: ArtifactKind = PROXY) -> Dict[str, Any]:
    """Extrae los metadatos del bundle: nombre declarado, basepaths y flujos.

    Returns:
        Dict[str, Any]: ``declared_name``, ``descriptor``, ``basepaths``, ``flows``,
        ``targets`` y ``policies``.

    Raises:
        BundleError: Si el bundle no declara ningún flujo o endpoint.
    """
    info: Dict[str, Any] = {
        "declared_name": None,
        "descriptor": None,
        "basepaths": [],
        "flows": [],
        "targets": [],
        "policies": [],
    }

    flow_prefix = f"{kind.flow_dir}/"

    for rel_path, content in files.items():
        # Descriptor raíz: un XML con la etiqueta del tipo, directamente en la raíz.
        if "/" not in rel_path and rel_path.endswith(".xml"):
            root = _parse_xml(content)
            if root is not None and root.tag == kind.descriptor_tag:
                info["descriptor"] = rel_path
                info["declared_name"] = root.get("name") or rel_path[: -len(".xml")]

        elif rel_path.startswith(flow_prefix) and rel_path.endswith(".xml"):
            info["flows"].append(os.path.basename(rel_path)[: -len(".xml")])
            root = _parse_xml(content)
            if root is not None and kind.checks_basepaths:
                base_path = root.findtext("HTTPProxyConnection/BasePath")
                if base_path:
                    info["basepaths"].append(base_path.strip())

        elif rel_path.startswith("targets/") and rel_path.endswith(".xml"):
            info["targets"].append(os.path.basename(rel_path)[: -len(".xml")])

        elif rel_path.startswith("policies/") and rel_path.endswith(".xml"):
            info["policies"].append(os.path.basename(rel_path)[: -len(".xml")])

    if not info["flows"]:
        raise BundleError(
            f"El bundle no define ningún {kind.flow_tag} en "
            f"'{kind.bundle_root}/{kind.flow_dir}/'. Apigee necesita al menos uno "
            f"para poder desplegar el {kind.label}."
        )

    return info


def existing_artifacts(kind: ArtifactKind = PROXY) -> List[str]:
    """Nombres de los artefactos que ya viven en el workspace local."""
    root = artifacts_dir(kind)

    if not os.path.isdir(root):
        return []

    return sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)))


def existing_proxies() -> List[str]:
    """Atajo histórico para los proxies del workspace."""
    return existing_artifacts(PROXY)


def resolve_proxy_name(proxy_name: str, kind: ArtifactKind = PROXY) -> Optional[str]:
    """Busca el artefacto en disco ignorando mayúsculas y devuelve su nombre real.

    El workspace vive en el sistema de archivos del usuario, que en Windows y
    macOS no distingue mayúsculas: 'helloWorld' y 'HelloWorld' son la misma
    carpeta. Comparar los nombres con '==' hace creer que no existe, y a partir
    de ahí cualquier escritura o borrado actúa sobre el artefacto equivocado.
    Toda operación sobre uno existente debe resolverse aquí.

    Returns:
        Optional[str]: Nombre tal como está en disco, o None si no existe.
    """
    lowered = (proxy_name or "").strip().lower()

    for existing in existing_artifacts(kind):
        if existing.lower() == lowered:
            return existing

    return None


def basepaths_in_use(
    exclude: Optional[str] = None, kind: ArtifactKind = PROXY
) -> Dict[str, str]:
    """Mapea cada basepath ya ocupado en el workspace con el proxy que lo declara.

    Apigee rechaza dos proxies con el mismo basepath en un environment; replicamos
    esa validación antes de tocar el disco para no dejar el workspace inconsistente.
    Los shared flows no exponen basepath, así que para ellos no aplica.
    """
    if not kind.checks_basepaths:
        return {}

    in_use: Dict[str, str] = {}
    root = artifacts_dir(kind)

    for proxy in existing_artifacts(kind):
        if exclude and proxy == exclude:
            continue

        endpoints_dir = os.path.join(root, proxy, kind.bundle_root, kind.flow_dir)
        if not os.path.isdir(endpoints_dir):
            continue

        for file_name in os.listdir(endpoints_dir):
            if not file_name.endswith(".xml"):
                continue

            try:
                with open(os.path.join(endpoints_dir, file_name), "rb") as handle:
                    element = _parse_xml(handle.read())
            except OSError as exc:
                logger.warning(f"No se pudo leer el endpoint {proxy}/{file_name}: {exc}")
                continue

            if element is None:
                continue

            base_path = element.findtext("HTTPProxyConnection/BasePath")
            if base_path:
                in_use.setdefault(base_path.strip(), proxy)

    return in_use


def _rename_descriptor(content: bytes, name: str, kind: ArtifactKind) -> bytes:
    """Sustituye el atributo ``name`` del descriptor raíz del bundle."""
    root = _parse_xml(content)

    if root is None or root.tag != kind.descriptor_tag:
        return content

    root.set("name", name)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def write_bundle(
    files: Dict[str, bytes],
    name: str,
    descriptor: Optional[str],
    kind: ArtifactKind = PROXY,
) -> str:
    """Escribe el bundle en el workspace bajo ``<dir_name>/<name>/<bundle_root>``.

    El descriptor raíz se renombra y se reescribe con el nombre elegido en el
    asistente, igual que hace Apigee al importar un bundle con otro nombre.

    Returns:
        str: Ruta absoluta de la carpeta creada.
    """
    target_root = os.path.join(artifacts_dir(kind), name)
    bundle_root = os.path.join(target_root, kind.bundle_root)

    os.makedirs(bundle_root, exist_ok=True)

    for rel_path, content in files.items():
        # El descriptor raíz siempre queda como '<name>.xml'.
        if descriptor and rel_path == descriptor:
            rel_path = f"{name}.xml"
            content = _rename_descriptor(content, name, kind)

        destination = os.path.join(bundle_root, *rel_path.split("/"))
        os.makedirs(os.path.dirname(destination), exist_ok=True)

        with open(destination, "wb") as handle:
            handle.write(content)

    logger.info(f"Bundle '{name}' escrito en {bundle_root} ({len(files)} archivos)")
    return target_root


def remove_bundle(name: str, kind: ArtifactKind = PROXY) -> None:
    """Elimina la carpeta del artefacto del workspace.

    Resuelve el nombre real en disco antes de borrar: un ``rmtree`` sobre un
    nombre que solo difiere en mayúsculas destruiría otro artefacto.
    """
    on_disk = resolve_proxy_name(name, kind)

    if not on_disk:
        return

    target = os.path.join(artifacts_dir(kind), on_disk)
    shutil.rmtree(target, ignore_errors=True)
    logger.info(f"Bundle '{on_disk}' eliminado de {target}")


def backup_bundle(
    name: str, keep_original: bool = False, kind: ArtifactKind = PROXY
) -> Optional[str]:
    """Aparta la versión actual del artefacto para restaurarla si algo falla.

    El workspace está versionado en Git, así que una sobrescritura fallida no
    puede dejar al usuario sin su bundle anterior.

    Args:
        name: Artefacto a respaldar.
        keep_original: Si es True copia en lugar de mover, dejándolo en su sitio.
            Lo usa el guardado desde el editor, que reescribe unos pocos archivos
            sobre el bundle existente en vez de reemplazarlo entero.
        kind: Tipo de artefacto.

    Returns:
        Optional[str]: Ruta del respaldo, o None si el artefacto no existía.
    """
    on_disk = resolve_proxy_name(name, kind)

    if not on_disk:
        return None

    source = os.path.join(artifacts_dir(kind), on_disk)
    backup = tempfile.mkdtemp(prefix=f"apigee-backup-{on_disk}-")
    destination = os.path.join(backup, on_disk)

    if keep_original:
        shutil.copytree(source, destination)
    else:
        shutil.move(source, destination)

    logger.info(f"Respaldo de '{on_disk}' creado en {destination}")
    return destination


def restore_bundle(backup_path: str, name: str, kind: ArtifactKind = PROXY) -> None:
    """Devuelve al workspace el bundle respaldado por :func:`backup_bundle`."""
    if not backup_path or not os.path.isdir(backup_path):
        return

    remove_bundle(name, kind)
    shutil.move(backup_path, os.path.join(artifacts_dir(kind), name))
    shutil.rmtree(os.path.dirname(backup_path), ignore_errors=True)
    logger.info(f"Bundle '{name}' restaurado desde el respaldo")


def discard_backup(backup_path: Optional[str]) -> None:
    """Borra un respaldo que ya no hace falta."""
    if backup_path:
        shutil.rmtree(os.path.dirname(backup_path), ignore_errors=True)


def register_deployment(
    name: str, environment: Optional[str] = None, kind: ArtifactKind = PROXY
) -> bool:
    """Añade el artefacto al ``deployments.json`` del environment si no está.

    Returns:
        bool: True si se modificó el manifiesto, False si ya estaba registrado.
    """
    return _edit_deployments(name, environment, add=True, kind=kind)


def unregister_deployment(
    name: str, environment: Optional[str] = None, kind: ArtifactKind = PROXY
) -> bool:
    """Quita el artefacto del ``deployments.json`` (rollback de una importación)."""
    return _edit_deployments(name, environment, add=False, kind=kind)


def _load_deployments(path: str) -> Dict[str, Any]:
    """Lee el manifiesto tolerando que no exista o esté vacío."""
    if not os.path.exists(path):
        return {"proxies": [], "sharedflows": []}

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read().strip()
    except OSError as exc:
        raise BundleError(f"No se pudo leer '{path}': {exc}") from exc

    if not content:
        return {"proxies": [], "sharedflows": []}

    try:
        manifest = json.loads(content)
    except json.JSONDecodeError as exc:
        raise BundleError(
            f"El manifiesto '{path}' tiene JSON inválido y debe corregirse a mano: {exc}"
        ) from exc

    if not isinstance(manifest, dict):
        raise BundleError(f"El manifiesto '{path}' debe ser un objeto JSON.")

    return manifest


def _edit_deployments(
    name: str, environment: Optional[str], add: bool, kind: ArtifactKind
) -> bool:
    path = deployments_file(environment)
    manifest = _load_deployments(path)
    entries = manifest.setdefault(kind.manifest_key, [])
    lowered = name.lower()

    # Comparamos sin distinguir mayúsculas, igual que resolve_proxy_name.
    def _matches(entry):
        return isinstance(entry, dict) and str(entry.get("name", "")).lower() == lowered

    already = any(_matches(entry) for entry in entries)

    if add:
        if already:
            return False
        entries.append({"name": name})
    else:
        if not already:
            return False
        manifest[kind.manifest_key] = [e for e in entries if not _matches(e)]

    manifest.setdefault("proxies", [])
    manifest.setdefault("sharedflows", [])
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    action = "registrado en" if add else "eliminado de"
    logger.info(f"{kind.label.capitalize()} '{name}' {action} {path}")
    return True


def bundle_dir(name: str, kind: ArtifactKind = PROXY) -> str:
    """Ruta a la carpeta raíz del bundle de un artefacto dentro del workspace."""
    return os.path.join(artifacts_dir(kind), name, kind.bundle_root)


def proxy_bundle_dir(proxy_name: str) -> str:
    """Atajo histórico para la carpeta ``apiproxy`` de un proxy."""
    return bundle_dir(proxy_name, PROXY)


def _resolve_inside_bundle(
    bundle_root: str, rel_path: str, kind: ArtifactKind = PROXY
) -> str:
    """Convierte una ruta relativa del editor en una ruta absoluta segura.

    La UI envía rutas como ``policies/GetKVM.xml`` o ``proxies\\default.xml``.
    Se normalizan y se comprueba que el resultado siga dentro del bundle, para
    que un ``..`` no pueda escribir fuera de él.

    Si la ruta ya viene con la carpeta raíz del bundle por delante, se descarta:
    de lo contrario se crearía un duplicado anidado (``sharedflowbundle/
    sharedflowbundle/...``) y la edición no llegaría al archivo real.
    """
    normalized = (rel_path or "").replace("\\", "/").strip().lstrip("/")

    if not normalized:
        raise BundleError("La ruta del archivo es obligatoria.")

    prefix = f"{kind.bundle_root}/"
    if normalized.startswith(prefix):
        normalized = normalized[len(prefix) :]

    if not normalized:
        raise BundleError("La ruta del archivo es obligatoria.")

    destination = os.path.normpath(os.path.join(bundle_root, *normalized.split("/")))
    root = os.path.normpath(bundle_root)

    if destination != root and not destination.startswith(root + os.sep):
        raise BundleError(f"Ruta fuera del bundle: '{rel_path}'")

    return destination


def save_artifact_files(
    name: str, files: List[Dict[str, str]], kind: ArtifactKind = PROXY
) -> Tuple[List[str], str]:
    """Escribe en el workspace los archivos editados desde la UI.

    Antes de tocar nada respalda el estado actual, de modo que el llamador pueda
    revertir si el emulador rechaza el contrato resultante.

    Args:
        name: Artefacto a modificar; debe existir ya en el workspace.
        files: Lista de ``{"path": ..., "content": ...}`` relativos al bundle.
        kind: Tipo de artefacto.

    Returns:
        Tuple[List[str], str]: rutas escritas y ruta del respaldo. El llamador
        debe cerrar el respaldo con :func:`discard_backup` o :func:`restore_bundle`.

    Raises:
        BundleError: Si no existe, la lista viene vacía o una ruta es inválida.
    """
    validate_proxy_name(name)
    # Trabajamos siempre sobre el nombre real en disco (ver resolve_proxy_name).
    on_disk = resolve_proxy_name(name, kind)

    if not on_disk:
        raise BundleError(
            f"El {kind.label} '{name}' no existe en el workspace. "
            f"Impórtalo primero con '{kind.ui_action}'."
        )

    bundle_root = bundle_dir(on_disk, kind)

    if not os.path.isdir(bundle_root):
        raise BundleError(
            f"El {kind.label} '{on_disk}' no tiene carpeta "
            f"'{kind.bundle_root}' en el workspace."
        )

    if not files:
        raise BundleError("No se recibió ningún archivo que guardar.")

    # Validamos todas las rutas antes de escribir, para no dejar el bundle a medias.
    planned = []
    for entry in files:
        if not isinstance(entry, dict):
            raise BundleError("Cada archivo debe ser un objeto con 'path' y 'content'.")

        content = entry.get("content")
        if content is None:
            raise BundleError(f"Falta el contenido del archivo '{entry.get('path')}'.")

        planned.append(
            (_resolve_inside_bundle(bundle_root, entry.get("path"), kind), str(content))
        )

    backup = backup_bundle(on_disk, keep_original=True, kind=kind)

    try:
        for destination, content in planned:
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            with open(destination, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
    except OSError as exc:
        restore_bundle(backup, on_disk, kind)
        raise BundleError(f"No se pudo escribir en el workspace: {exc}") from exc

    written = [
        os.path.relpath(destination, bundle_root).replace(os.sep, "/")
        for destination, _ in planned
    ]
    logger.info(f"Guardados {len(written)} archivo(s) del {kind.label} '{on_disk}': {written}")
    return written, backup


def save_proxy_files(proxy_name: str, files: List[Dict[str, str]]) -> Tuple[List[str], str]:
    """Atajo histórico para guardar archivos de un proxy."""
    return save_artifact_files(proxy_name, files, PROXY)


def import_bundle(
    raw_zip: bytes,
    name: str,
    environment: Optional[str] = None,
    overwrite: bool = False,
    kind: ArtifactKind = PROXY,
) -> Tuple[Dict[str, Any], Optional[str]]:
    """Valida un bundle y lo deja listo en el workspace, sin desplegar todavía.

    Args:
        raw_zip: Contenido del ZIP subido desde la UI.
        name: Nombre elegido en el asistente.
        environment: Environment destino; por defecto el configurado.
        overwrite: Permite reemplazar un artefacto existente con el mismo nombre.
        kind: Tipo de artefacto.

    Returns:
        Tuple[Dict[str, Any], Optional[str]]: metadatos del bundle y la ruta del
        respaldo del artefacto anterior (None si era nuevo). El llamador debe
        cerrar el respaldo con :func:`discard_backup` o :func:`restore_bundle`.

    Raises:
        BundleError: Ante cualquier validación fallida (el disco queda intacto).
    """
    clean_name = validate_proxy_name(name)
    files = read_bundle(raw_zip, kind)
    metadata = describe_bundle(files, kind)

    # Resolvemos ignorando mayúsculas: en Windows 'helloWorld' y 'HelloWorld'
    # son la misma carpeta, y tratarlas como distintas destruiría la existente.
    on_disk = resolve_proxy_name(clean_name, kind)
    replaced = on_disk is not None

    if replaced and not overwrite:
        conflict = (
            f"Ya existe un {kind.label} llamado '{on_disk}' en el workspace."
            if on_disk == clean_name
            else (
                f"Ya existe el {kind.label} '{on_disk}', que en este sistema de "
                f"archivos es la misma carpeta que '{clean_name}'."
            )
        )
        raise BundleError(f"{conflict} Elige otro nombre o habilita la sobrescritura.")

    # Un basepath duplicado hace que el emulador enrute al proxy equivocado.
    in_use = basepaths_in_use(exclude=on_disk if replaced else None, kind=kind)
    for base_path in metadata["basepaths"]:
        owner = in_use.get(base_path)
        if owner:
            raise BundleError(
                f"El basepath '{base_path}' ya lo usa el proxy '{owner}'. "
                "Apigee no permite dos proxies con el mismo basepath en un environment."
            )

    # El respaldo mueve la carpeta existente, así que el nombre nuevo queda libre
    # y la escritura no hereda la grafía anterior.
    backup = backup_bundle(on_disk, kind=kind) if replaced else None

    try:
        write_bundle(files, clean_name, metadata["descriptor"], kind)
        if replaced and on_disk != clean_name:
            unregister_deployment(on_disk, environment, kind)
        register_deployment(clean_name, environment, kind)
    except OSError as exc:
        remove_bundle(clean_name, kind)
        if backup:
            restore_bundle(backup, on_disk, kind)
        raise BundleError(f"No se pudo escribir el bundle en el workspace: {exc}") from exc

    metadata["name"] = clean_name
    metadata["replaced"] = replaced
    metadata["replacedName"] = on_disk
    metadata["files"] = sorted(files)
    return metadata, backup


def import_proxy_bundle(
    raw_zip: bytes,
    proxy_name: str,
    environment: Optional[str] = None,
    overwrite: bool = False,
) -> Tuple[Dict[str, Any], Optional[str]]:
    """Atajo histórico para importar un bundle de proxy."""
    return import_bundle(raw_zip, proxy_name, environment, overwrite, PROXY)


def delete_bundles(
    names: List[str], environment: Optional[str] = None, kind: ArtifactKind = PROXY
) -> Tuple[List[str], List[str], Dict[str, str]]:
    """Saca del workspace uno o varios artefactos y los desregistra del environment.

    No borra nada del emulador directamente: el runtime se deriva del workspace,
    así que el artefacto desaparece del contenedor en cuanto se redespliega sin él.
    Esa parte la dispara el llamador, que además puede revertir con los respaldos
    devueltos si el emulador rechaza el contrato resultante.

    Args:
        names: Nombres a eliminar; se resuelven ignorando mayúsculas.
        environment: Environment cuyo ``deployments.json`` hay que actualizar.
        kind: Tipo de artefacto.

    Returns:
        Tuple[List[str], List[str], Dict[str, str]]: eliminados (nombre real),
        no encontrados, y el mapa ``nombre -> ruta de respaldo`` para revertir.

    Raises:
        BundleError: Si no se recibe ningún nombre o alguno es inválido.
    """
    if not names:
        raise BundleError("No se recibió ningún elemento que eliminar.")

    deleted: List[str] = []
    missing: List[str] = []
    backups: Dict[str, str] = {}

    for requested in names:
        validate_proxy_name(requested)
        on_disk = resolve_proxy_name(requested, kind)

        if not on_disk:
            missing.append(requested)
            continue

        # backup_bundle mueve la carpeta: eso ya la saca del workspace.
        backup = backup_bundle(on_disk, kind=kind)
        if backup:
            backups[on_disk] = backup

        unregister_deployment(on_disk, environment, kind)
        deleted.append(on_disk)

    logger.info(f"{kind.label.capitalize()}s eliminados del workspace: {deleted or 'ninguno'}")
    return deleted, missing, backups


def restore_deleted_bundles(
    backups: Dict[str, str], environment: Optional[str] = None, kind: ArtifactKind = PROXY
) -> None:
    """Deshace :func:`delete_bundles` devolviendo cada artefacto a su sitio."""
    for name, backup in backups.items():
        restore_bundle(backup, name, kind)
        register_deployment(name, environment, kind)

    if backups:
        logger.info(f"Restaurados tras un borrado fallido: {sorted(backups)}")


def delete_proxy_bundles(
    proxy_names: List[str], environment: Optional[str] = None
) -> Tuple[List[str], List[str], Dict[str, str]]:
    """Atajo histórico para eliminar proxies."""
    return delete_bundles(proxy_names, environment, PROXY)
