from django.shortcuts import render


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .services import get_latest_revision_path
from .services import get_proxy_tree
from .services import get_proxy_file_tree
from .services import get_proxy_file_content
import os
import socket
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


# Create your views here.
class ProxyTreeView(APIView):
    def get(self, request, proxy_name):
        data = get_proxy_tree(proxy_name)
        if data:
            return Response(data)
        return Response({"error": "Proxy no encontrado"}, status=status.HTTP_404_NOT_FOUND)
 
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

class ProxyFileContentView(APIView):
    """API para obtener el contenido de un archivo específico del proxy."""
    
    def get(self, request, proxy_name):
        file_path = request.query_params.get('path')
        if not file_path:
            return Response({"error": "Se requiere el parámetro 'path'"}, status=status.HTTP_400_BAD_REQUEST)
            
        content = get_proxy_file_content(proxy_name, file_path)
        
        if content is None:
            return Response(
                {"error": f"No se pudo leer el archivo '{file_path}' del proxy '{proxy_name}'"},
                status=status.HTTP_404_NOT_FOUND
            )
            
        return Response({
            "proxy": proxy_name,
            "path": file_path,
            "content": content
        })

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