"""Virtual hosts del environment: el mapa de puertos y dominios de Apigee Edge.

Réplica de la pestaña *Environment Configuration → Virtual Hosts* de Edge. En la
instalación real cada virtual host publica los proxies en un dominio y un puerto
concretos, y de ahí salen las URL con las que se consume cada proxy::

    https://api-dev.svamx.com/<basepath>       (default,   puerto 9001)
    https://api-nb-dev.svamx.com/<basepath>    (defaultnb, puerto 9003)

**El emulador local no monta nada de esto**, y conviene tenerlo claro:

* Su contrato compilado no tiene siquiera un campo para virtual hosts: el
  ``env.json`` de la revisión lleva deployments, resources, flowhooks, targets,
  keystores, dataCollectors, debugMask y featureFlags, y nada más.
* Un ``<VirtualHost>`` dentro del ``<HTTPProxyConnection>`` de un proxy se
  ignora: comprobado que el despliegue compila igual y el endpoint sigue
  enrutado en el puerto único del runtime.

Es decir, en local **todos los proxies responden en el mismo puerto**
(``APIGEE_RUNTIME_URL``) sea cual sea el virtual host. Esta pantalla sirve para
dos cosas reales: documentar en el repositorio el mapa de dominios y puertos que
usa Edge, y saber a qué URL local corresponde cada URL de Edge.

Se guarda en ``src/main/apigee/environments/<env>/virtualhosts.json`` con la
forma que devuelve la API de administración de Edge::

    [
      {
        "name": "default",
        "port": "9001",
        "hostAliases": ["api-dev.svamx.com"],
        "sslInfo": {"enabled": "true"}
      }
    ]
"""

import json
import logging
import os
import re
import tempfile
from typing import Any, Dict, List, Optional

from django.conf import settings

logger = logging.getLogger(__name__)

VIRTUAL_HOSTS_FILE = "virtualhosts.json"

# El mismo patrón que valida el emulador en input-validator:
# Validator.VirtualHostName=^[.\p{Alnum}-_]{0,255}$
NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,255}$")

