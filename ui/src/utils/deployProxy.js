// Utilidades para persistir cambios del editor y desplegarlos en el emulador local.
// El proxy de Vite reenvía /v1 al backend de Django, así que las rutas van relativas.

/**
 * Traduce el error del emulador a algo legible en la UI.
 *
 * Cuando el contrato no compila, el emulador devuelve en `detail` un JSON con la
 * forma { "<ruta>": { "errors": { "Line:1:54": [{ message }] } } }. Merece la pena
 * desglosarlo: indica archivo y línea exactos del XML que falló.
 *
 * @param {{ error?: string, detail?: string }} payload
 * @returns {string} Mensaje de una o varias líneas listo para mostrar.
 */
export function formatEmulatorError(payload) {
  const base = payload?.error || 'Error desconocido al desplegar'

  if (!payload?.detail) return base

  let parsed
  try {
    parsed = JSON.parse(payload.detail)
  } catch {
    return `${base}\n${payload.detail}`
  }

  const lines = []
  Object.entries(parsed).forEach(([filePath, info]) => {
    const fileName = filePath.split('/').pop()
    Object.entries(info?.errors || {}).forEach(([location, issues]) => {
      issues.forEach(issue => lines.push(`${fileName} (${location}): ${issue.message}`))
    })
  })

  return lines.length ? lines.join('\n') : base
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // El backend siempre responde JSON; si no, nos quedamos con el status.
  }

  if (!res.ok) {
    const error = new Error(payload ? formatEmulatorError(payload) : `Error HTTP ${res.status}`)
    error.status = res.status
    error.reverted = Boolean(payload?.reverted)
    throw error
  }

  return payload
}

/**
 * Guarda archivos del proxy en el workspace y, por defecto, redespliega.
 *
 * @param {{ proxyName: string, files: Array<{path: string, content: string}>, deploy?: boolean }} params
 * @returns {Promise<{proxy: string, saved: string[], deployed: boolean, revision: string}>}
 */
export function saveProxyFiles({ proxyName, files, deploy = true }) {
  return postJson(`/v1/proxies/${encodeURIComponent(proxyName)}/update`, { files, deploy })
}

/**
 * Redespliega el workspace completo sin escribir archivos.
 *
 * @returns {Promise<{environment: string, revision: string}>}
 */
export function deployWorkspace() {
  return postJson('/v1/emulator/deploy', {})
}
