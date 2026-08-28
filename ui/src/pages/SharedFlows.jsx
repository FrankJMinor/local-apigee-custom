import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge'
import { IconRefresh, IconRocket, IconTrash } from '../components/Icons'
import { NewProxyModal } from '../components/NewProxyModal'
import { DeleteProxiesModal } from '../components/DeleteProxiesModal'
import { ARTIFACT_KINDS } from '../utils/importProxyBundle'
import { getDotColor, isErrorState } from '../utils/states'
import s from './table.module.css'

const KIND = ARTIFACT_KINDS.sharedflow

function SharedFlows() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('')
  const [sharedFlows, setSharedFlows] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  // Nombres marcados para borrar.
  const [selected, setSelected] = useState(() => new Set())
  const [pendingDelete, setPendingDelete] = useState([])

  const loadSharedFlows = useCallback(() => {
    setLoading(true)
    fetch('/v1/sharedflows/deployed')
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
  }, [])

  useEffect(() => {
    loadSharedFlows()
  }, [loadSharedFlows])

  const searchLower = search.toLowerCase()
  const filtered = sharedFlows.filter(r =>
    [r.name, r.revision, r.state].join(' ').toLowerCase().includes(searchLower)
  )

  const visibleNames = [...new Set(filtered.map(r => r.name))]
  const allVisibleSelected = visibleNames.length > 0 && visibleNames.every(n => selected.has(n))

  const toggleOne = name => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })

  // La cabecera solo alterna lo que el filtro tiene a la vista.
  const toggleAllVisible = () => setSelected(prev => {
    const next = new Set(prev)
    if (allVisibleSelected) visibleNames.forEach(n => next.delete(n))
    else visibleNames.forEach(n => next.add(n))
    return next
  })

  const handleDeleted = () => {
    setSelected(new Set())
    setPendingDelete([])
    loadSharedFlows()
  }

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
          <button className={s.btnPrimary} onClick={() => setModalOpen(true)}>+ Nuevo Flow</button>
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
          <div className={s.tableBarRight}>
            {selected.size > 0 && (
              <button className={s.btnDanger} onClick={() => setPendingDelete([...selected])}>
                <IconTrash size={13} /> Eliminar ({selected.size})
              </button>
            )}
            <span className={s.countLabel}>{filtered.length} de {sharedFlows.length} shared flows</span>
          </div>
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.checkCell}>
                  <input
                    type="checkbox"
                    className={s.checkbox}
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    disabled={visibleNames.length === 0}
                    aria-label="Seleccionar todos los shared flows visibles"
                  />
                </th>
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
                <tr><td colSpan={7} className={s.empty}>Sin resultados</td></tr>
              ) : filtered.map(row => (
                <tr key={row.name} className={selected.has(row.name) ? s.rowSelected : ''}>
                  <td className={s.checkCell}>
                    <input
                      type="checkbox"
                      className={s.checkbox}
                      checked={selected.has(row.name)}
                      onChange={() => toggleOne(row.name)}
                      aria-label={`Seleccionar ${row.name}`}
                    />
                  </td>
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
                    <div className={s.actionCell}>
                      <button
                        className={`${s.deployBtn} ${isErrorState(row.state) ? s.deployBtnDisabled : ''}`}
                        disabled={isErrorState(row.state)}
                        onClick={() => alert(`Desplegando ${row.name}…`)}
                      >
                        <IconRocket size={13} /> Desplegar
                      </button>
                      <button
                        className={`${s.iconAction} ${s.iconActionDanger}`}
                        onClick={() => setPendingDelete([row.name])}
                        title={`Eliminar ${row.name}`}
                        aria-label={`Eliminar ${row.name}`}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteProxiesModal
        isOpen={pendingDelete.length > 0}
        proxies={pendingDelete}
        kind={KIND}
        onClose={() => setPendingDelete([])}
        onDeleted={handleDeleted}
      />

      <NewProxyModal
        isOpen={modalOpen}
        kind={KIND}
        onClose={() => setModalOpen(false)}
        onCreated={loadSharedFlows}
        onOpenProxy={flowName => {
          setModalOpen(false)
          navigate(`/shared-flows/${encodeURIComponent(flowName)}`)
        }}
      />
    </div>
  )
}

export default SharedFlows
