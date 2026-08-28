"""Validación, extracción y registro de bundles de proxy en el workspace local.

El workspace (``src/main/apigee`` del repositorio) es la *source of truth*: lo que
se escribe aquí es lo que VS Code muestra, lo que versiona Git y lo que se envía
al emulador. Este módulo replica lo que hace la opción "Proxy bundle" del asistente
"Build a Proxy" de Apigee: recibe un ZIP, comprueba que sea un bundle válido, lo
deja en disco con el nombre elegido y lo registra en el ``deployments.json`` del
environment.
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
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)

# Misma restricción que aplica la consola de Apigee al nombre del proxy.
PROXY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")

# Carpeta raíz obligatoria dentro de un bundle de proxy de Apigee.
BUNDLE_ROOT = "apiproxy"


class BundleError(ValueError):
    """El ZIP recibido no es un bundle de proxy válido."""


def proxies_dir() -> str:
    """Ruta a ``src/main/apigee/apiproxies`` dentro del contenedor."""
    return os.path.join(settings.APIGEE_SOURCE_ROOT, "main", "apigee", "apiproxies")


def deployments_file(environment: Optional[str] = None) -> str:
    """Ruta al manifiesto ``deployments.json`` del environment indicado."""
    env = environment or settings.APIGEE_ENVIRONMENT
    return os.path.join(
        settings.APIGEE_SOURCE_ROOT, "main", "apigee", "environments", env, "deployments.json"
    )


def validate_proxy_name(name: str) -> str:
    """Normaliza y valida el nombre del proxy tal como lo hace la consola de Apigee."""
    clean = (name or "").strip()

    if not clean:
        raise BundleError("El nombre del proxy es obligatorio.")

    if not PROXY_NAME_PATTERN.match(clean):
        raise BundleError(
            "Nombre de proxy inválido. Solo se permiten letras, números, "
            "guion (-) y guion bajo (_)."
        )

    return clean


def _safe_member_path(name: str) -> str:
    """Rechaza rutas absolutas o con '..' para evitar zip-slip al extraer."""
    normalized = name.replace("\\", "/").lstrip("/")

    if posixpath.normpath(normalized).startswith(("..", "/")):
        raise BundleError(f"El bundle contiene una ruta no permitida: '{name}'")

    return normalized


def read_bundle(raw_zip: bytes) -> Dict[str, bytes]:
    """Extrae en memoria el contenido de un bundle, relativo a ``apiproxy/``.

    Acepta tanto el formato estándar de Apigee (``apiproxy/...`` en la raíz del ZIP)
    como el que genera comprimir la carpeta del proxy (``MiProxy/apiproxy/...``).

    Args:
        raw_zip: Contenido binario del archivo ZIP subido.

    Returns:
        Dict[str, bytes]: Rutas relativas a ``apiproxy/`` y su contenido.

    Raises:
        BundleError: Si el archivo no es un ZIP o no contiene una carpeta ``apiproxy``.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw_zip))
    except zipfile.BadZipFile as exc:
        raise BundleError("El archivo enviado no es un ZIP válido.") from exc

    with archive:
        if archive.testzip() is not None:
            raise BundleError("El ZIP está dañado; alguna entrada no se puede leer.")

        # Localizamos el prefijo que antecede a la carpeta 'apiproxy'.
        prefix = None
        for member in archive.namelist():
            parts = _safe_member_path(member).split("/")
            if BUNDLE_ROOT in parts:
                prefix = "/".join(parts[: parts.index(BUNDLE_ROOT)])
                break

        if prefix is None:
            raise BundleError(
                "El bundle no contiene una carpeta 'apiproxy'. "
                "Un bundle de Apigee debe tener la estructura 'apiproxy/<Proxy>.xml'."
            )

        base = f"{prefix}/{BUNDLE_ROOT}/" if prefix else f"{BUNDLE_ROOT}/"
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
        raise BundleError("La carpeta 'apiproxy' del bundle está vacía.")

    return files


def _parse_xml(content: bytes) -> Optional[ET.Element]:
    try:
        return ET.fromstring(content)
    except ET.ParseError:
        return None


