// Resumen del entorno local que pinta el dashboard: totales, actividad reciente
// y alertas, todo derivado del estado real en disco y del runtime del emulador.
// El proxy de Vite reenvía /v1 al backend de Django.

const EMPTY = {
  environment: '',
  revision: null,
  stats: {
    proxies: { total: 0, detail: '' },
    sharedFlows: { total: 0, detail: '' },
    keyValueMaps: { total: 0, detail: '', loaded: 0 },
  },
  activity: [],
  alerts: [],
}

/**
 * Devuelve el resumen del entorno.
 *
 * @param {string} [environment] Environment a consultar.
 * @returns {Promise<typeof EMPTY>}
 * @throws {Error} Con el mensaje del backend si la consulta falla.
 */
export async function fetchDashboard(environment) {
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : ''
  const res = await fetch(`/v1/dashboard${query}`)

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // El backend siempre responde JSON; si no, nos quedamos con el status.
  }

  if (!res.ok) {
    throw new Error(payload?.error || `Error HTTP ${res.status} al leer el dashboard`)
  }

  return { ...EMPTY, ...payload }
}

export const EMPTY_DASHBOARD = EMPTY
