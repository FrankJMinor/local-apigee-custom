"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

# core/urls.py
# IMPORTANTE: Importamos desde 'api.views' (ruta absoluta), no desde '.'
from APIs.views import (
    ApigeeOrganizationApisView,
    ApigeePolicyMenuView,
    ProxyDeployedListView,
    ProxyFileListView,
    SharedFlowDeployedListView,
    SharedFlowFileListView,
)
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
    
    path('v1/organizations/<str:org>/apis', ApigeeOrganizationApisView.as_view()),
    
    # Ruta para listar proxies desplegados (sin detalles de archivos)
    path('v1/proxies/deployed', ProxyDeployedListView.as_view()),
    
    # Rutas para operaciones de archivos dentro de un proxy específico
    path('v1/proxies/<str:proxy_name>/files', ProxyFileListView.as_view()),
    
    # Ruta para listar shared flows desplegados (sin detalles de archivos)
    path('v1/sharedflows/deployed', SharedFlowDeployedListView.as_view()),
    
    # Rutas para operaciones de archivos dentro de un shared flow específico
    path('v1/sharedflows/<str:shared_flow_name>/files', SharedFlowFileListView.as_view()),
    
    # Ruta para obtener el menú de políticas
    path('v1/policies/menu', ApigeePolicyMenuView.as_view()),
    
]