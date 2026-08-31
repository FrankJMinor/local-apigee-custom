// Cliente de la configuración de caches del environment.
//
// Réplica de la pestaña "Environment Configuration → Caches" de Apigee Edge. La
// tabla se guarda entera de una vez, como el botón Save de la consola, así que
// la API principal es un PUT con la lista completa.

export const EXPIRY_TIMEOUT = 'timeoutInSec'
export const EXPIRY_TIME_OF_DAY = 'timeOfDay'
export const EXPIRY_DATE = 'expiryDate'

export const EXPIRY_OPTIONS = [
  { value: EXPIRY_TIMEOUT, label: 'Tiempo de espera (segundos)' },
  { value: EXPIRY_TIME_OF_DAY, label: 'Hora del día' },
  { value: EXPIRY_DATE, label: 'Fecha' },
]

/** Valor por defecto al cambiar de tipo, para que la fila nunca quede vacía. */
export function defaultExpiryValue(type) {
  if (type === EXPIRY_TIME_OF_DAY) return '23:59:59'
  if (type === EXPIRY_DATE) return toEdgeDate(new Date())
  return '300'
}

/** `MM/DD/YYYY` (lo que guarda Edge) → `YYYY-MM-DD` (lo que pide <input type="date">). */
export function toInputDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim())
  if (match) return `${match[3]}-${match[1]}-${match[2]}`
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

/** Fecha del navegador → `MM/DD/YYYY`. */
export function toEdgeDate(date) {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${mm}/${dd}/${date.getFullYear()}`
}

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

/** Caches configurados en el environment, con la ruta del archivo que los guarda. */
export function fetchCaches(environment) {
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : ''
  return request(`/v1/caches${query}`)
}

/**
 * Guarda la tabla completa.
 *
 * El backend valida todo antes de escribir: si una fila está mal, el archivo se
 * queda como estaba y la UI conserva lo que había a medias.
 *
 * @param {object[]} caches Filas `{name, description, expiryType, expiryValue}`.
 */
export function saveCaches(caches, environment) {
  return request('/v1/caches', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caches, environment }),
  })
}
