"""Normalización de las sesiones de depuración (Trace) del emulador.

El emulador expone la misma traza que la consola de Apigee, en JSON:

    {"DebugSession": {...},
     "Messages": [{"completed": true,
                   "point": [{"id": "Execution", "results": [...]}, ...]}]}

Cada ``point`` es un instante del flujo y sus ``results`` describen qué pasó:

* ``DebugInfo``      — propiedades del punto. En los puntos ``Execution`` trae
  ``stepDefinition-name``, que es el nombre de la política que se ejecutó.
* ``VariableAccess`` — lista de lecturas (``Get``) y escrituras (``Set``) de
  variables de flujo: es lo que permite ver qué pasa con los datos.
* ``RequestMessage`` / ``ResponseMessage`` — el mensaje tal como estaba en ese
  instante (verbo, URI, cabeceras, código de estado, cuerpo).

Ese formato es fiel pero incómodo de pintar: una petición sencilla genera unos 40
puntos, la mayoría ruido de infraestructura. Este módulo lo aplana en una lista
ordenada de pasos con nombre, duración y variables, que es lo que consume la UI.
"""

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Formato de los timestamps del emulador: "28-08-26 22:56:40:215" (dd-MM-yy y ms).
TIMESTAMP_PATTERN = re.compile(r"^(\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):(\d{1,3})$")

# Ejecuciones internas del motor que no aportan nada al depurar un proxy.
INTERNAL_EXECUTION_TYPES = {
    "ApiSecurityAction",
    "EchoRequestExecution",
    "CORSResponseOrErrorFlowExecution",
    "MintExecution",
    "AnalyticsPredefinedVariablesPublisher",
    "AnalyticsPublisher",
}

# Variables de infraestructura que saturan la vista sin explicar el flujo.
NOISY_VARIABLE_PREFIXES = (
    "analytics.",
    "apigee.",
    "system.",
    "messageid",
    "organization.",
    "environment.",
)


def _parse_timestamp(raw: Optional[str]) -> Optional[float]:
    """Convierte el timestamp del emulador en epoch de milisegundos.

    Devuelve None si el formato no es el esperado, para que un cambio de versión
    del emulador degrade la vista en vez de romperla.
    """
    if not raw:
        return None

    match = TIMESTAMP_PATTERN.match(raw.strip())
    if not match:
        return None

    try:
        base = datetime.strptime(match.group(1), "%d-%m-%y %H:%M:%S")
    except ValueError:
        return None

    return base.timestamp() * 1000 + int(match.group(2))


def _properties(result: Dict[str, Any]) -> Dict[str, str]:
    """Aplana el bloque ``properties.property`` en un diccionario."""
    entries = (result.get("properties") or {}).get("property") or []
    return {e.get("name"): e.get("value") for e in entries if isinstance(e, dict) and e.get("name")}


def _headers(result: Dict[str, Any]) -> Dict[str, str]:
    return {
        h.get("name"): h.get("value")
        for h in result.get("headers") or []
        if isinstance(h, dict) and h.get("name")
    }


def _variables(result: Dict[str, Any], include_noisy: bool) -> Dict[str, List[Dict[str, Any]]]:
    """Separa la lista de accesos a variables en lecturas y escrituras."""
    reads: List[Dict[str, Any]] = []
    writes: List[Dict[str, Any]] = []

    for access in result.get("accessList") or []:
        if not isinstance(access, dict):
            continue

        for kind, bucket in (("Get", reads), ("Set", writes)):
            entry = access.get(kind)
            if not isinstance(entry, dict):
                continue

            name = entry.get("name") or ""
            if not include_noisy and name.lower().startswith(NOISY_VARIABLE_PREFIXES):
                continue

            item = {"name": name, "value": entry.get("value")}
            if kind == "Set":
                item["success"] = entry.get("success", True)
            bucket.append(item)

    return {"read": reads, "written": writes}


def _classify(point_id: str, props: Dict[str, str]) -> Dict[str, Optional[str]]:
    """Traduce un punto crudo a algo que la UI pueda etiquetar.

    Returns:
        Dict con ``kind`` y ``title``, o ``kind`` None si el punto debe omitirse.
    """
    if point_id == "Execution":
        policy = props.get("stepDefinition-name")
        if policy:
            return {"kind": "policy", "title": policy}

        # Ejecuciones del propio motor: solo interesan si no son ruido conocido.
        exec_type = props.get("type")
        if exec_type in INTERNAL_EXECUTION_TYPES:
            return {"kind": None, "title": None}
        return {"kind": "engine", "title": exec_type or "Execution"}

    if point_id == "Condition":
        expression = props.get("Expression")
        if not expression:
            return {"kind": None, "title": None}
        return {"kind": "condition", "title": expression}

    if point_id == "StateChange":
        to_state = props.get("To")
        return {"kind": "state", "title": to_state or "StateChange"}

    if point_id == "FlowInfo":
        # FlowInfo solo aporta si trae variables; sus propiedades son metadatos.
        return {"kind": "flow", "title": "FlowInfo"}

    if point_id in {"Paused", "Resumed"}:
        return {"kind": "transport", "title": point_id}

    return {"kind": None, "title": None}


