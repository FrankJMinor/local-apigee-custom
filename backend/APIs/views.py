# local imports
import json
import logging

# global libraries
import os
import socket
import time
import urllib.error
import urllib.request
from datetime import datetime

from django.conf import settings
from django.http import StreamingHttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from . import bundles, caches, dashboard, edge, emulator, flowhooks, kvms, trace
from .services import (
    get_current_revision,
    get_latest_revision_path,
    get_list_shared_flows,
    get_proxy_file_tree,
    get_sharedflow_file_tree,
)
from .utility import ApigeeTemplateService

logger = logging.getLogger(__name__)


def _as_bool(value) -> bool:
    """Interpreta los valores que envían los formularios HTML como booleanos."""
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


class SSERenderer(BaseRenderer):
    """Renderer que permite a DRF negociar `text/event-stream`.

    Sin él, la negociación de contenido responde 406 a `EventSource`, que envía
    `Accept: text/event-stream`. El cuerpo lo emite un StreamingHttpResponse, así
    que este render() nunca llega a usarse.
    """

    media_type = "text/event-stream"
    format = "sse"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


def _sse(event: str, payload: dict) -> str:
    """Serializa un evento en el formato de Server-Sent Events."""
    data = json.dumps(payload, ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n"


class ApigeeOrganizationApisView(APIView):
    """
    Simula el endpoint oficial de Apigee: /v1/organizations/{org}/apis
    Mapea el estado real del emulador a la estructura compleja que espera la UI.
    """

    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        summary="Importa un bundle de proxy y lo despliega en el emulador",
        description=(
            "Réplica local de `POST /v1/organizations/{org}/apis?action=import&name={name}`.\n\n"
            "Recibe el ZIP del bundle (con la carpeta `apiproxy/` en la raíz), lo valida, "
            "lo escribe en el workspace `src/main/apigee/apiproxies/<name>`, lo registra en "
            "`deployments.json` y dispara el despliegue en el emulador. Si el emulador "
            "rechaza el contrato, el workspace se deja como estaba."
        ),
        parameters=[
            OpenApiParameter("action", str, description="Compatibilidad con Apigee: `import`."),
            OpenApiParameter("name", str, description="Nombre del proxy a crear."),
            OpenApiParameter("overwrite", bool, description="Reemplaza un proxy existente."),
        ],
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "format": "binary"},
                    "name": {"type": "string"},
                    "environment": {"type": "string"},
                    "overwrite": {"type": "boolean"},
                },
                "required": ["file"],
            }
        },
        responses={201: dict, 400: dict, 502: dict},
    )
    def post(self, request, org):
        upload = request.FILES.get("file") or request.FILES.get("bundle")

        if upload is None:
            return Response(
                {
                    "error": "Falta el archivo del bundle.",
                    "detail": "Envía el ZIP en el campo 'file' de un formulario multipart.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # El nombre puede llegar por query string (como en Apigee) o en el formulario.
        raw_name = request.query_params.get("name") or request.data.get("name") or ""
        if not raw_name:
            raw_name = os.path.splitext(os.path.basename(upload.name or ""))[0]

        environment = request.data.get("environment") or settings.APIGEE_ENVIRONMENT
        overwrite = _as_bool(
            request.query_params.get("overwrite") or request.data.get("overwrite") or False
        )

        try:
            metadata, backup = bundles.import_proxy_bundle(
                upload.read(), raw_name, environment=environment, overwrite=overwrite
            )
        except bundles.BundleError as exc:
            logger.warning(f"Bundle rechazado para '{raw_name}': {exc}")
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        proxy_name = metadata["name"]

        try:
            deployment = emulator.deploy_workspace(environment)
        except emulator.EmulatorError as exc:
            # El contrato no se activó: devolvemos el workspace a su estado previo.
            logger.error(f"Despliegue fallido de '{proxy_name}', revirtiendo: {exc}")
            bundles.remove_bundle(proxy_name)
            bundles.unregister_deployment(proxy_name, environment)

            if backup:
                # Puede diferir en mayúsculas del nombre pedido: restauramos el real.
                previous = metadata.get("replacedName") or proxy_name
                bundles.restore_bundle(backup, previous)
                bundles.register_deployment(previous, environment)

            return Response(
                {"error": exc.message, "detail": exc.detail, "proxy": proxy_name},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        bundles.discard_backup(backup)
        revision = str(deployment.get("revision", "1"))
        logger.info(f"Proxy '{proxy_name}' desplegado en la revisión {revision} de {org}")

        return Response(
            {
                "name": proxy_name,
                "organization": org,
                "environment": environment,
                "revision": revision,
                "basepaths": metadata["basepaths"],
                "proxies": metadata["flows"],
                "targets": metadata["targets"],
                "policies": metadata["policies"],
                "replaced": metadata["replaced"],
                "declaredName": metadata["declared_name"],
                "files": metadata["files"],
            },
            status=status.HTTP_201_CREATED,
        )

    def get(self, request, org):
        # 1. Obtener datos del entorno real
        container_id = socket.gethostname()  # ID del contenedor (UUID en tu estructura vieja)
        ruta_base = get_latest_revision_path()

        # 2. Inicializar estructura base
        # El name del environment lo sacamos de la ruta o lo dejamos fijo como 'local'
        response = {"aPIProxy": [], "name": "emulator-env", "organization": org}

        if not ruta_base or not os.path.exists(ruta_base):
            logger.warning("No se encontró ruta de contratos activa.")
            return Response(response)

        # 3. Extraer el número de revisión real desde la ruta (ej: carpeta '4')
        # /apigee_runtime/sdlc/contracts/4/src/...
        revision_id = "1"
        parts = ruta_base.split("/")
        if "contracts" in parts:
            idx = parts.index("contracts")
            revision_id = parts[idx + 1]

        # 4. Escanear proxies físicos
        try:
            proxies_fisicos = [
                d for d in os.listdir(ruta_base) if os.path.isdir(os.path.join(ruta_base, d))
            ]

            for i, proxy_name in enumerate(proxies_fisicos, 1):
                proxy_detail = {
                    "name": proxy_name,
                    "revision": [
                        {
                            "configuration": {
                                "basePath": f"/{proxy_name.lower()}",  # Por ahora simulado
                                "configVersion": f"SHA-512:local-revision-{revision_id}",
                                "steps": [],
                            },
                            "name": revision_id,  # Usamos la revisión real del emulador
                            "server": [
                                {
                                    "pod": {"name": "gateway-1", "region": "mexico-city"},
                                    "status": "deployed",
                                    "type": ["message-processor"],
                                    "uUID": container_id,
                                }
                            ],
                            "state": "deployed",
                            "lastModifiedAt": datetime.now().isoformat(),
                        }
                    ],
                }
                response["aPIProxy"].append(proxy_detail)

            logger.info(f"Mapeados {len(proxies_fisicos)} proxies para la organización {org}")

        except Exception as e:
            logger.exception("Error al construir la respuesta espejo de Apigee")
            return Response({"error": str(e)}, status=500)

        return Response(response)


class ApigeeOrganizationSharedFlowsView(APIView):
    """
    Simula el endpoint oficial de Apigee: /v1/organizations/{org}/apis
    Mapea el estado real del emulador a la estructura compleja que espera la UI.
    """

    def get(self, request, org):
        # 1. Obtener datos del entorno real
        container_id = socket.gethostname()  # ID del contenedor (UUID en tu estructura vieja)
        ruta_base = get_list_shared_flows()

        # 2. Inicializar estructura base
        # El name del environment lo sacamos de la ruta o lo dejamos fijo como 'local'
        response = {"aPIProxy": [], "name": "emulator-env", "organization": org}

        if not ruta_base or not os.path.exists(ruta_base):
            logger.warning("No se encontró ruta de contratos activa.")
            return Response(response)

        # 3. Extraer el número de revisión real desde la ruta (ej: carpeta '4')
        # /apigee_runtime/sdlc/contracts/4/src/...
        revision_id = "1"
        parts = ruta_base.split("/")
        if "contracts" in parts:
            idx = parts.index("contracts")
            revision_id = parts[idx + 1]

        # 4. Escanear proxies físicos
        try:
            proxies_fisicos = [
                d for d in os.listdir(ruta_base) if os.path.isdir(os.path.join(ruta_base, d))
            ]

            for i, proxy_name in enumerate(proxies_fisicos, 1):
                proxy_detail = {
                    "name": proxy_name,
                    "revision": [
                        {
                            "configuration": {
                                "basePath": f"/{proxy_name.lower()}",  # Por ahora simulado
                                "configVersion": f"SHA-512:local-revision-{revision_id}",
                                "steps": [],
                            },
                            "name": revision_id,  # Usamos la revisión real del emulador
                            "server": [
                                {
                                    "pod": {"name": "gateway-1", "region": "mexico-city"},
                                    "status": "deployed",
                                    "type": ["message-processor"],
                                    "uUID": container_id,
                                }
                            ],
                            "state": "deployed",
                            "lastModifiedAt": datetime.now().isoformat(),
                        }
                    ],
                }
                response["aPIProxy"].append(proxy_detail)

            logger.info(f"Mapeados {len(proxies_fisicos)} proxies para la organización {org}")

        except Exception as e:
            logger.exception("Error al construir la respuesta espejo de Apigee")
            return Response({"error": str(e)}, status=500)

        return Response(response)


# Esta clase es para listar los proxies desplegados
class ProxyDeployedListView(APIView):
    def get(self, request):
        path = get_latest_revision_path()

        if not path or not os.path.exists(path):
            return Response(
                {"error": "No se encontraron despliegues activos", "ruta": path},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Listamos las carpetas de proxies
        proxies = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]

        return Response(
            {
                "status": "online",
                "revision": os.path.basename(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(path))))
                ),
                "proxies": proxies,
                "total": len(proxies),
            }
        )


