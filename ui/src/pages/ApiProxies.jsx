import { useState, useEffect, useCallback } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { TagChip } from '../components/TagChip'
import { IconRefresh, IconRocket } from '../components/Icons'
import { formatDate } from '../utils/format'
import { getDotColor, isErrorState } from '../utils/states'
import s from './table.module.css'

const API_URL = '/v1/organizations/americamovil/apis'

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

function ApiProxies() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(API_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => setRows(parseProxies(d)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const searchLower = search.toLowerCase()
  const filtered = rows.filter(r =>
    [r.name, r.revision, r.state, r.basePath, ...r.tags].join(' ')
      .toLowerCase().includes(searchLower)
  )

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
                        <span className={s.dot} style={{ background: getDotColor(row.state) }} />
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
                        className={`${s.deployBtn} ${isErrorState(row.state) ? s.deployBtnDisabled : ''}`}
                        disabled={isErrorState(row.state)}
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
