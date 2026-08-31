"""Cliente de la API de administración de Apigee Edge (la instalación real).

Sirve para traerse los KVM de un environment de Edge al emulador local, de modo
que las políticas locales trabajen con los mismos valores que la instalación de
verdad en lugar de con datos inventados.

La API clásica de Edge expone, para cada environment:

* ``GET /v1/o/{org}/e/{env}/keyvaluemaps`` — lista de nombres de KVM.
* ``GET /v1/o/{org}/e/{env}/keyvaluemaps/{nombre}`` — el KVM con sus entradas,
  en el mismo formato ``{"name", "encrypted", "entry": [{"name", "value"}]}``
  que usa el ``kvms.json`` del workspace.

Autenticación **Basic** con el usuario y la contraseña de Edge. Este módulo no
las guarda en ningún sitio: llegan en la petición, se usan para construir la
cabecera y se van con ella. Nunca se escriben en disco ni en el log.

Dos cosas que hay que tener presentes al usarlo:

* Los hosts solo son alcanzables con la **VPN corporativa** levantada.
* Un environment sin permisos concedidos responde **401**. Hoy solo ``dev`` está
  habilitado; ``pre-prod`` y ``prd`` quedan configurados a la espera.
"""

import base64
import json
import logging
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterator, List, Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)


