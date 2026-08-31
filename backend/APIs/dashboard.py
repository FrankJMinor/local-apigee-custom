"""Datos reales del entorno local para el dashboard.

No hay un registro de auditoría en el emulador: no guarda un historial de lo que
se ha hecho. Pero el estado en disco sí lo cuenta, y con eso basta para una
actividad reciente honesta:

* Cada despliegue deja una carpeta en ``/apigee_runtime/sdlc/contracts/<N>``, y
  su fecha de creación es la del despliegue.
* Cada proxy y shared flow del workspace tiene la fecha del archivo más reciente
  de su bundle: eso es la última vez que se editó.
* Los KVM guardan su propio ``lastModifiedAt`` desde que se administran por la UI.

Se juntan las tres fuentes en una línea de tiempo, sin inventar nada: si algo no
se puede fechar, no aparece.
"""

import logging
import os
from typing import Any, Dict, List, Optional

from django.conf import settings

from . import bundles, emulator, kvms
from .services import BASE_CONTRACTS, get_current_revision

logger = logging.getLogger(__name__)

# Los KVM importados de Edge se escriben todos en el mismo segundo. Enumerarlos
# uno a uno ahogaría la lista, así que los que caen dentro de esta ventana se
# agrupan en un único evento.
GROUPING_WINDOW_MS = 60_000


def _millis(path: str) -> Optional[int]:
    try:
        return int(os.path.getmtime(path) * 1000)
    except OSError:
        return None


def _newest_file_millis(root: str) -> Optional[int]:
    """Fecha del archivo más reciente del árbol: la última edición del bundle."""
    newest = None

    for current_dir, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for name in files:
            stamp = _millis(os.path.join(current_dir, name))
            if stamp and (newest is None or stamp > newest):
                newest = stamp

    return newest


def _deployments() -> List[Dict[str, Any]]:
    """Un evento por cada revisión que el emulador tiene materializada."""
    contracts = os.path.join(BASE_CONTRACTS, "sdlc", "contracts")

    if not os.path.isdir(contracts):
        return []

    active = get_current_revision()
    events = []

    for revision in os.listdir(contracts):
        if not revision.isdigit():
            continue

        stamp = _millis(os.path.join(contracts, revision))
        if not stamp:
            continue

        events.append(
            {
                "type": "deploy",
                "action": f"Revisión {revision} desplegada",
                "detail": "contrato activo" if revision == active else "revisión anterior",
                "time": stamp,
            }
        )

    return events


def _artifacts(kind, label: str, event_type: str) -> List[Dict[str, Any]]:
    """Un evento por artefacto del workspace, con la fecha de su última edición."""
    root = bundles.artifacts_dir(kind)

    if not os.path.isdir(root):
        return []

    events = []

    for name in os.listdir(root):
        path = os.path.join(root, name)

        if not os.path.isdir(path):
            continue

        stamp = _newest_file_millis(path)
        if not stamp:
            continue

        events.append(
            {
                "type": event_type,
                "action": f"{label} {name} actualizado",
                "detail": name,
                "time": stamp,
            }
        )

    return events


def _keyvaluemaps(environment: str) -> List[Dict[str, Any]]:
    """Eventos de KVM, agrupando los que se tocaron a la vez.

    Una importación desde Edge actualiza decenas de KVM en el mismo instante;
    listarlos por separado no aporta nada y tapa el resto de la actividad.
    """
    try:
        maps = kvms.list_maps(environment)
    except kvms.KvmError as exc:
        logger.warning(f"No se pudo leer los KVM para la actividad: {exc}")
        return []

    stamped = sorted(
        ((item["lastModifiedAt"], item["name"]) for item in maps if item.get("lastModifiedAt")),
        reverse=True,
    )

    events = []
    bucket: List[str] = []
    bucket_time = None

    def flush():
        if not bucket:
            return
        if len(bucket) == 1:
            action = f"KVM {bucket[0]} actualizado"
            detail = bucket[0]
        else:
            action = f"{len(bucket)} Key Value Maps actualizados"
            detail = ", ".join(bucket[:3]) + ("…" if len(bucket) > 3 else "")
        events.append({"type": "kvm", "action": action, "detail": detail, "time": bucket_time})

    for stamp, name in stamped:
        if bucket_time is not None and bucket_time - stamp <= GROUPING_WINDOW_MS:
            bucket.append(name)
            continue

        flush()
        bucket, bucket_time = [name], stamp

    flush()
    return events


