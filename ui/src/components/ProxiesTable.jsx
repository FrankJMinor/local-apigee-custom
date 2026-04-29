import { useState, useEffect } from 'react'
import styles from './ProxiesTable.module.css'

const API_URL = '/v1/organizations/americamovil/apis'

const STATE_CONFIG = {
  deployed:   { label: 'Activo',    variant: 'solid',   icon: '◎' },
  undeployed: { label: 'Inactivo',  variant: 'outline', icon: '○' },
  pending:    { label: 'Pendiente', variant: 'outline', icon: '◷' },
  error:      { label: 'Error',     variant: 'error',   icon: '⊗' },
}

const DOT_COLORS = {
  deployed:   '#22c55e',
  undeployed: '#94a3b8',
  pending:    '#f59e0b',
  error:      '#ef4444',
}

const TAG_PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#10b981', '#ec4899', '#6366f1',
]

function tagColor(tag) {
  const hash = tag.split('').reduce((a, c) => a + c.codePointAt(0), 0)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

function formatDate(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function parseRevision(proxy, rev) {
  return {
    name:         proxy.name?.name || proxy.name || '-',
    revision:     rev.name || '-',
    state:        rev.state || '-',
    basePath:     rev.configuration?.basePath || '-',
    lastModified: rev.lastModifiedAt || null,
    tags:         proxy.tags || rev.tags || [],
  }
}

function parseProxies(data) {
  const proxies = data.aPIProxy || data
  const result = []
  proxies.forEach(proxy => {
    (proxy.revision || []).forEach(rev => result.push(parseRevision(proxy, rev)))
  })
  return result
}

function StatusBadge({ status }) { // NOSONAR S6774
  const key = (status || '').toLowerCase()
  const cfg = STATE_CONFIG[key] || { label: status || '-', variant: 'outline', icon: '○' }
  const variantClass = styles[`badge_${cfg.variant}`]
  return (
    <span className={`${styles.badge} ${variantClass}`}>
      <span className={styles.badgeIcon}>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

function ProxyDot({ state }) { // NOSONAR S6774
  const key = (state || '').toLowerCase()
  return <span className={styles.dot} style={{ background: DOT_COLORS[key] || '#94a3b8' }} />
}

function TagChip({ tag }) { // NOSONAR S6774
  const color = tagColor(tag)
  return (
    <span
      className={styles.tag}
      style={{ background: `${color}22`, color, borderColor: `${color}55` }}
    >
      {tag}
    </span>
  )
}

function ProxiesTable({ isDark, onToggleTheme }) { // NOSONAR S6774
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    fetch(API_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setRows(parseProxies(data)))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = rows.filter(r =>
    [r.name, r.revision, r.state, r.basePath, ...(r.tags || [])]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  const isError = state => (state || '').toLowerCase() === 'error'

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className={styles.search}
            type="text"
            placeholder="Buscar proxy por nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.topRight}>
          <span className={styles.countLabel}>
            {filtered.length} de {rows.length} proxies
          </span>
          <button
            className={styles.themeBtn}
            onClick={onToggleTheme}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <button className={styles.addBtn} onClick={() => alert('Funcionalidad no implementada')}>
            + Proxy
          </button>
        </div>
      </div>

      {loading && <p className={styles.info}>Cargando proxies...</p>}
      {error   && <p className={styles.errMsg}>Error: {error}</p>}

      {!loading && !error && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre del Proxy</th>
                <th>Revisión</th>
                <th>Estado</th>
                <th>Tags</th>
                <th>Fecha de Modificación</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>Sin resultados</td>
                </tr>
              ) : (
                filtered.map(row => (
                  <tr key={`${row.name}-${row.revision}`} className={styles.row}>
                    <td>
                      <span className={styles.nameCell}>
                        <ProxyDot state={row.state} />
                        <span className={styles.proxyName}>{row.name}</span>
                      </span>
                    </td>
                    <td>
                      <span className={styles.revision}>v{row.revision}</span>
                    </td>
                    <td>
                      <StatusBadge status={row.state} />
                    </td>
                    <td>
                      <span className={styles.tagList}>
                        {row.tags.length > 0
                          ? row.tags.map(t => <TagChip key={t} tag={t} />)
                          : <span className={styles.noTags}>—</span>}
                      </span>
                    </td>
                    <td className={styles.date}>{formatDate(row.lastModified)}</td>
                    <td>
                      <button
                        className={`${styles.deployBtn} ${isError(row.state) ? styles.deployBtnDisabled : ''}`}
                        disabled={isError(row.state)}
                        onClick={() => alert(`Desplegando ${row.name}…`)}
                      >
                        🚀 Desplegar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ProxiesTable
