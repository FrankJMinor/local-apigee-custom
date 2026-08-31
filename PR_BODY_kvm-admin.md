## Qué cambia

La pantalla **Key Value Maps** era una plantilla: leía un array de `mock.js` y los botones de editar y eliminar lanzaban un `alert`. Ahora administra los KVM reales del emulador, los trae de la instalación de Apigee Edge, el dashboard deja de pintar datos inventados y se añade la configuración de caches del environment.

Seis commits:

| Commit | Qué aporta |
| --- | --- |
| `438f8ab` | Administración de KVM desde la UI: tabla real, vista de edición y CRUD de llaves |
| `bfe7791` | Sincronización con Apigee Edge, borrado en bloque y modo selección |
| `938f26b` | La importación deja de descartar los KVM de rutas |
| `fb7bcab` | Llaves que solo difieren en mayúsculas, y barra de progreso |
| `e42ea7d` | Totales y actividad reales en el dashboard |
| `067fbd6` | Configuración de caches del environment |

## Por qué está hecho así

**Los KVM no viajan dentro del contrato del emulador.** `ApigeeSource`, el compilador que corre en `POST /v1/emulator/deploy`, solo lee `targetservers.json`, `flowhooks.json`, `debugmask.json`, `keystores.json`, `featureflags.json`, `datacollectors.json` y `deployments.json`; `kvms.json` no aparece por ningún lado. Eso explica por qué la política `GetKVM` de HelloWorld devolvía la variable vacía.

El emulador los carga por su API de datos de prueba, la misma que usa Cloud Code:

| Endpoint | Qué hace |
| --- | --- |
| `POST /v1/emulator/setup/tests` | Recibe un ZIP con `maps.json`, lo carga en el runtime y borra los archivos |
| `GET /v1/emulator/test/maps` | Devuelve los KVM cargados, con los nombres de sus llaves pero **sin** los valores |
| `DELETE /v1/emulator/clear/test` | Los descarga |

Como el runtime nunca devuelve valores, la fuente de verdad es el workspace: lo que versiona Git y lo que ve VS Code.

## Lo que hay que saber al revisar

**1. `setup/tests` reemplaza todo el test data y un fallo lo deja vacío.** Cada envío lleva el estado completo. Y si un cargador falla, el emulador responde 400 y el runtime se queda **sin ningún** KVM. Verificado a mano con una llave llamada `a`. De ahí que se valide antes de enviar y se revierta el `kvms.json` si aun así rechaza la carga.

**2. Qué acepta el cargador, comprobado contra el contenedor.** No se dedujo de la documentación:

| Caso | Emulador |
| --- | --- |
| `GET/v1/clientes`, `/v1/recurso` (con `/`) | rechaza |
| Nombre de un solo carácter | rechaza |
| `CreateUser` junto a `createuser` | acepta las dos: **distingue mayúsculas** |
| Espacios, puntos, acentos, empezar por dígito | acepta |
| Valores con comillas dobles, saltos de línea, de 20 KB | acepta |

**3. La validación está en el sitio donde importa, no antes.** Al workspace entra todo tal cual viene de Edge —incluidas las llaves con forma de URI de los KVM de rutas—, y el filtro se aplica al construir el `testdata.zip`. Se descartan las llaves concretas, no el KVM entero: `routing-repository` se carga con las que sí valen, y la UI marca las otras con una insignia *sin runtime*.

**4. Las credenciales de Edge no se guardan.** Se piden en cada sincronización, viven en el estado del modal mientras dura la llamada y no llegan a `localStorage`, ni a disco, ni al log — solo se registran usuario y ambiente para poder rastrear la operación.

**5. Solo `dev` tiene permisos.** `pre-prod` y `prd` quedan configurados y el desplegable avisa de que devolverán 401 hasta que los habiliten. Los hosts únicamente responden con la VPN corporativa levantada; el backend clasifica el fallo (`vpn`, `auth`, `forbidden`, `tls`, `notfound`) y la UI explica qué hacer con cada uno.

**6. TLS sin verificar por defecto.** Los gateways presentan un certificado de una CA interna (`Apigee CA`, de Radiomóvil Dipsa) que el contenedor no conoce. `APIGEE_EDGE_VERIFY_TLS=false` es el valor por defecto para que funcione sin configuración extra, pero `APIGEE_EDGE_CA_BUNDLE` permite montar la CA y verificar de verdad. **Conviene hacerlo: por esa conexión viajan las credenciales de Edge.**

**7. Los KVM cifrados llegan enmascarados.** Edge nunca expone sus valores por API: llegan como `*****`. Se importan igual, porque el nombre de las llaves sirve, pero el resumen los lista aparte para no confundirlos con valores reales.

**8. Escritura atómica.** El `kvms.json` lo leen a la vez la UI, el empaquetado del workspace y VS Code. Se escribe a un temporal y se hace `os.replace`, para que nadie lo lea a medias.

