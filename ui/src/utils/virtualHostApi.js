// Cliente de los virtual hosts del environment.
//
// El emulador no los aplica —en local todo sale por el puerto único del
// runtime—, así que esto documenta el mapa de dominios y puertos de Edge y
// permite traducir cada URL de Edge a su equivalente local.

async function request(url, options = {}) {
  const res = await fetch(url, options)

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // Una respuesta sin cuerpo: nos quedamos con el status.
  }

  if (!res.ok) {
    const error = new Error(payload?.error || `Error HTTP ${res.status}`)
    error.status = res.status
    throw error
  }

  return payload
}

/**
 * Virtual hosts del environment, con la URL que forma cada alias y la URL del
 * runtime local por la que responden todos los proxies.
 */
export function fetchVirtualHosts(environment) {
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : ''
  return request(`/v1/virtualhosts${query}`)
}

/**
 * Guarda la tabla completa.
 *
 * @param {object[]} virtualHosts Filas `{name, port, hostAliases, ssl}`.
 */
export function saveVirtualHosts(virtualHosts, environment) {
  return request('/v1/virtualhosts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ virtualHosts, environment }),
  })
}

/** Convierte la lista de alias en el texto editable de la celda, y al revés. */
export const aliasesToText = aliases => (aliases || []).join(', ')
export const textToAliases = text =>
  String(text || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
