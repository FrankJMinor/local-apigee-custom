// Utilidades para las sesiones de Trace del emulador.
// El proxy de Vite reenvía /v1 al backend de Django, así que las rutas van relativas.

async function request(url, options) {
  const res = await fetch(url, options)

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // El backend siempre responde JSON; si no, nos quedamos con el status.
  }

  if (!res.ok) {
    const error = new Error(payload?.error || `Error HTTP ${res.status}`)
    error.detail = payload?.detail || ''
    error.status = res.status
    throw error
  }

  return payload
}

/**
 * Abre una sesión de depuración sobre el proxy.
 *
 * A partir de ese momento el emulador registra cada petición que llegue al proxy,
 * hasta agotar `count` transacciones o `timeoutInSeconds`.
 *
 * @param {string} proxyName
 * @returns {Promise<{sessionId: string, count: number, timeoutInSeconds: number}>}
 */
export function startTrace(proxyName) {
  return request(`/v1/proxies/${encodeURIComponent(proxyName)}/trace`, { method: 'POST' })
}

/**
 * Recupera las transacciones capturadas, ya aplanadas en pasos por el backend.
 *
 * @param {string} proxyName
 * @param {string} sessionId
 * @returns {Promise<{session: object, transactions: Array}>}
 */
export function fetchTransactions(proxyName, sessionId) {
  return request(
    `/v1/proxies/${encodeURIComponent(proxyName)}/trace/${encodeURIComponent(sessionId)}`
  )
}

/** Color e icono por tipo de paso, para que la línea de tiempo se lea de un vistazo. */
export const STEP_STYLES = {
  policy:    { label: 'Política',  color: '#60a5fa' },
  condition: { label: 'Condición', color: '#f59e0b' },
  state:     { label: 'Estado',    color: '#64748b' },
  flow:      { label: 'Flujo',     color: '#a78bfa' },
  engine:    { label: 'Motor',     color: '#94a3b8' },
  transport: { label: 'Transporte', color: '#64748b' },
}
