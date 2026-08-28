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

from django.contrib import admin
from django.urls import path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

from APIs.views import (
    ApigeeOrganizationApisView,
    ApigeePolicyMenuView,
    EmulatorDeployView,
    EmulatorStatusView,
    ProxyDeployedListView,
    ProxyFileListView,
    ProxyFileUpdateView,
    SharedFlowDeployedListView,
    SharedFlowFileListView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # GET lista los proxies del emulador; POST importa un bundle ZIP y lo despliega
    path("v1/organizations/<str:org>/apis", ApigeeOrganizationApisView.as_view()),
    # Redespliegue del workspace completo (equivalente al "Deploy" de Cloud Code)
    path("v1/emulator/deploy", EmulatorDeployView.as_view()),
    # Estado vivo del emulador: versión y endpoints enrutados
    path("v1/emulator/status", EmulatorStatusView.as_view()),
    # Ruta para listar proxies desplegados (sin detalles de archivos)
    path("v1/proxies/deployed", ProxyDeployedListView.as_view()),
    # Rutas para operaciones de archivos dentro de un proxy específico
    path("v1/proxies/<str:proxy_name>/files", ProxyFileListView.as_view()),
    # Guarda los archivos editados en la UI y redespliega el proxy
    path("v1/proxies/<str:proxy_name>/update", ProxyFileUpdateView.as_view()),
    # Ruta para listar shared flows desplegados (sin detalles de archivos)
    path("v1/sharedflows/deployed", SharedFlowDeployedListView.as_view()),
    # Rutas para operaciones de archivos dentro de un shared flow específico
    path("v1/sharedflows/<str:shared_flow_name>/files", SharedFlowFileListView.as_view()),
    # Ruta para obtener el menú de políticas
    path("v1/policies/menu", ApigeePolicyMenuView.as_view()),
    # 2. Las rutas de la documentación
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    # Levanta la interfaz interactiva (Swagger) en tu navegador
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
