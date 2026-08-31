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
    ApigeeOrganizationSharedFlowsImportView,
    ApigeePolicyMenuView,
    ApigeeProxyDetailView,
    EmulatorDeployView,
    EmulatorStatusView,
    KeyValueMapCatalogView,
    KeyValueMapDetailView,
    KeyValueMapEntryDetailView,
    KeyValueMapEntryListView,
    KeyValueMapListView,
    KeyValueMapSyncView,
    ProxyBulkDeleteView,
    ProxyDeployedListView,
    ProxyFileListView,
    ProxyFileUpdateView,
    ProxyInvokeView,
    ProxyTraceStartView,
    ProxyTraceStreamView,
    ProxyTraceTransactionsView,
    SharedFlowBulkDeleteView,
    SharedFlowDeployedListView,
    SharedFlowDetailView,
    SharedFlowFileListView,
    SharedFlowFileUpdateView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # GET lista los proxies del emulador; POST importa un bundle ZIP y lo despliega
    path("v1/organizations/<str:org>/apis", ApigeeOrganizationApisView.as_view()),
    # DELETE elimina un proxy del workspace y del runtime del emulador
    path("v1/organizations/<str:org>/apis/<str:proxy_name>", ApigeeProxyDetailView.as_view()),
    # Borrado en bloque con un único redespliegue (selección múltiple de la tabla)
    path("v1/proxies/delete", ProxyBulkDeleteView.as_view()),
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
    # Lanza tráfico contra el proxy desde la UI (barra "Send Requests" de la traza)
    path("v1/proxies/<str:proxy_name>/invoke", ProxyInvokeView.as_view()),
    # Abre una sesión de trace sobre el proxy y consulta lo capturado
    path("v1/proxies/<str:proxy_name>/trace", ProxyTraceStartView.as_view()),
    path(
        "v1/proxies/<str:proxy_name>/trace/<str:session_id>",
        ProxyTraceTransactionsView.as_view(),
    ),
    # Stream SSE: empuja las transacciones nuevas sin que la UI tenga que sondear
    path(
        "v1/proxies/<str:proxy_name>/trace/<str:session_id>/stream",
        ProxyTraceStreamView.as_view(),
    ),
    # POST importa un bundle de shared flow y lo despliega
    path(
        "v1/organizations/<str:org>/sharedflows",
        ApigeeOrganizationSharedFlowsImportView.as_view(),
    ),
    # DELETE elimina un shared flow del workspace y del runtime del emulador
    path(
        "v1/organizations/<str:org>/sharedflows/<str:shared_flow_name>",
        SharedFlowDetailView.as_view(),
    ),
    # Borrado en bloque de shared flows con un único redespliegue
    path("v1/sharedflows/delete", SharedFlowBulkDeleteView.as_view()),
    # Ruta para listar shared flows desplegados (sin detalles de archivos)
    path("v1/sharedflows/deployed", SharedFlowDeployedListView.as_view()),
    # Rutas para operaciones de archivos dentro de un shared flow específico
    path("v1/sharedflows/<str:shared_flow_name>/files", SharedFlowFileListView.as_view()),
    # Guarda los archivos editados del shared flow y redespliega
    path("v1/sharedflows/<str:shared_flow_name>/update", SharedFlowFileUpdateView.as_view()),
    # Ruta para obtener el menú de políticas
    path("v1/policies/menu", ApigeePolicyMenuView.as_view()),
    # ── Key Value Maps ────────────────────────────────────────────────────────
    # Catálogo que consume la tabla de la UI: los dos scopes en una llamada, ya
    # cruzados con los KVM que el contenedor del emulador tiene cargados.
    path("v1/keyvaluemaps", KeyValueMapCatalogView.as_view()),
    # Reenvía el workspace al emulador (tras editar kvms.json a mano o reiniciar)
    path("v1/keyvaluemaps/sync", KeyValueMapSyncView.as_view()),
    # Réplica local de la API de Apigee. El scope va implícito en la ruta:
    # sin `environments/<env>` es de organización, con él es de entorno.
    path("v1/organizations/<str:org>/keyvaluemaps", KeyValueMapListView.as_view()),
    path(
        "v1/organizations/<str:org>/keyvaluemaps/<str:map_name>",
        KeyValueMapDetailView.as_view(),
    ),
    path(
        "v1/organizations/<str:org>/keyvaluemaps/<str:map_name>/entries",
        KeyValueMapEntryListView.as_view(),
    ),
    path(
        "v1/organizations/<str:org>/keyvaluemaps/<str:map_name>/entries/<str:entry_name>",
        KeyValueMapEntryDetailView.as_view(),
    ),
    path(
        "v1/organizations/<str:org>/environments/<str:env>/keyvaluemaps",
        KeyValueMapListView.as_view(),
    ),
    path(
        "v1/organizations/<str:org>/environments/<str:env>/keyvaluemaps/<str:map_name>",
        KeyValueMapDetailView.as_view(),
    ),
    path(
        "v1/organizations/<str:org>/environments/<str:env>/keyvaluemaps/<str:map_name>/entries",
        KeyValueMapEntryListView.as_view(),
    ),
    path(
        "v1/organizations/<str:org>/environments/<str:env>/keyvaluemaps/"
        "<str:map_name>/entries/<str:entry_name>",
        KeyValueMapEntryDetailView.as_view(),
    ),
    # 2. Las rutas de la documentación
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    # Levanta la interfaz interactiva (Swagger) en tu navegador
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
