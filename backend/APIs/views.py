# local imports
import logging

# global libraries
import os
import socket
from datetime import datetime

from django.conf import settings
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import bundles, emulator
from .services import (
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

            if backup:
                bundles.restore_bundle(backup, proxy_name)
            else:
                bundles.unregister_deployment(proxy_name, environment)

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
                "proxies": metadata["proxy_endpoints"],
                "targets": metadata["target_endpoints"],
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

        return Response({"proxy": proxy_name, "total_files": len(files), "files": files})


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
            {"shared_flow": shared_flow_name, "total_files": len(files), "files": files}
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