def _build_step(
    point: Dict[str, Any], include_noisy: bool, policy_types: Dict[str, str]
) -> Optional[Dict[str, Any]]:
    """Convierte un punto de la traza en un paso de la línea de tiempo."""
    point_id = point.get("id") or ""
    props: Dict[str, str] = {}
    variables = {"read": [], "written": []}
    timestamp_ms: Optional[float] = None
    request = None
    response = None

    for result in point.get("results") or []:
        if not isinstance(result, dict):
            continue

        action = result.get("ActionResult")

        if action == "DebugInfo":
            props.update(_properties(result))
            timestamp_ms = timestamp_ms or _parse_timestamp(result.get("timestamp"))

        elif action == "VariableAccess":
            found = _variables(result, include_noisy)
            variables["read"].extend(found["read"])
            variables["written"].extend(found["written"])

        elif action == "RequestMessage":
            request = {
                "verb": result.get("verb"),
                "uri": result.get("uRI"),
                "headers": _headers(result),
                "body": result.get("body") or "",
            }

        elif action == "ResponseMessage":
            response = {
                "statusCode": result.get("statusCode"),
                "reasonPhrase": result.get("reasonPhrase"),
                "headers": _headers(result),
                "body": result.get("body") or "",
            }

    classified = _classify(point_id, props)
    kind = classified["kind"]

    if kind is None:
        return None

    # Un FlowInfo sin variables ni mensajes es puro metadato: no aporta al flujo.
    has_payload = bool(variables["read"] or variables["written"] or request or response)
    if kind == "flow" and not has_payload:
        return None

    title = classified["title"]
    step: Dict[str, Any] = {
        "kind": kind,
        "title": title,
        "pointId": point_id,
        "timestampMs": timestamp_ms,
        "variables": variables,
        "properties": props,
        "request": request,
        "response": response,
    }

    if kind == "policy":
        # El trace solo da el nombre; el tipo lo sacamos del bundle desplegado.
        step["policyType"] = policy_types.get(title)
    elif kind == "condition":
        step["expressionResult"] = props.get("ExpressionResult")
        step["tree"] = props.get("Tree")

    return step


def _message_summary(steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Extrae la petición de entrada y la respuesta final de una transacción."""
    request = next((s["request"] for s in steps if s.get("request")), None)
    response = None

    for step in reversed(steps):
        if step.get("response") and step["response"].get("statusCode") is not None:
            response = step["response"]
            break

    return {"request": request, "response": response}


def normalize_transactions(
    raw: Dict[str, Any],
    policy_types: Optional[Dict[str, str]] = None,
    include_noisy: bool = False,
) -> Dict[str, Any]:
    """Aplana la respuesta cruda del emulador en transacciones y pasos.

    Args:
        raw: JSON tal cual lo devuelve ``/v1/emulator/trace/transactions``.
        policy_types: Mapa ``nombre de política -> tipo`` del bundle desplegado,
            para poder mostrar "GetKVM (KeyValueMapOperations)".
        include_noisy: Incluye las variables de infraestructura, útil al depurar
            el propio emulador.

    Returns:
        Dict[str, Any]: ``session`` y ``transactions``, cada una con su petición,
        su respuesta y la lista ordenada de pasos.
    """
    policy_types = policy_types or {}
    session_raw = raw.get("DebugSession") or {}

    session = {
        "id": session_raw.get("SessionId"),
        "organization": session_raw.get("Organization"),
        "environment": session_raw.get("Environment"),
        "revision": session_raw.get("Revision"),
    }

    transactions = []

    for index, message in enumerate(raw.get("Messages") or []):
        if not isinstance(message, dict):
            continue

        steps = []
        for point in message.get("point") or []:
            if not isinstance(point, dict):
                continue

            step = _build_step(point, include_noisy, policy_types)
            if step:
                steps.append(step)

        if not steps:
            continue

        # El offset relativo es más legible que la hora absoluta al comparar pasos.
        stamps = [s["timestampMs"] for s in steps if s["timestampMs"] is not None]
        start = min(stamps) if stamps else None
        end = max(stamps) if stamps else None

        for position, step in enumerate(steps):
            step["index"] = position
            step["offsetMs"] = (
                round(step["timestampMs"] - start) if step["timestampMs"] and start else None
            )

        summary = _message_summary(steps)
        transactions.append(
            {
                "index": index,
                "completed": bool(message.get("completed")),
                "durationMs": round(end - start) if start is not None and end is not None else None,
                "request": summary["request"],
                "response": summary["response"],
                "policies": [s["title"] for s in steps if s["kind"] == "policy"],
                "steps": steps,
            }
        )

    logger.info(
        f"Traza normalizada: {len(transactions)} transacción(es), "
        f"{sum(len(t['steps']) for t in transactions)} pasos"
    )
    return {"session": session, "transactions": transactions}


def policy_types_for(file_tree: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Mapa ``nombre de política -> tipo`` a partir del árbol del proxy."""
    if not file_tree:
        return {}

    return {
        policy.get("name"): policy.get("type")
        for policy in file_tree.get("policies") or []
        if policy.get("name")
    }
