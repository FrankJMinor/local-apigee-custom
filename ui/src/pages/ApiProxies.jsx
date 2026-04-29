import { useState, useEffect } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { IconRefresh, IconRocket } from '../components/Icons'
import { formatDate, tagColor } from '../utils/format'
import s from './table.module.css'

const API_URL = '/v1/organizations/americamovil/apis'

const DOT_COLORS = {
  deployed: '#22c55e', undeployed: '#94a3b8',
  pending: '#f59e0b', error: '#ef4444',
}

function parseProxies(data) {
  const proxies = data.aPIProxy || data
  const out = []
  proxies.forEach(proxy => {
    const name = proxy.name?.name || proxy.name || '-'
    ;(proxy.revision || []).forEach(rev => {
      out.push({
        name,
        revision:     rev.name || '-',
        state:        rev.state || '-',
        basePath:     rev.configuration?.basePath || '-',
        lastModified: rev.lastModifiedAt || null,
        tags:         proxy.tags || rev.tags || [],
      })
    })
  })
  return out
}

function TagChip({ tag }) { // NOSONAR S6774
  const color = tagColor(tag)
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: '10px',
      fontSize: '0.78em',
      fontWeight: 600,
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
    }}>
      {tag}
    </span>
  )
}

function ApiProxies() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  function load() {
    setLoading(true)
    setError(null)
    fetch(API_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => setRows(parseProxies(d)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filtered = rows.filter(r =>
    [r.name, r.revision, r.state, r.basePath, ...r.tags].join(' ')
      .toLowerCase().includes(search.toLowerCase())
  )

  const dotColor = state => DOT_COLORS[(state || '').toLowerCase()] || '#94a3b8'
  const isError  = state => (state || '').toLowerCase() === 'error'

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>API Proxies</h1>
          <p className={s.pageSub}>Gestiona los proxies de API desplegados en tu entorno local.</p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={load}>
            <IconRefresh size={14} /> Actualizar
          </button>
          <button className={s.btnPrimary}>+ Nuevo Proxy</button>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.tableBar}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon}>🔍</span>
            <input
              className={s.searchInput}
              placeholder="Buscar proxy..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className={s.countLabel}>
            {loading ? '…' : `${filtered.length} de ${rows.length} proxies`}
          </span>
        </div>

        {loading && <p className={s.empty}>Cargando proxies...</p>}
        {error   && <p className={s.empty} style={{ color: '#ef4444' }}>Error: {error}</p>}

        {!loading && !error && (
          <div className={s.tableWrapper}>
            <table className={s.table}>
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
                  <tr><td colSpan={6} className={s.empty}>Sin resultados</td></tr>
                ) : filtered.map(row => (
                  <tr key={`${row.name}-${row.revision}`}>
                    <td>
                      <span className={s.nameCell}>
                        <span className={s.dot} style={{ background: dotColor(row.state) }} />
                        <span className={s.itemName}>{row.name}</span>
                      </span>
                    </td>
                    <td><span className={s.revBadge}>v{row.revision}</span></td>
                    <td><StatusBadge status={row.state} /></td>
                    <td>
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.tags.length > 0
                          ? row.tags.map(t => <TagChip key={t} tag={t} />)
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </span>
                    </td>
                    <td className={s.dateCell}>{formatDate(row.lastModified)}</td>
                    <td>
                      <button
                        className={`${s.deployBtn} ${isError(row.state) ? s.deployBtnDisabled : ''}`}
                        disabled={isError(row.state)}
                        onClick={() => alert(`Desplegando ${row.name}…`)}
                      >
                        <IconRocket size={13} /> Desplegar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default ApiProxies
