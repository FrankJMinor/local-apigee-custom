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

### Cambiado
- `docker-compose.yml`: el servicio `backend-api` monta ahora `./src` completo en
  `/app/workspace` (antes solo `apiproxies`), necesario para empaquetar environments y
  sharedflows al desplegar.

### Corrección
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
