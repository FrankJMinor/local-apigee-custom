"""Administración de Key Value Maps del emulador local de Apigee.

El emulador no compila los KVM dentro del contrato: `ApigeeSource` solo lee
``targetservers.json``, ``flowhooks.json``, ``debugmask.json``,
``keystores.json``, ``featureflags.json``, ``datacollectors.json`` y
``deployments.json``. Los KVM entran por otra puerta, la misma que usa Cloud
Code:

* ``POST /v1/emulator/setup/tests`` — recibe un ZIP con ``maps.json`` (y, si se
  usaran, ``products.json``, ``developers.json``, ``developerapps.json``). El
  emulador lo extrae en ``/opt/apigee/sdlc/testdata``, lo carga en su store y
  borra los archivos. **Reemplaza todo el test data anterior**, así que cada
  envío tiene que llevar el estado completo.
* ``GET /v1/emulator/test/maps`` — devuelve los KVM cargados en el runtime, con
  los nombres de sus llaves pero *sin* los valores.

Como el runtime no devuelve valores, la fuente de verdad son los archivos del
workspace (lo que versiona Git y lo que ve VS Code):

* ``src/main/apigee/environments/<env>/kvms.json`` — scope ``environment``.
* ``src/main/apigee/organization/kvms.json``        — scope ``organization``.

El emulador solo distingue esos dos scopes: ``KeyValueMapLoader`` manda a
``createEnvironmentScope`` cuando ``scope`` es ``environment`` y a
``createOrgScope`` en cualquier otro caso.

Formato de cada archivo (el de Cloud Code, más metadatos de fechas al estilo
Apigee, que otras herramientas ignoran si leen el archivo)::

    [
      {
        "name": "MiKvm",
        "encrypted": false,
        "entry": [{"name": "llave", "value": "valor"}],
        "createdAt": 1756500000000,
        "lastModifiedAt": 1756500000000
      }
    ]
"""

import io
import json
import logging
import os
import re
import tempfile
import time
import zipfile
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings

from . import emulator

logger = logging.getLogger(__name__)

KVM_FILE = "kvms.json"

SCOPE_ENVIRONMENT = "environment"
SCOPE_ORGANIZATION = "organization"
SCOPES = (SCOPE_ORGANIZATION, SCOPE_ENVIRONMENT)

# Misma expresión que aplica el emulador en KeyValueMapUtil.ENTITY_NAME_PATTERN
# (`\b[A-Z0-9._\-$ ][^/]+$` con CASE_INSENSITIVE y `matches()`): mínimo dos
# caracteres, el primero alfanumérico o '. _ - $ espacio', y sin '/'.
ENTITY_NAME_PATTERN = re.compile(r"\b[A-Z0-9._\-$ ][^/]+$", re.IGNORECASE)


class KvmError(ValueError):
    """La operación sobre el KVM no es válida o el nombre no cumple las reglas."""


# ──────────────────────────────────────────────────────────────────────────────
# Rutas y lectura/escritura de los archivos del workspace
# ──────────────────────────────────────────────────────────────────────────────


def normalize_scope(scope: Optional[str]) -> str:
    """Normaliza el scope recibido desde la UI a uno de los soportados."""
    clean = (scope or SCOPE_ENVIRONMENT).strip().lower()

    if clean in ("env", "environments"):
        clean = SCOPE_ENVIRONMENT
    elif clean in ("org", "organizations"):
        clean = SCOPE_ORGANIZATION

    if clean not in SCOPES:
        raise KvmError(
            f"Scope '{scope}' no soportado por el emulador. "
            f"Usa '{SCOPE_ORGANIZATION}' o '{SCOPE_ENVIRONMENT}'."
        )

    return clean