def recent_activity(environment: Optional[str] = None, limit: int = 12) -> List[Dict[str, Any]]:
    """Línea de tiempo del entorno local, de lo más reciente a lo más antiguo."""
    env = environment or settings.APIGEE_ENVIRONMENT

    events = (
        _deployments()
        + _artifacts(bundles.PROXY, "Proxy", "proxy")
        + _artifacts(bundles.SHAREDFLOW, "Shared flow", "sharedflow")
        + _keyvaluemaps(env)
    )

    events.sort(key=lambda item: item["time"], reverse=True)
    return events[:limit]


def _alerts(catalog: Dict[str, Any], revision: Optional[str]) -> List[Dict[str, Any]]:
    """Avisos derivados del estado real, no de una lista fija.

    Solo se avisa de cosas accionables: que el emulador no responda, que haya KVM
    sin cargar en el runtime o llaves que no puede sostener, y que no haya
    ninguna revisión desplegada.
    """
    alerts = []

    if not catalog.get("runtimeAvailable"):
        alerts.append(
            {
                "type": "warning",
                "title": "El emulador no responde",
                "detail": catalog.get("runtimeError")
                or "Comprueba que el contenedor 'apigee-dev' esté arriba.",
            }
        )

    if not revision:
        alerts.append(
            {
                "type": "warning",
                "title": "No hay ninguna revisión desplegada",
                "detail": "Pulsa Deploy para compilar y activar el workspace.",
            }
        )

    pending = [item for item in catalog.get("keyValueMaps", []) if not item.get("inSync")]
    if pending:
        alerts.append(
            {
                "type": "warning",
                "title": f"{len(pending)} KVM sin cargar en el emulador",
                "detail": "Usa «Recargar en emulador» para que las políticas los vean.",
            }
        )

    not_loadable = catalog.get("notLoadableKeyCount", 0)
    if not_loadable:
        alerts.append(
            {
                "type": "info",
                "title": f"{not_loadable} llaves fuera del runtime local",
                "detail": (
                    "Su nombre lleva «/» o tiene menos de dos caracteres. Están en el "
                    "workspace y en Edge, pero el emulador no las admite."
                ),
            }
        )

    if not alerts:
        alerts.append(
            {
                "type": "info",
                "title": "Todo en orden",
                "detail": "El workspace y el runtime del emulador están alineados.",
            }
        )

    return alerts


def summary(environment: Optional[str] = None) -> Dict[str, Any]:
    """Todo lo que pinta el dashboard, en una sola llamada."""
    env = environment or settings.APIGEE_ENVIRONMENT
    catalog = kvms.catalog(env)
    maps = catalog.get("keyValueMaps", [])

    try:
        revision = get_current_revision()
    except Exception as exc:  # noqa: BLE001 - el dashboard nunca debe romperse por esto
        logger.warning(f"No se pudo determinar la revisión activa: {exc}")
        revision = None

    try:
        tree = emulator.get_tree()
    except emulator.EmulatorError:
        tree = []

    proxies = sorted({str(item.get("application")) for item in tree if item.get("application")})
    sharedflows = bundles.existing_artifacts(bundles.SHAREDFLOW)
    entry_total = sum(item["entryCount"] for item in maps)

    return {
        "environment": env,
        "revision": revision,
        "stats": {
            "proxies": {"total": len(proxies), "detail": f"{len(tree)} endpoints enrutados"},
            "sharedFlows": {
                "total": len(sharedflows),
                "detail": f"en {env}",
            },
            "keyValueMaps": {
                "total": len(maps),
                "detail": f"{entry_total} llaves en total",
                "loaded": sum(1 for item in maps if item.get("inSync")),
            },
        },
        "activity": recent_activity(env),
        "alerts": _alerts(catalog, revision),
    }