# Esta clase es para listar los archivos físicos de un proxy específico, similar a ProxyTreeView pero listando solo los archivos sin la estructura XML
class ProxyFileListView(APIView):
    """API para listar los archivos físicos de un bundle de proxy."""

    def get(self, request, proxy_name):
        files = get_proxy_file_tree(proxy_name)

        if files is None:
            return Response(
                {"error": f"No se pudo encontrar el bundle del proxy '{proxy_name}'"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "proxy": proxy_name,
                "revision": get_current_revision(),
                "total_files": len(files),
                "files": files,
            }
        )


# Esta clase es para listar los shared flows desplegados, similar a ProxyDeployedListView pero para shared flows
class SharedFlowDeployedListView(APIView):
    def get(self, request):
        path = get_list_shared_flows()

        if not path or not os.path.exists(path):
            return Response(
                {"error": "No se encontraron despliegues activos", "ruta": path},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Listamos las carpetas de shared flows
        shared_flows = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]

        return Response(
            {
                "status": "online",
                "revision": os.path.basename(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(path))))
                ),
                "shared_flows": shared_flows,
                "total": len(shared_flows),
            }
        )


# Esta clase es para listar los archivos físicos de un shared flow específico, similar a ProxyFileListView pero para shared flows
class SharedFlowFileListView(APIView):
    """API para listar los archivos físicos de un bundle de shared flow."""

    def get(self, request, shared_flow_name):
        files = get_sharedflow_file_tree(shared_flow_name)

        if files is None:
            return Response(
                {"error": f"No se pudo encontrar el bundle del shared flow '{shared_flow_name}'"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "shared_flow": shared_flow_name,
                "revision": get_current_revision(),
                "total_files": len(files),
                "files": files,
            }
        )


# Esta clase es para generar el menú de políticas basado en los snippets de VS Code, similar a lo que hace ApigeeTemplateService pero expuesto como API
class ApigeePolicyMenuView(APIView):
    def get(self, request):
        service = ApigeeTemplateService()
        data = service.generate_menu_json()
        return Response(data)


# Esta clase expone el despliegue del workspace completo hacia el emulador,
# equivalente al botón "Deploy" de la extensión Cloud Code de VS Code.
class EmulatorDeployView(APIView):
    """Empaqueta `src/main/apigee` y lo activa como una revisión nueva del emulador."""

    @extend_schema(
        summary="Despliega el workspace local en el emulador",
        responses={200: dict, 502: dict},
    )
    def post(self, request):
        environment = request.data.get("environment") or settings.APIGEE_ENVIRONMENT

        try:
            deployment = emulator.deploy_workspace(environment)
        except emulator.EmulatorError as exc:
            return Response(
                {"error": exc.message, "detail": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"environment": environment, **deployment})


