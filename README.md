# Apigee Emulator

![Status](https://img.shields.io/badge/status-preview-yellow)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11-3776ab?logo=python&logoColor=white)
![React](https://img.shields.io/badge/react-v18-61dafb?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/docker-v4.38.0-2496ed?logo=docker&logoColor=white)
![Apigee Emulator](https://img.shields.io/badge/Apigee%20Emulator-v1.15.2-4285F4?logo=google-cloud&logoColor=white)

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

### Alta de proxies desde la UI (+ Nuevo Proxy)

El botón **+ Nuevo Proxy** de la pantalla *API Proxies* replica el asistente
*Build a Proxy → Proxy bundle* de la consola de Apigee: se selecciona un ZIP, se
indica el nombre y el proxy queda desplegado en el emulador sin pasar por VS Code.

**Flujo completo**

1. La UI envía el ZIP a `POST /v1/organizations/{org}/apis?action=import&name={name}`
   (multipart, campo `file`).
2. El backend valida el bundle: que sea un ZIP legible, que contenga la carpeta
   `apiproxy/`, que declare al menos un `ProxyEndpoint` y que su basepath no lo
   esté usando ya otro proxy.
3. Escribe el bundle en `src/main/apigee/apiproxies/<name>/apiproxy/` — la
   *source of truth* que ve VS Code y versiona Git — y lo registra en el
   `deployments.json` del environment.
4. Empaqueta todo `src/` y lo envía al emulador; este compila el contrato, crea
   una revisión nueva y la activa.
5. Si el emulador rechaza el contrato, el workspace se revierte al estado previo
   (incluida la versión anterior del proxy cuando se sobrescribe).

Se aceptan las dos formas habituales de empaquetado: `apiproxy/...` en la raíz
del ZIP (formato oficial de Apigee) y `MiProxy/apiproxy/...` (comprimir la
carpeta del proxy).

### Guardar y desplegar desde el editor (botón Save)

En el detalle de un proxy, **Save** persiste lo editado (XML de políticas,
endpoints, scripts) y despliega la revisión resultante en el emulador. El botón
solo se habilita si hay cambios pendientes y muestra un punto (`Save •`) cuando
los hay. **Deploy**, al lado, redespliega el workspace tal como está en disco sin
escribir nada.

Mientras la operación está en curso, el chip de estado de la cabecera pasa de
`● Active` (verde) a `Deploying…` (ámbar, con un punto que late) y ambos botones
quedan deshabilitados. Si el emulador rechaza el contrato, el chip queda en
`● Deploy failed` (rojo) y aparece un banner con el diagnóstico exacto que
devuelve el emulador, por ejemplo:

```
SetResponse.xml (Line:1:65): The element type "Payload" must be terminated
by the matching end-tag "</Payload>".
```

El guardado es transaccional: `POST /v1/proxies/{proxy}/update` respalda el bundle
antes de escribir y, si el despliegue falla, restaura los archivos al último
estado válido. El workspace nunca se queda en un estado que el emulador rechaza.

### De dónde sale el número de revisión

El indicador *Revision* refleja el contrato que el emulador tiene **realmente
activo**, no la carpeta más alta de `sdlc/contracts/`. La distinción importa: si un
despliegue falla al compilar, el emulador ya ha extraído el código fuente en
`contracts/<N>` y esa carpeta se queda ahí. Deducir la revisión del máximo haría
que la UI mostrara —y dejara editar— los archivos de un contrato rechazado.

La fuente fiable es el `proxyUID` que reporta `GET /v1/emulator/tree`, que
identifica el contrato en ejecución. `get_current_revision()` lo consulta y cae a
la carpeta más alta solo si el emulador no responde.


### La API de administración del emulador

El emulador expone una API REST en el **puerto 8080 del contenedor** (publicado
como `8999` en el host) bajo el prefijo `/v1`. Es la misma que usa la extensión
Cloud Code al pulsar *Deploy*, y no está documentada públicamente:

| Método   | Ruta                                    | Uso                                                   |
|----------|-----------------------------------------|-------------------------------------------------------|
| `POST`   | `/v1/emulator/deploy?environment=<env>` | Recibe un ZIP con `src/main/apigee/...` y lo activa    |
| `GET`    | `/v1/emulator/tree`                     | Endpoints desplegados y su basepath                   |
| `GET`    | `/v1/emulator/version`                  | Versión del emulador y environment activo             |
| `POST`   | `/v1/emulator/reset`                    | Reinicia el estado del emulador                       |
| `POST`   | `/v1/emulator/trace?proxyName=<proxy>`  | Abre una sesión de trace                              |
| `GET`    | `/v1/emulator/analytics`                | Registros de analytics                                |

Ojo con los puertos: el `8445` del host es **tráfico** (puerto 8998 interno), no
administración, pese a lo que sugiere su etiqueta histórica de "control port".

El despliegue no se dispara escribiendo en `sdlc/contracts/`: el emulador no
vigila ese directorio. Solo el `POST /v1/emulator/deploy` compila y activa el
contrato; el emulador crea la carpeta de la revisión y borra las anteriores.

**Endpoints propios que expone el backend**

| Método | Ruta                                | Uso                                                        |
|--------|-------------------------------------|------------------------------------------------------------|
| `POST` | `/v1/organizations/{org}/apis`      | Importa un bundle ZIP y lo despliega                        |
| `POST` | `/v1/emulator/deploy`               | Redespliega todo el workspace (equivale al *Deploy* de VS Code) |
| `GET`  | `/v1/emulator/status`               | Versión del emulador + árbol de endpoints activos          |
| `POST` | `/v1/proxies/{proxy}/update`        | Guarda archivos editados y despliega (con rollback)        |

Variables de entorno del servicio `backend-api` (ver `docker-compose.yml`):

| Variable               | Valor por defecto          | Descripción                                    |
|------------------------|----------------------------|------------------------------------------------|
| `APIGEE_EMULATOR_URL`  | `http://apigee-dev:8080`   | API de administración del emulador             |
| `APIGEE_ENVIRONMENT`   | `apigee-dev`               | Environment destino de los despliegues         |
| `APIGEE_SOURCE_ROOT`   | `/app/workspace`           | Carpeta `src` montada desde el host            |



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