def kvm_file(scope: str, environment: Optional[str] = None) -> str:
    """Ruta al ``kvms.json`` que guarda los KVM de ese scope."""
    scope = normalize_scope(scope)
    apigee_root = os.path.join(settings.APIGEE_SOURCE_ROOT, "main", "apigee")

    if scope == SCOPE_ORGANIZATION:
        return os.path.join(apigee_root, "organization", KVM_FILE)

    env = environment or settings.APIGEE_ENVIRONMENT
    return os.path.join(apigee_root, "environments", env, KVM_FILE)


RUNTIME_NAME_HELP = (
    "Debe tener al menos dos caracteres, empezar por una letra, un número o uno "
    "de '. _ - $', y no puede contener '/'."
)


def runtime_accepts(name: str) -> bool:
    """Indica si el cargador del emulador aceptaría ese nombre.

    Comprobado contra el contenedor: rechaza los nombres de una sola letra y
    cualquiera que contenga ``/``, que es justo la forma que tienen las llaves
    de los KVM de rutas de Edge (``GET/v1/recurso``). Aceptar espacios, puntos,
    acentos o empezar por dígito sí los admite.
    """
    return bool(ENTITY_NAME_PATTERN.fullmatch((name or "").strip()))


def validate_name(name: str, label: str = "KVM") -> str:
    """Valida un nombre escrito a mano con las reglas del emulador.

    Solo se aplica a lo que teclea una persona (alta, renombrado, llave nueva):
    ahí conviene avisar en el momento, porque tiene arreglo. La importación
    desde Edge no pasa por aquí; ver :func:`import_maps`.
    """
    clean = (name or "").strip()

    if not clean:
        raise KvmError(f"El nombre del {label} es obligatorio.")

    if not runtime_accepts(clean):
        raise KvmError(f"Nombre de {label} inválido: '{clean}'. {RUNTIME_NAME_HELP}")

    return clean


def _read_file(path: str) -> List[Dict[str, Any]]:
    """Lee un ``kvms.json`` tolerando que no exista o esté vacío."""
    if not os.path.exists(path):
        return []

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read().strip()
    except OSError as exc:
        raise KvmError(f"No se pudo leer '{path}': {exc}") from exc

    if not content:
        return []

    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise KvmError(
            f"El archivo '{path}' tiene JSON inválido y debe corregirse a mano: {exc}"
        ) from exc

    if not isinstance(data, list):
        raise KvmError(f"El archivo '{path}' debe contener una lista de KVM.")

    return [item for item in data if isinstance(item, dict)]