**9. El dashboard no inventa.** El emulador no guarda historial de operaciones, así que la actividad se reconstruye de tres fuentes fechables: las carpetas de `sdlc/contracts/<N>` (despliegues), el archivo más reciente del bundle de cada artefacto (ediciones) y el `lastModifiedAt` de cada KVM. Los tocados en el mismo minuto se agrupan, porque una importación de ochenta taparía el resto. Si algo no se puede fechar, no aparece.

## Caches del environment

Réplica de la pestaña *Environment Configuration → Caches* de Edge, bajo Key Value Maps en el menú: tabla editable en línea, `+ Cache`, borrado por fila y **Cancelar / Guardar** que persisten la tabla completa. Los tres tipos de caducidad con el control que corresponde a cada uno.

| Tipo | Control | Se guarda como |
| --- | --- | --- |
| Tiempo de espera | número | `timeoutInSec` → `"600"` |
| Hora del día | hora | `timeOfDay` → `"23:30:00"` |
| Fecha | fecha | `expiryDate` → `"08/31/2025"` |

**El emulador no aplica ese archivo, y conviene saberlo.** Verificado de tres formas: su compilador de contratos no lo lista entre los que lee; un despliegue con `caches.json` presente compila y lo ignora; y en los jars, `L1CacheManagerCaffeineImpl` registra `createCache(%s) completed` — los caches se crean **bajo demanda** cuando una política `PopulateCache`/`LookupCache` referencia un `<CacheResource>`. Las políticas locales funcionan sin declarar nada; esta pantalla mantiene la configuración que Edge sí exige, versionada en Git. La UI lo avisa en la propia página.

El nombre de un cache existente no se edita, igual que en Edge: es la referencia de los `<CacheResource>`. La validación corre entera antes de escribir, y `lastModifiedAt` solo avanza en las filas que cambiaron de verdad.

## Endpoints nuevos

```
GET    /v1/dashboard                                     totales, actividad y alertas
GET    /v1/keyvaluemaps                                  catálogo de los dos scopes + estado del runtime
POST   /v1/keyvaluemaps/sync                             reenvía el workspace al emulador
POST   /v1/keyvaluemaps/delete                           borrado en bloque, una sola recarga
GET    /v1/keyvaluemaps/edge/environments                ambientes de Edge configurados
POST   /v1/keyvaluemaps/edge/import                      importa de Edge (`stream: true` para el progreso)
```

```
GET|PUT          /v1/caches                                     tabla de caches / guardado en bloque
GET|POST         /v1/organizations/{org}/environments/{env}/caches
GET|PUT|DELETE   .../caches/{cache}
```

Más la réplica local de la API de KVM de Apigee, con el scope implícito en la ruta (sin `environments/<env>` es de organización, con él de entorno):

```
GET|POST         /v1/organizations/{org}[/environments/{env}]/keyvaluemaps
GET|PUT|DELETE   .../keyvaluemaps/{map}
GET|POST         .../keyvaluemaps/{map}/entries
GET|PUT|DELETE   .../keyvaluemaps/{map}/entries/{key}
```

## Verificación

- CRUD completo contra el contenedor real, en ambos scopes: 30 operaciones encadenadas sin errores ni temporales huérfanos.
- Importación real desde `dev`: 81 KVM, 27 087 llaves, los 81 cargados en el emulador.
- Ruta de error contra el Edge real: 401 con credenciales de prueba, mostrado con su pista.
- Pérdida del runtime (`clear/test`) y recuperación con **Recargar en emulador**; la alerta del dashboard aparece y desaparece con ello.
- Un `POST /v1/emulator/deploy` con la carpeta `organization/` presente sigue compilando, y los KVM sobreviven al despliegue.
- UI en claro y oscuro, con búsqueda, filtros, orden, paginado, edición en línea y borrado múltiple.
- Caches: los tres tipos guardados y releídos con el formato de Edge; rechazadas una caducidad negativa, un nombre con espacio y una fecha `31/08/2025`, sin tocar el archivo; rutas réplica de Edge (GET/PUT/DELETE) probadas.
- `ruff check` limpio y `vite build` en verde.

## Notas aparte

**El `kvms.json` del workspace queda fuera de este PR.** Tras la importación pesa 11 MB con los 81 KVM de `dev`, y contiene valores en claro de KVM que Edge no marcó como cifrados (`reset-credentials-repository`, `notificacionesCredentials`). Es dato de trabajo, no código: conviene decidir aparte si se versiona, se ignora o se queda solo en local.

**El `caches.json` del workspace tampoco entra**, por la misma razón: lo que hay ahora es un cache `test` de probar la pantalla, no configuración real. El archivo nace en el primer guardado.

**La política `GetKVM` de HelloWorld** no lee nada porque le falta `mapIdentifier="MiKvmDePrueba"`; sin él consulta el mapa por defecto. Queda documentado en el README, pero **no se toca el archivo en este PR**.