# Esta clase refleja el estado vivo del emulador (versión y endpoints activos),
# útil para confirmar en la UI que un proxy recién importado quedó enrutado.
class EmulatorStatusView(APIView):
    """Versión del emulador y árbol de endpoints actualmente desplegados."""

    @extend_schema(
        summary="Estado del emulador y endpoints activos",
        responses={200: dict, 502: dict},
    )
    def get(self, request):
        try:
            return Response({"version": emulator.get_version(), "tree": emulator.get_tree()})
        except emulator.EmulatorError as exc:
            return Response(
                {"error": exc.message, "detail": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )


# Esta clase persiste en el workspace lo que se edita en el editor de la UI
# (XML de políticas, endpoints, scripts) y opcionalmente redespliega el proxy.
class ProxyFileUpdateView(APIView):
    """Guarda archivos editados de un proxy y despliega la revisión resultante."""

    @extend_schema(
        summary="Guarda archivos de un proxy y lo despliega",
        description=(
            "Escribe el contenido editado en `src/main/apigee/apiproxies/<proxy>/apiproxy/` "
            "y, si `deploy` es true, lanza el despliegue en el emulador devolviendo la "
            "revisión resultante. Si el emulador rechaza el contrato, los archivos "
            "vuelven a su estado anterior.\n\n"
            "Acepta un único archivo (`path` + `content`) o varios en `files`."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "files": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "path": {"type": "string"},
                                "content": {"type": "string"},
                            },
                        },
                    },
                    "deploy": {"type": "boolean", "default": True},
                    "environment": {"type": "string"},
                },
            }
        },
        responses={200: dict, 400: dict, 502: dict},
    )
    def post(self, request, proxy_name):
        payload = request.data if isinstance(request.data, dict) else {}
        files = payload.get("files")

        # Compatibilidad con el guardado de un solo archivo desde el editor.
        if not files and payload.get("path") is not None:
            files = [{"path": payload.get("path"), "content": payload.get("content")}]

        if not isinstance(files, list) or not files:
            return Response(
                {
                    "error": "No se recibió ningún archivo que guardar.",
                    "detail": "Envía 'files': [{'path': ..., 'content': ...}] o 'path' y 'content'.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        should_deploy = _as_bool(payload.get("deploy", True))

        try:
            written, backup = bundles.save_proxy_files(proxy_name, files)
        except bundles.BundleError as exc:
            logger.warning(f"Guardado rechazado para '{proxy_name}': {exc}")
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not should_deploy:
            bundles.discard_backup(backup)
            return Response(
                {
                    "proxy": proxy_name,
                    "saved": written,
                    "deployed": False,
                    "revision": get_current_revision(),
                }
            )

        try:
            deployment = emulator.deploy_workspace(environment)
        except emulator.EmulatorError as exc:
            # El contrato no compiló: deshacemos la edición para no dejar el
            # workspace en un estado que el emulador no acepta.
            logger.error(f"Despliegue fallido tras editar '{proxy_name}', revirtiendo: {exc}")
            bundles.restore_bundle(backup, proxy_name)

            return Response(
                {
                    "error": exc.message,
                    "detail": exc.detail,
                    "proxy": proxy_name,
                    "reverted": True,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        bundles.discard_backup(backup)
        revision = str(deployment.get("revision") or get_current_revision() or "1")
        logger.info(f"Proxy '{proxy_name}' actualizado y desplegado en la revisión {revision}")

        return Response(
            {
                "proxy": proxy_name,
                "saved": written,
                "deployed": True,
                "environment": environment,
                "revision": revision,
            }
        )


def _delete_and_deploy(names, environment, kind=bundles.PROXY):
    """Saca los artefactos del workspace y redespliega; revierte si el emulador falla.

    Devuelve la tupla (payload, http_status) lista para responder.
    """
    try:
        deleted, missing, backups = bundles.delete_bundles(names, environment, kind)
    except bundles.BundleError as exc:
        return {"error": str(exc)}, status.HTTP_400_BAD_REQUEST

    if not deleted:
        return (
            {
                "error": f"Ninguno de los {kind.label}s indicados existe en el workspace.",
                "notFound": missing,
            },
            status.HTTP_404_NOT_FOUND,
        )

    try:
        # El emulador no expone un borrado por artefacto: su runtime se deriva del
        # workspace, así que redesplegar sin ellos es lo que los saca del contenedor.
        deployment = emulator.deploy_workspace(environment)
    except emulator.EmulatorError as exc:
        logger.error(f"Despliegue fallido tras borrar {deleted}, revirtiendo: {exc}")
        bundles.restore_deleted_bundles(backups, environment, kind)

        return (
            {
                "error": exc.message,
                "detail": exc.detail,
                "proxies": deleted,
                "reverted": True,
            },
            status.HTTP_502_BAD_GATEWAY,
        )

    for backup in backups.values():
        bundles.discard_backup(backup)

    revision = str(deployment.get("revision") or get_current_revision() or "1")
    logger.info(f"Proxies {deleted} eliminados; emulador en la revisión {revision}")

    return (
        {
            "deleted": deleted,
            "notFound": missing,
            "environment": environment,
            "revision": revision,
        },
        status.HTTP_200_OK,
    )


# Esta clase replica el borrado de un proxy de Apigee y lo propaga al emulador.
class ApigeeProxyDetailView(APIView):
    """Elimina un proxy del workspace y del runtime del emulador."""

    @extend_schema(
        summary="Elimina un API proxy",
        description=(
            "Réplica local de `DELETE /v1/organizations/{org}/apis/{api}`. Saca el proxy "
            "de `src/main/apigee/apiproxies/`, lo desregistra del `deployments.json` y "
            "redespliega para que desaparezca del contenedor del emulador. Si el "
            "despliegue falla, el proxy vuelve a su sitio."
        ),
        responses={200: dict, 400: dict, 404: dict, 502: dict},
    )
    def delete(self, request, org, proxy_name):
        environment = request.query_params.get("environment") or settings.APIGEE_ENVIRONMENT
        payload, code = _delete_and_deploy([proxy_name], environment)
        return Response(payload, status=code)


# Esta clase permite borrar varios proxies con un solo despliegue, que es lo que
# necesita la selección múltiple de la tabla.
class ProxyBulkDeleteView(APIView):
    """Elimina varios proxies a la vez con un único redespliegue."""

    @extend_schema(
        summary="Elimina varios API proxies",
        description=(
            "Borra en bloque y redespliega una sola vez, en lugar de generar una "
            "revisión por proxy. Si el emulador rechaza el contrato resultante, todos "
            "los proxies se restauran."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "proxies": {"type": "array", "items": {"type": "string"}},
                    "environment": {"type": "string"},
                },
                "required": ["proxies"],
            }
        },
        responses={200: dict, 400: dict, 404: dict, 502: dict},
    )
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        proxies = payload.get("proxies")

        if not isinstance(proxies, list) or not proxies:
            return Response(
                {
                    "error": "No se recibió ningún proxy que eliminar.",
                    "detail": "Envía 'proxies': ['NombreA', 'NombreB'].",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        body, code = _delete_and_deploy(proxies, environment)
        return Response(body, status=code)


# ── Shared flows ────────────────────────────────────────────────────────────
# Mismo ciclo que los proxies (alta por bundle, guardado + despliegue y borrado),
# apoyado en bundles.SHAREDFLOW para las diferencias de carpetas y etiquetas XML.


class ApigeeOrganizationSharedFlowsImportView(APIView):
    """Importa un bundle de shared flow y lo despliega en el emulador."""

    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        summary="Importa un bundle de shared flow y lo despliega",
        description=(
            "Réplica local de "
            "`POST /v1/organizations/{org}/sharedflows?action=import&name={name}`.\n\n"
            "Recibe el ZIP (con la carpeta `sharedflowbundle/` en la raíz), lo valida, lo "
            "escribe en `src/main/apigee/sharedflows/<name>`, lo registra en "
            "`deployments.json` y despliega. Si el emulador rechaza el contrato, el "
            "workspace se deja como estaba."
        ),
        parameters=[
            OpenApiParameter("action", str, description="Compatibilidad con Apigee: `import`."),
            OpenApiParameter("name", str, description="Nombre del shared flow a crear."),
            OpenApiParameter("overwrite", bool, description="Reemplaza uno existente."),
        ],
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "format": "binary"},
                    "name": {"type": "string"},
                    "environment": {"type": "string"},
                    "overwrite": {"type": "boolean"},
                },
                "required": ["file"],
            }
        },
        responses={201: dict, 400: dict, 502: dict},
    )
    def post(self, request, org):
        upload = request.FILES.get("file") or request.FILES.get("bundle")

        if upload is None:
            return Response(
                {
                    "error": "Falta el archivo del bundle.",
                    "detail": "Envía el ZIP en el campo 'file' de un formulario multipart.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_name = request.query_params.get("name") or request.data.get("name") or ""
        if not raw_name:
            raw_name = os.path.splitext(os.path.basename(upload.name or ""))[0]

        environment = request.data.get("environment") or settings.APIGEE_ENVIRONMENT
        overwrite = _as_bool(
            request.query_params.get("overwrite") or request.data.get("overwrite") or False
        )

        try:
            metadata, backup = bundles.import_bundle(
                upload.read(),
                raw_name,
                environment=environment,
                overwrite=overwrite,
                kind=bundles.SHAREDFLOW,
            )
        except bundles.BundleError as exc:
            logger.warning(f"Bundle de shared flow rechazado para '{raw_name}': {exc}")
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        flow_name = metadata["name"]

        try:
            deployment = emulator.deploy_workspace(environment)
        except emulator.EmulatorError as exc:
            logger.error(f"Despliegue fallido del shared flow '{flow_name}', revirtiendo: {exc}")
            bundles.remove_bundle(flow_name, bundles.SHAREDFLOW)
            bundles.unregister_deployment(flow_name, environment, bundles.SHAREDFLOW)

            if backup:
                previous = metadata.get("replacedName") or flow_name
                bundles.restore_bundle(backup, previous, bundles.SHAREDFLOW)
                bundles.register_deployment(previous, environment, bundles.SHAREDFLOW)

            return Response(
                {"error": exc.message, "detail": exc.detail, "sharedFlow": flow_name},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        bundles.discard_backup(backup)
        revision = str(deployment.get("revision", "1"))
        logger.info(f"Shared flow '{flow_name}' desplegado en la revisión {revision} de {org}")

        return Response(
            {
                "name": flow_name,
                "organization": org,
                "environment": environment,
                "revision": revision,
                "flows": metadata["flows"],
                "policies": metadata["policies"],
                "replaced": metadata["replaced"],
                "declaredName": metadata["declared_name"],
                "files": metadata["files"],
            },
            status=status.HTTP_201_CREATED,
        )


class SharedFlowFileUpdateView(APIView):
    """Guarda archivos editados de un shared flow y despliega la revisión resultante."""

    @extend_schema(
        summary="Guarda archivos de un shared flow y lo despliega",
        description=(
            "Escribe el contenido editado en "
            "`src/main/apigee/sharedflows/<flow>/sharedflowbundle/` y, si `deploy` es "
            "true, despliega devolviendo la revisión. Si el emulador rechaza el "
            "contrato, los archivos vuelven a su estado anterior.\n\n"
            "Acepta un único archivo (`path` + `content`) o varios en `files`."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "files": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "path": {"type": "string"},
                                "content": {"type": "string"},
                            },
                        },
                    },
                    "deploy": {"type": "boolean", "default": True},
                    "environment": {"type": "string"},
                },
            }
        },
        responses={200: dict, 400: dict, 502: dict},
    )
    def post(self, request, shared_flow_name):
        payload = request.data if isinstance(request.data, dict) else {}
        files = payload.get("files")

        # Compatibilidad con el guardado de un solo archivo desde el editor.
        if not files and payload.get("path") is not None:
            files = [{"path": payload.get("path"), "content": payload.get("content")}]

        if not isinstance(files, list) or not files:
            return Response(
                {
                    "error": "No se recibió ningún archivo que guardar.",
                    "detail": "Envía 'files' con objetos 'path' y 'content'.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        should_deploy = _as_bool(payload.get("deploy", True))

        try:
            written, backup = bundles.save_artifact_files(
                shared_flow_name, files, bundles.SHAREDFLOW
            )
        except bundles.BundleError as exc:
            logger.warning(f"Guardado rechazado para el shared flow '{shared_flow_name}': {exc}")
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not should_deploy:
            bundles.discard_backup(backup)
            return Response(
                {
                    "sharedFlow": shared_flow_name,
                    "saved": written,
                    "deployed": False,
                    "revision": get_current_revision(),
                }
            )

        try:
            deployment = emulator.deploy_workspace(environment)
        except emulator.EmulatorError as exc:
            logger.error(f"Despliegue fallido tras editar '{shared_flow_name}': {exc}")
            bundles.restore_bundle(backup, shared_flow_name, bundles.SHAREDFLOW)

            return Response(
                {
                    "error": exc.message,
                    "detail": exc.detail,
                    "sharedFlow": shared_flow_name,
                    "reverted": True,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        bundles.discard_backup(backup)
        revision = str(deployment.get("revision") or get_current_revision() or "1")
        logger.info(f"Shared flow '{shared_flow_name}' actualizado en la revisión {revision}")

        return Response(
            {
                "sharedFlow": shared_flow_name,
                "saved": written,
                "deployed": True,
                "environment": environment,
                "revision": revision,
            }
        )


class SharedFlowDetailView(APIView):
    """Elimina un shared flow del workspace y del runtime del emulador."""

    @extend_schema(
        summary="Elimina un shared flow",
        description=(
            "Réplica local de `DELETE /v1/organizations/{org}/sharedflows/{name}`. Lo saca "
            "de `src/main/apigee/sharedflows/`, lo desregistra del `deployments.json` y "
            "redespliega para que desaparezca del contenedor. Si el despliegue falla, "
            "el shared flow vuelve a su sitio."
        ),
        responses={200: dict, 400: dict, 404: dict, 502: dict},
    )
    def delete(self, request, org, shared_flow_name):
        environment = request.query_params.get("environment") or settings.APIGEE_ENVIRONMENT
        payload, code = _delete_and_deploy([shared_flow_name], environment, bundles.SHAREDFLOW)
        return Response(payload, status=code)


class SharedFlowBulkDeleteView(APIView):
    """Elimina varios shared flows a la vez con un único redespliegue."""

    @extend_schema(
        summary="Elimina varios shared flows",
        description=(
            "Borra en bloque y redespliega una sola vez. Si el emulador rechaza el "
            "contrato resultante, todos los shared flows se restauran."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "sharedflows": {"type": "array", "items": {"type": "string"}},
                    "environment": {"type": "string"},
                },
                "required": ["sharedflows"],
            }
        },
        responses={200: dict, 400: dict, 404: dict, 502: dict},
    )
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        flows = payload.get("sharedflows")

        if not isinstance(flows, list) or not flows:
            return Response(
                {
                    "error": "No se recibió ningún shared flow que eliminar.",
                    "detail": "Envía 'sharedflows' con la lista de nombres.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        body, code = _delete_and_deploy(flows, environment, bundles.SHAREDFLOW)
        return Response(body, status=code)


# ── Trace (sesiones de depuracion) ──────────────────────────────────────────
# El emulador expone la misma traza que la consola de Apigee. Estas vistas la
# arrancan y devuelven ya normalizada para que la UI la pinte como linea de tiempo.


class ProxyTraceStartView(APIView):
    """Abre una sesion de depuracion sobre un proxy."""

    @extend_schema(
        summary="Inicia una sesion de trace",
        description=(
            "Llama a `POST /v1/emulator/trace?proxyName=<proxy>` del emulador. Devuelve "
            "el id de sesion, cuantas transacciones captura y en cuantos segundos "
            "caduca. A partir de ese momento, cada peticion al proxy queda registrada."
        ),
        responses={201: dict, 502: dict},
    )
    def post(self, request, proxy_name):
        try:
            session = emulator.start_trace(proxy_name)
        except emulator.EmulatorError as exc:
            logger.error(f"No se pudo iniciar el trace de '{proxy_name}': {exc}")
            return Response(
                {"error": exc.message, "detail": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        logger.info(f"Sesion de trace abierta para '{proxy_name}': {session.get('name')}")

        # Los basepaths reales los sabe el emulador; la UI los usa para sugerir
        # la petición de prueba con la que disparar la traza.
        basepaths = []
        try:
            basepaths = sorted(
                {
                    "/" + str(d.get("basePath", "")).lstrip("/")
                    for d in emulator.get_tree()
                    if d.get("application") == proxy_name
                }
            )
        except emulator.EmulatorError as exc:
            logger.warning(f"No se pudieron leer los basepaths de '{proxy_name}': {exc}")

        return Response(
            {
                "proxy": proxy_name,
                "sessionId": session.get("name"),
                "count": session.get("count"),
                "traceSize": session.get("traceSize"),
                "timeoutInSeconds": session.get("timeoutInSeconds"),
                "basepaths": basepaths,
            },
            status=status.HTTP_201_CREATED,
        )


class ProxyTraceTransactionsView(APIView):
    """Devuelve las transacciones capturadas, ya aplanadas en pasos."""

    @extend_schema(
        summary="Transacciones de una sesion de trace",
        description=(
            "Recupera la traza del emulador y la normaliza: por cada peticion devuelve "
            "la lista ordenada de pasos (politicas ejecutadas, condiciones evaluadas, "
            "cambios de estado) con las variables leidas y escritas en cada uno.\n\n"
            "Con `raw=true` se devuelve el JSON del emulador sin tocar, y con "
            "`verbose=true` se incluyen las variables de infraestructura que por "
            "defecto se filtran."
        ),
        parameters=[
            OpenApiParameter("raw", bool, description="Devuelve la traza sin normalizar."),
            OpenApiParameter("verbose", bool, description="Incluye variables internas."),
        ],
        responses={200: dict, 502: dict},
    )
    def get(self, request, proxy_name, session_id):
        try:
            raw = emulator.get_trace_transactions(session_id)
        except emulator.EmulatorError as exc:
            logger.error(f"No se pudieron leer las transacciones de '{session_id}': {exc}")
            return Response(
                {"error": exc.message, "detail": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if _as_bool(request.query_params.get("raw")):
            return Response(raw)

        # El trace solo trae el nombre de la politica; el tipo sale del bundle.
        policy_types = trace.policy_types_for(get_proxy_file_tree(proxy_name))
        normalized = trace.normalize_transactions(
            raw,
            policy_types=policy_types,
            include_noisy=_as_bool(request.query_params.get("verbose")),
        )

        return Response({"proxy": proxy_name, **normalized})


class ProxyTraceStreamView(APIView):
    """Empuja las transacciones nuevas de una sesion de trace por SSE.

    El emulador no notifica nada por su cuenta: no expone webhook ni socket, solo
    el GET de transacciones. Asi que quien sondea es el backend, cada
    APIGEE_TRACE_POLL_SECONDS, y solo empuja al navegador cuando el contenido
    cambia de verdad. La UI deja de sondear y se entera en cuanto llega la
    peticion.

    Se usa Server-Sent Events y no WebSocket a proposito: el flujo es de una sola
    direccion (servidor -> navegador), funciona sobre el WSGI que ya corre el
    proyecto y no obliga a migrar a ASGI ni a anadir Channels/Daphne.
    """

    renderer_classes = [SSERenderer]

    @extend_schema(
        summary="Stream SSE de las transacciones de una sesion de trace",
        description=(
            "Mantiene abierta una conexion `text/event-stream`. Emite un evento "
            "`transactions` con la traza normalizada cada vez que el emulador registra "
            "algo nuevo, y comentarios de keep-alive mientras no hay cambios. Termina "
            "cuando caduca la sesion o el cliente cierra la conexion."
        ),
        responses={(200, "text/event-stream"): str},
    )
    def get(self, request, proxy_name, session_id):
        poll_seconds = settings.APIGEE_TRACE_POLL_SECONDS
        max_seconds = settings.APIGEE_TRACE_STREAM_MAX_SECONDS
        verbose = _as_bool(request.query_params.get("verbose"))

        # El tipo de cada politica sale del bundle, no del trace. Se resuelve una
        # vez al abrir el stream para no releer el arbol en cada sondeo.
        policy_types = trace.policy_types_for(get_proxy_file_tree(proxy_name))

        def event_stream():
            started = time.monotonic()
            last_fingerprint = None
            last_heartbeat = started

            while time.monotonic() - started < max_seconds:
                try:
                    raw = emulator.get_trace_transactions(session_id)
                except emulator.EmulatorError as exc:
                    logger.warning(f"Stream de trace '{session_id}' interrumpido: {exc}")
                    yield _sse("error", {"error": exc.message, "detail": exc.detail})
                    return

                fingerprint = trace.fingerprint(raw)

                if fingerprint != last_fingerprint:
                    last_fingerprint = fingerprint
                    payload = trace.normalize_transactions(
                        raw, policy_types=policy_types, include_noisy=verbose
                    )
                    yield _sse("transactions", {"proxy": proxy_name, **payload})
                    last_heartbeat = time.monotonic()

                elif time.monotonic() - last_heartbeat >= 15:
                    # Comentario SSE: mantiene viva la conexion sin ensuciar los datos.
                    yield ": keep-alive\n\n"
                    last_heartbeat = time.monotonic()

                time.sleep(poll_seconds)

            yield _sse("end", {"reason": "timeout"})

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream; charset=utf-8"
        )
        response["Cache-Control"] = "no-cache"
        # Evita que un proxy intermedio acumule el stream en un buffer.
        response["X-Accel-Buffering"] = "no"
        return response


class ProxyInvokeView(APIView):
    """Reenvia una peticion al runtime del emulador desde la UI.

    Replica el "Send Requests" de la traza de Apigee Edge. Va por el backend y no
    por el navegador porque el runtime (puerto 8445) no manda cabeceras CORS: un
    fetch directo desde la pagina fallaria antes de llegar al proxy.
    """

    @extend_schema(
        summary="Lanza una peticion contra el proxy en el emulador",
        description=(
            "Reenvia el metodo, la ruta y el cuerpo indicados al runtime del emulador y "
            "devuelve el resultado. Sirve para disparar traficotrazado desde la propia UI."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "method": {"type": "string", "default": "GET"},
                    "path": {"type": "string"},
                    "headers": {"type": "object"},
                    "body": {"type": "string"},
                },
                "required": ["path"],
            }
        },
        responses={200: dict, 400: dict, 502: dict},
    )
    def post(self, request, proxy_name):
        payload = request.data if isinstance(request.data, dict) else {}
        method = str(payload.get("method") or "GET").upper()
        path = str(payload.get("path") or "").strip()

        if not path.startswith("/"):
            return Response(
                {
                    "error": "La ruta debe empezar por '/'.",
                    "detail": "Ejemplo: /hello?cliente=demo",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
            return Response(
                {"error": f"Método HTTP no soportado: {method}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        url = f"{settings.APIGEE_RUNTIME_URL.rstrip('/')}{path}"
        body = payload.get("body")
        data = body.encode("utf-8") if body else None

        headers = {
            str(k): str(v) for k, v in (payload.get("headers") or {}).items() if k and v is not None
        }

        started = time.monotonic()

        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=settings.APIGEE_RUNTIME_TIMEOUT) as resp:
                raw = resp.read()
                result = {
                    "statusCode": resp.status,
                    "reasonPhrase": resp.reason,
                    "headers": dict(resp.headers.items()),
                    "body": raw.decode("utf-8", errors="replace"),
                }
        except urllib.error.HTTPError as exc:
            # Un 4xx/5xx del proxy es un resultado válido, no un fallo de la llamada.
            raw = exc.read()
            result = {
                "statusCode": exc.code,
                "reasonPhrase": exc.reason,
                "headers": dict(exc.headers.items()) if exc.headers else {},
                "body": raw.decode("utf-8", errors="replace"),
            }
        except urllib.error.URLError as exc:
            logger.warning(f"No se pudo invocar '{url}': {exc.reason}")
            return Response(
                {
                    "error": f"No se pudo contactar al runtime en {settings.APIGEE_RUNTIME_URL}.",
                    "detail": str(exc.reason),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        result["elapsedMs"] = round((time.monotonic() - started) * 1000)
        result["url"] = url
        result["method"] = method
        logger.info(
            f"Invocado {method} {path} -> {result['statusCode']} ({result['elapsedMs']} ms)"
        )
        return Response(result)


# ──────────────────────────────────────────────────────────────────────────────
# Key Value Maps
#
# Las rutas replican las de la API de administración de Apigee
# (`/v1/organizations/{org}/keyvaluemaps` y su variante por environment), de modo
# que el scope se deduce de la URL: si trae `environments/<env>` es un KVM de
# entorno; si no, es de organización. `KeyValueMapCatalogView` es el añadido
# local que la UI usa para pintar la tabla de una sola llamada.
# ──────────────────────────────────────────────────────────────────────────────


def _kvm_scope(env):
    """Scope implícito en la ruta: con environment es de entorno, sin él de org."""
    return kvms.SCOPE_ENVIRONMENT if env else kvms.SCOPE_ORGANIZATION


def _kvm_error(exc, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"error": str(exc)}, status=http_status)


def _emulator_error(exc):
    return Response(
        {"error": exc.message, "detail": exc.detail},
        status=status.HTTP_502_BAD_GATEWAY,
    )


class KeyValueMapCatalogView(APIView):
    """Todos los KVM del workspace cruzados con lo que el emulador tiene cargado."""

    @extend_schema(
        summary="Lista los KVM del workspace y su estado en el emulador",
        description=(
            "Devuelve los KVM de los dos scopes que soporta el emulador "
            "(`organization` y `environment`) leyendo los `kvms.json` del "
            "workspace, y los cruza con `GET /v1/emulator/test/maps` para marcar "
            "cuáles están realmente cargados en el contenedor.\n\n"
            "El runtime no expone los valores de las llaves, solo sus nombres: los "
            "valores salen del workspace, que es la fuente de verdad."
        ),
        parameters=[OpenApiParameter("environment", str, description="Environment a consultar.")],
        responses={200: dict, 400: dict},
    )
    def get(self, request):
        environment = request.query_params.get("environment") or settings.APIGEE_ENVIRONMENT

        try:
            return Response(kvms.catalog(environment))
        except kvms.KvmError as exc:
            return _kvm_error(exc)


class KeyValueMapSyncView(APIView):
    """Reenvía al emulador todos los KVM del workspace."""

    @extend_schema(
        summary="Sincroniza los KVM del workspace con el emulador",
        description=(
            "Empaqueta los `kvms.json` en el `testdata.zip` que espera "
            "`POST /v1/emulator/setup/tests` y lo carga. Útil cuando el "
            "`kvms.json` se editó a mano o cuando el contenedor se reinició, "
            "porque los datos de prueba del emulador no sobreviven al reinicio."
        ),
        responses={200: dict, 400: dict, 502: dict},
    )
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT

        try:
            result = kvms.sync(environment)
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response(result)


class KeyValueMapListView(APIView):
    """Colección de KVM de un scope: listar y crear."""

    @extend_schema(
        summary="Lista los KVM de un scope",
        responses={200: dict, 400: dict},
    )
    def get(self, request, org, env=None):
        environment = env or request.query_params.get("environment")

        try:
            maps = kvms.load_scope(_kvm_scope(env), environment)
        except kvms.KvmError as exc:
            return _kvm_error(exc)

        return Response({"keyValueMaps": maps})

    @extend_schema(
        summary="Crea un KVM y lo carga en el emulador",
        description=(
            "Escribe el KVM en el `kvms.json` del scope y lo empuja al runtime. "
            "Si el emulador rechaza la carga, el archivo vuelve a su estado anterior."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "encrypted": {"type": "boolean", "default": False},
                    "entries": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "value": {"type": "string"},
                            },
                        },
                    },
                },
                "required": ["name"],
            }
        },
        responses={201: dict, 400: dict, 502: dict},
    )
    def post(self, request, org, env=None):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = env or payload.get("environment")

        try:
            created, result = kvms.create_map(
                name=payload.get("name", ""),
                # El scope lo fija la ruta, igual que en la API de Apigee: no se
                # acepta por cuerpo para que la URL y el archivo nunca discrepen.
                scope=_kvm_scope(env),
                encrypted=_as_bool(payload.get("encrypted", False)),
                entries=payload.get("entries") or [],
                environment=environment,
            )
        except kvms.KvmError as exc:
            logger.warning(f"Alta de KVM rechazada: {exc}")
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response({"keyValueMap": created, **result}, status=status.HTTP_201_CREATED)


class KeyValueMapDetailView(APIView):
    """Un KVM concreto: consultar, actualizar y eliminar."""

    @extend_schema(summary="Devuelve un KVM con sus entradas", responses={200: dict, 404: dict})
    def get(self, request, org, map_name, env=None):
        environment = env or request.query_params.get("environment")

        try:
            found = kvms.get_map(map_name, _kvm_scope(env), environment)
        except kvms.KvmError as exc:
            return _kvm_error(exc)

        if not found:
            return Response(
                {"error": f"El KVM '{map_name}' no existe."}, status=status.HTTP_404_NOT_FOUND
            )

        return Response(found)

    @extend_schema(
        summary="Renombra un KVM, cambia su cifrado o reemplaza sus entradas",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Nombre nuevo."},
                    "encrypted": {"type": "boolean"},
                    "entries": {"type": "array", "items": {"type": "object"}},
                },
            }
        },
        responses={200: dict, 400: dict, 502: dict},
    )
    def put(self, request, org, map_name, env=None):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = env or payload.get("environment")
        encrypted = payload.get("encrypted")

        try:
            updated, result = kvms.update_map(
                name=map_name,
                scope=_kvm_scope(env),
                new_name=payload.get("name"),
                encrypted=None if encrypted is None else _as_bool(encrypted),
                entries=payload.get("entries"),
                environment=environment,
            )
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response({"keyValueMap": updated, **result})

    @extend_schema(summary="Elimina un KVM", responses={200: dict, 400: dict, 502: dict})
    def delete(self, request, org, map_name, env=None):
        environment = env or request.query_params.get("environment")

        try:
            removed, result = kvms.delete_map(map_name, _kvm_scope(env), environment)
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response({"keyValueMap": removed, **result})


class KeyValueMapEntryListView(APIView):
    """Llaves de un KVM: listar y agregar."""

    @extend_schema(summary="Lista las llaves de un KVM", responses={200: dict, 404: dict})
    def get(self, request, org, map_name, env=None):
        environment = env or request.query_params.get("environment")

        try:
            found = kvms.get_map(map_name, _kvm_scope(env), environment)
        except kvms.KvmError as exc:
            return _kvm_error(exc)

        if not found:
            return Response(
                {"error": f"El KVM '{map_name}' no existe."}, status=status.HTTP_404_NOT_FOUND
            )

        return Response({"entry": found["entries"], "totalEntries": found["entryCount"]})

    @extend_schema(
        summary="Agrega una llave al KVM",
        request={
            "application/json": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "value": {"type": "string"}},
                "required": ["name"],
            }
        },
        responses={201: dict, 400: dict, 502: dict},
    )
    def post(self, request, org, map_name, env=None):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = env or payload.get("environment")

        try:
            updated, result = kvms.add_entry(
                map_name=map_name,
                scope=_kvm_scope(env),
                entry_name=payload.get("name", ""),
                value=payload.get("value", ""),
                environment=environment,
            )
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response({"keyValueMap": updated, **result}, status=status.HTTP_201_CREATED)