class EdgeError(RuntimeError):
    """Fallo al hablar con Apigee Edge, ya traducido a algo accionable.

    Attributes:
        kind: Categoría del fallo (``vpn``, ``auth``, ``forbidden``, ``notfound``,
            ``tls``, ``http``, ``config``), para que la UI pueda reaccionar.
        status_code: Código HTTP cuando lo hubo.
    """

    def __init__(self, message: str, kind: str = "http", status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.status_code = status_code


def environments() -> List[Dict[str, Any]]:
    """Environments de Edge configurados, tal como los pinta el desplegable."""
    return [
        {
            "key": key,
            "label": config.get("label", key),
            "organization": config.get("organization"),
            "environment": config.get("environment"),
            "enabled": bool(config.get("enabled")),
            "url": _keyvaluemaps_url(config),
        }
        for key, config in settings.APIGEE_EDGE_ENVIRONMENTS.items()
    ]


def get_environment(key: str) -> Dict[str, Any]:
    """Configuración de un environment de Edge, validando que exista."""
    config = settings.APIGEE_EDGE_ENVIRONMENTS.get((key or "").strip())

    if not config:
        disponibles = ", ".join(settings.APIGEE_EDGE_ENVIRONMENTS)
        raise EdgeError(
            f"El ambiente '{key}' no está configurado. Disponibles: {disponibles}.",
            kind="config",
        )

    return config


def _keyvaluemaps_url(config: Dict[str, Any], name: Optional[str] = None) -> str:
    base = str(config["base_url"]).rstrip("/")
    org = urllib.parse.quote(str(config["organization"]), safe="")
    env = urllib.parse.quote(str(config["environment"]), safe="")
    url = f"{base}/v1/o/{org}/e/{env}/keyvaluemaps"

    return f"{url}/{urllib.parse.quote(name, safe='')}" if name else url


def _ssl_context() -> ssl.SSLContext:
    """Contexto TLS según la configuración (ver ``APIGEE_EDGE_CA_BUNDLE``)."""
    if settings.APIGEE_EDGE_CA_BUNDLE:
        return ssl.create_default_context(cafile=settings.APIGEE_EDGE_CA_BUNDLE)

    context = ssl.create_default_context()

    if not settings.APIGEE_EDGE_VERIFY_TLS:
        # Los gateways usan una CA interna que el contenedor no conoce. Ver la
        # nota de settings: lo correcto es montar la CA y verificar de verdad.
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

    return context


def _basic_auth(username: str, password: str) -> str:
    """Construye la cabecera Basic. El resultado no se registra en ningún log."""
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _request(url: str, authorization: str) -> Any:
    """GET contra Edge, traduciendo los fallos a mensajes accionables."""
    request = urllib.request.Request(
        url,
        headers={"Authorization": authorization, "Accept": "application/json"},
        method="GET",
    )

    try:
        with urllib.request.urlopen(
            request, timeout=settings.APIGEE_EDGE_TIMEOUT, context=_ssl_context()
        ) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise _http_error(exc, url) from exc
    except urllib.error.URLError as exc:
        raise _url_error(exc, url) from exc
    except (TimeoutError, OSError) as exc:
        raise EdgeError(
            f"Se agotó el tiempo de espera contra {_host(url)}. "
            "Comprueba que la VPN siga levantada.",
            kind="vpn",
        ) from exc

    if not raw.strip():
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise EdgeError(
            f"{_host(url)} respondió algo que no es JSON. "
            "Suele pasar cuando un portal de la VPN intercepta la petición.",
            kind="http",
        ) from exc


def _host(url: str) -> str:
    return urllib.parse.urlparse(url).netloc or url


def _http_error(exc: urllib.error.HTTPError, url: str) -> EdgeError:
    """Traduce el código HTTP a algo que le sirva a quien está en la UI."""
    # El cuerpo puede traer el detalle de Edge, pero nunca la credencial.
    try:
        detail = exc.read(400).decode("utf-8", errors="replace").strip()
    except Exception:
        detail = ""

    if exc.code == 401:
        message = (
            "Apigee Edge rechazó las credenciales (401). Revisa el usuario y la "
            "contraseña, o pide que te habiliten permisos en este ambiente: hoy "
            "solo 'dev' los tiene concedidos."
        )
        kind = "auth"
    elif exc.code == 403:
        message = (
            "Tu usuario no tiene permiso para leer los KVM de este ambiente (403). "
            "Hay que solicitarlo al equipo de Apigee."
        )
        kind = "forbidden"
    elif exc.code == 404:
        message = (
            f"{_host(url)} no encontró el recurso (404). Comprueba la organización "
            "y el nombre del environment."
        )
        kind = "notfound"
    else:
        message = f"Apigee Edge respondió HTTP {exc.code}."
        kind = "http"

    logger.warning(f"Edge {exc.code} en {url}: {detail[:200]}")
    return EdgeError(message, kind=kind, status_code=exc.code)


def _url_error(exc: urllib.error.URLError, url: str) -> EdgeError:
    """Distingue un problema de certificado de uno de red (VPN caída)."""
    reason = exc.reason

    if isinstance(reason, ssl.SSLCertVerificationError):
        return EdgeError(
            f"No se pudo verificar el certificado de {_host(url)}. Lo emite una CA "
            "interna: monta ese certificado en el contenedor y apunta "
            "APIGEE_EDGE_CA_BUNDLE, o pon APIGEE_EDGE_VERIFY_TLS=false.",
            kind="tls",
        )

    logger.warning(f"No se pudo contactar a {_host(url)}: {reason}")
    return EdgeError(
        f"No se pudo contactar a {_host(url)}. Estos hosts solo responden con la "
        "VPN corporativa levantada.",
        kind="vpn",
    )


def list_map_names(env_key: str, username: str, password: str) -> List[str]:
    """Nombres de los KVM del environment de Edge."""
    config = get_environment(env_key)
    payload = _request(_keyvaluemaps_url(config), _basic_auth(username, password))
    return _extract_names(payload)


def _extract_names(payload: Any) -> List[str]:
    """Saca los nombres tolerando las dos formas en que Edge puede responder.

    Lo normal es una lista de cadenas, pero según la versión y el parámetro
    ``expand`` puede llegar una lista de objetos o un envoltorio.
    """
    if isinstance(payload, dict):
        payload = payload.get("keyValueMap") or payload.get("keyValueMaps") or []

    if not isinstance(payload, list):
        return []

    names = []
    for item in payload:
        if isinstance(item, str):
            names.append(item)
        elif isinstance(item, dict) and item.get("name"):
            names.append(str(item["name"]))

    return names


def fetch_map(env_key: str, username: str, password: str, name: str) -> Dict[str, Any]:
    """Un KVM de Edge, ya en el formato del ``kvms.json`` local."""
    config = get_environment(env_key)
    payload = _request(_keyvaluemaps_url(config, name), _basic_auth(username, password))

    if not isinstance(payload, dict):
        raise EdgeError(f"Edge devolvió un formato inesperado para el KVM '{name}'.")

    return _normalize(payload, name)


def _normalize(payload: Dict[str, Any], fallback_name: str) -> Dict[str, Any]:
    """Normaliza la respuesta de Edge al formato del workspace."""
    raw_entries = payload.get("entry")

    if isinstance(raw_entries, dict):
        raw_entries = [{"name": k, "value": v} for k, v in raw_entries.items()]

    entries = []
    for item in raw_entries or []:
        if not isinstance(item, dict) or item.get("name") is None:
            continue
        value = item.get("value")
        entries.append({"name": str(item["name"]), "value": "" if value is None else str(value)})

    return {
        "name": str(payload.get("name") or fallback_name),
        "encrypted": bool(payload.get("encrypted", False)),
        "entry": entries,
    }


def is_masked(kvm: Dict[str, Any]) -> bool:
    """Indica si Edge devolvió los valores enmascarados en vez del contenido.

    Los KVM cifrados nunca exponen sus valores por la API: llegan como ``*****``.
    Importarlos tal cual dejaría el workspace con basura, así que hay que avisar
    de cuáles se trajeron sin valor real. Se comprueba que *todas* las entradas
    sean solo asteriscos, en vez de comparar con una máscara concreta, porque su
    longitud varía entre versiones de Edge.
    """
    entries = kvm.get("entry") or []
    return bool(entries) and all(
        str(entry.get("value", "")).strip("*") == "" and entry.get("value") for entry in entries
    )


def iter_all(env_key: str, username: str, password: str) -> Iterator[Tuple[str, Any]]:
    """Descarga los KVM del environment cediendo el avance según van llegando.

    Edge no expone un endpoint que devuelva todos los KVM con sus entradas de
    una sola llamada: hay que listar los nombres y luego pedirlos uno a uno. Con
    ochenta mapas eso tarda, así que en vez de bloquear hasta el final esto va
    emitiendo el progreso y la UI puede pintar una barra.

    Yields:
        ``("progress", {"done", "total", "current"})`` por cada KVM pedido y, al
        terminar, ``("result", (maps, masked))``.

    Un KVM que falla al leerse no aborta la descarga: se registra y se sigue,
    porque en Edge los permisos se conceden mapa a mapa.
    """
    config = get_environment(env_key)
    authorization = _basic_auth(username, password)
    names = _extract_names(_request(_keyvaluemaps_url(config), authorization))
    total = len(names)

    logger.info(f"Edge '{env_key}': {total} KVM listados")

    maps: List[Dict[str, Any]] = []
    masked: List[str] = []

    for done, name in enumerate(names, start=1):
        yield "progress", {"done": done, "total": total, "current": name}

        try:
            payload = _request(_keyvaluemaps_url(config, name), authorization)
        except EdgeError as exc:
            # Un 401/403 sobre un mapa concreto no debe tumbar toda la descarga.
            if exc.kind in ("auth", "forbidden", "notfound"):
                logger.warning(f"Edge '{env_key}': se omite el KVM '{name}' ({exc.kind})")
                continue
            raise

        if not isinstance(payload, dict):
            continue

        kvm = _normalize(payload, name)

        if is_masked(kvm):
            masked.append(kvm["name"])

        maps.append(kvm)

    logger.info(f"Edge '{env_key}': {len(maps)} KVM descargados, {len(masked)} enmascarados")
    yield "result", (maps, masked)


def fetch_all(env_key: str, username: str, password: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Descarga todos los KVM del environment de Edge, sin reportar avance.

    Envoltorio síncrono de :func:`iter_all` para quien no necesita el progreso.

    Returns:
        Tuple con la lista en formato de workspace y los nombres de los que
        llegaron enmascarados (cifrados en Edge), para poder avisar en la UI.
    """
    for kind, data in iter_all(env_key, username, password):
        if kind == "result":
            return data

    return [], []
