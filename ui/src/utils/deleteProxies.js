// Utilidad para eliminar proxies o shared flows del workspace y del runtime del emulador.
// El proxy de Vite reenvía /v1 al backend de Django, así que las rutas van relativas.

import { formatEmulatorError } from './deployProxy'
import { ARTIFACT_KINDS } from './importProxyBundle'

/**
 * Elimina uno o varios artefactos con un único redespliegue.
 *
 * El emulador no expone un borrado por artefacto: su runtime se deriva del
 * workspace, así que el backend los saca de disco y redespliega. Si el contrato
 * resultante no compila, se restauran todos.
 *
 * @param {string[]} names Nombres a eliminar.
 * @param {object} kind Tipo de artefacto (ver ARTIFACT_KINDS).
 * @returns {Promise<{deleted: string[], notFound: string[], revision: string}>}
 * @throws {Error} Con un mensaje legible; `reverted` indica si se restauraron.
 */
export async function deleteProxies(names, kind = ARTIFACT_KINDS.proxy) {
  const res = await fetch(kind.deletePath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kind.deleteBody(names)),
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
