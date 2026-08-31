"""Configuración de caches del environment, al estilo de Apigee Edge.

Réplica local de la pestaña *Environment Configuration → Caches* de Edge: cada
cache tiene nombre, descripción y una caducidad de uno de estos tres tipos.

El archivo vive en ``src/main/apigee/environments/<env>/caches.json`` y guarda la
forma que devuelve la API de administración de Edge, para que se pueda promover
tal cual::

    [
      {
        "name": "token-cenam",
        "description": "Store token for HSC",
        "expirySettings": {"timeoutInSec": {"value": "120"}},
        "createdAt": 1756500000000,
        "lastModifiedAt": 1756500000000
      }
    ]

**El emulador no lee este archivo.** Su compilador de contratos
(``ApigeeSource``) solo conoce ``targetservers.json``, ``flowhooks.json``,
``debugmask.json``, ``keystores.json``, ``featureflags.json``,
``datacollectors.json`` y ``deployments.json``; comprobado además que un
despliegue con ``caches.json`` presente compila sin quejarse, simplemente lo
ignora. En el runtime local los caches se crean **bajo demanda**: cuando una
política ``PopulateCache``/``LookupCache`` referencia un ``<CacheResource>``,
``L1CacheManagerCaffeineImpl`` lo crea en ese momento.

Así que esto es la configuración de environment que exige Edge y que versiona
Git, no algo que el emulador vaya a aplicar. Las políticas locales funcionan
igual sin declarar nada; la caducidad configurada aquí es la que se respetará al
promover a Edge.
"""

import json
import logging
import os
import re
import tempfile
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)

CACHE_FILE = "caches.json"

# Los tres tipos que ofrece Edge, con la clave que usa en `expirySettings`.
EXPIRY_TIMEOUT = "timeoutInSec"
EXPIRY_TIME_OF_DAY = "timeOfDay"
EXPIRY_DATE = "expiryDate"
EXPIRY_TYPES = (EXPIRY_TIMEOUT, EXPIRY_TIME_OF_DAY, EXPIRY_DATE)

# Edge admite letras, dígitos y `. _ -` en el nombre. En la consola hay caches de
# un solo carácter, así que no se exige longitud mínima.
CACHE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")

TIME_OF_DAY_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$")

# Edge serializa la fecha de caducidad como MM/DD/YYYY.
EDGE_DATE_FORMAT = "%m/%d/%Y"


class CacheError(ValueError):
    """La configuración del cache no es válida."""


# ──────────────────────────────────────────────────────────────────────────────
# Archivo del workspace
# ──────────────────────────────────────────────────────────────────────────────


