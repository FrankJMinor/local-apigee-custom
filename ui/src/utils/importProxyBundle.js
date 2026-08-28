// Utilidad para importar un bundle de proxy y desplegarlo en el emulador.
// Replica la llamada oficial de Apigee:
//   POST /v1/organizations/{org}/apis?action=import&name={name}
// El proxy de Vite reenvía /v1 al backend de Django, así que la ruta va relativa.

export const ORGANIZATION = 'americamovil'

/**
 * Sube un bundle ZIP al backend, que lo valida, lo escribe en el workspace
 * y dispara el despliegue en el emulador.
 *
 * @param {{ file: File, name: string, overwrite?: boolean }} params
 * @returns {Promise<Object>} Metadatos del proxy creado (nombre, revisión, basepaths…).
 * @throws {Error} Con `message` legible y `detail` opcional del emulador.
 */
export async function importProxyBundle({ file, name, overwrite = false }) {
  const body = new FormData()
  body.append('file', file)
  body.append('name', name)
  if (overwrite) body.append('overwrite', 'true')

  const query = new URLSearchParams({ action: 'import', name })
  const res = await fetch(`/v1/organizations/${ORGANIZATION}/apis?${query}`, {
    method: 'POST',
    body,
  })

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
