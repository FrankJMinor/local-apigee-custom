# 🚀 Apigee Emulator - Guía de Configuración en Windows

Este documento detalla la solución técnica para implementar un entorno de desarrollo local de Apigee utilizando **Cloud Code** en VS Code, resolviendo específicamente los conflictos de comunicación con Docker y la gestión de recursos locales.

## 🛠️ Diagnóstico del Error Principal
Al utilizar versiones recientes de Docker Desktop (v29.0.0+), la extensión de Google Cloud Code falla al intentar detectar el contenedor, lanzando el error:  
`Error: Could not find the newly created container apigee-dev`

Esto se debe a un cambio en el esquema del JSON de respuesta del motor de Docker (cambio de `ApiVersion` a `APIVersion`).

## 📋 Proceso de Instalación

### 1. Downgrade de Docker Desktop
Es obligatorio retroceder a una versión que utilice el **Docker Engine v27.x** para mantener la compatibilidad con el plugin actual de Google.

* **URL de descarga oficial:** [Docker Desktop Installer v4.38.0](https://desktop.docker.com/win/main/amd64/181591/Docker%20Desktop%20Installer.exe)
* **Pasos:**
    1. Desinstalar la versión actual de Docker Desktop.
    2. Instalar el ejecutable `v4.38.0`.
    3. **IMPORTANTE:** Ir a *Settings > General* y desmarcar la casilla **"Automatically check for updates"**. Esto evita que el sistema regrese a la versión 29 automáticamente.

### 2. Configuración de VS Code y Emulador
1. En la extensión **Google Cloud Code**, sección de Apigee, abrir *Settings*.
2. En `Apigee: Emulators`, añadir el tag: **`1.15.2`**.
3. Iniciar el emulador y asignar los siguientes puertos para evitar colisiones:
    * **Traffic Port:** `8999` (Puerto para consumir APIs).
    * **Control Port:** `8445` (Puerto para administración/despliegue).

## 📂 Configuración del Entorno Local

### Despliegues (deployments.json)
El emulador requiere un manifiesto para cargar los proxies en memoria. Se ubica en `./environments/apigee-dev/deployments.json`:

```json
{
  "proxies": ["HelloWorld"],
  "sharedflows": []
}
```


### Mapas de Valores (KVMs)
Para simular KVMs de la nube, se debe crear el archivo `./environments/apigee-dev/kvms.json`:

```json
[
  {
    "name": "MiKvmDePrueba",
    "encrypted": false,
    "entry": [
      { "name": "token_secreto", "value": "12345-abcde-local" }
    ]
  }
]
```