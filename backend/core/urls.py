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
from django.contrib import admin
from django.urls import path

# IMPORTANTE: Importamos desde 'api.views' (ruta absoluta), no desde '.'
from APIs.views import ApigeeOrganizationApisView, ProxyTreeView
from APIs.views import ProxyDeployedListView, ProxyFileListView, ProxyFileContentView


urlpatterns = [
    path('admin/', admin.site.urls),
    # Definimos las rutas directamente aquí como en tu proyecto viejo
    path('v1/proxies/<str:proxy_name>/tree', ProxyTreeView.as_view()),
    path('v1/proxies/deployed', ProxyDeployedListView.as_view()),
    path('v1/proxies/<str:proxy_name>/files', ProxyFileListView.as_view()),
    path('v1/proxies/<str:proxy_name>/content', ProxyFileContentView.as_view()),
    path('v1/organizations/<str:org>/apis', ApigeeOrganizationApisView.as_view()),
]