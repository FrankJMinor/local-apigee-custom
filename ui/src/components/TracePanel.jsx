import { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { IconTrace, IconRefresh, IconX, IconDownload, IconChevronRight } from './Icons'
import {
  startTrace,
  fetchTransactions,
  subscribeTransactions,
  formatCountdown,
  invokeProxy,
  STEP_STYLES,
} from '../utils/traceSession'
import { visualFor, splitPhases } from '../utils/policyVisuals'
import s from './TracePanel.module.css'

/** Respaldo por sondeo si el navegador o el proxy no dejan pasar el SSE. */
const FALLBACK_POLL_MS = 2500

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

function StatusPill({ code }) {
  if (code === undefined || code === null) return <span className={s.pillMuted}>—</span>
  const numeric = Number(code)
  const tone = numeric >= 500 ? s.pillError : numeric >= 400 ? s.pillWarn : s.pillOk
  return <span className={`${s.pill} ${tone}`}>{code}</span>
}

StatusPill.propTypes = { code: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) }

/** Tabla clave/valor para cabeceras, variables y propiedades. */
function KeyValueTable({ rows, tone }) {
  if (!rows.length) return null
  return (
    <div className={s.kvTable}>
      {rows.map(([key, value], i) => (
        <div key={`${key}-${i}`} className={s.kvRow}>
          <span className={`${s.kvKey} ${tone ? s[tone] : ''}`}>{key}</span>
          <span className={s.kvValue}>
            {value === undefined || value === null || value === ''
              ? <em className={s.kvEmpty}>sin valor</em>
              : String(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

KeyValueTable.propTypes = { rows: PropTypes.array.isRequired, tone: PropTypes.string }

/**
 * Una casilla del Transaction Map.
 *
 * Reproduce la baldosa de la traza de Apigee Edge: color por categoría de
 * política, con el SVG cuando existe y las siglas cuando no.
 */
function MapTile({ step, active, onSelect }) {
  const visual = visualFor(step)
  const isState = step.kind === 'state'

  return (
    <button
      className={`${s.tile} ${active ? s.tileActive : ''} ${isState ? s.tileState : ''}`}
      style={{ '--tile-color': visual.color }}
      onClick={onSelect}
      title={`${step.title}${step.policyType ? ` (${step.policyType})` : ''}`}
    >
      {visual.icon
        ? <img src={visual.icon} alt="" className={s.tileIcon} />
        : <span className={s.tileLabel}>{visual.label}</span>}
    </button>
  )
}

MapTile.propTypes = {
  step: PropTypes.object.isRequired,
  active: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
}

/**
 * Un carril del mapa: los pasos de una fase, unidos por el riel.
 *
 * Los pasos que ocurren dentro de un flow hook se agrupan sobre una banda más
 * clara, para distinguir de un vistazo lo que viene del shared flow.
 */
function MapRail({ label, steps, selectedIndex, onSelect }) {
  if (!steps.length) return null

  // Tramos consecutivos: o todos dentro del mismo flow hook, o ninguno.
  const groups = []
  steps.forEach(step => {
    const hook = step.flowHook || null
    const last = groups[groups.length - 1]
    if (last && last.hook === hook) last.steps.push(step)
    else groups.push({ hook, steps: [step] })
  })

  return (
    <div className={s.rail}>
      <span className={s.railLabel}>{label}</span>
      <div className={s.railTrack}>
        {groups.map((group, gi) => (
          <div
            key={`${group.hook || 'main'}-${gi}`}
            className={`${s.railGroup} ${group.hook ? s.railGroupHook : ''}`}
            title={group.hook ? `Flow hook: ${group.hook}` : undefined}
          >
            {group.hook && <span className={s.hookTag}>{group.hook}</span>}
            <div className={s.railTiles}>
              {group.steps.map(step => (
                <MapTile
                  key={step.index}
                  step={step}
                  active={step.index === selectedIndex}
                  onSelect={() => onSelect(step.index)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

MapRail.propTypes = {
  label: PropTypes.string.isRequired,
  steps: PropTypes.array.isRequired,
  selectedIndex: PropTypes.number,
  onSelect: PropTypes.func.isRequired,
}

/**
 * Panel de Trace del editor de proxies, con el acomodo de la traza de Apigee Edge.
 *
 * A la izquierda las transacciones capturadas y las opciones de vista; a la
 * derecha la barra para lanzar peticiones, el Transaction Map y, debajo, el
 * detalle de la fase seleccionada en dos columnas: petición y respuesta.
 */
export function TracePanel({ proxyName, basePath }) {
  const [session, setSession] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [selectedTx, setSelectedTx] = useState(0)
  const [selectedStep, setSelectedStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  // 'live' mientras el stream empuja; 'polling' si hubo que caer al respaldo.
  const [feed, setFeed] = useState('idle')

  // Barra "Send Requests"
  const [method, setMethod] = useState('GET')
  const [path, setPath] = useState(basePath || '/')
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  // Panel "View Options"
  const [options, setOptions] = useState({
    states: true,
    conditions: true,
    variables: true,
    properties: true,
  })

  const closeStreamRef = useRef(null)
  const pollRef = useRef(null)

  const refresh = useCallback(async (sessionId) => {
    try {
      const data = await fetchTransactions(proxyName, sessionId)
      setTransactions(data.transactions || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [proxyName])

  // El backend empuja por SSE en cuanto el emulador registra algo, así que la
  // página se actualiza sola sin que el navegador sondee.
  useEffect(() => {
    if (!session?.sessionId) return undefined

    let fellBack = false

    const startPolling = () => {
      if (fellBack) return
      fellBack = true
      setFeed('polling')
      pollRef.current = setInterval(() => refresh(session.sessionId), FALLBACK_POLL_MS)
    }

    setFeed('live')
    closeStreamRef.current = subscribeTransactions(proxyName, session.sessionId, {
      onData: data => {
        setTransactions(data.transactions || [])
        setError(null)
      },
      onError: message => {
        setError(message || null)
        startPolling()
      },
      onEnd: () => setFeed('idle'),
    })

    return () => {
      closeStreamRef.current?.()
      clearInterval(pollRef.current)
    }
  }, [session, proxyName, refresh])

  // Cuenta atrás hasta que el emulador cierra la sesión por timeout.
  useEffect(() => {
    if (!session || secondsLeft <= 0) return undefined
    const timer = setInterval(() => setSecondsLeft(v => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [session, secondsLeft])

  // La ruta sugerida sale del basepath real del ProxyEndpoint.
  useEffect(() => { if (basePath) setPath(basePath) }, [basePath])

  const begin = async () => {
    setBusy(true)
    setError(null)
    setTransactions([])
    setSelectedTx(0)
    setSelectedStep(0)

    try {
      const data = await startTrace(proxyName)
      setSession(data)
      setSecondsLeft(data.timeoutInSeconds || 0)
    } catch (e) {
      setError(e.message)
      setSession(null)
    } finally {
      setBusy(false)
    }
  }

  const stop = () => {
    closeStreamRef.current?.()
    clearInterval(pollRef.current)
    setFeed('idle')
    setSecondsLeft(0)
  }

  const send = async () => {
    setSending(true)
    setLastResult(null)
    try {
      setLastResult(await invokeProxy(proxyName, { method, path }))
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  // Descarga la traza tal cual, para revisarla o compartirla fuera de la UI.
  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ session, transactions }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-${proxyName}-${session?.sessionId?.slice(0, 8) || 'sesion'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggle = key => setOptions(prev => ({ ...prev, [key]: !prev[key] }))

  const tx = transactions[selectedTx]

  // Las opciones de vista filtran el mapa sin alterar los índices originales.
  const visibleSteps = (tx?.steps || []).filter(st => {
    if (!options.states && st.kind === 'state') return false
    if (!options.conditions && st.kind === 'condition') return false
    return true
  })

  const step = tx?.steps?.[selectedStep]
  const phases = splitPhases(visibleSteps)
  const live = Boolean(session) && secondsLeft > 0
  const sampleUrl = `http://localhost:8445${basePath && basePath !== '-' ? basePath : ''}`

  // Navegación entre fases, como los botones Back/Next de Edge.
  const goRelative = delta => {
    const pos = visibleSteps.findIndex(v => v.index === selectedStep)
    const next = visibleSteps[Math.min(visibleSteps.length - 1, Math.max(0, pos + delta))]
    if (next) setSelectedStep(next.index)
  }

  return (
    <div className={s.panel}>
      {/* Barra de sesión */}
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          {!session ? (
            <button className={s.btnPrimary} onClick={begin} disabled={busy}>
              {busy ? <span className={s.spinner} /> : <IconTrace size={14} />}
              {busy ? 'Iniciando…' : 'Iniciar sesión de Trace'}
            </button>
          ) : (
            <>
              <span className={`${s.sessionDot} ${live ? s.sessionLive : s.sessionDone}`} />
              <span className={s.sessionLabel}>
                {live ? 'Capturando' : 'Sesión finalizada'}
              </span>
              {live && (
                <span className={s.countdown} title="Tiempo restante de la sesión">
                  {formatCountdown(secondsLeft)}
                </span>
              )}
              {live && (
                <span className={s.feedBadge} title={
                  feed === 'live'
                    ? 'El servidor empuja los cambios en cuanto llegan'
                    : 'El stream no está disponible: consultando cada 2,5 s'
                }>
                  {feed === 'live' ? 'en vivo' : 'sondeo'}
                </span>
              )}
              <span className={s.sessionId}>{session.sessionId?.slice(0, 8)}…</span>
            </>
          )}
        </div>

        <div className={s.toolbarRight}>
          {session && (
            <>
              <button className={s.btnGhost} onClick={() => refresh(session.sessionId)}>
                <IconRefresh size={13} /> Actualizar
              </button>
              {live && <button className={s.btnStop} onClick={stop}>Detener sesión</button>}
              <button className={s.btnGhost} onClick={begin} disabled={busy}>Nueva sesión</button>
              {transactions.length > 0 && (
                <button className={s.btnGhost} onClick={download} title="Descargar la traza en JSON">
                  <IconDownload size={13} /> Descargar
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className={s.errorBar}>
          <span>{error}</span>
          <button className={s.errorClose} onClick={() => setError(null)} aria-label="Cerrar">
            <IconX size={14} />
          </button>
        </div>
      )}

      {!session && !busy && (
        <div className={s.empty}>
          <IconTrace size={34} />
          <p className={s.emptyTitle}>Depura el flujo de tu proxy</p>
          <p className={s.emptyText}>
            Inicia una sesión y lanza una petición al proxy. Verás qué políticas se
            ejecutan, en qué orden, y qué variables lee y escribe cada una.
          </p>
          <code className={s.emptyCode}>curl {sampleUrl}</code>
        </div>
      )}

      {session && (
        <div className={s.body}>
          {/* ── Izquierda: transacciones y opciones de vista ── */}
          <div className={s.leftPane}>
            <div className={s.colHeader}>Transacciones ({transactions.length})</div>

            <div className={s.txScroll}>
              {transactions.length === 0 ? (
                <p className={s.txEmpty}>
                  {live ? 'Esperando peticiones…' : 'Sin tráfico capturado.'}
                </p>
              ) : (
                <table className={s.txTable}>
                  <thead>
                    <tr>
                      <th>#</th><th>Estado</th><th>Método</th><th>URI</th><th>Tiempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, i) => (
                      <tr
                        key={t.index}
                        className={i === selectedTx ? s.txRowActive : ''}
                        onClick={() => { setSelectedTx(i); setSelectedStep(0) }}
                      >
                        <td className={s.txNum}>{transactions.length - i}</td>
                        <td><StatusPill code={t.response?.statusCode} /></td>
                        <td className={s.txVerb}>{t.request?.verb || '—'}</td>
                        <td className={s.txUriCell} title={t.request?.uri}>
                          {t.request?.uri || '—'}
                        </td>
                        <td className={s.txElapsed}>
                          {t.durationMs !== null ? `${t.durationMs} ms` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={s.viewOptions}>
              <div className={s.viewOptionsTitle}>Opciones de vista</div>
              <label className={s.optionRow}>
                <input type="checkbox" checked={options.states} onChange={() => toggle('states')} />
                Mostrar cambios de estado
              </label>
              <label className={s.optionRow}>
                <input type="checkbox" checked={options.conditions} onChange={() => toggle('conditions')} />
                Mostrar condiciones
              </label>
              <label className={s.optionRow}>
                <input type="checkbox" checked={options.variables} onChange={() => toggle('variables')} />
                Mostrar variables
              </label>
              <label className={s.optionRow}>
                <input type="checkbox" checked={options.properties} onChange={() => toggle('properties')} />
                Mostrar propiedades
              </label>
            </div>
          </div>

          {/* ── Derecha: envío, mapa y detalle de fase ── */}
          <div className={s.rightPane}>
            <div className={s.sendBar}>
              <span className={s.sendLabel}>Enviar petición</span>
              <select
                className={s.sendMethod}
                value={method}
                onChange={e => setMethod(e.target.value)}
              >
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className={s.sendHost}>http://localhost:8445</span>
              <input
                className={s.sendInput}
                value={path}
                onChange={e => setPath(e.target.value)}
                placeholder="/hello?cliente=demo"
                onKeyDown={e => { if (e.key === 'Enter' && !sending) send() }}
              />
              <button className={s.btnPrimary} onClick={send} disabled={sending || !path}>
                {sending ? <span className={s.spinner} /> : null}
                {sending ? 'Enviando…' : 'Send'}
              </button>
              {lastResult && (
                <span className={s.sendResult}>
                  <StatusPill code={lastResult.statusCode} /> {lastResult.elapsedMs} ms
                </span>
              )}
            </div>

            <div className={s.mapColumn}>
              <div className={s.colHeader}>Transaction Map</div>
              <div className={s.mapScroll}>
                {tx ? (
                  <>
                    <MapRail
                      label="Solicitud"
                      steps={phases.request}
                      selectedIndex={selectedStep}
                      onSelect={setSelectedStep}
                    />
                    <MapRail
                      label="Respuesta"
                      steps={phases.response}
                      selectedIndex={selectedStep}
                      onSelect={setSelectedStep}
                    />
                  </>
                ) : (
                  <p className={s.txEmpty}>
                    Lanza una petición y el flujo aparecerá aquí solo, sin recargar.
                  </p>
                )}
              </div>
            </div>

            {/* ── Phase Details ── */}
            <div className={s.detail}>
              <div className={s.phaseHeader}>
                <span>Detalle de la fase</span>
                {step && (
                  <span className={s.phaseNav}>
                    <button className={`${s.navBtn} ${s.navBack}`} onClick={() => goRelative(-1)}>
                      <IconChevronRight size={12} /> Anterior
                    </button>
                    <button className={s.navBtn} onClick={() => goRelative(1)}>
                      Siguiente <IconChevronRight size={12} />
                    </button>
                  </span>
                )}
              </div>

              {step ? (
                <div className={s.phaseBody}>
                  <div className={s.phaseTitleRow}>
                    <span className={s.phaseTitle}>{step.title}</span>
                    <span className={s.phaseMeta}>
                      {(STEP_STYLES[step.kind] || {}).label}
                      {step.policyType ? ` · ${step.policyType}` : ''}
                      {step.flowHook ? ` · flow hook: ${step.flowHook}` : ''}
                      {step.offsetMs !== null ? ` · +${step.offsetMs} ms` : ''}
                      {step.kind === 'condition' && step.expressionResult
                        ? ` · ${step.expressionResult}` : ''}
                    </span>
                  </div>

                  <div className={s.phaseColumns}>
                    {/* Petición en este punto */}
                    <section className={s.phaseCol}>
                      <h4 className={`${s.phaseColTitle} ${s.phaseReq}`}>
                        {step.index === 0
                          ? 'Petición recibida del cliente'
                          : 'Petición en este punto'}
                      </h4>
                      {step.request ? (
                        <>
                          <div className={s.phaseLine}>
                            <strong>{step.request.verb}</strong> {step.request.uri}
                          </div>
                          <h5 className={s.phaseSub}>Cabeceras de petición</h5>
                          <KeyValueTable rows={Object.entries(step.request.headers || {})} />
                          <h5 className={s.phaseSub}>Cuerpo de la petición</h5>
                          {step.request.body
                            ? <pre className={s.phaseBodyPre}>{step.request.body}</pre>
                            : <p className={s.phaseNone}>Sin cuerpo</p>}
                        </>
                      ) : <p className={s.phaseNone}>Sin datos de petición en esta fase.</p>}

                      {options.variables && (
                        <>
                          <h5 className={s.phaseSub}>Variables leídas</h5>
                          {step.variables.read.length
                            ? <KeyValueTable
                                rows={step.variables.read.map(v => [v.name, v.value])}
                                tone="kvRead"
                              />
                            : <p className={s.phaseNone}>Ninguna</p>}
                        </>
                      )}
                    </section>

                    {/* Respuesta en este punto */}
                    <section className={s.phaseCol}>
                      <h4 className={`${s.phaseColTitle} ${s.phaseResp}`}>
                        {step.kind === 'state' && /RESP_SENT|END/i.test(step.title || '')
                          ? 'Respuesta enviada al cliente'
                          : 'Respuesta en este punto'}
                      </h4>
                      {step.response ? (
                        <>
                          <div className={s.phaseLine}>
                            <StatusPill code={step.response.statusCode} />
                            {' '}{step.response.reasonPhrase}
                          </div>
                          <h5 className={s.phaseSub}>Cabeceras de respuesta</h5>
                          <KeyValueTable rows={Object.entries(step.response.headers || {})} />
                          <h5 className={s.phaseSub}>Cuerpo de la respuesta</h5>
                          {step.response.body
                            ? <pre className={s.phaseBodyPre}>{step.response.body}</pre>
                            : <p className={s.phaseNone}>Sin cuerpo</p>}
                        </>
                      ) : <p className={s.phaseNone}>Sin datos de respuesta en esta fase.</p>}

                      {options.variables && (
                        <>
                          <h5 className={s.phaseSub}>Variables escritas</h5>
                          {step.variables.written.length
                            ? <KeyValueTable
                                rows={step.variables.written.map(v => [v.name, v.value])}
                                tone="kvWrite"
                              />
                            : <p className={s.phaseNone}>Ninguna</p>}
                        </>
                      )}
                    </section>
                  </div>

                  {options.properties && Object.keys(step.properties || {}).length > 0 && (
                    <section className={s.phaseProps}>
                      <h5 className={s.phaseSub}>Propiedades</h5>
                      <KeyValueTable rows={Object.entries(step.properties)} />
                    </section>
                  )}
                </div>
              ) : (
                <p className={s.phaseNone}>Selecciona un paso del Transaction Map.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

TracePanel.propTypes = {
  proxyName: PropTypes.string.isRequired,
  basePath: PropTypes.string,
}

export default TracePanel
