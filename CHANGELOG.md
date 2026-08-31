# Changelog

Todas las versiones y cambios relevantes del proyecto se documentan aquí siguiendo el formato [SemVer](https://semver.org/lang/es/).

## [Unreleased]
### Agregado
- Alta de proxies desde la UI: el botón **+ Nuevo Proxy** abre un asistente de 4 pasos
  (Tipo → Detalles → Construir → Resumen) que replica *Build a Proxy → Proxy bundle*
  de la consola de Apigee.
- `POST /v1/organizations/{org}/apis`: importa un bundle ZIP, lo valida, lo escribe en
  `src/main/apigee/apiproxies/` y lo despliega en el emulador. Revierte el workspace si
  el emulador rechaza el contrato.
- `POST /v1/emulator/deploy` y `GET /v1/emulator/status` para redesplegar el workspace y
  consultar el estado vivo del emulador sin depender de VS Code.
- Módulos `APIs/emulator.py` (cliente de la API de administración del emulador y
  empaquetado del workspace) y `APIs/bundles.py` (validación y registro de bundles).
- Botón **Save** del detalle de proxy: guarda lo editado (políticas, endpoints, scripts)
  en el workspace y despliega la revisión resultante en el emulador. Se habilita solo si
  hay cambios pendientes.
- `POST /v1/proxies/{proxy}/update`: guardado transaccional: respalda el bundle antes de
  escribir y lo restaura si el emulador rechaza el contrato.
- Chip de estado en la cabecera: `● Active` → `Deploying…` (ámbar, con pulso) → `● Active`,
  o `● Deploy failed` con un banner que muestra el archivo y la línea que reporta el emulador.
- Botón **Deploy**: redespliega el workspace tal como está en disco, sin escribir archivos.
- Eliminación de proxies desde la tabla: botón de papelera por fila y selección múltiple
  con casillas (la de la cabecera marca lo visible tras el filtro). Pide confirmación con
  la lista exacta y borra del workspace y del runtime del emulador.
- `DELETE /v1/organizations/{org}/apis/{proxy}` y `POST /v1/proxies/delete`: el borrado en
  bloque genera una sola revisión, y si el emulador rechaza el contrato todo se restaura.
- Viñeta **Trace** del editor de proxies: abre una sesión de depuración en el emulador y
  muestra, por cada petición, la línea de tiempo del flujo (políticas con su tipo y offset,
  condiciones con su resultado, cambios de estado) y las variables leídas y escritas en cada
  paso, junto al mensaje tal como estaba en ese instante.
- `POST /v1/proxies/{proxy}/trace` y `GET /v1/proxies/{proxy}/trace/{sessionId}`, apoyados
  en la API de trace no documentada del emulador.
- `APIs/trace.py`: aplana el formato de debug session de Apigee (unos 40 puntos por
  petición) en pasos legibles, descartando las ejecuciones internas del motor y las
  variables de infraestructura. `?raw=true` y `?verbose=true` los recuperan.
- La viñeta Trace se actualiza sola cuando llega una petición, vía Server-Sent Events
  (`GET /v1/proxies/{proxy}/trace/{sessionId}/stream`). El emulador no notifica nada por su
  cuenta, así que sondea el backend y solo empuja al navegador cuando hay cambios; si el
  stream no se establece, la UI cae a sondeo cada 2,5 s y lo indica con una insignia.
- El cronómetro de la sesión de trace se muestra en `m:ss` en lugar de solo segundos.
- La traza se visualiza como el *Transaction Map* de Apigee Edge: carriles de Solicitud y
  Respuesta con una baldosa por paso, coloreada por categoría de política, y el detalle a
  todo lo ancho debajo. `ui/src/utils/policyVisuals.js` mapea el catálogo completo a los
  SVG de `ui/icons`, con color de categoría y siglas del tipo para los que no tienen icono.
- Los flow hooks se reconocen en la traza (`FlowCallout` / `FlowReturn`) y se agrupan sobre
  una banda verde con el nombre del shared flow, junto con todo lo que se ejecuta dentro.
- La viñeta Trace adopta el acomodo de la traza de Apigee Edge: tabla de transacciones
  (#, Estado, Método, URI, Tiempo) y opciones de vista a la izquierda; barra *Enviar
  petición*, Transaction Map y detalle de fase en dos columnas a la derecha, con navegación
  *Anterior* / *Siguiente* y descarga de la traza en JSON.
- `POST /v1/proxies/{proxy}/invoke`: lanza tráfico contra el proxy desde la propia UI. Va
  por el backend porque el runtime del emulador no manda cabeceras CORS.
- Shared flows con el mismo ciclo que los proxies: alta por bundle desde **+ Nuevo Flow**,
  guardado + despliegue desde el editor con chip de estado, y borrado individual o múltiple
  desde la tabla.
- `POST /v1/organizations/{org}/sharedflows`, `POST /v1/sharedflows/{flow}/update`,
  `DELETE /v1/organizations/{org}/sharedflows/{flow}` y `POST /v1/sharedflows/delete`.
- Administración de Key Value Maps desde la UI: la tabla de *Key Value Maps* deja de ser
  una plantilla con datos falsos y muestra los KVM reales del contenedor. Scope, cifrado,
  número de entradas y fecha de modificación salen del propio KVM, y una columna nueva
  indica si el emulador lo tiene cargado.
- Vista de edición de un KVM (`/kvm/:nombre`): tabla estilo cliente de base de datos para
  buscar por llave o valor, filtrar por filas vacías o con valor, ordenar por cualquier
  columna y paginar; alta, edición en línea y borrado de llaves, individual o por selección
  múltiple. Los KVM cifrados enmascaran los valores con un botón *Mostrar valores*.
- `APIs/kvms.py`: CRUD de KVM sobre los `kvms.json` del workspace y sincronización con el
  runtime. Los KVM no entran por el contrato del emulador (`ApigeeSource` no lee
  `kvms.json`), sino por su API de datos de prueba: `POST /v1/emulator/setup/tests` con un
  ZIP que contiene `maps.json`, y `GET /v1/emulator/test/maps` para leer lo cargado. Es la
  misma puerta que usa Cloud Code.
- Réplica local de la API de KVM de Apigee, con el scope implícito en la ruta:
  `GET|POST /v1/organizations/{org}[/environments/{env}]/keyvaluemaps`,
  `GET|PUT|DELETE .../keyvaluemaps/{map}`, `GET|POST .../keyvaluemaps/{map}/entries` y
  `GET|PUT|DELETE .../keyvaluemaps/{map}/entries/{key}`. Se añaden `GET /v1/keyvaluemaps`
  (catálogo de los dos scopes cruzado con el runtime) y `POST /v1/keyvaluemaps/sync`.
- Scope `organization` para KVM, en `src/main/apigee/organization/kvms.json`. Son los dos
  únicos scopes que distingue el emulador: `KeyValueMapLoader` manda a `createOrgScope`
  todo lo que no sea `environment`.
- Los KVM creados desde la UI guardan `createdAt` y `lastModifiedAt` en milisegundos, al
  estilo de las demás entidades de Apigee. Un `kvms.json` escrito a mano sigue funcionando:
  la fecha cae a la del archivo.
- `emulator.push_test_data()`, `emulator.get_test_maps()` y `emulator.clear_test_data()`.
- Componentes `ConfirmDialog` (confirmación de acciones destructivas, reutilizable) y
  `NewKvmModal` (alta de KVM con sus entradas iniciales).
- Sincronización de KVM contra la instalación real de Apigee Edge: el botón **Sincronizar
  con Edge** abre un modal que pide usuario, contraseña y ambiente (`dev`, `pre-prod`, `prd`),
  consulta `GET /v1/o/{org}/e/{env}/keyvaluemaps` con autenticación Basic y deja los KVM en el
  workspace y en el emulador. Hoy solo `dev` tiene permisos concedidos; los otros dos quedan
  configurados y el desplegable avisa de que devolverán 401.
- `APIs/edge.py`: cliente de la API de administración de Edge. Las credenciales viajan solo en
  la petición: no se guardan en el navegador, ni en el backend, ni en el log. Traduce el fallo
  a un `kind` (`vpn`, `auth`, `forbidden`, `tls`, `notfound`) y la UI explica qué hacer con cada
  uno; los hosts únicamente responden con la VPN corporativa levantada.
- `POST /v1/keyvaluemaps/edge/import` y `GET /v1/keyvaluemaps/edge/environments`.
- Modo selección en las dos tablas de KVM: las casillas solo aparecen al pulsar **Seleccionar**,
  y con ellas los botones *Eliminar (n)* y *Eliminar todos*. Antes las casillas de las llaves
  estaban siempre visibles y las de los KVM no existían.
- `POST /v1/keyvaluemaps/delete`: borra varios KVM (o todos, de los dos scopes) con una sola
  recarga del emulador en lugar de encadenar una por nombre.
- La importación desde Edge ya no descarta KVM por nombres que el emulador no acepte: el
  workspace guarda la copia fiel de lo que hay en Edge, incluidas las llaves con forma de URI
  (`GET/v1/recurso`) de los KVM de rutas. El filtro se aplica solo al construir el
  `testdata.zip`, que es donde un nombre inválido tiene consecuencias: `setup/tests` devuelve
  400 y deja el runtime sin ningún KVM.
- La UI marca las llaves que están en el workspace pero que el runtime local no puede sostener,
  con una insignia por fila y un aviso en la cabecera del KVM. `inSync` se calcula contra las
  llaves cargables, no contra todas, para que un KVM de rutas no aparezca eternamente
  desincronizado.
- `GET /v1/keyvaluemaps` añade `notLoadableKeys` y `loadable` por KVM, y los totales
  `notLoadableKeyCount` y `notLoadableMaps`.
- Barra de progreso durante la importación desde Edge. El backend admite `"stream": true` y
  emite el avance como Server-Sent Events; la UI lo lee con `fetch` y un lector de stream, ya
  que las credenciales viajan en el cuerpo del POST y `EventSource` solo hace GET.
- El dashboard deja de pintar datos inventados. `GET /v1/dashboard` (módulo `APIs/dashboard.py`)
  devuelve los totales reales —proxies enrutados, shared flows, KVM y llaves—, la actividad
  reciente y las alertas.
- Actividad reciente reconstruida del estado en disco, porque el emulador no guarda historial:
  las carpetas de revisión de `sdlc/contracts` fechan los despliegues, el archivo más reciente
  de cada bundle fecha su última edición y los KVM traen su propio `lastModifiedAt`. Los KVM
  tocados en el mismo minuto se agrupan en un evento, para que una importación de ochenta no
  tape el resto.
- Las alertas del dashboard salen del estado real: emulador sin responder, KVM sin cargar en el
  runtime, llaves que el emulador no admite o ninguna revisión desplegada.
- Pantalla **Caches**, bajo Key Value Maps en el menú: réplica de la pestaña *Environment
  Configuration → Caches* de Apigee Edge, con edición en línea y guardado de la tabla completa.
  Los tres tipos de caducidad (`timeoutInSec`, `timeOfDay`, `expiryDate`) con el control que
  corresponde a cada uno.
- `APIs/caches.py` y `src/main/apigee/environments/<env>/caches.json`, con la forma que devuelve
  la API de administración de Edge para poder promoverlo tal cual. El emulador no aplica ese
  archivo —crea los caches bajo demanda cuando una política los referencia— y la UI lo avisa.
- `GET|PUT /v1/caches` y la réplica de las rutas de Edge
  `/v1/organizations/{org}/environments/{env}/caches[/{cache}]`.

### Cambiado
- La unicidad de nombres de KVM y de llave pasa a distinguir mayúsculas, como hace el emulador
  (su cargador usa un `Set<String>` de Java: está comprobado que `CreateUser` y `createuser`
  conviven). Compararlos en minúsculas colapsaba llaves legítimas de Edge que solo difieren en
  la caja, y hacía fallar la importación de once KVM —`api-proxy-settings`,
  `routing-repository`, `interface-repository` y compañía—. Un duplicado exacto durante la
  importación ya no aborta el KVM: se conserva el último valor y se reporta.
- El botón de sincronización de la tabla de KVM se separa en dos: **Recargar en emulador**
  (reenvía el workspace, lo que antes hacía *Sincronizar*) y **Sincronizar con Edge** (trae los
  KVM de la instalación real). Recargar sigue haciendo falta tras reiniciar el contenedor,
  porque los datos de prueba del emulador viven solo en memoria.
- Los nombres de KVM y de llave se validan en el backend con la misma expresión que aplica
  el emulador (`KeyValueMapUtil.ENTITY_NAME_PATTERN`): mínimo dos caracteres y sin `/`. No
  es cosmético: `POST /v1/emulator/setup/tests` reemplaza todos los datos de prueba y, si un
  cargador falla, deja el runtime **sin ningún** KVM. Si aun así el emulador rechaza la
  carga, el backend revierte el `kvms.json` y vuelve a sincronizar el estado anterior.
- `APIs/bundles.py` pasa a estar parametrizado por `ArtifactKind`: proxies y shared flows
  comparten implementación en lugar de duplicarla. Los modales de alta y borrado de la UI
  reciben el tipo por prop.
- `docker-compose.yml`: el servicio `backend-api` monta ahora `./src` completo en
  `/app/workspace` (antes solo `apiproxies`), necesario para empaquetar environments y
  sharedflows al desplegar.

### Corrección
- Las viñetas del editor de proxies (*Develop*, *Trace*, *Performance*) solo cambiaban el
  estilo del botón: `activeTab` no condicionaba el cuerpo, así que pulsarlas no hacía nada.
- El árbol de archivos de un shared flow se leía desde la carpeta del flow y no desde
  `sharedflowbundle/`, así que devolvía rutas con el prefijo del bundle. Al guardar, esa
  ruta se resolvía otra vez dentro del bundle y creaba
  `sharedflowbundle/sharedflowbundle/...`: la edición nunca llegaba al archivo real. Ahora
  el árbol es relativo a la raíz del bundle y el guardado descarta el prefijo si viene.
- `POST /v1/sharedflows/{flow}/update` no existía: el botón de guardar del editor de shared
  flows devolvía 404 en silencio.
- Los nombres de proxy se comparaban distinguiendo mayúsculas, pero el workspace vive en un
  sistema de archivos que no las distingue. Importar `helloWorld` con `HelloWorld` existente
  escribía sobre su carpeta y, al fallar el despliegue, el rollback la borraba entera. Ahora
  el nombre real se resuelve con `bundles.resolve_proxy_name()` antes de escribir o borrar, y
  un choque de mayúsculas se rechaza explicándolo.
- La revisión activa y el árbol de archivos se tomaban de la carpeta numérica más alta de
  `sdlc/contracts/`. Un despliegue que falla al compilar deja igualmente su carpeta ahí, así
  que la UI mostraba —y dejaba editar— archivos de un contrato rechazado. Ahora se resuelve
  con el `proxyUID` que reporta el emulador, cayendo al máximo en disco solo si no responde.
- `POST /v1/proxies/{proxy}/update` no existía: el botón de guardar del editor devolvía 404
  de forma silenciosa.
- El editor volvía a `default.xml` cada vez que se releía el árbol, sacando al usuario del
  archivo que estaba editando.
- Los selectores `.btnSave` del CSS estaban escritos sin el punto inicial, por lo que nunca
  se aplicaron.

---

## Sugerencia de versionado y tags históricos

Se recomienda el siguiente flujo de versionado y etiquetado:

- Usar tags en la rama master para versiones estables.
- Usar tags en dev para versiones de desarrollo (por ejemplo, v0.x.x-dev).
- Al hacer merge de dev a master, incrementar la versión estable.
- Para la rama qa, usar tags tipo v0.x.x-rc (release candidate).

### Ejemplo de tags sugeridos según el historial:

- d5de57c: v0.1.0 (inicio del proyecto)
- ffab102: v0.2.0 (apigee local y pruebas)
- 98c6034: v0.3.0 (máquina complementaria)
- fe4b64a: v0.4.0 (mejora de organización)
- 1db7672: v0.5.0 (actualización de repo y script web)
- 95dd0a3: v0.6.0-dev (último en dev)

---

## [v0.1.0] - 2026-04-29
### Agregado
- Estructura inicial del proyecto.
- Scripts de despliegue y archivos de configuración Docker.
- Mock API y archivos de ejemplo para Apigee.
- Interfaz de usuario básica con Vite y React.

### Cambiado
- Organización de carpetas y archivos para facilitar el desarrollo.

### Corrección
- Correcciones menores en scripts y archivos de configuración.

---

> Agrega nuevas versiones arriba de esta línea siguiendo el formato:
> 
> ## [vX.Y.Z] - YYYY-MM-DD
> ### Agregado
> - ...
> ### Cambiado
> - ...
> ### Corrección
> - ...