class KeyValueMapEntryDetailView(APIView):
    """Una llave concreta: consultar, actualizar y eliminar."""

    @extend_schema(summary="Devuelve una llave del KVM", responses={200: dict, 404: dict})
    def get(self, request, org, map_name, entry_name, env=None):
        environment = env or request.query_params.get("environment")

        try:
            found = kvms.get_map(map_name, _kvm_scope(env), environment)
        except kvms.KvmError as exc:
            return _kvm_error(exc)

        entry = next(
            (
                e
                for e in (found or {}).get("entries", [])
                if e["name"].lower() == entry_name.lower()
            ),
            None,
        )

        if not entry:
            return Response(
                {"error": f"La llave '{entry_name}' no existe en el KVM '{map_name}'."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(entry)

    @extend_schema(
        summary="Actualiza el valor de una llave (y opcionalmente su nombre)",
        request={
            "application/json": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "value": {"type": "string"}},
            }
        },
        responses={200: dict, 400: dict, 502: dict},
    )
    def put(self, request, org, map_name, entry_name, env=None):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = env or payload.get("environment")

        try:
            updated, result = kvms.update_entry(
                map_name=map_name,
                scope=_kvm_scope(env),
                entry_name=entry_name,
                value=payload.get("value"),
                new_name=payload.get("name"),
                environment=environment,
            )
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response({"keyValueMap": updated, **result})

    @extend_schema(summary="Elimina una llave del KVM", responses={200: dict, 400: dict, 502: dict})
    def delete(self, request, org, map_name, entry_name, env=None):
        environment = env or request.query_params.get("environment")

        try:
            updated, result = kvms.delete_entry(
                map_name=map_name,
                scope=_kvm_scope(env),
                entry_name=entry_name,
                environment=environment,
            )
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response({"keyValueMap": updated, **result})


