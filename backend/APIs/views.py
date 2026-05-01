from django.shortcuts import render


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .services import get_proxy_tree
from .services import get_latest_revision_path
import os


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