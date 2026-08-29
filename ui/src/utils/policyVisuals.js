// Aspecto de cada paso en el Transaction Map, al estilo de la traza de Apigee Edge.
//
// El catálogo de políticas de Apigee (~60 tipos, ver backend/templates) es mucho
// mayor que los SVG que hay en ui/icons. Para las que no tienen SVG propio se usa
// el color de su categoría y su acrónimo, que es exactamente lo que hace Edge:
// la categoría se reconoce por el color y la política concreta por las siglas.

import AIIcon from '../../icons/AI.svg'
import AssignMessageIcon from '../../icons/AssignMessage.svg'
import CacheIcon from '../../icons/Cache.svg'
import CloudIcon from '../../icons/Cloud.svg'
import ExtensionIcon from '../../icons/Extension.svg'
import ExtractVariablesIcon from '../../icons/ExtractVariables.svg'
import FlowCalloutIcon from '../../icons/FlowCallout.svg'
import JavascriptIcon from '../../icons/Javascript.svg'
import JSONToXMLIcon from '../../icons/JSONToXML.svg'
import KVMIcon from '../../icons/KeyValueMapOperations.svg'
import RaiseFaultIcon from '../../icons/RaiseFault.svg'
import SpikeArrestIcon from '../../icons/SpikeArrest.svg'

/** Colores por categoría, con el mismo código que usa Edge para agrupar. */
export const CATEGORY_COLORS = {
  mediation: '#3b82f6',   // azul
  security:  '#f97316',   // naranja
  traffic:   '#a855f7',   // morado
  extension: '#eab308',   // amarillo
  ai:        '#14b8a6',   // turquesa
  flow:      '#22c55e',   // verde
  system:    '#64748b',   // gris
}

/** Tipo de política -> icono y categoría. Las claves van en minúsculas. */
const POLICIES = {
  // ── Mediation ──
  assignmessage:            { icon: AssignMessageIcon, category: 'mediation' },
  extractvariables:         { icon: ExtractVariablesIcon, category: 'mediation' },
  jsontoxml:                { icon: JSONToXMLIcon, category: 'mediation' },
  xmltojson:                { icon: JSONToXMLIcon, category: 'mediation' },
  keyvaluemapoperations:    { icon: KVMIcon, category: 'mediation' },
  raisefault:               { icon: RaiseFaultIcon, category: 'mediation' },
  accessentity:             { category: 'mediation' },
  assertcondition:          { category: 'mediation' },
  graphql:                  { category: 'mediation' },
  httpmodifier:             { category: 'mediation' },
  messagevalidation:        { category: 'mediation' },
  monetizationlimitscheck:  { category: 'mediation' },
  oasvalidation:            { category: 'mediation' },
  readpropertyset:          { category: 'mediation' },
  xsl:                      { category: 'mediation' },

  // ── Security ──
  verifyapikey:             { category: 'security' },
  oauthv2:                  { category: 'security' },
  getoauthv2info:           { category: 'security' },
  setoauthv2info:           { category: 'security' },
  deleteoauthv2info:        { category: 'security' },
  revokeoauthv2:            { category: 'security' },
  accesscontrol:            { category: 'security' },
  basicauthentication:      { category: 'security' },
  cors:                     { category: 'security' },
  decodejws:                { category: 'security' },
  decodejwt:                { category: 'security' },
  generatejws:              { category: 'security' },
  generatejwt:              { category: 'security' },
  verifyjws:                { category: 'security' },
  verifyjwt:                { category: 'security' },
  generatesamlassertion:    { category: 'security' },
  validatesamlassertion:    { category: 'security' },
  hmac:                     { category: 'security' },
  jsonthreatprotection:     { category: 'security' },
  xmlthreatprotection:      { category: 'security' },
  regularexpressionprotection: { category: 'security' },
  verifyiam:                { category: 'security' },

  // ── Traffic Management ──
  spikearrest:              { icon: SpikeArrestIcon, category: 'traffic' },
  quota:                    { category: 'traffic' },
  lookupcache:              { icon: CacheIcon, category: 'traffic' },
  populatecache:            { icon: CacheIcon, category: 'traffic' },
  invalidatecache:          { icon: CacheIcon, category: 'traffic' },
  responsecache:            { icon: CacheIcon, category: 'traffic' },
  concurrentratelimit:      { category: 'traffic' },
  resetquota:               { category: 'traffic' },

  // ── Extension ──
  javascript:               { icon: JavascriptIcon, category: 'extension' },
  script:                   { icon: JavascriptIcon, category: 'extension' },
  flowcallout:              { icon: FlowCalloutIcon, category: 'extension' },
  servicecallout:           { icon: ExtensionIcon, category: 'extension' },
  externalcallout:          { icon: ExtensionIcon, category: 'extension' },
  integrationcallout:       { icon: ExtensionIcon, category: 'extension' },
  setintegrationrequest:    { icon: ExtensionIcon, category: 'extension' },
  messagelogging:           { icon: CloudIcon, category: 'extension' },
  publishmessage:           { icon: CloudIcon, category: 'extension' },
  datacapture:              { category: 'extension' },
  tracecapture:             { category: 'extension' },
  javacallout:              { icon: ExtensionIcon, category: 'extension' },

  // ── AI / Dialogflow ──
  llmtokenquota:            { icon: AIIcon, category: 'ai' },
  prompttokenlimit:         { icon: AIIcon, category: 'ai' },
  sanitizeuserprompt:       { icon: AIIcon, category: 'ai' },
  sanitizemodelresponse:    { icon: AIIcon, category: 'ai' },
  semanticcachelookup:      { icon: AIIcon, category: 'ai' },
  semanticcachepopulate:    { icon: AIIcon, category: 'ai' },
  parsedialogflowrequest:   { icon: CloudIcon, category: 'ai' },
  setdialogflowresponse:    { icon: CloudIcon, category: 'ai' },
}

