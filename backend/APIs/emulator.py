"""Cliente HTTP y empaquetado de código fuente para el emulador de Apigee.

El emulador (`gcr.io/apigee-release/hybrid/apigee-emulator`) expone una API de
administración en su puerto 8080 (`management.http.port`) bajo el prefijo `/v1`:

* ``POST /v1/emulator/deploy?environment=<env>`` — recibe en el cuerpo un ZIP con
  el código fuente completo del proyecto (``src/main/apigee/...``). El emulador
  crea una revisión nueva en ``/opt/apigee/sdlc/contracts/<N>``, compila el
  contrato y lo activa. Responde ``{"revision": "<N>"}``.
* ``GET  /v1/emulator/tree`` — devuelve los endpoints desplegados y su basepath.
* ``GET  /v1/emulator/version`` — metadatos del emulador y environment activo.

Este módulo replica exactamente el flujo que utiliza la extensión Cloud Code de
VS Code al pulsar "Deploy", de modo que la UI pueda desplegar sin depender del IDE.
"""

import io
import json
import logging
import os
import urllib.error
import urllib.request
import zipfile
from typing import Any, Dict, List, Optional

from django.conf import settings

logger = logging.getLogger(__name__)

# Directorios y archivos que nunca deben viajar dentro del archivo de código fuente.
EXCLUDED_DIRS = {".git", "__pycache__", "node_modules", ".idea", ".vscode"}
EXCLUDED_SUFFIXES = (".zip", ".pyc", ".log")


class EmulatorError(RuntimeError):
    """Error de comunicación o de validación devuelto por el emulador."""

    def __init__(self, message: str, status_code: Optional[int] = None, detail: str = ""):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.detail = detail


def _emulator_url(path: str) -> str:
    return f"{settings.APIGEE_EMULATOR_URL.rstrip('/')}{path}"


def build_source_archive(source_root: Optional[str] = None) -> bytes:
    """Comprime el workspace local con la estructura que espera el emulador.

    El emulador extrae el ZIP en la raíz de la revisión y busca los bundles bajo
    ``src/main/apigee``. Por eso cada entrada se escribe con el prefijo ``src/``,
    calculado a partir de ``APIGEE_SOURCE_ROOT`` (que apunta a la carpeta ``src``
    del proyecto montada dentro del contenedor).

    Args:
        source_root: Ruta a la carpeta ``src`` del proyecto. Por defecto usa
            ``settings.APIGEE_SOURCE_ROOT``.

    Returns:
        bytes: Contenido del ZIP listo para enviarse al emulador.
    """
    root = source_root or settings.APIGEE_SOURCE_ROOT

    if not os.path.isdir(root):
        raise EmulatorError(
            f"El workspace de Apigee no está montado en '{root}'. "
            "Verifica el volumen './src:/app/workspace' en docker-compose.yml."
        )

    buffer = io.BytesIO()
    prefix = settings.APIGEE_SOURCE_ARCHIVE_PREFIX

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for current_dir, dirs, files in os.walk(root):
            # Poda in-place para no descender en carpetas irrelevantes.
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]

            for file_name in files:
                if file_name.startswith(".") or file_name.endswith(EXCLUDED_SUFFIXES):
                    continue

                full_path = os.path.join(current_dir, file_name)
                rel_path = os.path.relpath(full_path, root).replace(os.sep, "/")
                archive.write(full_path, f"{prefix}/{rel_path}")

    logger.info(f"Archivo de código fuente generado ({buffer.tell()} bytes) desde {root}")
    return buffer.getvalue()


def _request(path: str, method: str = "GET", body: Optional[bytes] = None) -> Any:
    """Ejecuta una petición contra la API de administración del emulador."""
    url = _emulator_url(path)
    headers = {"Content-Type": "application/octet-stream"} if body is not None else {}
    request = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=settings.APIGEE_EMULATOR_TIMEOUT) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.error(f"El emulador respondió {exc.code} en {url}: {detail}")
        raise EmulatorError(
            f"El emulador rechazó la operación (HTTP {exc.code}).",
            status_code=exc.code,
            detail=detail,
        ) from exc
    except urllib.error.URLError as exc:
        logger.error(f"No se pudo contactar al emulador en {url}: {exc.reason}")
        raise EmulatorError(
            f"No se pudo contactar al emulador en {settings.APIGEE_EMULATOR_URL}. "
            "Confirma que el contenedor 'apigee-dev' esté arriba."
        ) from exc

    if not raw.strip():
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def deploy_workspace(environment: Optional[str] = None) -> Dict[str, Any]:
    """Empaqueta el workspace y lo despliega como una revisión nueva del emulador.

    Returns:
        Dict[str, Any]: Respuesta del emulador, p. ej. ``{"revision": "5"}``.
    """
    env = environment or settings.APIGEE_ENVIRONMENT
    archive = build_source_archive()

    logger.info(f"Desplegando workspace en el environment '{env}' ({len(archive)} bytes)")
    result = _request(f"/v1/emulator/deploy?environment={env}", method="POST", body=archive)

    if not isinstance(result, dict):
        result = {"raw": result}

    logger.info(f"Despliegue completado: {result}")
    return result


def get_tree() -> List[Dict[str, Any]]:
    """Devuelve los endpoints activos en el emulador (aplicación y basepath)."""
    result = _request("/v1/emulator/tree")
    return result if isinstance(result, list) else []


def get_version() -> Dict[str, Any]:
    """Devuelve la versión del emulador y el environment activo."""
    result = _request("/v1/emulator/version")
    return result if isinstance(result, dict) else {}
