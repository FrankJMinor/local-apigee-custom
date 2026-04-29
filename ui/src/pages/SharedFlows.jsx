import { useState } from 'react'
import { SHARED_FLOWS } from '../data/mock'
import { StatusBadge } from '../components/StatusBadge'
import { IconRefresh, IconRocket } from '../components/Icons'
import { formatDate } from '../utils/format'
import s from './table.module.css'

const DOT_COLORS = {
  deployed: '#22c55e', undeployed: '#94a3b8',
  pending: '#f59e0b', error: '#ef4444',
}

function SharedFlows() {
  const [search, setSearch] = useState('')

  const filtered = SHARED_FLOWS.filter(r =>
    [r.name, r.revision, r.state].join(' ')
      .toLowerCase().includes(search.toLowerCase())
  )

  const dotColor = state => DOT_COLORS[(state || '').toLowerCase()] || '#94a3b8'
  const isError  = state => (state || '').toLowerCase() === 'error'

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Shared Flows</h1>
          <p className={s.pageSub}>Gestiona los flujos compartidos reutilizables entre tus proxies de API.</p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary}>
            <IconRefresh size={14} /> Actualizar
          </button>
          <button className={s.btnPrimary}>+ Nuevo Flow</button>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.tableBar}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon}>🔍</span>
            <input
              className={s.searchInput}
              placeholder="Buscar shared flow..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className={s.countLabel}>{filtered.length} de {SHARED_FLOWS.length} shared flows</span>
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nombre del Flow</th>
                <th>Revisión</th>
                <th>Estado</th>
                <th>Uso</th>
                <th>Fecha de Modificación</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className={s.empty}>Sin resultados</td></tr>
              ) : filtered.map(row => (
                <tr key={row.name}>
                  <td>
                    <span className={s.nameCell}>
                      <span className={s.dot} style={{ background: dotColor(row.state) }} />
                      <span className={s.itemName}>{row.name}</span>
                    </span>
                  </td>
                  <td><span className={s.revBadge}>v{row.revision}</span></td>
                  <td><StatusBadge status={row.state} /></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                    {row.usage} proxies
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
      </div>
    </div>
  )
}

export default SharedFlows
