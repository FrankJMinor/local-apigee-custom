// Cliente de la API de Key Value Maps.
//
// El backend replica las rutas de administración de Apigee, así que el scope va
// implícito en la URL: `/v1/organizations/<org>/keyvaluemaps` es de organización
// y `/v1/organizations/<org>/environments/<env>/keyvaluemaps` es de entorno.
// El proxy de Vite reenvía /v1 al backend de Django.

// El emulador local trabaja con una sola organización, la del environment activo.
const ORG = 'apigee-dev'

export const SCOPES = {
  organization: 'organization',
  environment: 'environment',
}

export const SCOPE_OPTIONS = [
  { value: SCOPES.environment, label: 'Entorno (environment)' },
  { value: SCOPES.organization, label: 'Organización (organization)' },
]

// El environment activo lo decide el backend (APIGEE_ENVIRONMENT), pero las rutas
// de scope `environment` lo llevan en la URL. Se memoriza el que devuelve el
// catálogo para no tener que pedirlo en cada operación; un enlace directo a la
// vista de detalle lo resuelve con una sola llamada extra.
let cachedEnvironment = null

async function resolveEnvironment(environment) {
  if (environment) return environment
  if (cachedEnvironment) return cachedEnvironment

  await fetchKvmCatalog()
  return cachedEnvironment
}

/** Base de la colección de KVM según el scope. */
async function collectionUrl(scope, environment) {
  if (scope === SCOPES.organization) {
    return `/v1/organizations/${ORG}/keyvaluemaps`
  }

  const env = await resolveEnvironment(environment)
  return `/v1/organizations/${ORG}/environments/${encodeURIComponent(env)}/keyvaluemaps`
}

async function mapUrl(scope, environment, mapName) {
  const base = await collectionUrl(scope, environment)
  return `${base}/${encodeURIComponent(mapName)}`
}

async function entryUrl(scope, environment, mapName, entryName) {
  const base = await mapUrl(scope, environment, mapName)
  return `${base}/entries/${encodeURIComponent(entryName)}`
}

/**
 * Lanza la petición y normaliza el error del backend a un `Error` legible.
 *
 * El backend responde 400 con `{error}` cuando la operación no es válida y 502
 * con `{error, detail}` cuando el emulador rechaza la carga.
 */
async function request(url, options = {}) {
  const res = await fetch(url, options)

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // Un 204 o una respuesta vacía no traen cuerpo; nos quedamos con el status.
  }

  if (!res.ok) {
    const detail = payload?.detail ? ` ${payload.detail}` : ''
    const error = new Error((payload?.error || `Error HTTP ${res.status}`) + detail)
    error.status = res.status
    // El import desde Edge clasifica el fallo (vpn, auth, forbidden, tls…) para
    // que la UI pueda explicar qué hacer en vez de soltar el mensaje pelado.
    error.kind = payload?.kind
    throw error
  }

  return payload
}

function jsonBody(body) {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/**
 * Catálogo completo: los KVM de los dos scopes cruzados con lo que el
 * contenedor del emulador tiene realmente cargado.
 *
 * @param {string} [environment] Environment a consultar.
 * @returns {Promise<{environment: string, keyValueMaps: object[], runtimeAvailable: boolean,
 *                    runtimeError: ?string, orphanRuntimeMaps: string[]}>}
 */
export async function fetchKvmCatalog(environment) {
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : ''
  const catalog = await request(`/v1/keyvaluemaps${query}`)

  cachedEnvironment = catalog?.environment || cachedEnvironment
  return catalog
}

/** Devuelve un KVM con sus entradas. */
export async function fetchKvm(scope, environment, mapName) {
  return request(await mapUrl(scope, environment, mapName))
}

/** Crea un KVM y lo carga en el emulador. */
export async function createKvm({ name, scope, encrypted = false, entries = [], environment }) {
  return request(await collectionUrl(scope, environment), {
    method: 'POST',
    ...jsonBody({ name, encrypted, entries }),
  })
}

/** Renombra un KVM, cambia su cifrado o reemplaza todas sus entradas. */
export async function updateKvm(scope, environment, mapName, changes) {
  return request(await mapUrl(scope, environment, mapName), {
    method: 'PUT',
    ...jsonBody(changes),
  })
}

/** Elimina un KVM del workspace y del runtime. */
export async function deleteKvm(scope, environment, mapName) {
  return request(await mapUrl(scope, environment, mapName), { method: 'DELETE' })
}

/** Agrega una llave al KVM. */
export async function createEntry(scope, environment, mapName, { name, value }) {
  return request(`${await mapUrl(scope, environment, mapName)}/entries`, {
    method: 'POST',
    ...jsonBody({ name, value }),
  })
}

/** Cambia el valor de una llave y, opcionalmente, su nombre. */
export async function updateEntry(scope, environment, mapName, entryName, { name, value }) {
  return request(await entryUrl(scope, environment, mapName, entryName), {
    method: 'PUT',
    ...jsonBody({ name, value }),
  })
}

/** Elimina una llave del KVM. */
export async function deleteEntry(scope, environment, mapName, entryName) {
  return request(await entryUrl(scope, environment, mapName, entryName), { method: 'DELETE' })
}

/**
 * Reenvía todos los KVM del workspace al emulador.
 *
 * Los datos de prueba del emulador viven solo en memoria: si el contenedor se
 * reinicia o alguien edita `kvms.json` a mano, esta llamada vuelve a dejar el
 * runtime alineado con el workspace.
 */
export function syncKvms(environment) {
  return request('/v1/keyvaluemaps/sync', {
    method: 'POST',
    ...jsonBody({ environment }),
  })
}

/**
 * Elimina varios KVM (o todos) con una sola recarga del emulador.
 *
 * @param {object} options
 * @param {string[]} [options.names] Nombres a eliminar.
 * @param {boolean} [options.all]    Elimina todos los KVM de los dos scopes.
 */
export function deleteKvms({ names, all = false, environment } = {}) {
  return request('/v1/keyvaluemaps/delete', {
    method: 'POST',
    ...jsonBody({ names, all, environment }),
  })
}

/** Ambientes de Apigee Edge configurados, para el desplegable del modal. */
export function fetchEdgeEnvironments() {
  return request('/v1/keyvaluemaps/edge/environments')
}

/**
 * Trae los KVM de un ambiente de Apigee Edge al workspace y al emulador.
 *
 * Las credenciales viajan solo en esta llamada: no se guardan en el navegador
 * ni en el backend. Los hosts de Edge solo responden con la VPN levantada, y un
 * ambiente sin permisos concedidos devuelve 401; el error que llega trae `kind`
 * (`vpn`, `auth`, `forbidden`, `tls`…) para poder explicarlo en la UI.
 *
 * @param {object} credentials `{username, password, edgeEnvironment, replace}`
 */
export function importFromEdge({ username, password, edgeEnvironment, replace = false, environment }) {
  return request('/v1/keyvaluemaps/edge/import', {
    method: 'POST',
    ...jsonBody({ username, password, edgeEnvironment, replace, environment }),
  })
}
