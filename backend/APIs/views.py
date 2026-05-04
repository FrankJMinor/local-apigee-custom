from django.shortcuts import render


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .services import get_latest_revision_path
from .services import get_list_shared_flows
from .services import get_proxy_file_tree
from .services import get_sharedflow_file_tree
import os
import socket
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class ApigeeOrganizationApisView(APIView):
    """
    Simula el endpoint oficial de Apigee: /v1/organizations/{org}/apis
    Mapea el estado real del emulador a la estructura compleja que espera la UI.
    """
    def get(self, request, org):
        # 1. Obtener datos del entorno real
        container_id = socket.gethostname() # ID del contenedor (UUID en tu estructura vieja)
        ruta_base = get_latest_revision_path()
        
        # 2. Inicializar estructura base
        # El name del environment lo sacamos de la ruta o lo dejamos fijo como 'local'
        response = {
            "aPIProxy": [],
            "name": "emulator-env", 
            "organization": org
        }

        if not ruta_base or not os.path.exists(ruta_base):
            logger.warning("No se encontró ruta de contratos activa.")
            return Response(response)

        # 3. Extraer el número de revisión real desde la ruta (ej: carpeta '4')
        # /apigee_runtime/sdlc/contracts/4/src/...
        revision_id = "1"
        parts = ruta_base.split('/')
        if 'contracts' in parts:
            idx = parts.index('contracts')
            revision_id = parts[idx + 1]

        # 4. Escanear proxies físicos
        try:
            proxies_fisicos = [d for d in os.listdir(ruta_base) if os.path.isdir(os.path.join(ruta_base, d))]
            
            for i, proxy_name in enumerate(proxies_fisicos, 1):
                proxy_detail = {
                    "name": proxy_name,
                    "revision": [
                        {
                            "configuration": {
                                "basePath": f"/{proxy_name.lower()}", # Por ahora simulado
                                "configVersion": f"SHA-512:local-revision-{revision_id}",
                                "steps": []
                            },
                            "name": revision_id, # Usamos la revisión real del emulador
                            "server": [
                                {
                                    "pod": {"name": "gateway-1", "region": "mexico-city"},
                                    "status": "deployed",
                                    "type": ["message-processor"],
                                    "uUID": container_id
                                }
                            ],
                            "state": "deployed",
                            "lastModifiedAt": datetime.now().isoformat()
                        }
                    ]
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
        container_id = socket.gethostname() # ID del contenedor (UUID en tu estructura vieja)
        ruta_base = get_list_shared_flows()
        
        # 2. Inicializar estructura base
        # El name del environment lo sacamos de la ruta o lo dejamos fijo como 'local'
        response = {
            "aPIProxy": [],
            "name": "emulator-env", 
            "organization": org
        }

        if not ruta_base or not os.path.exists(ruta_base):
            logger.warning("No se encontró ruta de contratos activa.")
            return Response(response)

        # 3. Extraer el número de revisión real desde la ruta (ej: carpeta '4')
        # /apigee_runtime/sdlc/contracts/4/src/...
        revision_id = "1"
        parts = ruta_base.split('/')
        if 'contracts' in parts:
            idx = parts.index('contracts')
            revision_id = parts[idx + 1]

        # 4. Escanear proxies físicos
        try:
            proxies_fisicos = [d for d in os.listdir(ruta_base) if os.path.isdir(os.path.join(ruta_base, d))]
            
            for i, proxy_name in enumerate(proxies_fisicos, 1):
                proxy_detail = {
                    "name": proxy_name,
                    "revision": [
                        {
                            "configuration": {
                                "basePath": f"/{proxy_name.lower()}", # Por ahora simulado
                                "configVersion": f"SHA-512:local-revision-{revision_id}",
                                "steps": []
                            },
                            "name": revision_id, # Usamos la revisión real del emulador
                            "server": [
                                {
                                    "pod": {"name": "gateway-1", "region": "mexico-city"},
                                    "status": "deployed",
                                    "type": ["message-processor"],
                                    "uUID": container_id
                                }
                            ],
                            "state": "deployed",
                            "lastModifiedAt": datetime.now().isoformat()
                        }
                    ]
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
            return Response({"error": "No se encontraron despliegues activos", "ruta": path}, status=status.HTTP_404_NOT_FOUND)
        
        # Listamos las carpetas de proxies
        proxies = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]
        
        return Response({
            "status": "online",
            "revision": os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(path))))),
            "proxies": proxies,
            "total": len(proxies)
        })
        
# Esta clase es para listar los archivos físicos de un proxy específico, similar a ProxyTreeView pero listando solo los archivos sin la estructura XML  
class ProxyFileListView(APIView):
    """API para listar los archivos físicos de un bundle de proxy."""
    
    def get(self, request, proxy_name):
        files = get_proxy_file_tree(proxy_name)
        
        if files is None:
            return Response(
                {"error": f"No se pudo encontrar el bundle del proxy '{proxy_name}'"},
                status=status.HTTP_404_NOT_FOUND
            )
            
        return Response({
            "proxy": proxy_name,
            "total_files": len(files),
            "files": files
        })
        
# Esta clase es para listar los shared flows desplegados, similar a ProxyDeployedListView pero para shared flows
class SharedFlowDeployedListView(APIView):
    def get(self, request):
        path = get_list_shared_flows()
        
        if not path or not os.path.exists(path):
            return Response({"error": "No se encontraron despliegues activos", "ruta": path}, status=status.HTTP_404_NOT_FOUND)
        
        # Listamos las carpetas de shared flows
        shared_flows = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]
        
        return Response({
            "status": "online",
            "revision": os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(path))))),
            "shared_flows": shared_flows,
            "total": len(shared_flows)
        })

# Esta clase es para listar los archivos físicos de un shared flow específico, similar a ProxyFileListView pero para shared flows
class SharedFlowFileListView(APIView):
    """API para listar los archivos físicos de un bundle de shared flow."""
    
    def get(self, request, shared_flow_name):
        files = get_sharedflow_file_tree(shared_flow_name)
        
        if files is None:
            return Response(
                {"error": f"No se pudo encontrar el bundle del shared flow '{shared_flow_name}'"},
                status=status.HTTP_404_NOT_FOUND
            )
            
        return Response({
            "shared_flow": shared_flow_name,
            "total_files": len(files),
            "files": files
        })