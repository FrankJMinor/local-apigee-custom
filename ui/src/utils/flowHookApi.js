// Cliente de los flow hooks del environment.
//
// A diferencia de los caches, esta configuración sí la compila el emulador
// dentro del contrato: guardarla dispara un redespliegue.

async function request(url, options = {}) {
  const res = await fetch(url, options)

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // Una respuesta sin cuerpo: nos quedamos con el status.
  }

  if (!res.ok) {
    const detail = payload?.detail ? ` ${payload.detail}` : ''
    const error = new Error((payload?.error || `Error HTTP ${res.status}`) + detail)
    error.status = res.status
    // El backend revierte el archivo si el emulador rechaza el contrato.
    error.reverted = Boolean(payload?.reverted)
    throw error
  }

  return payload
}

/**
 * Los cuatro ganchos y los shared flows desplegados que se les pueden asignar.
 *
 * @returns {Promise<{environment: string, flowHooks: object[], sharedFlows: string[],
 *                    source: string}>}
 */
export function fetchFlowHooks(environment) {
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : ''
  return request(`/v1/flowhooks${query}`)
}

/**
 * Guarda los ganchos y redespliega el contrato.
 *
 * Un `sharedFlow` vacío desasigna el gancho. Si el emulador rechaza el contrato,
 * el backend deja el archivo como estaba y el error llega con `reverted`.
 *
 * @param {object[]} flowHooks Lista de `{name, sharedFlow, continueOnError}`.
 */
export function saveFlowHooks(flowHooks, environment) {
  return request('/v1/flowhooks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowHooks, environment }),
  })
}
