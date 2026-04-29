const STATUS_MESSAGES = {
  400: 'Bad Request — parámetros inválidos o mal formados',
  401: 'Unauthorized — credenciales inválidas o ausentes',
  403: 'Forbidden — sin permisos para el recurso',
  404: 'Not Found — recurso no encontrado',
  405: 'Method Not Allowed — método HTTP no permitido',
  429: 'Too Many Requests — límite de rate excedido',
  500: 'Internal Server Error — error en el backend',
  502: 'Bad Gateway — error de conexión al target',
  503: 'Service Unavailable — servicio no disponible',
  504: 'Gateway Timeout — timeout al conectar al target',
}

const CRITICAL_VAR_PATTERNS = [
  'apikey', 'access_token', 'client_id', 'client_secret',
  'app.name', 'developer.email', 'token', 'oauth',
]

function getText(el, ...selectors) {
  for (const sel of selectors) {
    try {
      const found = el.querySelector(sel)
      if (found?.textContent.trim()) return found.textContent.trim()
    } catch { /* invalid selector, skip */ }
  }
  return ''
}

function parseStep(el) {
  const vars = {}
  el.querySelectorAll('Variable').forEach(v => {
    const name = v.getAttribute('name')
    if (name) vars[name] = v.textContent.trim()
  })

  return {
    policyName: getText(el, 'PolicyName'),
    policyType: getText(el, 'PolicyType'),
    duration:   parseInt(getText(el, 'Duration')) || 0,
    flowState:  getText(el, 'FlowState', 'FlowId', 'ResultId'),
    error:      getText(el, 'Error') === 'true',
    fault: {
      source:  getText(el, 'FaultSource'),
      code:    getText(el, 'FaultCode'),
      message: getText(el, 'FaultString'),
    },
    variables: vars,
  }
}

function filterVars(vars, prefix) {
  return Object.entries(vars)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => ({ name: k.slice(prefix.length), value: v }))
}

function analyzeTransaction({ steps, allVars, statusCode, errors }) {
  const findings = []

  if (statusCode >= 400) {
    findings.push({
      level: statusCode >= 500 ? 'error' : 'warning',
      title: `Respuesta HTTP ${statusCode}`,
      detail: STATUS_MESSAGES[statusCode] || `Código de error ${statusCode}`,
    })
  }

  errors.forEach(s => {
    if (s.fault.code || s.fault.message) {
      findings.push({
        level: 'error',
        title: `Falla en política: ${s.policyName || 'desconocida'}`,
        detail: [s.fault.code, s.fault.message].filter(Boolean).join(' — '),
      })
    } else if (s.error) {
      findings.push({
        level: 'error',
        title: `Error en paso: ${s.policyName || s.policyType || 'desconocido'}`,
        detail: 'La política reportó un error sin detalle de fault',
      })
    }
  })

  const nullVars = Object.entries(allVars)
    .filter(([, v]) => !v || v === 'null' || v === 'undefined' || v === '')
    .map(([k]) => k)

  const criticalNulls = nullVars.filter(k =>
    CRITICAL_VAR_PATTERNS.some(p => k.toLowerCase().includes(p))
  )
  if (criticalNulls.length > 0) {
    findings.push({
      level: 'warning',
      title: `${criticalNulls.length} variable(s) crítica(s) sin valor`,
      detail: criticalNulls.join(', '),
    })
  }
  if (nullVars.length > criticalNulls.length) {
    findings.push({
      level: 'info',
      title: `${nullVars.length - criticalNulls.length} variable(s) nulas/vacías`,
      detail: nullVars.filter(k => !criticalNulls.includes(k)).slice(0, 5).join(', '),
    })
  }

  const slowSteps = steps.filter(s => s.duration > 50)
  if (slowSteps.length > 0) {
    findings.push({
      level: 'info',
      title: `${slowSteps.length} paso(s) lentos (>50 ms)`,
      detail: slowSteps.map(s => `${s.policyName || s.policyType}: ${s.duration} ms`).join(', '),
    })
  }

  if (!allVars['apikey'] && !allVars['request.queryparam.apikey'] && !allVars['request.header.apikey']) {
    findings.push({
      level: 'info',
      title: 'API key no encontrada en variables',
      detail: 'No se detectó apikey en query params ni en headers',
    })
  }

  return { findings, nullVars }
}

function parseTransaction(el, index) {
  const steps = Array.from(el.querySelectorAll('ExecutionStep')).map(parseStep)

  const allVars = {}
  steps.forEach(s => Object.assign(allVars, s.variables))

  const statusRaw  = allVars['response.status.code'] || allVars['message.status.code'] || '0'
  const statusCode = parseInt(statusRaw) || 0
  const method     = allVars['request.verb'] || allVars['request.method'] || 'GET'
  const uri        = allVars['request.uri'] || allVars['request.path'] || '—'
  const duration   = steps.reduce((sum, s) => sum + s.duration, 0)

  const errorSteps = steps.filter(s => s.error || s.fault.code || s.fault.message)
  const { findings, nullVars } = analyzeTransaction({ steps, allVars, statusCode, errors: errorSteps })

  return {
    id:              index,
    statusCode,
    method,
    uri,
    duration,
    steps,
    variables:       allVars,
    requestHeaders:  filterVars(allVars, 'request.header.'),
    responseHeaders: filterVars(allVars, 'response.header.'),
    queryParams:     filterVars(allVars, 'request.queryparam.'),
    errorSteps,
    nullVars,
    findings,
  }
}

export function parseTrace(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('XML inválido: ' + parseError.textContent.split('\n')[0])
  }

  const meta = {
    proxy:        getText(doc, 'APIProxy'),
    revision:     getText(doc, 'Revision'),
    environment:  getText(doc, 'Environment'),
    organization: getText(doc, 'Organization'),
  }

  const containers = doc.querySelectorAll('TransactionTraceContainer')
  const rawTx      = doc.querySelectorAll('Transaction')
  const source     = containers.length > 0 ? containers : rawTx

  const transactions = Array.from(source).map((el, i) => parseTransaction(el, i + 1))

  if (transactions.length === 0) {
    throw new Error('No se encontraron transacciones en el archivo. Verifica que sea una traza de Apigee válida.')
  }

  return { meta, transactions }
}