class KeyValueMapBulkDeleteView(APIView):
    """Borrado de varios KVM a la vez, con una sola recarga del emulador."""

    @extend_schema(
        summary="Elimina varios KVM (o todos) del workspace y del emulador",
        description=(
            "Encadenar el borrado individual dispararía un `setup/tests` por cada "
            "KVM. Aquí se reescriben los `kvms.json` afectados de los dos scopes y "
            "se sincroniza una sola vez. Si el emulador rechaza la carga, los "
            "archivos vuelven a su estado anterior."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "names": {"type": "array", "items": {"type": "string"}},
                    "all": {"type": "boolean", "default": False},
                },
            }
        },
        responses={200: dict, 400: dict, 502: dict},
    )
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        names = payload.get("names")

        try:
            summary, result = kvms.delete_maps(
                names=names if isinstance(names, list) else None,
                delete_all=_as_bool(payload.get("all", False)),
                environment=environment,
            )
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response({**summary, **result})


class EdgeEnvironmentsView(APIView):
    """Environments de Apigee Edge configurados para la importación."""

    @extend_schema(
        summary="Lista los ambientes de Apigee Edge disponibles",
        description=(
            "Alimenta el desplegable del modal de sincronización. `enabled` indica "
            "los que ya tienen permisos concedidos; los demás se pueden intentar, "
            "pero hoy devuelven 401."
        ),
        responses={200: dict},
    )
    def get(self, request):
        return Response(
            {
                "environments": edge.environments(),
                "localEnvironment": settings.APIGEE_ENVIRONMENT,
                "verifyTls": settings.APIGEE_EDGE_VERIFY_TLS,
            }
        )


