# Apigee Emulator

Este repositorio contiene una detalla solución técnica para implementar un entorno de desarrollo local de Apigee utilizando **Cloud Code** en VS Code, resolviendo específicamente los conflictos de comunicación con Docker y la gestión de recursos locales.

## Diagnóstico del Error Principal
Al utilizar versiones recientes de Docker Desktop (v29.0.0+), la extensión de Google Cloud Code falla al intentar detectar el contenedor, lanzando el error: 

`Error: Could not find the newly created container apigee-dev`

Esto se debe a un cambio en el esquema del JSON de respuesta del motor de Docker (cambio de `ApiVersion` a `APIVersion`).

## Instalación

### 1. Downgrade de Docker Desktop
Es obligatorio retroceder a una versión que utilice el **Docker Engine v27.x** para mantener la compatibilidad con el plugin actual de Google.

* **URL de descarga oficial:** [Docker Desktop Installer v4.38.0](https://desktop.docker.com/win/main/amd64/181591/Docker%20Desktop%20Installer.exe)

* **Pasos:**
    1. Desinstalar la versión actual de Docker Desktop (sí es que se tiene una).
    2. Instalar el ejecutable `v4.38.0`.
    3. **IMPORTANTE:** Ir a *Settings > General* y desmarcar la casilla **"Automatically check for updates"**. Esto evita que el sistema regrese a la versión 29 automáticamente.

![alt text](images/{226AC8FF-0DE8-410F-AE0F-9DBA6E2D1ABE}.png)

### 2. Configuración de VS Code y Emulador
1. En la extensión **Google Cloud Code**, sección de Apigee, abrir *Settings*.

    ![alt text](images/{25F879C5-DB43-4BE1-A2C9-618F7027D7C2}.png)

2. En `Apigee: Emulators`, añadir el tag: **`1.15.2`**.

Nota: Para agregar una versión especifica en windows seleccionar ctrl + , y agregamos la versión deseada.


![alt text](images/{C9D0D623-F0F1-4D20-9A16-DBB465D02560}.png)

3. Iniciar el emulador y asignar los siguientes puertos para evitar colisiones (o los que prefiera el usuario):
    * **Traffic Port:** `8999` (Puerto para consumir APIs).
    * **Control Port:** `8445` (Puerto para administración/despliegue).

      ![Desacarga manual](images/{560D9023-80AB-498B-8580-5C7D098B8243}.png)

      ![Nombre del contenedor](images/{032B59B0-6284-4B5F-B1AD-0979B53DD011}.png)

      ![Selección de puerto de salida](images/{364F4131-761C-48B6-9838-C69798544C08}.png)

      ![selección del puerto de apigee](images/{46427D77-838C-4297-B52C-6369DFF300C3}.png)

      ![proceso de instalación](images/{B3D0DD9B-5CEE-480B-BAA7-2CEF81B7C187}.png)

## 📂 Configuración del Entorno Local



### Creación de un Environment y registro de Proxies

Para que el emulador cargue los proxies correctamente, es necesario crear un manifiesto llamado `deployments.json` dentro de la carpeta del environment. Por defecto, la ruta es: `./src/main/apigee/environments/apigee-dev/deployments.json`.

#### Pasos para crear un nuevo environment y registrar proxies:

1. **Crear la carpeta del environment:**
   - Ubícate en `src/main/apigee/environments/`.
   - Crea una nueva carpeta con el nombre de tu environment, por ejemplo: `mi-nuevo-env`.

2. **Crear el archivo `deployments.json`:**
   - Dentro de la carpeta del environment, crea el archivo `deployments.json`.
   - Agrega la siguiente estructura, listando los proxies que deseas habilitar:

```json
{
  "proxies": ["HelloWorld", "REVERSE-proxy"],
  "sharedflows": []
}
```

> **Nota:** Puedes agregar tantos proxies como existan en la carpeta `src/main/apigee/apiproxies/`. Solo debes asegurarte de que los nombres coincidan exactamente con los nombres de las carpetas de cada proxy.

Con este manifiesto, el emulador cargará en memoria los proxies especificados cada vez que se inicie.


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



## Resumen Técnico: Arquitectura de Doble Backend para Apigee Local

### 1. El Problema de Origen

El **Apigee Emulator** de Google es un "Data Plane" (Runtime). Esto significa que está diseñado para ejecutar tráfico, pero carece de un "Management API" completo. Al intentar consultar la lista de proxies vía `curl` al puerto de administración, el emulador devuelve un error **404 Not Found** porque esa ruta no está programada en su imagen ligera.

### 2. La Solución: "Fake Management API" (Sidecar Container)

Para obtener la lista de proxies mediante comandos de consola, desarrollamos un microservicio satélite que actúa como un Plano de Control Simulado. Este servicio lee directamente el sistema de archivos del proyecto y expone la información a través de una API REST.

#### Componentes de la Arquitectura

**A. El Servidor de Simulación (`server.js`)**

- Se creó un servidor en Node.js (Express) cuya única función es escuchar peticiones en la ruta estándar de Apigee `/v1/organizations/:org/apis`.
- **Lógica:** En lugar de consultar una base de datos, el servidor realiza una lectura síncrona del archivo `deployments.json` ubicado en la estructura de carpetas del proyecto.
- **Ruta Crítica:** Se identificó mediante inspección de contenedores que la ruta exacta dentro del volumen de Docker es: `/workspace/src/main/apigee/environments/apigee-dev/deployments.json`.

**B. Contenedorización (`Dockerfile`)**

- Para evitar instalar dependencias en el sistema operativo host (Windows), el servidor se empaqueta en una imagen de `node:18-alpine`.
- Se utiliza la instrucción `COPY` para integrar el código.
- Se expone el puerto `8446`.

**C. Orquestación (`docker-compose.yml`)**

- Se configuró un archivo de orquestación para levantar ambos servicios en sincronía:
    - **Servicio `apigee-dev`:** El emulador oficial (versión 1.15.2).
    - **Servicio `fake-management-api`:** Nuestro servidor de Node.js.
- **Volúmenes:** Se utilizó un montaje de volumen (`./:/workspace`) que permite al segundo contenedor "ver" en tiempo real los cambios que haces en tu VS Code.

### 3. Configuración de Puertos Final

El laboratorio quedó operando bajo el siguiente esquema de puertos:

| Puerto   | Uso                                         |
|----------|---------------------------------------------|
| 8445     | Control y Tráfico de Apigee (VS Code)       |
| 8446     | Consulta de Inventario (Fake API)           |
| 8999     | Tráfico secundario                          |

### 4. Pasos Clave del Logro Técnico

- **Downgrade de Infraestructura:** Se forzó el uso de Docker Desktop v4.38.0 para mantener compatibilidad con el motor de Docker v27, evitando errores de comunicación con el plugin de Google Cloud Code.
- **Descubrimiento de Rutas:** Se utilizó el comando:

  ```bash
  docker exec [id] find /workspace -name deployments.json
  ```
  para mapear la estructura interna del contenedor y corregir errores de lectura (500 Internal Server Error).
- **Persistencia y Build:** Se implementó el flujo de reconstrucción con:

  ```bash
  docker-compose up --build
  ```
  para asegurar que cada cambio en la lógica del servidor de simulación sea aplicado correctamente.

### 5. Comandos de Validación

**Listar API Proxies (Nuestra solución):**

```bash
curl -i http://localhost:8446/v1/organizations/hybrid/apis
```

Respuesta esperada: `200 OK` con un JSON conteniendo los nombres de los proxies definidos en `deployments.json`.

**Consumir Tráfico (Apigee Runtime):**

```bash
curl -i http://localhost:8445/hello
```

Respuesta esperada: `200 OK` con el payload definido en las políticas de AssignMessage y lectura de KVMs locales.

---

Este laboratorio representa una solución de ingeniería de nivel **Senior**, donde se extendieron las capacidades de una herramienta cerrada mediante el uso estratégico de contenedores, volúmenes compartidos y simulación de APIs.

# Diagrama de Arquitectura de la solución

A continuación se detalla un diagrama para complementar el emulador de Apigee

![alt text](images/Arquitectura%20complementaria.png)