def describe_bundle(files: Dict[str, bytes]) -> Dict[str, Any]:
    """Extrae los metadatos del bundle: nombre declarado, basepaths y endpoints.

    Returns:
        Dict[str, Any]: ``declared_name``, ``descriptor``, ``basepaths``,
        ``proxy_endpoints``, ``target_endpoints`` y ``policies``.

    Raises:
        BundleError: Si el bundle no declara ningún ProxyEndpoint.
    """
    info: Dict[str, Any] = {
        "declared_name": None,
        "descriptor": None,
        "basepaths": [],
        "proxy_endpoints": [],
        "target_endpoints": [],
        "policies": [],
    }

    for rel_path, content in files.items():
        # Descriptor raíz: un XML <APIProxy> directamente bajo apiproxy/.
        if "/" not in rel_path and rel_path.endswith(".xml"):
            root = _parse_xml(content)
            if root is not None and root.tag == "APIProxy":
                info["descriptor"] = rel_path
                info["declared_name"] = root.get("name") or rel_path[: -len(".xml")]

        elif rel_path.startswith("proxies/") and rel_path.endswith(".xml"):
            info["proxy_endpoints"].append(os.path.basename(rel_path)[: -len(".xml")])
            root = _parse_xml(content)
            if root is not None:
                base_path = root.findtext("HTTPProxyConnection/BasePath")
                if base_path:
                    info["basepaths"].append(base_path.strip())

        elif rel_path.startswith("targets/") and rel_path.endswith(".xml"):
            info["target_endpoints"].append(os.path.basename(rel_path)[: -len(".xml")])

        elif rel_path.startswith("policies/") and rel_path.endswith(".xml"):
            info["policies"].append(os.path.basename(rel_path)[: -len(".xml")])

    if not info["proxy_endpoints"]:
        raise BundleError(
            "El bundle no define ningún ProxyEndpoint en 'apiproxy/proxies/'. "
            "Apigee necesita al menos un endpoint para poder desplegar el proxy."
        )

    return info


def existing_proxies() -> List[str]:
    """Nombres de los proxies que ya viven en el workspace local."""
    root = proxies_dir()

    if not os.path.isdir(root):
        return []

    return sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)))


def basepaths_in_use(exclude: Optional[str] = None) -> Dict[str, str]:
    """Mapea cada basepath ya ocupado en el workspace con el proxy que lo declara.

    Apigee rechaza dos proxies con el mismo basepath en un environment; replicamos
    esa validación antes de tocar el disco para no dejar el workspace inconsistente.
    """
    in_use: Dict[str, str] = {}
    root = proxies_dir()

    for proxy in existing_proxies():
        if exclude and proxy == exclude:
            continue

        endpoints_dir = os.path.join(root, proxy, BUNDLE_ROOT, "proxies")
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


def _rename_descriptor(content: bytes, proxy_name: str) -> bytes:
    """Sustituye el atributo ``name`` del descriptor ``<APIProxy>``."""
    root = _parse_xml(content)

    if root is None or root.tag != "APIProxy":
        return content

    root.set("name", proxy_name)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def write_bundle(files: Dict[str, bytes], proxy_name: str, descriptor: Optional[str]) -> str:
    """Escribe el bundle en el workspace bajo ``apiproxies/<proxy_name>/apiproxy``.

    El descriptor raíz se renombra y se reescribe con el nombre elegido en el
    asistente, igual que hace Apigee al importar un bundle con otro nombre.

    Returns:
        str: Ruta absoluta de la carpeta del proxy creada.
    """
    target_root = os.path.join(proxies_dir(), proxy_name)
    bundle_root = os.path.join(target_root, BUNDLE_ROOT)

    os.makedirs(bundle_root, exist_ok=True)

    for rel_path, content in files.items():
        # El descriptor raíz siempre queda como '<proxy_name>.xml'.
        if descriptor and rel_path == descriptor:
            rel_path = f"{proxy_name}.xml"
            content = _rename_descriptor(content, proxy_name)

        destination = os.path.join(bundle_root, *rel_path.split("/"))
        os.makedirs(os.path.dirname(destination), exist_ok=True)

        with open(destination, "wb") as handle:
            handle.write(content)

    logger.info(f"Bundle '{proxy_name}' escrito en {bundle_root} ({len(files)} archivos)")
    return target_root


def remove_bundle(proxy_name: str) -> None:
    """Elimina la carpeta del proxy del workspace (rollback de una importación)."""
    target = os.path.join(proxies_dir(), proxy_name)

    if os.path.isdir(target):
        shutil.rmtree(target, ignore_errors=True)
        logger.info(f"Bundle '{proxy_name}' eliminado de {target}")