class KeyValueMapEdgeImportView(APIView):
    """Trae los KVM de un environment de Apigee Edge al emulador local."""

    @extend_schema(
        summary="Importa los KVM de Apigee Edge al workspace y al emulador",
        description=(
            "Consulta `GET /v1/o/{org}/e/{env}/keyvaluemaps` en la instalación real "
            "de Edge con autenticación Basic, descarga cada KVM y lo deja en el "
            "`kvms.json` del workspace, sincronizando el emulador al final.\n\n"
            "Las credenciales viajan solo en esta petición: no se guardan en disco "
            "ni se escriben en el log. Los hosts de Edge únicamente responden con "
            "la VPN corporativa levantada, y un ambiente sin permisos concedidos "
            "devuelve 401.\n\n"
            "Los KVM cifrados en Edge llegan con los valores enmascarados (`*****`): "
            "se importan igualmente, pero se listan en `masked` para poder avisar."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "username": {"type": "string"},
                    "password": {"type": "string"},
                    "edgeEnvironment": {
                        "type": "string",
                        "description": "Clave del ambiente: dev, pre-prod o prd.",
                    },
                    "replace": {
                        "type": "boolean",
                        "default": False,
                        "description": "Deja solo lo importado y descarta el resto.",
                    },
                },
                "required": ["username", "password", "edgeEnvironment"],
            }
        },
        responses={200: dict, 400: dict, 401: dict, 502: dict},
    )
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        username = (payload.get("username") or "").strip()
        password = payload.get("password") or ""
        env_key = (payload.get("edgeEnvironment") or "").strip()

        if not username or not password:
            return Response(
                {"error": "Hacen falta el usuario y la contraseña de Apigee Edge."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # El log lleva usuario y ambiente para poder rastrear la operación,
        # nunca la contraseña.
        logger.info(f"Importando KVM de Edge '{env_key}' como '{username}'")

        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        replace = _as_bool(payload.get("replace", False))

        if _as_bool(payload.get("stream", False)):
            return self._stream(env_key, username, password, environment, replace)

        try:
            maps, masked = edge.fetch_all(env_key, username, password)
        except edge.EdgeError as exc:
            return Response(
                {"error": exc.message, "kind": exc.kind},
                status=_edge_status(exc),
            )

        if not maps:
            return Response(
                {
                    "error": f"El ambiente '{env_key}' de Edge no devolvió ningún KVM.",
                    "kind": "empty",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            summary, result = kvms.import_maps(maps, environment=environment, replace=replace)
        except kvms.KvmError as exc:
            return _kvm_error(exc)
        except emulator.EmulatorError as exc:
            return _emulator_error(exc)

        return Response(
            {
                "edgeEnvironment": env_key,
                "fetched": len(maps),
                "masked": masked,
                **summary,
                **result,
            }
        )

    def _stream(self, env_key, username, password, environment, replace):
        """Misma importación, emitiendo el avance como Server-Sent Events.

        Edge no expone los KVM con sus entradas de una sola llamada: hay que
        pedirlos uno a uno, y con 80 mapas la espera es larga. Aquí se emite un
        evento por cada uno para que la UI pueda pintar la barra de progreso.

        Va por POST y no por `EventSource` porque las credenciales viajan en el
        cuerpo; el navegador lo lee con `fetch` y un lector de stream.
        """

        def event_stream():
            maps, masked = [], []

            try:
                for kind, data in edge.iter_all(env_key, username, password):
                    if kind == "progress":
                        yield _sse("progress", data)
                    else:
                        maps, masked = data
            except edge.EdgeError as exc:
                yield _sse("error", {"error": exc.message, "kind": exc.kind})
                return

            if not maps:
                yield _sse(
                    "error",
                    {
                        "error": f"El ambiente '{env_key}' de Edge no devolvió ningún KVM.",
                        "kind": "empty",
                    },
                )
                return

            yield _sse("phase", {"phase": "write", "total": len(maps)})

            try:
                summary, result = kvms.import_maps(maps, environment=environment, replace=replace)
            except (kvms.KvmError, emulator.EmulatorError) as exc:
                message = getattr(exc, "message", str(exc))
                yield _sse("error", {"error": message, "kind": "local"})
                return

            yield _sse(
                "done",
                {
                    "edgeEnvironment": env_key,
                    "fetched": len(maps),
                    "masked": masked,
                    **summary,
                    **result,
                },
            )

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream; charset=utf-8"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


def _edge_status(exc):
    """Traduce el fallo de Edge al código con el que responde este backend."""
    if exc.kind == "auth":
        return status.HTTP_401_UNAUTHORIZED
    if exc.kind == "forbidden":
        return status.HTTP_403_FORBIDDEN
    if exc.kind == "config":
        return status.HTTP_400_BAD_REQUEST
    # VPN caída, TLS o error remoto: el fallo está aguas arriba, no en la petición.
    return status.HTTP_502_BAD_GATEWAY


class DashboardSummaryView(APIView):
    """Todo lo que pinta el dashboard, leído del estado real del entorno."""

    @extend_schema(
        summary="Resumen del entorno local para el dashboard",
        description=(
            "Devuelve los totales (proxies enrutados, shared flows, KVM y llaves), "
            "la actividad reciente y las alertas, todo derivado del estado en disco "
            "y del runtime del emulador.\n\n"
            "El emulador no guarda un historial de operaciones, así que la actividad "
            "se reconstruye de tres fuentes fechables: las carpetas de revisión en "
            "`sdlc/contracts`, la fecha del archivo más reciente de cada bundle del "
            "workspace y el `lastModifiedAt` de cada KVM."
        ),
        parameters=[OpenApiParameter("environment", str, description="Environment a resumir.")],
        responses={200: dict, 400: dict},
    )
    def get(self, request):
        environment = request.query_params.get("environment") or settings.APIGEE_ENVIRONMENT

        try:
            return Response(dashboard.summary(environment))
        except kvms.KvmError as exc:
            return _kvm_error(exc)


# ──────────────────────────────────────────────────────────────────────────────
# Caches del environment
#
# Réplica de la pestaña "Environment Configuration → Caches" de Apigee Edge. Las
# rutas por cache siguen las de la API de administración; `CacheCatalogView`
# añade el guardado en bloque que necesita la tabla, que es como funciona el
# botón Save de la consola de Edge.
# ──────────────────────────────────────────────────────────────────────────────


def _cache_error(exc, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"error": str(exc)}, status=http_status)


class CacheCatalogView(APIView):
    """Caches del environment: consulta y guardado de la tabla completa."""

    @extend_schema(
        summary="Lista los caches configurados en el environment",
        description=(
            "Lee `src/main/apigee/environments/<env>/caches.json`.\n\n"
            "El emulador **no aplica** este archivo: su compilador de contratos no "
            "lo conoce y en local los caches se crean bajo demanda cuando una "
            "política los referencia. Es la configuración de environment que exige "
            "Edge, versionada en Git y lista para promover."
        ),
        parameters=[OpenApiParameter("environment", str, description="Environment a consultar.")],
        responses={200: dict, 400: dict},
    )
    def get(self, request):
        environment = request.query_params.get("environment") or settings.APIGEE_ENVIRONMENT

        try:
            return Response(caches.catalog(environment))
        except caches.CacheError as exc:
            return _cache_error(exc)

    @extend_schema(
        summary="Guarda la tabla completa de caches",
        description=(
            "Equivalente al botón *Save* de la consola de Edge: recibe la lista "
            "entera y la reemplaza. Se valida todo antes de escribir, así que una "
            "fila mal puesta no deja el archivo a medias."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "caches": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "expiryType": {
                                    "type": "string",
                                    "enum": list(caches.EXPIRY_TYPES),
                                },
                                "expiryValue": {"type": "string"},
                            },
                            "required": ["name", "expiryType", "expiryValue"],
                        },
                    }
                },
                "required": ["caches"],
            }
        },
        responses={200: dict, 400: dict},
    )
    def put(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        rows = payload.get("caches")

        if not isinstance(rows, list):
            return Response(
                {"error": "Envía la lista completa en 'caches'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            saved = caches.replace_all(rows, environment)
        except caches.CacheError as exc:
            logger.warning(f"Guardado de caches rechazado: {exc}")
            return _cache_error(exc)

        return Response({"environment": environment, "caches": saved, "saved": len(saved)})


class CacheListView(APIView):
    """Colección de caches de un environment: listar y crear."""

    @extend_schema(summary="Lista los caches del environment", responses={200: dict, 400: dict})
    def get(self, request, org, env):
        try:
            return Response({"cache": caches.list_caches(env)})
        except caches.CacheError as exc:
            return _cache_error(exc)

    @extend_schema(
        summary="Crea un cache en el environment",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "expiryType": {"type": "string", "enum": list(caches.EXPIRY_TYPES)},
                    "expiryValue": {"type": "string"},
                },
                "required": ["name"],
            }
        },
        responses={201: dict, 400: dict},
    )
    def post(self, request, org, env):
        payload = request.data if isinstance(request.data, dict) else {}

        try:
            created = caches.create_cache(
                name=payload.get("name", ""),
                description=payload.get("description", ""),
                expiry_type=payload.get("expiryType") or caches.EXPIRY_TIMEOUT,
                expiry_value=payload.get("expiryValue", "300"),
                environment=env,
            )
        except caches.CacheError as exc:
            return _cache_error(exc)

        return Response({"cache": created}, status=status.HTTP_201_CREATED)