def cache_file(environment: Optional[str] = None) -> str:
    """Ruta al ``caches.json`` del environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    return os.path.join(
        settings.APIGEE_SOURCE_ROOT, "main", "apigee", "environments", env, CACHE_FILE
    )


def _read_file(path: str) -> List[Dict[str, Any]]:
    """Lee el ``caches.json`` tolerando que no exista o esté vacío."""
    if not os.path.exists(path):
        return []

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read().strip()
    except OSError as exc:
        raise CacheError(f"No se pudo leer '{path}': {exc}") from exc

    if not content:
        return []

    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise CacheError(
            f"El archivo '{path}' tiene JSON inválido y debe corregirse a mano: {exc}"
        ) from exc

    if not isinstance(data, list):
        raise CacheError(f"El archivo '{path}' debe contener una lista de caches.")

    return [item for item in data if isinstance(item, dict)]


def _write_file(path: str, caches: List[Dict[str, Any]]) -> None:
    """Escribe el ``caches.json`` de forma atómica.

    Mismo motivo que en ``kvms``: el archivo lo leen a la vez la UI, el
    empaquetado del workspace y VS Code, así que no puede quedar truncado a
    medias.
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
            prefix=f".{CACHE_FILE}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = handle.name
            json.dump(caches, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

        os.replace(temporary, path)
        temporary = None
    except OSError as exc:
        raise CacheError(f"No se pudo escribir en '{path}': {exc}") from exc
    finally:
        if temporary and os.path.exists(temporary):
            os.remove(temporary)


def _now_millis() -> int:
    return int(time.time() * 1000)


def _file_millis(path: str) -> Optional[int]:
    try:
        return int(os.path.getmtime(path) * 1000)
    except OSError:
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Validación y normalización
# ──────────────────────────────────────────────────────────────────────────────


def validate_name(name: str) -> str:
    """Valida el nombre del cache con las reglas de Edge."""
    clean = (name or "").strip()

    if not clean:
        raise CacheError("El nombre del cache es obligatorio.")

    if not CACHE_NAME_PATTERN.fullmatch(clean):
        raise CacheError(
            f"Nombre de cache inválido: '{clean}'. "
            "Solo se permiten letras, números, punto, guion y guion bajo."
        )

    return clean


def normalize_expiry(expiry_type: str, value: Any) -> Tuple[str, str]:
    """Valida la caducidad y la devuelve en el formato que guarda Edge.

    Args:
        expiry_type: ``timeoutInSec``, ``timeOfDay`` o ``expiryDate``.
        value: El valor tal como llega de la UI.

    Returns:
        Tuple con el tipo normalizado y el valor ya en formato de Edge.
    """
    kind = (expiry_type or "").strip()

    if kind not in EXPIRY_TYPES:
        raise CacheError(
            f"Tipo de caducidad no soportado: '{expiry_type}'. "
            f"Usa uno de: {', '.join(EXPIRY_TYPES)}."
        )

    raw = str(value if value is not None else "").strip()

    if not raw:
        raise CacheError("La caducidad es obligatoria.")

    if kind == EXPIRY_TIMEOUT:
        try:
            seconds = int(raw)
        except ValueError as exc:
            raise CacheError(f"El tiempo de espera debe ser un número: '{raw}'.") from exc

        if seconds <= 0:
            raise CacheError("El tiempo de espera debe ser mayor que cero.")

        return kind, str(seconds)

    if kind == EXPIRY_TIME_OF_DAY:
        # La UI puede mandar HH:mm desde un <input type="time">; se completan
        # los segundos, que es lo que espera Edge.
        if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", raw):
            raw = f"{raw}:00"

        if not TIME_OF_DAY_PATTERN.fullmatch(raw):
            raise CacheError(f"La hora debe tener el formato HH:mm:ss: '{raw}'.")

        return kind, raw

    return kind, _normalize_date(raw)


def _normalize_date(raw: str) -> str:
    """Acepta la fecha en ISO o en el formato de Edge y devuelve el de Edge.

    El ``<input type="date">`` del navegador entrega ``YYYY-MM-DD``; Edge guarda
    ``MM/DD/YYYY``. Se admiten los dos para poder editar a mano el archivo.
    """
    for formato in ("%Y-%m-%d", EDGE_DATE_FORMAT):
        try:
            return datetime.strptime(raw, formato).strftime(EDGE_DATE_FORMAT)
        except ValueError:
            continue

    raise CacheError(f"La fecha debe ser MM/DD/YYYY o YYYY-MM-DD: '{raw}'.")


def _read_expiry(raw: Dict[str, Any]) -> Tuple[str, str]:
    """Extrae el tipo y el valor de caducidad de un cache del archivo."""
    settings_block = raw.get("expirySettings")

    if isinstance(settings_block, dict):
        for kind in EXPIRY_TYPES:
            entry = settings_block.get(kind)
            if isinstance(entry, dict) and entry.get("value") not in (None, ""):
                return kind, str(entry["value"])
            if isinstance(entry, (str, int)) and str(entry).strip():
                # Tolera la forma abreviada de un archivo escrito a mano.
                return kind, str(entry)

    return EXPIRY_TIMEOUT, ""


def _to_api(raw: Dict[str, Any], path: str, environment: str) -> Dict[str, Any]:
    """Convierte un cache del archivo en el objeto que consume la UI."""
    kind, value = _read_expiry(raw)
    fallback = _file_millis(path)

    return {
        "name": str(raw.get("name", "")),
        "description": str(raw.get("description") or ""),
        "expiryType": kind,
        "expiryValue": value,
        "environment": environment,
        "createdAt": raw.get("createdAt") or fallback,
        "lastModifiedAt": raw.get("lastModifiedAt") or fallback,
        "source": os.path.relpath(path, settings.APIGEE_SOURCE_ROOT).replace(os.sep, "/"),
    }


def _to_file(
    name: str,
    description: str,
    kind: str,
    value: str,
    created_at: Optional[int],
    modified_at: int,
) -> Dict[str, Any]:
    """Construye el objeto con la forma que devuelve la API de Edge."""
    return {
        "name": name,
        "description": description,
        "expirySettings": {kind: {"value": value}},
        "createdAt": created_at or modified_at,
        "lastModifiedAt": modified_at,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Consulta
# ──────────────────────────────────────────────────────────────────────────────


def list_caches(environment: Optional[str] = None) -> List[Dict[str, Any]]:
    """Caches configurados en el environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    path = cache_file(env)
    return [_to_api(raw, path, env) for raw in _read_file(path)]


def get_cache(name: str, environment: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Busca un cache por nombre."""
    for item in list_caches(environment):
        if item["name"] == name:
            return item

    return None


def catalog(environment: Optional[str] = None) -> Dict[str, Any]:
    """Lo que pinta la tabla de la UI."""
    env = environment or settings.APIGEE_ENVIRONMENT
    caches = list_caches(env)

    return {
        "environment": env,
        "caches": caches,
        "source": os.path.relpath(cache_file(env), settings.APIGEE_SOURCE_ROOT).replace(
            os.sep, "/"
        ),
        # El emulador ignora este archivo: los caches se crean bajo demanda
        # cuando una política los referencia. La UI lo explica.
        "appliedByEmulator": False,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Escritura
# ──────────────────────────────────────────────────────────────────────────────


def _index_of(caches: List[Dict[str, Any]], name: str) -> Optional[int]:
    return next((i for i, item in enumerate(caches) if str(item.get("name", "")) == name), None)


def replace_all(
    caches: List[Dict[str, Any]], environment: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Guarda la tabla completa, como hace el botón *Save* de Edge.

    Valida todo antes de escribir: si una fila está mal, no se toca el archivo y
    la UI conserva lo que el usuario tenía a medias.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    path = cache_file(env)
    previous = {str(item.get("name", "")): item for item in _read_file(path)}
    now = _now_millis()

    prepared: List[Dict[str, Any]] = []
    seen = set()

    for item in caches:
        if not isinstance(item, dict):
            raise CacheError("Cada cache debe ser un objeto con 'name' y su caducidad.")

        name = validate_name(item.get("name", ""))

        if name in seen:
            raise CacheError(f"El cache '{name}' está repetido.")

        seen.add(name)
        kind, value = normalize_expiry(item.get("expiryType"), item.get("expiryValue"))
        before = previous.get(name)

        # La fecha de modificación solo avanza si algo cambió de verdad; si no,
        # abrir y guardar la pantalla movería la de todos.
        unchanged = (
            before is not None
            and str(before.get("description") or "") == str(item.get("description") or "")
            and _read_expiry(before) == (kind, value)
        )

        prepared.append(
            _to_file(
                name=name,
                description=str(item.get("description") or "").strip(),
                kind=kind,
                value=value,
                created_at=(before or {}).get("createdAt"),
                modified_at=before.get("lastModifiedAt", now) if unchanged else now,
            )
        )

    _write_file(path, prepared)
    logger.info(f"Guardados {len(prepared)} cache(s) en {path}")
    return list_caches(env)


def create_cache(
    name: str,
    description: str = "",
    expiry_type: str = EXPIRY_TIMEOUT,
    expiry_value: Any = "300",
    environment: Optional[str] = None,
) -> Dict[str, Any]:
    """Agrega un cache al environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    clean = validate_name(name)

    if get_cache(clean, env):
        raise CacheError(f"Ya existe un cache llamado '{clean}'.")

    kind, value = normalize_expiry(expiry_type, expiry_value)
    path = cache_file(env)
    now = _now_millis()

    updated = _read_file(path) + [
        _to_file(clean, (description or "").strip(), kind, value, now, now)
    ]
    _write_file(path, updated)

    logger.info(f"Cache '{clean}' creado en {path}")
    return get_cache(clean, env)


def update_cache(
    name: str,
    description: Optional[str] = None,
    expiry_type: Optional[str] = None,
    expiry_value: Any = None,
    environment: Optional[str] = None,
) -> Dict[str, Any]:
    """Cambia la descripción o la caducidad de un cache.

    El nombre no se puede cambiar, igual que en Edge: es la referencia que usan
    los ``<CacheResource>`` de las políticas.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    path = cache_file(env)
    caches = _read_file(path)
    index = _index_of(caches, name)

    if index is None:
        raise CacheError(f"El cache '{name}' no existe en el environment '{env}'.")

    current = caches[index]
    kind, value = _read_expiry(current)

    if expiry_type is not None or expiry_value is not None:
        kind, value = normalize_expiry(
            expiry_type if expiry_type is not None else kind,
            expiry_value if expiry_value is not None else value,
        )

    caches[index] = _to_file(
        name=str(current.get("name", name)),
        description=(
            str(description).strip()
            if description is not None
            else str(current.get("description") or "")
        ),
        kind=kind,
        value=value,
        created_at=current.get("createdAt"),
        modified_at=_now_millis(),
    )

    _write_file(path, caches)
    logger.info(f"Cache '{name}' actualizado en {path}")
    return get_cache(name, env)


def delete_cache(name: str, environment: Optional[str] = None) -> Dict[str, Any]:
    """Elimina un cache del environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    path = cache_file(env)
    caches = _read_file(path)
    index = _index_of(caches, name)

    if index is None:
        raise CacheError(f"El cache '{name}' no existe en el environment '{env}'.")

    removed = _to_api(caches[index], path, env)
    _write_file(path, [item for i, item in enumerate(caches) if i != index])

    logger.info(f"Cache '{name}' eliminado de {path}")
    return removed
