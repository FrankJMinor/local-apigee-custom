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

### Cambiado
- `docker-compose.yml`: el servicio `backend-api` monta ahora `./src` completo en
  `/app/workspace` (antes solo `apiproxies`), necesario para empaquetar environments y
  sharedflows al desplegar.

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