class CacheDetailView(APIView):
    """Un cache concreto: consultar, actualizar y eliminar."""

    @extend_schema(summary="Devuelve un cache", responses={200: dict, 404: dict})
    def get(self, request, org, env, cache_name):
        try:
            found = caches.get_cache(cache_name, env)
        except caches.CacheError as exc:
            return _cache_error(exc)

        if not found:
            return Response(
                {"error": f"El cache '{cache_name}' no existe."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(found)

    @extend_schema(
        summary="Actualiza la descripción o la caducidad de un cache",
        description=(
            "El nombre no se puede cambiar, igual que en Edge: es la referencia "
            "que usan los `<CacheResource>` de las políticas."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "expiryType": {"type": "string", "enum": list(caches.EXPIRY_TYPES)},
                    "expiryValue": {"type": "string"},
                },
            }
        },
        responses={200: dict, 400: dict},
    )
    def put(self, request, org, env, cache_name):
        payload = request.data if isinstance(request.data, dict) else {}

        try:
            updated = caches.update_cache(
                name=cache_name,
                description=payload.get("description"),
                expiry_type=payload.get("expiryType"),
                expiry_value=payload.get("expiryValue"),
                environment=env,
            )
        except caches.CacheError as exc:
            return _cache_error(exc)

        return Response({"cache": updated})

    @extend_schema(summary="Elimina un cache", responses={200: dict, 400: dict})
    def delete(self, request, org, env, cache_name):
        try:
            removed = caches.delete_cache(cache_name, env)
        except caches.CacheError as exc:
            return _cache_error(exc)

        return Response({"cache": removed})


