import { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { IconTrace, IconRefresh, IconX } from './Icons'
import { startTrace, fetchTransactions, STEP_STYLES } from '../utils/traceSession'
import s from './TracePanel.module.css'

/** Cada cuánto se consultan transacciones nuevas mientras la sesión está viva. */
const POLL_MS = 2500

function StatusPill({ code }) {
  if (code === undefined || code === null) return <span className={s.pillMuted}>—</span>
  const numeric = Number(code)
  const tone = numeric >= 500 ? s.pillError : numeric >= 400 ? s.pillWarn : s.pillOk
  return <span className={`${s.pill} ${tone}`}>{code}</span>
}

StatusPill.propTypes = { code: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) }

function VariableList({ title, items, tone }) {
  if (!items?.length) return null
  return (
    <div className={s.varBlock}>
      <div className={s.varTitle}>{title}</div>
      {items.map((v, i) => (
        <div key={`${v.name}-${i}`} className={s.varRow}>
          <span className={`${s.varName} ${tone === 'write' ? s.varWrite : s.varRead}`}>
            {v.name}
          </span>
          <span className={s.varValue}>
            {v.value === undefined || v.value === null || v.value === ''
              ? <em className={s.varEmpty}>sin valor</em>
              : String(v.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

VariableList.propTypes = {
  title: PropTypes.string.isRequired,
  items: PropTypes.array,
  tone: PropTypes.string,
}

function MessageBlock({ title, message }) {
  if (!message) return null
  const headers = Object.entries(message.headers || {})

  return (
    <div className={s.msgBlock}>
      <div className={s.varTitle}>{title}</div>
      {message.verb && (
        <div className={s.msgLine}>
          <strong>{message.verb}</strong> {message.uri}
        </div>
      )}
      {message.statusCode !== undefined && message.statusCode !== null && (
        <div className={s.msgLine}>
          <StatusPill code={message.statusCode} /> {message.reasonPhrase}
        </div>
      )}
      {headers.length > 0 && (
        <div className={s.msgHeaders}>
          {headers.map(([k, v]) => (
            <div key={k} className={s.varRow}>
              <span className={s.varName}>{k}</span>
              <span className={s.varValue}>{v}</span>
            </div>
          ))}
        </div>
      )}
      {message.body ? <pre className={s.msgBody}>{message.body}</pre> : null}
    </div>
  )
}

MessageBlock.propTypes = { title: PropTypes.string.isRequired, message: PropTypes.object }

/**
 * Panel de Trace del editor de proxies.
 *
 * Abre una sesión de depuración en el emulador y, mientras esté viva, consulta
 * periódicamente lo capturado. Por cada petición muestra la línea de tiempo del
 * flujo —políticas ejecutadas, condiciones evaluadas, cambios de estado— y, al
 * seleccionar un paso, las variables que leyó y escribió junto al mensaje tal
 * como estaba en ese instante.
 */
export function TracePanel({ proxyName, basePath }) {
  const [session, setSession] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [selectedTx, setSelectedTx] = useState(0)
  const [selectedStep, setSelectedStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
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

  // Mientras la sesión esté viva consultamos transacciones nuevas.
  useEffect(() => {
    if (!session?.sessionId || secondsLeft <= 0) return undefined

    pollRef.current = setInterval(() => refresh(session.sessionId), POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [session, secondsLeft, refresh])

  // Cuenta atrás hasta que el emulador cierra la sesión por timeout.
  useEffect(() => {
    if (!session || secondsLeft <= 0) return undefined
    const timer = setInterval(() => setSecondsLeft(v => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [session, secondsLeft])

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
    clearInterval(pollRef.current)
    setSecondsLeft(0)
  }

  const tx = transactions[selectedTx]
  const step = tx?.steps?.[selectedStep]
  const live = Boolean(session) && secondsLeft > 0
  const sampleUrl = `http://localhost:8445${basePath && basePath !== '-' ? basePath : ''}`

  return (
    <div className={s.panel}>
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
              {live && <span className={s.countdown}>{secondsLeft}s</span>}
              <span className={s.sessionId}>{session.sessionId?.slice(0, 8)}…</span>
            </>
          )}
        </div>

        <div className={s.toolbarRight}>
          {session && (
            <>
              <button
                className={s.btnGhost}
                onClick={() => refresh(session.sessionId)}
                title="Consultar ahora"
              >
                <IconRefresh size={13} /> Actualizar
              </button>
              {live && (
                <button className={s.btnGhost} onClick={stop}>Detener</button>
              )}
              <button className={s.btnGhost} onClick={begin} disabled={busy}>
                Nueva sesión
              </button>
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

      {session && transactions.length === 0 && (
        <div className={s.empty}>
          <span className={s.waitPulse} />
          <p className={s.emptyTitle}>
            {live ? 'Esperando peticiones…' : 'La sesión terminó sin capturar tráfico'}
          </p>
          <p className={s.emptyText}>
            {live
              ? 'Lanza una petición al proxy y aparecerá aquí en unos segundos.'
              : 'Inicia una sesión nueva y vuelve a intentarlo.'}
          </p>
          <code className={s.emptyCode}>curl {sampleUrl}</code>
        </div>
      )}

      {transactions.length > 0 && (
        <div className={s.body}>
          {/* Transacciones capturadas */}
          <div className={s.txList}>
            <div className={s.colHeader}>Peticiones ({transactions.length})</div>
            {transactions.map((t, i) => (
              <button
                key={t.index}
                className={`${s.txItem} ${i === selectedTx ? s.txItemActive : ''}`}
                onClick={() => { setSelectedTx(i); setSelectedStep(0) }}
              >
                <div className={s.txTop}>
                  <span className={s.txVerb}>{t.request?.verb || '—'}</span>
                  <StatusPill code={t.response?.statusCode} />
                </div>
                <div className={s.txUri}>{t.request?.uri || '—'}</div>
                <div className={s.txMeta}>
                  {t.durationMs !== null ? `${t.durationMs} ms` : '—'} · {t.policies.length} política{t.policies.length === 1 ? '' : 's'}
                </div>
              </button>
            ))}
          </div>

          {/* Línea de tiempo del flujo */}
          <div className={s.timeline}>
            <div className={s.colHeader}>Flujo de ejecución</div>
            {tx?.steps.map((st, i) => {
              const style = STEP_STYLES[st.kind] || STEP_STYLES.state
              const reads = st.variables.read.length
              const writes = st.variables.written.length
              return (
                <button
                  key={`${st.pointId}-${i}`}
                  className={`${s.stepItem} ${i === selectedStep ? s.stepItemActive : ''}`}
                  onClick={() => setSelectedStep(i)}
                >
                  <span className={s.stepRail} style={{ background: style.color }} />
                  <span className={s.stepOffset}>
                    {st.offsetMs !== null ? `+${st.offsetMs}ms` : '—'}
                  </span>
                  <span className={s.stepMain}>
                    <span className={s.stepTitle}>{st.title}</span>
                    <span className={s.stepSub}>
                      <span style={{ color: style.color }}>{style.label}</span>
                      {st.policyType && <> · {st.policyType}</>}
                      {st.kind === 'condition' && (
                        <> · <span className={st.expressionResult === 'true' ? s.condTrue : s.condFalse}>
                          {st.expressionResult}
                        </span></>
                      )}
                      {(reads > 0 || writes > 0) && (
                        <> · <span className={s.varRead}>{reads}↓</span> <span className={s.varWrite}>{writes}↑</span></>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Detalle del paso seleccionado */}
          <div className={s.detail}>
            <div className={s.colHeader}>Detalle del paso</div>
            {step ? (
              <div className={s.detailBody}>
                <div className={s.detailHead}>
                  <span className={s.detailTitle}>{step.title}</span>
                  <span className={s.detailKind}>
                    {(STEP_STYLES[step.kind] || {}).label}
                    {step.policyType ? ` · ${step.policyType}` : ''}
                  </span>
                </div>

                <VariableList title="Variables leídas" items={step.variables.read} tone="read" />
                <VariableList title="Variables escritas" items={step.variables.written} tone="write" />
                <MessageBlock title="Petición en este punto" message={step.request} />
                <MessageBlock title="Respuesta en este punto" message={step.response} />

                {Object.keys(step.properties || {}).length > 0 && (
                  <div className={s.varBlock}>
                    <div className={s.varTitle}>Propiedades</div>
                    {Object.entries(step.properties).map(([k, v]) => (
                      <div key={k} className={s.varRow}>
                        <span className={s.varName}>{k}</span>
                        <span className={s.varValue}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!step.variables.read.length &&
                  !step.variables.written.length &&
                  !step.request &&
                  !step.response &&
                  !Object.keys(step.properties || {}).length && (
                    <p className={s.detailEmpty}>Este paso no registró datos adicionales.</p>
                  )}
              </div>
            ) : (
              <p className={s.detailEmpty}>Selecciona un paso de la línea de tiempo.</p>
            )}
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