# Un alias es un nombre de host: etiquetas separadas por puntos, sin esquema ni
# ruta. Se admite el comodín inicial que Edge permite en los alias.
ALIAS_PATTERN = re.compile(
    r"^(\*\.)?[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)

MIN_PORT = 1
MAX_PORT = 65535


class VirtualHostError(ValueError):
    """La configuración del virtual host no es válida."""


# ──────────────────────────────────────────────────────────────────────────────
# Archivo del workspace
# ──────────────────────────────────────────────────────────────────────────────


def virtual_hosts_file(environment: Optional[str] = None) -> str:
    """Ruta al ``virtualhosts.json`` del environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    return os.path.join(
        settings.APIGEE_SOURCE_ROOT, "main", "apigee", "environments", env, VIRTUAL_HOSTS_FILE
    )


def _read_file(path: str) -> List[Dict[str, Any]]:
    """Lee el ``virtualhosts.json`` tolerando que no exista o esté vacío."""
    if not os.path.exists(path):
        return []

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read().strip()
    except OSError as exc:
        raise VirtualHostError(f"No se pudo leer '{path}': {exc}") from exc

    if not content:
        return []

    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise VirtualHostError(
            f"El archivo '{path}' tiene JSON inválido y debe corregirse a mano: {exc}"
        ) from exc

    if not isinstance(data, list):
        raise VirtualHostError(f"El archivo '{path}' debe contener una lista de virtual hosts.")

    return [item for item in data if isinstance(item, dict)]


def _write_file(path: str, hosts: List[Dict[str, Any]]) -> None:
    """Escribe el ``virtualhosts.json`` de forma atómica."""
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    temporary = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=directory,
            prefix=f".{VIRTUAL_HOSTS_FILE}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = handle.name
            json.dump(hosts, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

        os.replace(temporary, path)
        temporary = None
    except OSError as exc:
        raise VirtualHostError(f"No se pudo escribir en '{path}': {exc}") from exc
    finally:
        if temporary and os.path.exists(temporary):
            os.remove(temporary)


# ──────────────────────────────────────────────────────────────────────────────
# Validación y normalización
# ──────────────────────────────────────────────────────────────────────────────


def validate_name(name: str) -> str:
    """Valida el nombre del virtual host con el patrón que usa Edge."""
    clean = (name or "").strip()

    if not clean:
        raise VirtualHostError("El nombre del virtual host es obligatorio.")

    if not NAME_PATTERN.fullmatch(clean):
        raise VirtualHostError(
            f"Nombre de virtual host inválido: '{clean}'. "
            "Solo se permiten letras, números, punto, guion y guion bajo."
        )

    return clean


def validate_port(port: Any) -> str:
    """Valida el puerto y lo devuelve como cadena, que es como lo guarda Edge."""
    raw = str(port if port is not None else "").strip()

    if not raw:
        raise VirtualHostError("El puerto es obligatorio.")

    try:
        number = int(raw)
    except ValueError as exc:
        raise VirtualHostError(f"El puerto debe ser un número: '{raw}'.") from exc

    if not MIN_PORT <= number <= MAX_PORT:
        raise VirtualHostError(f"El puerto debe estar entre {MIN_PORT} y {MAX_PORT}: {number}.")

    return str(number)


def _normalize_aliases(raw: Any) -> List[str]:
    """Acepta la lista o una cadena separada por comas y valida cada alias."""
    if isinstance(raw, str):
        candidates = [part for part in re.split(r"[,\s]+", raw) if part]
    elif isinstance(raw, list):
        candidates = [str(item).strip() for item in raw if str(item).strip()]
    else:
        candidates = []

    if not candidates:
        raise VirtualHostError("Hace falta al menos un alias de host.")

    aliases = []
    for alias in candidates:
        # Se tolera pegar la URL completa: interesa solo el host.
        clean = alias.strip().rstrip("/")
        clean = re.sub(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", "", clean).split("/")[0].split(":")[0]

        if not ALIAS_PATTERN.fullmatch(clean):
            raise VirtualHostError(f"Alias de host inválido: '{alias}'.")

        if clean not in aliases:
            aliases.append(clean)

    return aliases


def _to_api(raw: Dict[str, Any], path: str, environment: str) -> Dict[str, Any]:
    """Convierte un virtual host del archivo en el objeto que consume la UI."""
    ssl_info = raw.get("sslInfo")
    ssl_enabled = (
        str(ssl_info.get("enabled", "false")).strip().lower() in {"1", "true", "yes", "on"}
        if isinstance(ssl_info, dict)
        else bool(raw.get("ssl", False))
    )

    aliases = raw.get("hostAliases")
    if isinstance(aliases, str):
        aliases = [aliases]

    return {
        "name": str(raw.get("name", "")),
        "port": str(raw.get("port", "")),
        "hostAliases": [str(a) for a in (aliases or [])],
        "ssl": ssl_enabled,
        "environment": environment,
        "source": os.path.relpath(path, settings.APIGEE_SOURCE_ROOT).replace(os.sep, "/"),
    }


def _to_file(name: str, port: str, aliases: List[str], ssl: bool) -> Dict[str, Any]:
    """Construye el objeto con la forma que devuelve la API de Edge."""
    return {
        "name": name,
        "port": port,
        "hostAliases": aliases,
        # Edge serializa los booleanos de sslInfo como cadenas.
        "sslInfo": {"enabled": "true" if ssl else "false"},
    }


# ──────────────────────────────────────────────────────────────────────────────
# Consulta
# ──────────────────────────────────────────────────────────────────────────────


def list_hosts(environment: Optional[str] = None) -> List[Dict[str, Any]]:
    """Virtual hosts configurados en el environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    path = virtual_hosts_file(env)
    return [_to_api(raw, path, env) for raw in _read_file(path)]


def get_host(name: str, environment: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Busca un virtual host por nombre."""
    for item in list_hosts(environment):
        if item["name"] == name:
            return item

    return None


def catalog(environment: Optional[str] = None) -> Dict[str, Any]:
    """Lo que pinta la pantalla, con la equivalencia local de cada dominio."""
    env = environment or settings.APIGEE_ENVIRONMENT
    hosts = list_hosts(env)

    for host in hosts:
        scheme = "https" if host["ssl"] else "http"
        host["urls"] = [f"{scheme}://{alias}" for alias in host["hostAliases"]]

    return {
        "environment": env,
        "virtualHosts": hosts,
        "source": os.path.relpath(virtual_hosts_file(env), settings.APIGEE_SOURCE_ROOT).replace(
            os.sep, "/"
        ),
        # En local no hay virtual hosts: todo sale por el puerto único del
        # runtime. Se devuelve la URL publicada en el host, no la interna del
        # contenedor, porque es la que se copia y pega en el navegador.
        "localRuntimeUrl": settings.APIGEE_RUNTIME_PUBLIC_URL,
        "appliedByEmulator": False,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Escritura
# ──────────────────────────────────────────────────────────────────────────────


def replace_all(
    hosts: List[Dict[str, Any]], environment: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Guarda la tabla completa, como el botón *Save* de la consola de Edge.

    Valida todo antes de escribir: si una fila está mal, no se toca el archivo y
    la UI conserva lo que el usuario tenía a medias.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    path = virtual_hosts_file(env)

    prepared: List[Dict[str, Any]] = []
    seen = set()

    for item in hosts:
        if not isinstance(item, dict):
            raise VirtualHostError("Cada virtual host debe ser un objeto con 'name' y 'port'.")

        name = validate_name(item.get("name", ""))

        if name in seen:
            raise VirtualHostError(f"El virtual host '{name}' está repetido.")

        seen.add(name)
        prepared.append(
            _to_file(
                name=name,
                port=validate_port(item.get("port")),
                aliases=_normalize_aliases(item.get("hostAliases")),
                ssl=bool(item.get("ssl", True)),
            )
        )

    _write_file(path, prepared)
    logger.info(f"Guardados {len(prepared)} virtual host(s) en {path}")
    return list_hosts(env)


def delete_host(name: str, environment: Optional[str] = None) -> Dict[str, Any]:
    """Elimina un virtual host del environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    path = virtual_hosts_file(env)
    hosts = _read_file(path)
    index = next((i for i, item in enumerate(hosts) if str(item.get("name", "")) == name), None)

    if index is None:
        raise VirtualHostError(f"El virtual host '{name}' no existe en el environment '{env}'.")

    removed = _to_api(hosts[index], path, env)
    _write_file(path, [item for i, item in enumerate(hosts) if i != index])

    logger.info(f"Virtual host '{name}' eliminado de {path}")
    return removed
