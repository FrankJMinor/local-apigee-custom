import { useState, useRef } from 'react'
import { parseTrace } from '../utils/traceParser'
import {
  IconTrace, IconUpload, IconX, IconWarning,
  IconCheck, IconInfo, IconChevronRight,
} from '../components/Icons'
import styles from './TraceAnalyzer.module.css'

const STATUS_COLOR = code => {
  if (code >= 500) return '#ef4444'
  if (code >= 400) return '#f59e0b'
  if (code >= 300) return '#6366f1'
  if (code >= 200) return '#22c55e'
  return '#94a3b8'
}

const LEVEL_CFG = {
  error:   { Icon: IconWarning, cls: 'findingError',   label: 'Error' },
  warning: { Icon: IconWarning, cls: 'findingWarning', label: 'Advertencia' },
  info:    { Icon: IconInfo,    cls: 'findingInfo',    label: 'Info' },
}

function UploadZone({ onFile }) { // NOSONAR S6774
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  function handle(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => onFile(e.target.result, file.name)
    reader.readAsText(file)
  }

  return (
    <div
      className={`${styles.dropzone} ${dragging ? styles.dropzoneDrag : ''}`}
      onClick={() => inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml"
        style={{ display: 'none' }}
        onChange={e => handle(e.target.files[0])}
      />
      <IconUpload size={36} style={{ color: 'var(--accent)', marginBottom: '0.6em' }} />
      <p className={styles.dropTitle}>Arrastra tu traza Apigee aquí</p>
      <p className={styles.dropSub}>o haz clic para seleccionar un archivo <code>.xml</code></p>
    </div>
  )
}

function StatusBadge({ code }) { // NOSONAR S6774
  const color = STATUS_COLOR(code)
  return (
    <span className={styles.statusBadge} style={{ background: `${color}22`, color, borderColor: `${color}55` }}>
      {code || '—'}
    </span>
  )
}

function MethodBadge({ method }) { // NOSONAR S6774
  const colors = { GET: '#3b82f6', POST: '#10b981', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#8b5cf6' }
  const color = colors[(method || '').toUpperCase()] || '#94a3b8'
  return (
    <span className={styles.methodBadge} style={{ background: `${color}22`, color }}>
      {method || '—'}
    </span>
  )
}

function HeadersTable({ headers, emptyMsg }) { // NOSONAR S6774
  if (!headers.length) return <p className={styles.emptyMsg}>{emptyMsg}</p>
  return (
    <table className={styles.miniTable}>
      <tbody>
        {headers.map(h => (
          <tr key={h.name}>
            <td className={styles.headerName}>{h.name}</td>
            <td className={styles.headerValue}>{h.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function VarRow({ name, value }) { // NOSONAR S6774
  const isNull = !value || value === 'null' || value === 'undefined' || value === ''
  return (
    <tr className={isNull ? styles.varRowNull : ''}>
      <td className={styles.varName}>{name}</td>
      <td className={styles.varValue}>
        {isNull
          ? <span className={styles.nullTag}>null / vacío</span>
          : <code>{value}</code>}
      </td>
    </tr>
  )
}

function TabResumen({ tx }) { // NOSONAR S6774
  return (
    <div className={styles.tabContent}>
      <div className={styles.twoCol}>
        <div>
          <h4 className={styles.sectionLabel}>Request Headers</h4>
          <HeadersTable headers={tx.requestHeaders} emptyMsg="Sin headers de request capturados" />
          {tx.queryParams.length > 0 && (
            <>
              <h4 className={styles.sectionLabel} style={{ marginTop: '1.2em' }}>Query Params</h4>
              <HeadersTable headers={tx.queryParams} emptyMsg="" />
            </>
          )}
        </div>
        <div>
          <h4 className={styles.sectionLabel}>Response Headers</h4>
          <HeadersTable headers={tx.responseHeaders} emptyMsg="Sin headers de response capturados" />
        </div>
      </div>

      <h4 className={styles.sectionLabel} style={{ marginTop: '1.4em' }}>
        Pasos de ejecución ({tx.steps.length})
      </h4>
      <div className={styles.stepsList}>
        {tx.steps.map((step, i) => (
          <div key={i} className={`${styles.step} ${step.error ? styles.stepError : ''}`}>
            <span className={styles.stepDot} style={{ background: step.error ? '#ef4444' : '#22c55e' }} />
            <div className={styles.stepInfo}>
              <span className={styles.stepName}>{step.policyName || step.policyType || `Paso ${i + 1}`}</span>
              {step.policyType && step.policyType !== step.policyName && (
                <span className={styles.stepType}>{step.policyType}</span>
              )}
            </div>
            <span className={styles.stepDuration}>{step.duration} ms</span>
            {step.error && <IconWarning size={14} style={{ color: '#ef4444', flexShrink: 0 }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function TabVariables({ tx }) { // NOSONAR S6774
  const [search, setSearch] = useState('')
  const [showOnlyNull, setShowOnlyNull] = useState(false)

  const entries = Object.entries(tx.variables).filter(([k, v]) => {
    if (showOnlyNull && v && v !== 'null' && v !== 'undefined' && v !== '') return false
    return k.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className={styles.tabContent}>
      <div className={styles.varToolbar}>
        <input
          className={styles.varSearch}
          placeholder="Filtrar variables..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className={styles.nullToggle}>
          <input type="checkbox" checked={showOnlyNull} onChange={e => setShowOnlyNull(e.target.checked)} />
          Solo nulas / vacías ({tx.nullVars.length})
        </label>
      </div>
      {entries.length === 0
        ? <p className={styles.emptyMsg}>Sin variables que coincidan</p>
        : (
          <div className={styles.tableWrapper}>
            <table className={styles.miniTable}>
              <thead>
                <tr><th>Variable</th><th>Valor</th></tr>
              </thead>
              <tbody>
                {entries.map(([k, v]) => <VarRow key={k} name={k} value={v} />)}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}

function TabAnalysis({ tx }) { // NOSONAR S6774
  if (tx.findings.length === 0) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.allGood}>
          <IconCheck size={32} style={{ color: '#22c55e' }} />
          <p>Sin problemas detectados en esta transacción</p>
        </div>
      </div>
    )
  }
  return (
    <div className={styles.tabContent}>
      <div className={styles.findingsList}>
        {tx.findings.map((f, i) => {
          const cfg = LEVEL_CFG[f.level] || LEVEL_CFG.info
          return (
            <div key={i} className={`${styles.finding} ${styles[cfg.cls]}`}>
              <cfg.Icon size={16} className={styles.findingIcon} />
              <div>
                <p className={styles.findingTitle}>{f.title}</p>
                {f.detail && <p className={styles.findingDetail}>{f.detail}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TraceAnalyzer() {
  const [result, setResult]       = useState(null)
  const [fileName, setFileName]   = useState('')
  const [parseError, setParseError] = useState('')
  const [selectedTx, setSelectedTx] = useState(0)
  const [tab, setTab]             = useState('resumen')

  function handleFile(text, name) {
    setParseError('')
    setResult(null)
    try {
      const parsed = parseTrace(text)
      setResult(parsed)
      setFileName(name)
      setSelectedTx(0)
      setTab('resumen')
    } catch (e) {
      setParseError(e.message)
    }
  }

  function clear() {
    setResult(null)
    setFileName('')
    setParseError('')
  }

  const tx = result?.transactions[selectedTx]

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            <IconTrace size={22} style={{ verticalAlign: 'middle', marginRight: '0.4em' }} />
            Trace Analyzer
          </h1>
          <p className={styles.pageSub}>Carga una traza Apigee (.xml) para analizar peticiones, variables y errores.</p>
        </div>
        {result && (
          <div className={styles.metaBar}>
            {result.meta.proxy     && <span className={styles.metaTag}>Proxy: <strong>{result.meta.proxy}</strong></span>}
            {result.meta.revision  && <span className={styles.metaTag}>Rev: <strong>{result.meta.revision}</strong></span>}
            {result.meta.environment && <span className={styles.metaTag}>Env: <strong>{result.meta.environment}</strong></span>}
            <button className={styles.clearBtn} onClick={clear} title="Limpiar">
              <IconX size={14} /> {fileName}
            </button>
          </div>
        )}
      </div>

      {!result && (
        <>
          <UploadZone onFile={handleFile} />
          {parseError && (
            <div className={styles.errorBanner}>
              <IconWarning size={16} /> {parseError}
            </div>
          )}
        </>
      )}

      {result && (
        <div className={styles.analyzer}>
          {/* Transaction list */}
          <aside className={styles.txList}>
            <p className={styles.txListHeader}>{result.transactions.length} Transacciones</p>
            {result.transactions.map((t, i) => (
              <button
                key={t.id}
                className={`${styles.txItem} ${i === selectedTx ? styles.txItemActive : ''}`}
                onClick={() => { setSelectedTx(i); setTab('resumen') }}
              >
                <StatusBadge code={t.statusCode} />
                <div className={styles.txMeta}>
                  <span className={styles.txId}>#{t.id}</span>
                  <MethodBadge method={t.method} />
                </div>
                <p className={styles.txUri}>{t.uri}</p>
                <div className={styles.txFooter}>
                  <span>{t.duration} ms</span>
                  {t.findings.some(f => f.level === 'error') && (
                    <IconWarning size={12} style={{ color: '#ef4444' }} />
                  )}
                </div>
                <IconChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </aside>

          {/* Detail panel */}
          {tx && (
            <div className={styles.detail}>
              <div className={styles.detailHeader}>
                <div className={styles.detailTitle}>
                  <StatusBadge code={tx.statusCode} />
                  <MethodBadge method={tx.method} />
                  <code className={styles.detailUri}>{tx.uri}</code>
                  <span className={styles.detailDuration}>{tx.duration} ms total</span>
                </div>
                <div className={styles.tabs}>
                  {['resumen', 'variables', 'análisis'].map(t => (
                    <button
                      key={t}
                      className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                      onClick={() => setTab(t)}
                    >
                      {t === 'análisis' && tx.findings.filter(f => f.level === 'error').length > 0 && (
                        <span className={styles.tabBadge}>
                          {tx.findings.filter(f => f.level === 'error').length}
                        </span>
                      )}
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {tab === 'resumen'   && <TabResumen   tx={tx} />}
              {tab === 'variables' && <TabVariables tx={tx} />}
              {tab === 'análisis'  && <TabAnalysis  tx={tx} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TraceAnalyzer
