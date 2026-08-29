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

/**
 * Se suscribe por SSE a las transacciones de una sesión de trace.
 *
 * El emulador no notifica nada por su cuenta —no expone webhook ni socket—, así
 * que quien sondea es el backend y solo empuja cuando el contenido cambia. Aquí
 * el navegador ya no sondea: se entera en cuanto llega la petición.
 *
 * Se usa EventSource y no WebSocket porque el flujo es de una sola dirección y
 * así el backend sigue sobre el WSGI que ya corre el proyecto.
 *
 * @param {string} proxyName
 * @param {string} sessionId
 * @param {{onData: Function, onError?: Function, onEnd?: Function}} handlers
 * @returns {() => void} Función para cerrar la suscripción.
 */
export function subscribeTransactions(proxyName, sessionId, { onData, onError, onEnd }) {
  const url = `/v1/proxies/${encodeURIComponent(proxyName)}/trace/${encodeURIComponent(sessionId)}/stream`
  const source = new EventSource(url)

  source.addEventListener('transactions', e => {
    try {
      onData(JSON.parse(e.data))
    } catch {
      onError?.('No se pudo leer el evento del stream')
    }
  })

  source.addEventListener('error', e => {
    // El backend manda un evento 'error' con detalle; el navegador usa el mismo
    // nombre para fallos de conexión, que llegan sin data.
    if (e.data) {
      try {
        onError?.(JSON.parse(e.data).error)
        return
      } catch { /* cae al manejo genérico */ }
    }
    if (source.readyState === EventSource.CLOSED) onError?.('Se perdió la conexión con el stream')
  })

  source.addEventListener('end', () => {
    source.close()
    onEnd?.()
  })

  return () => source.close()
}

/**
 * Formatea los segundos restantes de la sesión como m:ss.
 *
 * El emulador da 600 s por defecto: "9:47" se lee mucho mejor que "587s".
 */
export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
