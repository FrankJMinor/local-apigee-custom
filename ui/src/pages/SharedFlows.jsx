import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge'
import { IconRefresh, IconRocket } from '../components/Icons'
import { getDotColor, isErrorState } from '../utils/states'
import s from './table.module.css'


function SharedFlows() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('')
  const [sharedFlows, setSharedFlows] = useState([])
  const [loading, setLoading] = useState(false)

  const loadSharedFlows = () => {
    setLoading(true)
    fetch('http://localhost:8446/v1/sharedflows/deployed')
      .then(res => res.json())
      .then(data => {
        const list = data.shared_flows || []
        const rev = data.revision || '1'
        setSharedFlows(list.map(name => ({
          name,
          revision: rev,
          state: 'deployed',
          usage: '-',
          lastModified: '-',
        })))
      })
      .catch(() => setSharedFlows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSharedFlows()
  }, [])

  const searchLower = search.toLowerCase()
  const filtered = sharedFlows.filter(r =>
    [r.name, r.revision, r.state].join(' ').toLowerCase().includes(searchLower)
  )

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Shared Flows</h1>
          <p className={s.pageSub}>Gestiona los flujos compartidos reutilizables entre tus proxies de API.</p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={loadSharedFlows} disabled={loading}>
            <IconRefresh size={14} /> {loading ? 'Actualizando...' : 'Actualizar'}
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
          <span className={s.countLabel}>{filtered.length} de {sharedFlows.length} shared flows</span>
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
                      <span className={s.dot} style={{ background: getDotColor(row.state) }} />
                      <span
                        className={s.itemName}
                        style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => navigate(`/shared-flows/${row.name}`)}
                      >
                        {row.name}
                      </span>
                    </span>
                  </td>
                  <td><span className={s.revBadge}>{row.revision ? `v${row.revision}` : '-'}</span></td>
                  <td><StatusBadge status={row.state} /></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                    {row.usage}
                  </td>
                  <td className={s.dateCell}>{row.lastModified}</td>
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
      </div>
    </div>
  )
}

export default SharedFlows
