"""Flow hooks del environment: shared flows que corren en todos los proxies.

Réplica local de la pestaña *Environment Configuration → Flow Hooks* de Apigee
Edge. A diferencia de los caches, **el emulador sí aplica esta configuración**:
``ApigeeSource`` lee ``flowhooks.json`` y la compila dentro del contrato, así que
guardar aquí cambia de verdad lo que se ejecuta en el runtime local.

El archivo es un mapa indexado por punto de enganche::

    {
      "PreProxyFlowHook":   {"sharedFlow": "sf-pre-proxy",  "continueOnError": false},
      "PostTargetFlowHook": {"sharedFlow": "sf-post-target", "continueOnError": true}
    }

Un gancho sin asignar simplemente no aparece en el archivo.

Dos cosas comprobadas contra el contenedor, que condicionan la validación:

* Los nombres de gancho son un enum cerrado. Uno inventado revienta el
  despliegue con ``No enum constant ... FlowHookPoint.X`` y un HTTP 500.
* El shared flow tiene que estar desplegado. Si no, el emulador responde 400 con
  ``SharedFlowDoesNotExist`` y rechaza el contrato entero.

Por eso se valida antes de escribir, y si aun así el despliegue falla se revierte
el archivo y se vuelve a desplegar el estado anterior.
"""

import json
import logging
import os
import tempfile
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings

from . import emulator
from .services import get_list_shared_flows

logger = logging.getLogger(__name__)

FLOW_HOOKS_FILE = "flowhooks.json"

# El enum FlowHookPoint del emulador, en el orden en que se ejecutan.
HOOK_POINTS = (
    ("PreProxyFlowHook", "Pre-proxy Flow Hook"),
    ("PreTargetFlowHook", "Pre-target Flow Hook"),
    ("PostTargetFlowHook", "Post-target Flow Hook"),
    ("PostProxyFlowHook", "Post-proxy Flow Hook"),
)

HOOK_NAMES = tuple(name for name, _ in HOOK_POINTS)


class FlowHookError(ValueError):
    """La configuración de flow hooks no es válida."""


# ──────────────────────────────────────────────────────────────────────────────
# Archivo del workspace
# ──────────────────────────────────────────────────────────────────────────────


def flow_hooks_file(environment: Optional[str] = None) -> str:
    """Ruta al ``flowhooks.json`` del environment."""
    env = environment or settings.APIGEE_ENVIRONMENT
    return os.path.join(
        settings.APIGEE_SOURCE_ROOT, "main", "apigee", "environments", env, FLOW_HOOKS_FILE
    )


def _read_file(path: str) -> Dict[str, Any]:
    """Lee el ``flowhooks.json`` tolerando que no exista o esté vacío."""
    if not os.path.exists(path):
        return {}

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read().strip()
    except OSError as exc:
        raise FlowHookError(f"No se pudo leer '{path}': {exc}") from exc

    if not content:
        return {}

    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise FlowHookError(
            f"El archivo '{path}' tiene JSON inválido y debe corregirse a mano: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise FlowHookError(
            f"El archivo '{path}' debe ser un objeto indexado por punto de enganche."
        )

    return data


