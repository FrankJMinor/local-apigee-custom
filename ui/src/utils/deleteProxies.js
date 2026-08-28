// Utilidad para eliminar proxies del workspace y del runtime del emulador.
// El proxy de Vite reenvía /v1 al backend de Django, así que las rutas van relativas.

import { formatEmulatorError } from './deployProxy'

/**
 * Elimina uno o varios proxies con un único redespliegue.
 *
 * El emulador no expone un borrado por proxy: su runtime se deriva del workspace,
 * así que el backend los saca de `src/main/apigee/apiproxies/` y redespliega. Si el
 * contrato resultante no compila, los proxies se restauran.
 *
 * @param {string[]} proxies Nombres de los proxies a eliminar.
 * @returns {Promise<{deleted: string[], notFound: string[], revision: string}>}
 * @throws {Error} Con un mensaje legible; `reverted` indica si se restauraron.
 */
export async function deleteProxies(proxies) {
  const res = await fetch('/v1/proxies/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxies }),
  })

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // El backend siempre responde JSON; si no, nos quedamos con el status.
  }

  if (!res.ok) {
    const error = new Error(
      payload ? formatEmulatorError(payload) : `Error HTTP ${res.status} al eliminar`
    )
    error.status = res.status
    error.reverted = Boolean(payload?.reverted)
    throw error
  }

  return payload
}