/**
 * Siglas de respaldo cuando la política no tiene SVG propio.
 *
 * Se toman las mayúsculas del tipo (`ExtractVariables` -> `EV`), que es la
 * convención de Edge; si no hay, las dos primeras letras.
 */
export function acronymFor(type) {
  if (!type) return '?'
  const capitals = type.replace(/[^A-Z]/g, '')
  if (capitals.length >= 2) return capitals.slice(0, 3)
  return type.slice(0, 2).toUpperCase()
}

/**
 * Devuelve cómo pintar un paso de la traza en el Transaction Map.
 *
 * @param {object} step Paso normalizado por el backend.
 * @returns {{icon?: string, label: string, color: string, category: string}}
 */
export function visualFor(step) {
  if (step.kind === 'flowhook') {
    return { icon: FlowCalloutIcon, label: 'FH', color: CATEGORY_COLORS.flow, category: 'flowhook' }
  }

  if (step.kind === 'policy') {
    const type = step.policyType || ''
    const entry = POLICIES[type.toLowerCase()] || {}
    const color = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.mediation
    return {
      icon: entry.icon,
      label: acronymFor(type || step.title),
      color,
      category: entry.category || 'mediation',
    }
  }

  if (step.kind === 'condition') {
    return { label: '?', color: '#f59e0b', category: 'condition' }
  }

  if (step.kind === 'transport') {
    return { label: '⇄', color: CATEGORY_COLORS.system, category: 'transport' }
  }

  // Cambios de estado del motor y demás: sin icono, solo la marca de fase.
  return { label: '•', color: CATEGORY_COLORS.system, category: 'state' }
}

/**
 * Reparte los pasos en la fase de solicitud y la de respuesta.
 *
 * Edge dibuja dos carriles; el corte lo marca el primer estado de respuesta que
 * reporta el emulador (`PROXY_RESP_FLOW`, `RESP_SENT`, `TARGET_RESP_*`…).
 */
export function splitPhases(steps) {
  const cut = steps.findIndex(
    s => s.kind === 'state' && /RESP|RESPONSE/i.test(s.title || '')
  )

  if (cut === -1) return { request: steps, response: [] }
  return { request: steps.slice(0, cut), response: steps.slice(cut) }
}