def _write_file(path: str, hooks: Dict[str, Any]) -> None:
    """Escribe el ``flowhooks.json`` de forma atómica."""
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    temporary = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=directory,
            prefix=f".{FLOW_HOOKS_FILE}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = handle.name
            json.dump(hooks, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

        os.replace(temporary, path)
        temporary = None
    except OSError as exc:
        raise FlowHookError(f"No se pudo escribir en '{path}': {exc}") from exc
    finally:
        if temporary and os.path.exists(temporary):
            os.remove(temporary)


# ──────────────────────────────────────────────────────────────────────────────
# Consulta
# ──────────────────────────────────────────────────────────────────────────────


def deployed_shared_flows() -> List[str]:
    """Shared flows desplegados en el emulador, que son los que se pueden enganchar.

    El emulador valida el gancho contra el contrato activo: si el shared flow no
    está desplegado, rechaza el despliegue entero. Por eso el desplegable de la
    UI se alimenta de aquí y no de la carpeta del workspace.
    """
    path = get_list_shared_flows()

    if not path or not os.path.isdir(path):
        logger.info("No hay revisión activa: no se pueden listar los shared flows.")
        return []

    return sorted(name for name in os.listdir(path) if os.path.isdir(os.path.join(path, name)))


def list_hooks(environment: Optional[str] = None) -> List[Dict[str, Any]]:
    """Los cuatro ganchos, asignados o no, en su orden de ejecución."""
    env = environment or settings.APIGEE_ENVIRONMENT
    stored = _read_file(flow_hooks_file(env))
    hooks = []

    for name, label in HOOK_POINTS:
        entry = stored.get(name)
        shared_flow = ""
        continue_on_error = False

        if isinstance(entry, dict):
            shared_flow = str(entry.get("sharedFlow") or "")
            continue_on_error = bool(entry.get("continueOnError", False))
        elif isinstance(entry, str):
            # Tolera la forma abreviada de un archivo escrito a mano.
            shared_flow = entry

        hooks.append(
            {
                "name": name,
                "label": label,
                "sharedFlow": shared_flow,
                "continueOnError": continue_on_error,
            }
        )

    return hooks


def catalog(environment: Optional[str] = None) -> Dict[str, Any]:
    """Lo que pinta la pantalla: los ganchos y los shared flows disponibles."""
    env = environment or settings.APIGEE_ENVIRONMENT
    available = deployed_shared_flows()
    hooks = list_hooks(env)

    for hook in hooks:
        # Un gancho puede apuntar a un shared flow que ya se borró: el archivo lo
        # conserva, pero el próximo despliegue fallaría. Conviene avisarlo.
        hook["missing"] = bool(hook["sharedFlow"]) and hook["sharedFlow"] not in available

    return {
        "environment": env,
        "flowHooks": hooks,
        "sharedFlows": available,
        "source": os.path.relpath(flow_hooks_file(env), settings.APIGEE_SOURCE_ROOT).replace(
            os.sep, "/"
        ),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Escritura
# ──────────────────────────────────────────────────────────────────────────────


def save_hooks(
    hooks: List[Dict[str, Any]], environment: Optional[str] = None
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Guarda los ganchos y redespliega el contrato.

    Se valida todo antes de tocar el disco, porque los dos fallos posibles son
    caros: un punto de enganche inventado tumba el despliegue con un 500 del
    emulador, y un shared flow inexistente lo rechaza con un 400. Si aun así el
    despliegue falla, se restaura el archivo y se vuelve a desplegar.

    Args:
        hooks: Lista de ``{"name", "sharedFlow", "continueOnError"}``. Un
            ``sharedFlow`` vacío desasigna el gancho.
        environment: Environment a configurar.

    Returns:
        Tuple con el catálogo resultante y la respuesta del despliegue.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    path = flow_hooks_file(env)
    previous = _read_file(path)
    available = deployed_shared_flows()

    updated: Dict[str, Any] = {}
    seen = set()

    for hook in hooks:
        if not isinstance(hook, dict):
            raise FlowHookError("Cada gancho debe ser un objeto con 'name' y 'sharedFlow'.")

        name = str(hook.get("name") or "").strip()

        if name not in HOOK_NAMES:
            raise FlowHookError(
                f"Punto de enganche desconocido: '{name}'. "
                f"El emulador solo acepta: {', '.join(HOOK_NAMES)}."
            )

        if name in seen:
            raise FlowHookError(f"El gancho '{name}' viene repetido.")

        seen.add(name)
        shared_flow = str(hook.get("sharedFlow") or "").strip()

        # Sin shared flow el gancho queda sin asignar, que en el archivo se
        # representa por ausencia.
        if not shared_flow:
            continue

        if shared_flow not in available:
            disponibles = ", ".join(available) if available else "ninguno desplegado"
            raise FlowHookError(
                f"El shared flow '{shared_flow}' no está desplegado en el emulador, "
                f"así que el despliegue lo rechazaría. Disponibles: {disponibles}."
            )

        updated[name] = {
            "sharedFlow": shared_flow,
            "continueOnError": bool(hook.get("continueOnError", False)),
        }

    _write_file(path, updated)

    try:
        deployment = emulator.deploy_workspace(env)
    except emulator.EmulatorError:
        logger.error(f"Despliegue fallido tras guardar los flow hooks, revirtiendo {path}")
        _write_file(path, previous)

        try:
            emulator.deploy_workspace(env)
        except emulator.EmulatorError as restore_exc:
            logger.error(f"No se pudo restaurar el contrato anterior: {restore_exc}")

        raise

    asignados = len(updated)
    logger.info(f"Guardados {asignados} flow hook(s) en {path} y redesplegado el contrato")
    return catalog(env), deployment