# ──────────────────────────────────────────────────────────────────────────────
# Flow hooks del environment
#
# A diferencia de los caches, esta configuración sí la compila el emulador
# dentro del contrato, así que guardarla implica redesplegar.
# ──────────────────────────────────────────────────────────────────────────────


class FlowHookView(APIView):
    """Los cuatro flow hooks del environment: consulta y guardado."""

    @extend_schema(
        summary="Lista los flow hooks y los shared flows que se pueden enganchar",
        description=(
            "Devuelve los cuatro puntos de enganche —asignados o no— y los shared "
            "flows desplegados en el emulador, que son los únicos que el contrato "
            "acepta.\n\n"
            "Un gancho que apunta a un shared flow que ya no está desplegado llega "
            "marcado con `missing`: el archivo lo conserva, pero el próximo "
            "despliegue lo rechazaría."
        ),
        parameters=[OpenApiParameter("environment", str, description="Environment a consultar.")],
        responses={200: dict, 400: dict},
    )
    def get(self, request):
        environment = request.query_params.get("environment") or settings.APIGEE_ENVIRONMENT

        try:
            return Response(flowhooks.catalog(environment))
        except flowhooks.FlowHookError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        summary="Guarda los flow hooks y redespliega el contrato",
        description=(
            "Escribe `src/main/apigee/environments/<env>/flowhooks.json` y lanza el "
            "despliegue, porque el emulador aplica esta configuración de verdad.\n\n"
            "Se valida antes de tocar el disco: un punto de enganche inventado tumba "
            "el despliegue con un 500 del emulador y un shared flow inexistente lo "
            "rechaza con un 400. Si aun así falla, el archivo vuelve a su estado "
            "anterior y se redespliega."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "flowHooks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "enum": list(flowhooks.HOOK_NAMES),
                                },
                                "sharedFlow": {
                                    "type": "string",
                                    "description": "Vacío desasigna el gancho.",
                                },
                                "continueOnError": {"type": "boolean", "default": False},
                            },
                            "required": ["name"],
                        },
                    }
                },
                "required": ["flowHooks"],
            }
        },
        responses={200: dict, 400: dict, 502: dict},
    )
    def put(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        environment = payload.get("environment") or settings.APIGEE_ENVIRONMENT
        hooks = payload.get("flowHooks")

        if not isinstance(hooks, list):
            return Response(
                {"error": "Envía los cuatro ganchos en 'flowHooks'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            catalog, deployment = flowhooks.save_hooks(hooks, environment)
        except flowhooks.FlowHookError as exc:
            logger.warning(f"Guardado de flow hooks rechazado: {exc}")
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except emulator.EmulatorError as exc:
            return Response(
                {"error": exc.message, "detail": exc.detail, "reverted": True},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({**catalog, "deployed": True, **deployment})
