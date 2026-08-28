// Utilidad para importar un bundle (proxy o shared flow) y desplegarlo en el emulador.
// Replica las llamadas oficiales de Apigee:
//   POST /v1/organizations/{org}/apis?action=import&name={name}
//   POST /v1/organizations/{org}/sharedflows?action=import&name={name}
// El proxy de Vite reenvía /v1 al backend de Django, así que la ruta va relativa.

export const ORGANIZATION = 'americamovil'

/**
 * Diferencias entre proxies y shared flows, para no duplicar el asistente ni la
 * tabla. Solo cambian las rutas, las etiquetas y la carpeta raíz del bundle.
 */
export const ARTIFACT_KINDS = {
  proxy: {
    key: 'proxy',
    importPath: `/v1/organizations/${ORGANIZATION}/apis`,
    deletePath: '/v1/proxies/delete',
    deleteBody: names => ({ proxies: names }),
    updatePath: name => `/v1/proxies/${encodeURIComponent(name)}/update`,
    filesPath: name => `/v1/proxies/${encodeURIComponent(name)}/files`,
    bundleRoot: 'apiproxy/',
    workspaceDir: 'src/main/apigee/apiproxies/',
    detailRoute: name => `/proxies/${encodeURIComponent(name)}`,
    labels: {
      one: 'proxy',
      many: 'proxies',
      titleNew: 'Nuevo API Proxy',
      subtitleNew: 'Carga un bundle y despliégalo en el emulador local.',
      lead: 'Elige cómo quieres construir tu API proxy.',
      nameField: 'Proxy Name',
      typeName: 'Proxy bundle',
      successTitle: 'Proxy importado y desplegado',
    },
  },
  sharedflow: {
    key: 'sharedflow',
    importPath: `/v1/organizations/${ORGANIZATION}/sharedflows`,
    deletePath: '/v1/sharedflows/delete',
    deleteBody: names => ({ sharedflows: names }),
    updatePath: name => `/v1/sharedflows/${encodeURIComponent(name)}/update`,
    filesPath: name => `/v1/sharedflows/${encodeURIComponent(name)}/files`,
    bundleRoot: 'sharedflowbundle/',
    workspaceDir: 'src/main/apigee/sharedflows/',
    detailRoute: name => `/shared-flows/${encodeURIComponent(name)}`,
    labels: {
      one: 'shared flow',
      many: 'shared flows',
      titleNew: 'Nuevo Shared Flow',
      subtitleNew: 'Carga un bundle y despliégalo en el emulador local.',
      lead: 'Elige cómo quieres construir tu shared flow.',
      nameField: 'Shared Flow Name',
      typeName: 'Shared flow bundle',
      successTitle: 'Shared flow importado y desplegado',
    },
  },
}

/**
 * Sube un bundle ZIP al backend, que lo valida, lo escribe en el workspace
 * y dispara el despliegue en el emulador.
 *
 * @param {{ file: File, name: string, overwrite?: boolean, kind?: object }} params
 * @returns {Promise<Object>} Metadatos del artefacto creado (nombre, revisión…).
 * @throws {Error} Con `message` legible y `detail` opcional del emulador.
 */
export async function importProxyBundle({ file, name, overwrite = false, kind = ARTIFACT_KINDS.proxy }) {
  const body = new FormData()
  body.append('file', file)
  body.append('name', name)
  if (overwrite) body.append('overwrite', 'true')

  const query = new URLSearchParams({ action: 'import', name })
  const res = await fetch(`${kind.importPath}?${query}`, { method: 'POST', body })

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // El backend siempre responde JSON; si no, nos quedamos con el status.
  }

  if (!res.ok) {
    const error = new Error(payload?.error || `Error HTTP ${res.status} al importar el bundle`)
    error.detail = payload?.detail || ''
    error.status = res.status
    throw error
  }

  return payload
}