def backup_bundle(proxy_name: str) -> Optional[str]:
    """Aparta la versión actual del proxy para poder restaurarla si algo falla.

    El workspace está versionado en Git, así que una sobrescritura fallida no
    puede dejar al usuario sin su bundle anterior.

    Returns:
        Optional[str]: Ruta del respaldo, o None si el proxy no existía.
    """
    source = os.path.join(proxies_dir(), proxy_name)

    if not os.path.isdir(source):
        return None

    backup = tempfile.mkdtemp(prefix=f"apigee-backup-{proxy_name}-")
    destination = os.path.join(backup, proxy_name)
    shutil.move(source, destination)
    logger.info(f"Respaldo de '{proxy_name}' creado en {destination}")
    return destination


def restore_bundle(backup_path: str, proxy_name: str) -> None:
    """Devuelve al workspace el bundle respaldado por :func:`backup_bundle`."""
    if not backup_path or not os.path.isdir(backup_path):
        return

    remove_bundle(proxy_name)
    shutil.move(backup_path, os.path.join(proxies_dir(), proxy_name))
    shutil.rmtree(os.path.dirname(backup_path), ignore_errors=True)
    logger.info(f"Bundle '{proxy_name}' restaurado desde el respaldo")


def discard_backup(backup_path: Optional[str]) -> None:
    """Borra un respaldo que ya no hace falta."""
    if backup_path:
        shutil.rmtree(os.path.dirname(backup_path), ignore_errors=True)


def register_deployment(proxy_name: str, environment: Optional[str] = None) -> bool:
    """Añade el proxy al ``deployments.json`` del environment si aún no está.

    Returns:
        bool: True si se modificó el manifiesto, False si ya estaba registrado.
    """
    return _edit_deployments(proxy_name, environment, add=True)


def unregister_deployment(proxy_name: str, environment: Optional[str] = None) -> bool:
    """Quita el proxy del ``deployments.json`` (rollback de una importación)."""
    return _edit_deployments(proxy_name, environment, add=False)


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


def _edit_deployments(proxy_name: str, environment: Optional[str], add: bool) -> bool:
    path = deployments_file(environment)
    manifest = _load_deployments(path)
    proxies = manifest.setdefault("proxies", [])
    already = any(entry.get("name") == proxy_name for entry in proxies if isinstance(entry, dict))

    if add:
        if already:
            return False
        proxies.append({"name": proxy_name})
    else:
        if not already:
            return False
        manifest["proxies"] = [
            entry
            for entry in proxies
            if not (isinstance(entry, dict) and entry.get("name") == proxy_name)
        ]

    manifest.setdefault("sharedflows", [])
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    action = "registrado en" if add else "eliminado de"
    logger.info(f"Proxy '{proxy_name}' {action} {path}")
    return True


def import_proxy_bundle(
    raw_zip: bytes,
    proxy_name: str,
    environment: Optional[str] = None,
    overwrite: bool = False,
) -> Tuple[Dict[str, Any], bool]:
    """Valida un bundle y lo deja listo en el workspace, sin desplegar todavía.

    Args:
        raw_zip: Contenido del ZIP subido desde la UI.
        proxy_name: Nombre elegido en el asistente.
        environment: Environment destino; por defecto el configurado.
        overwrite: Permite reemplazar un proxy existente con el mismo nombre.

    Returns:
        Tuple[Dict[str, Any], Optional[str]]: metadatos del bundle y la ruta del
        respaldo del proxy anterior (None si era un proxy nuevo). El llamador debe
        cerrar el respaldo con :func:`discard_backup` o :func:`restore_bundle`.

    Raises:
        BundleError: Ante cualquier validación fallida (el disco queda intacto).
    """
    name = validate_proxy_name(proxy_name)
    files = read_bundle(raw_zip)
    metadata = describe_bundle(files)
    replaced = name in existing_proxies()

    if replaced and not overwrite:
        raise BundleError(
            f"Ya existe un proxy llamado '{name}' en el workspace. "
            "Elige otro nombre o habilita la sobrescritura."
        )

    # Un basepath duplicado hace que el emulador enrute al proxy equivocado.
    in_use = basepaths_in_use(exclude=name if replaced else None)
    for base_path in metadata["basepaths"]:
        owner = in_use.get(base_path)
        if owner:
            raise BundleError(
                f"El basepath '{base_path}' ya lo usa el proxy '{owner}'. "
                "Apigee no permite dos proxies con el mismo basepath en un environment."
            )

    backup = backup_bundle(name) if replaced else None

    try:
        write_bundle(files, name, metadata["descriptor"])
        register_deployment(name, environment)
    except OSError as exc:
        remove_bundle(name)
        if backup:
            restore_bundle(backup, name)
        raise BundleError(f"No se pudo escribir el bundle en el workspace: {exc}") from exc

    metadata["name"] = name
    metadata["replaced"] = replaced
    metadata["files"] = sorted(files)
    return metadata, backup