def _write_file(path: str, maps: List[Dict[str, Any]]) -> None:
    """Escribe el ``kvms.json`` con el mismo formato que deja Cloud Code.

    La escritura es atómica —archivo temporal en la misma carpeta y ``os.replace``—
    porque este archivo lo leen a la vez la UI, el empaquetado del workspace y
    VS Code. Abrirlo en modo ``w`` lo trunca antes de escribirlo, y quien lo
    leyera en ese instante vería un JSON a medias.
    """
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    temporary = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=directory,
            prefix=f".{KVM_FILE}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = handle.name
            json.dump(maps, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

        os.replace(temporary, path)
        temporary = None
    except OSError as exc:
        raise KvmError(f"No se pudo escribir en '{path}': {exc}") from exc
    finally:
        # Si algo falló antes del replace, el temporal no debe quedar en el workspace.
        if temporary and os.path.exists(temporary):
            os.remove(temporary)


def _load_for_write(path: str) -> List[Dict[str, Any]]:
    """Lee el archivo fijando la fecha de los KVM que aún no la tienen.

    Los ``kvms.json` escritos a mano (o por Cloud Code) no traen ``createdAt`` ni
    ``lastModifiedAt``, así que la lectura cae a la fecha del archivo. Como todos
    los KVM de un scope comparten archivo, sin este sellado editar uno movería la
    fecha de todos los demás en cada guardado.
    """
    maps = _read_file(path)
    stamp = _file_millis(path) or _now_millis()

    for item in maps:
        item.setdefault("createdAt", stamp)
        item.setdefault("lastModifiedAt", stamp)

    return maps


def _now_millis() -> int:
    return int(time.time() * 1000)


def _file_millis(path: str) -> Optional[int]:
    """Fecha de modificación del archivo, para KVM sin metadatos propios."""
    try:
        return int(os.path.getmtime(path) * 1000)
    except OSError:
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Normalización hacia la UI
# ──────────────────────────────────────────────────────────────────────────────


def _normalize_entries(raw: Any) -> List[Dict[str, str]]:
    """Acepta las dos formas de entradas y devuelve siempre ``[{name, value}]``.

    El formato de Cloud Code usa ``entry: [{"name": ..., "value": ...}]``; el que
    espera el emulador en ``maps.json`` es un objeto ``entries: {llave: valor}``.
    Aquí se admiten ambos para no romper archivos escritos a mano.
    """
    entries: List[Dict[str, str]] = []

    if isinstance(raw, dict):
        return [{"name": str(k), "value": "" if v is None else str(v)} for k, v in raw.items()]

    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if name is None:
                continue
            value = item.get("value")
            entries.append({"name": str(name), "value": "" if value is None else str(value)})

    return entries


def _to_api(raw: Dict[str, Any], scope: str, path: str, environment: str) -> Dict[str, Any]:
    """Convierte un KVM del archivo en el objeto que consume la UI.

    ``notLoadableKeys`` son las llaves que están en el workspace pero que el
    cargador del emulador no admite (las de forma ``GET/v1/recurso``, sobre todo).
    La UI las marca para que quede claro que existen en el archivo pero no en el
    runtime local.
    """
    entries = _normalize_entries(raw.get("entry", raw.get("entries")))
    fallback = _file_millis(path)
    name = str(raw.get("name", ""))
    not_loadable = [entry["name"] for entry in entries if not runtime_accepts(entry["name"])]

    return {
        "name": name,
        "scope": scope,
        "environment": environment if scope == SCOPE_ENVIRONMENT else None,
        "encrypted": bool(raw.get("encrypted", False)),
        "entries": entries,
        "entryCount": len(entries),
        "createdAt": raw.get("createdAt") or fallback,
        "lastModifiedAt": raw.get("lastModifiedAt") or fallback,
        "source": os.path.relpath(path, settings.APIGEE_SOURCE_ROOT).replace(os.sep, "/"),
        "notLoadableKeys": not_loadable,
        "loadable": runtime_accepts(name),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Consulta
# ──────────────────────────────────────────────────────────────────────────────


def load_scope(scope: str, environment: Optional[str] = None) -> List[Dict[str, Any]]:
    """Devuelve los KVM de un scope, ya normalizados para la UI."""
    scope = normalize_scope(scope)
    env = environment or settings.APIGEE_ENVIRONMENT
    path = kvm_file(scope, env)
    return [_to_api(raw, scope, path, env) for raw in _read_file(path)]


def list_maps(environment: Optional[str] = None) -> List[Dict[str, Any]]:
    """Catálogo completo del workspace: organización + environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    return load_scope(SCOPE_ORGANIZATION, env) + load_scope(SCOPE_ENVIRONMENT, env)


def get_map(name: str, scope: str, environment: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Busca un KVM por nombre dentro de un scope (sin distinguir mayúsculas)."""
    for item in load_scope(scope, environment):
        if item["name"] == name:
            return item

    return None


def find_map(name: str, environment: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Busca un KVM en cualquiera de los dos scopes."""
    for item in list_maps(environment):
        if item["name"] == name:
            return item

    return None


def runtime_state(environment: Optional[str] = None) -> Dict[str, Any]:
    """Lo que el contenedor del emulador tiene realmente cargado.

    El runtime no devuelve los valores de las llaves, solo sus nombres, así que
    sirve para confirmar qué está desplegado, no para leer secretos.
    """
    try:
        loaded = emulator.get_test_maps()
    except emulator.EmulatorError as exc:
        logger.warning(f"No se pudo consultar los KVM del emulador: {exc}")
        return {"available": False, "error": exc.message, "maps": {}}

    maps = {}
    for item in loaded:
        if not isinstance(item, dict):
            continue
        entries = item.get("entriesList") or item.get("entry") or []
        keys = [str(e.get("name")) for e in entries if isinstance(e, dict) and e.get("name")]
        maps[str(item.get("name", ""))] = {"keys": keys, "keyCount": len(keys)}

    return {"available": True, "maps": maps}


def catalog(environment: Optional[str] = None) -> Dict[str, Any]:
    """Catálogo del workspace cruzado con el estado del runtime.

    Cada KVM lleva ``deployed`` e ``inSync`` para que la UI pueda distinguir uno
    recién escrito de otro que el emulador ya tiene cargado.

    ``inSync`` se compara contra las llaves que el emulador *puede* cargar, no
    contra todas las del archivo: si no, un KVM de rutas —cuyas llaves con ``/``
    nunca entran en el runtime— aparecería eternamente desincronizado.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    workspace = list_maps(env)
    runtime = runtime_state(env)
    loaded = runtime.get("maps", {})

    for item in workspace:
        state = loaded.get(item["name"])
        expected = sorted(e["name"] for e in item["entries"] if runtime_accepts(e["name"]))

        item["deployed"] = state is not None
        item["runtimeKeyCount"] = state["keyCount"] if state else 0
        item["inSync"] = bool(state) and sorted(state["keys"]) == expected

    not_loadable = [item for item in workspace if item["notLoadableKeys"] or not item["loadable"]]

    return {
        "environment": env,
        "keyValueMaps": workspace,
        "runtimeAvailable": runtime.get("available", False),
        "runtimeError": runtime.get("error"),
        # KVM que el emulador tiene cargados pero que ya no están en el workspace.
        "orphanRuntimeMaps": sorted(set(loaded) - {item["name"] for item in workspace}),
        # Cuántas llaves del workspace no puede sostener el runtime local.
        "notLoadableKeyCount": sum(len(item["notLoadableKeys"]) for item in not_loadable),
        "notLoadableMaps": [item["name"] for item in not_loadable],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Sincronización con el emulador
# ──────────────────────────────────────────────────────────────────────────────


def build_testdata_archive(
    environment: Optional[str] = None,
) -> Tuple[bytes, List[Dict[str, Any]]]:
    """Empaqueta los KVM del workspace en el ``testdata.zip`` del emulador.

    El emulador espera ``maps.json`` con la forma que consume
    ``TestKeyValueMapDefinition``: ``[{name, scope, entries: {llave: valor}}]``.

    El workspace puede contener nombres que el cargador no acepta —los KVM de
    rutas de Edge llevan llaves como ``GET/v1/recurso``— y basta uno para que
    ``setup/tests`` devuelva 400 y deje el runtime **sin ningún** KVM. Así que
    aquí se descartan esos nombres en lugar de arriesgar la carga entera: el
    archivo del workspace los conserva y el llamador recibe la lista para poder
    avisar de qué se quedó fuera del runtime.

    Returns:
        Tuple[bytes, List[Dict]]: el ZIP y lo descartado, como
        ``[{"map", "scope", "keys", "mapDropped"}]``.
    """
    definitions = []
    dropped: List[Dict[str, Any]] = []

    for item in list_maps(environment):
        if not runtime_accepts(item["name"]):
            dropped.append(
                {
                    "map": item["name"],
                    "scope": item["scope"],
                    "keys": [entry["name"] for entry in item["entries"]],
                    "mapDropped": True,
                }
            )
            continue

        entries = {}
        rejected = []

        for entry in item["entries"]:
            if runtime_accepts(entry["name"]):
                entries[entry["name"]] = entry["value"]
            else:
                rejected.append(entry["name"])

        if rejected:
            dropped.append(
                {
                    "map": item["name"],
                    "scope": item["scope"],
                    "keys": rejected,
                    "mapDropped": False,
                }
            )

        definitions.append({"name": item["name"], "scope": item["scope"], "entries": entries})

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("maps.json", json.dumps(definitions, ensure_ascii=False, indent=2))

    return buffer.getvalue(), dropped


def sync(environment: Optional[str] = None) -> Dict[str, Any]:
    """Empuja el workspace completo al runtime del emulador.

    Returns:
        Dict[str, Any]: ``synced`` (KVM cargados), ``environment`` y
        ``notLoadable`` con lo que el emulador no admite (ver
        :func:`build_testdata_archive`).

    Raises:
        emulator.EmulatorError: Si el emulador rechaza la carga.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    archive, dropped = build_testdata_archive(env)

    emulator.push_test_data(archive)
    count = len(list_maps(env))

    if dropped:
        total = sum(len(item["keys"]) for item in dropped)
        logger.warning(
            f"{total} nombre(s) del workspace no los admite el emulador y quedaron fuera "
            f"del runtime: {[item['map'] for item in dropped]}"
        )

    logger.info(f"Sincronizados {count} KVM con el emulador ({len(archive)} bytes)")
    return {"synced": count, "environment": env, "notLoadable": dropped}


def _save_and_sync(
    path: str, previous: List[Dict[str, Any]], updated: List[Dict[str, Any]], environment: str
) -> Dict[str, Any]:
    """Escribe el archivo y sincroniza; si el emulador falla, revierte el archivo.

    Un ``setup/tests`` rechazado deja el runtime vacío, así que tras revertir se
    reintenta la sincronización con el estado anterior para dejar el emulador
    como estaba.
    """
    _write_file(path, updated)

    try:
        return sync(environment)
    except (KvmError, emulator.EmulatorError) as exc:
        logger.error(f"Sincronización fallida, revirtiendo '{path}': {exc}")
        _write_file(path, previous)

        try:
            sync(environment)
        except (KvmError, emulator.EmulatorError) as restore_exc:
            logger.error(f"No se pudo restaurar el estado previo del emulador: {restore_exc}")

        raise


# ──────────────────────────────────────────────────────────────────────────────
# CRUD de KVM
# ──────────────────────────────────────────────────────────────────────────────


def create_map(
    name: str,
    scope: str = SCOPE_ENVIRONMENT,
    encrypted: bool = False,
    entries: Optional[List[Dict[str, str]]] = None,
    environment: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Crea un KVM en el workspace y lo carga en el emulador."""
    scope = normalize_scope(scope)
    env = environment or settings.APIGEE_ENVIRONMENT
    clean = validate_name(name, "KVM")

    if find_map(clean, env):
        raise KvmError(f"Ya existe un KVM llamado '{clean}'.")

    normalized, _ = _validate_entries(entries or [])
    now = _now_millis()
    path = kvm_file(scope, env)
    previous = _load_for_write(path)

    updated = previous + [
        {
            "name": clean,
            "encrypted": bool(encrypted),
            "entry": normalized,
            "createdAt": now,
            "lastModifiedAt": now,
        }
    ]

    result = _save_and_sync(path, previous, updated, env)
    logger.info(f"KVM '{clean}' creado con scope '{scope}' en {path}")
    return get_map(clean, scope, env), result


def update_map(
    name: str,
    scope: str,
    new_name: Optional[str] = None,
    encrypted: Optional[bool] = None,
    entries: Optional[List[Dict[str, str]]] = None,
    environment: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Renombra un KVM, cambia su cifrado o reemplaza todas sus entradas."""
    scope = normalize_scope(scope)
    env = environment or settings.APIGEE_ENVIRONMENT
    path = kvm_file(scope, env)
    previous = _load_for_write(path)
    index = _index_of(previous, name)

    if index is None:
        raise KvmError(f"El KVM '{name}' no existe en el scope '{scope}'.")

    updated = [dict(item) for item in previous]
    target = updated[index]
    final_name = str(target.get("name", name))

    if new_name is not None and new_name.strip() != final_name:
        final_name = validate_name(new_name, "KVM")
        if find_map(final_name, env):
            raise KvmError(f"Ya existe un KVM llamado '{final_name}'.")
        target["name"] = final_name

    if encrypted is not None:
        target["encrypted"] = bool(encrypted)

    if entries is not None:
        target["entry"], _ = _validate_entries(entries)

    target["lastModifiedAt"] = _now_millis()
    if not target.get("createdAt"):
        target["createdAt"] = target["lastModifiedAt"]

    result = _save_and_sync(path, previous, updated, env)
    logger.info(f"KVM '{name}' actualizado en {path}")
    return get_map(final_name, scope, env), result


def delete_map(
    name: str, scope: str, environment: Optional[str] = None
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Saca el KVM del workspace y lo descarga del emulador."""
    scope = normalize_scope(scope)
    env = environment or settings.APIGEE_ENVIRONMENT
    path = kvm_file(scope, env)
    previous = _load_for_write(path)
    index = _index_of(previous, name)

    if index is None:
        raise KvmError(f"El KVM '{name}' no existe en el scope '{scope}'.")

    removed = _to_api(previous[index], scope, path, env)
    updated = [item for i, item in enumerate(previous) if i != index]

    result = _save_and_sync(path, previous, updated, env)
    logger.info(f"KVM '{name}' eliminado de {path}")
    return removed, result


def delete_maps(
    names: Optional[List[str]] = None,
    delete_all: bool = False,
    environment: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Borra varios KVM de los dos scopes con una sola sincronización.

    Encadenar :func:`delete_map` por cada nombre haría un ``setup/tests`` por
    borrado; aquí se reescriben los archivos afectados y se sincroniza una vez.

    Args:
        names: Nombres a borrar. Se ignora si ``delete_all`` es verdadero.
        delete_all: Borra todos los KVM de los dos scopes.
        environment: Environment del scope de entorno.

    Returns:
        Tuple con el resumen (``deleted``, ``notFound``) y el resultado del sync.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    wanted = {str(name) for name in (names or [])}

    if not delete_all and not wanted:
        raise KvmError("No se recibió ningún KVM que eliminar.")

    def marked(item: Dict[str, Any]) -> bool:
        return delete_all or str(item.get("name", "")) in wanted

    deleted: List[str] = []
    # Se respalda cada archivo tocado para poder revertir los dos si el sync falla.
    touched: List[Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]] = []

    for scope in SCOPES:
        path = kvm_file(scope, env)
        previous = _load_for_write(path)
        keep = [item for item in previous if not marked(item)]

        if len(keep) == len(previous):
            continue

        deleted.extend(str(item.get("name", "")) for item in previous if marked(item))
        touched.append((path, previous, keep))

    if not touched:
        raise KvmError("Ninguno de los KVM indicados existe en el workspace.")

    for path, _, updated in touched:
        _write_file(path, updated)

    try:
        result = sync(env)
    except (KvmError, emulator.EmulatorError) as exc:
        logger.error(f"Sincronización fallida tras el borrado múltiple, revirtiendo: {exc}")
        for path, previous, _ in touched:
            _write_file(path, previous)
        try:
            sync(env)
        except (KvmError, emulator.EmulatorError) as restore_exc:
            logger.error(f"No se pudo restaurar el estado previo del emulador: {restore_exc}")
        raise

    not_found = sorted(wanted - set(deleted))
    logger.info(f"Eliminados {len(deleted)} KVM: {deleted}")
    return {"deleted": sorted(deleted), "notFound": not_found}, result


# ──────────────────────────────────────────────────────────────────────────────
# Importación desde Apigee Edge
# ──────────────────────────────────────────────────────────────────────────────


def import_maps(
    maps: List[Dict[str, Any]],
    scope: str = SCOPE_ENVIRONMENT,
    environment: Optional[str] = None,
    replace: bool = False,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Vuelca en el workspace los KVM traídos de Edge y los carga en el emulador.

    **Se importa todo tal cual viene de Edge**, sin aplicar las reglas de nombres
    del emulador. Los KVM de rutas llevan llaves con forma de URI
    (``GET/v1/recurso``) que el cargador local no admite, y son precisamente los
    que más falta hacen: descartarlos dejaría fuera del workspace lo importante.
    El archivo del workspace guarda la copia fiel; el filtro se aplica solo al
    empujar al emulador (ver :func:`build_testdata_archive`), que es donde un
    nombre inválido tiene consecuencias reales.

    Args:
        maps: KVM en formato de workspace (``{"name", "encrypted", "entry"}``).
        scope: Scope local donde dejarlos.
        environment: Environment del scope de entorno.
        replace: Si es verdadero, deja solo lo importado y descarta el resto.

    Returns:
        Tuple con el resumen (``created``, ``updated``, ``skipped``) y el sync.
        ``skipped`` solo recoge lo que no se puede representar en el archivo:
        un KVM sin nombre. El resto entra siempre.
    """
    scope = normalize_scope(scope)
    env = environment or settings.APIGEE_ENVIRONMENT
    path = kvm_file(scope, env)
    previous = _load_for_write(path)
    now = _now_millis()

    updated: List[Dict[str, Any]] = [] if replace else [dict(item) for item in previous]
    created: List[str] = []
    refreshed: List[str] = []
    skipped: List[Dict[str, str]] = []
    collapsed: List[Dict[str, Any]] = []

    for raw in maps:
        name = str(raw.get("name", "")).strip()

        if not name:
            skipped.append({"name": "?", "reason": "Edge devolvió un KVM sin nombre."})
            continue

        try:
            entries, duplicated = _validate_entries(
                raw.get("entry", raw.get("entries")), strict=False
            )
        except KvmError as exc:
            skipped.append({"name": name, "reason": str(exc)})
            continue

        if duplicated:
            collapsed.append({"map": name, "keys": sorted(set(duplicated))})

        index = _index_of(updated, name)
        record = {
            "name": name if index is None else str(updated[index].get("name", name)),
            "encrypted": bool(raw.get("encrypted", False)),
            "entry": entries,
            "createdAt": now if index is None else updated[index].get("createdAt", now),
            "lastModifiedAt": now,
        }

        if index is None:
            updated.append(record)
            created.append(record["name"])
        else:
            updated[index] = record
            refreshed.append(record["name"])

    if not created and not refreshed:
        raise KvmError(
            "No se importó ningún KVM: "
            + (skipped[0]["reason"] if skipped else "Edge no devolvió ninguno.")
        )

    result = _save_and_sync(path, previous, updated, env)
    logger.info(
        f"Importados desde Edge: {len(created)} nuevos, {len(refreshed)} actualizados, "
        f"{len(skipped)} omitidos, {len(collapsed)} con llaves duplicadas"
    )
    return {
        "created": created,
        "updated": refreshed,
        "skipped": skipped,
        "collapsed": collapsed,
    }, result


# ──────────────────────────────────────────────────────────────────────────────
# CRUD de llaves
# ──────────────────────────────────────────────────────────────────────────────


def add_entry(
    map_name: str,
    scope: str,
    entry_name: str,
    value: str = "",
    environment: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Agrega una llave al KVM."""
    current = _require_map(map_name, scope, environment)
    clean = validate_name(entry_name, "llave")

    if any(entry["name"] == clean for entry in current["entries"]):
        raise KvmError(f"La llave '{clean}' ya existe en el KVM '{current['name']}'.")

    entries = current["entries"] + [{"name": clean, "value": "" if value is None else str(value)}]
    return update_map(current["name"], scope, entries=entries, environment=environment)


def update_entry(
    map_name: str,
    scope: str,
    entry_name: str,
    value: Optional[str] = None,
    new_name: Optional[str] = None,
    environment: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Cambia el valor de una llave y, opcionalmente, su nombre."""
    current = _require_map(map_name, scope, environment)
    entries = [dict(entry) for entry in current["entries"]]
    index = next((i for i, e in enumerate(entries) if e["name"] == entry_name), None)

    if index is None:
        raise KvmError(f"La llave '{entry_name}' no existe en el KVM '{current['name']}'.")

    if new_name is not None and new_name.strip() != entry_name:
        clean = validate_name(new_name, "llave")
        if any(e["name"] == clean for i, e in enumerate(entries) if i != index):
            raise KvmError(f"La llave '{clean}' ya existe en el KVM '{current['name']}'.")
        entries[index]["name"] = clean

    if value is not None:
        entries[index]["value"] = str(value)

    return update_map(current["name"], scope, entries=entries, environment=environment)


def delete_entry(
    map_name: str, scope: str, entry_name: str, environment: Optional[str] = None
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Elimina una llave del KVM."""
    current = _require_map(map_name, scope, environment)
    entries = [entry for entry in current["entries"] if entry["name"] != entry_name]

    if len(entries) == len(current["entries"]):
        raise KvmError(f"La llave '{entry_name}' no existe en el KVM '{current['name']}'.")

    return update_map(current["name"], scope, entries=entries, environment=environment)


# ──────────────────────────────────────────────────────────────────────────────
# Auxiliares
# ──────────────────────────────────────────────────────────────────────────────


def _index_of(maps: List[Dict[str, Any]], name: str) -> Optional[int]:
    return next((i for i, item in enumerate(maps) if str(item.get("name", "")) == name), None)


def _require_map(map_name: str, scope: str, environment: Optional[str]) -> Dict[str, Any]:
    current = get_map(map_name, scope, environment)

    if not current:
        raise KvmError(f"El KVM '{map_name}' no existe en el scope '{normalize_scope(scope)}'.")

    return current


def _validate_entries(entries: Any, strict: bool = True) -> Tuple[List[Dict[str, str]], List[str]]:
    """Valida la lista completa de entradas antes de tocar el disco.

    La unicidad se comprueba distinguiendo mayúsculas, igual que el emulador:
    su cargador usa un ``Set<String>`` de Java, y está comprobado contra el
    contenedor que ``CreateUser`` y ``createuser`` conviven como dos llaves.
    Edge tiene muchas llaves que solo difieren en la caja
    (``…__CreateUser`` / ``…__createUser``) y compararlas en minúsculas las
    colapsaba.

    Args:
        entries: Entradas en cualquiera de las dos formas admitidas.
        strict: Con ``True`` (lo que teclea una persona) aplica las reglas de
            nombres del emulador y rechaza el duplicado. Con ``False``
            (importación desde Edge) solo exige que la llave tenga nombre, y un
            duplicado exacto se resuelve quedándose con el último valor, que es
            lo que haría el objeto JSON del ``maps.json``.

    Returns:
        Tuple con las entradas normalizadas y los nombres duplicados que se
        colapsaron (vacío en modo estricto, que aborta en cuanto ve uno).
    """
    normalized = _normalize_entries(entries)
    seen: Dict[str, int] = {}
    result: List[Dict[str, str]] = []
    duplicated: List[str] = []

    for entry in normalized:
        if strict:
            clean = validate_name(entry["name"], "llave")
        else:
            clean = entry["name"].strip()
            if not clean:
                raise KvmError("El KVM trae una llave sin nombre.")

        entry["name"] = clean

        if clean in seen:
            if strict:
                raise KvmError(f"La llave '{clean}' está repetida dentro del KVM.")
            # Gana el último, como haría el objeto JSON que consume el emulador.
            result[seen[clean]] = entry
            duplicated.append(clean)
            continue

        seen[clean] = len(result)
        result.append(entry)

    return result, duplicated
