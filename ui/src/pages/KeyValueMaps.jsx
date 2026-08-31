import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScopeBadge } from '../components/StatusBadge'
import { IconRefresh, IconEdit, IconTrash, IconKVM, IconCloud, IconWarning } from '../components/Icons'
import { NewKvmModal } from '../components/NewKvmModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatDate } from '../utils/format'
import { fetchKvmCatalog, deleteKvm, syncKvms } from '../utils/kvmApi'
import s from './table.module.css'
import k from './KeyValueMaps.module.css'

function KeyValueMaps() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState('todos')
  const [catalog, setCatalog] = useState({ keyValueMaps: [], environment: '', runtimeAvailable: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetchKvmCatalog()
      .then(setCatalog)
      .catch(err => {
        setError(err.message)
        setCatalog({ keyValueMaps: [], environment: '', runtimeAvailable: false })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setBusy(true)
    setError('')
    try {
      await syncKvms(catalog.environment)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteKvm(pendingDelete.scope, catalog.environment, pendingDelete.name)
      setPendingDelete(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openDetail = row =>
    navigate(`/kvm/${encodeURIComponent(row.name)}?scope=${row.scope}`)

  const maps = catalog.keyValueMaps || []
  const searchLower = search.toLowerCase()
  const filtered = maps.filter(row => {
    if (scopeFilter !== 'todos' && row.scope !== scopeFilter) return false
    return [row.name, row.scope, row.encrypted ? 'si cifrado' : 'no']
      .join(' ')
      .toLowerCase()
      .includes(searchLower)
  })

  // Un KVM sin cargar en el runtime existe en el workspace pero el emulador
  // todavía no lo tiene: las políticas KeyValueMapOperations no lo verían.
  const outOfSync = maps.filter(row => !row.inSync).length

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Key Value Maps</h1>
          <p className={s.pageSub}>
            Administra los mapas de clave-valor del emulador local
            {catalog.environment ? ` (environment ${catalog.environment})` : ''}.
          </p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={handleSync} disabled={busy || loading}>
            <IconCloud size={14} /> {busy ? 'Sincronizando…' : 'Sincronizar'}
          </button>
          <button className={s.btnSecondary} onClick={load} disabled={loading}>
            <IconRefresh size={14} /> {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button className={s.btnPrimary} onClick={() => setModalOpen(true)}>+ Nuevo KVM</button>
        </div>
      </div>

      {error && (
        <div className={k.banner} data-tone="error">
          <IconWarning size={15} /> <span>{error}</span>
        </div>
      )}

      {!error && !catalog.runtimeAvailable && (
        <div className={k.banner} data-tone="warn">
          <IconWarning size={15} />
          <span>
            No se pudo consultar el emulador: la tabla muestra el workspace, no lo que hay
            cargado en el contenedor.
          </span>
        </div>
      )}

      {!error && catalog.runtimeAvailable && outOfSync > 0 && (
        <div className={k.banner} data-tone="warn">
          <IconWarning size={15} />
          <span>
            {outOfSync} KVM sin cargar en el emulador. Pulsa <strong>Sincronizar</strong> para
            que las políticas los vean.
          </span>
        </div>
      )}

      <div className={s.card}>
        <div className={s.tableBar}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon}>🔍</span>
            <input
              className={s.searchInput}
              placeholder="Buscar KVM..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className={s.tableBarRight}>
            <select
              className={k.select}
              value={scopeFilter}
              onChange={e => setScopeFilter(e.target.value)}
              aria-label="Filtrar por scope"
            >
              <option value="todos">Todos los scopes</option>
              <option value="environment">Entorno</option>
              <option value="organization">Organización</option>
            </select>
            <span className={s.countLabel}>{filtered.length} de {maps.length} KVMs</span>
          </div>
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nombre del KVM</th>
                <th>Scope</th>
                <th>Cifrado</th>
                <th>Entradas</th>
                <th>En el emulador</th>
                <th>Fecha de Modificación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={s.empty}>
                    {loading ? 'Cargando…' : 'Sin resultados'}
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr key={`${row.scope}:${row.name}`}>
                  <td>
                    <span className={s.nameCell}>
                      <IconKVM size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <button className={k.nameLink} onClick={() => openDetail(row)}>
                        {row.name}
                      </button>
                    </span>
                  </td>
                  <td><ScopeBadge scope={row.scope} /></td>
                  <td>
                    <span className={row.encrypted ? k.encOn : k.encOff}>
                      {row.encrypted ? '🔒 Sí' : '🔓 No'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {row.entryCount}
                  </td>
                  <td>
                    <span className={row.inSync ? k.pillOk : k.pillPending}>
                      {row.inSync
                        ? `Cargado (${row.runtimeKeyCount})`
                        : row.deployed ? 'Desincronizado' : 'Sin cargar'}
                    </span>
                  </td>
                  <td className={s.dateCell}>{formatDate(row.lastModifiedAt)}</td>
                  <td>
                    <div className={s.actionCell}>
                      <button
                        className={s.iconAction}
                        title={`Editar ${row.name}`}
                        aria-label={`Editar ${row.name}`}
                        onClick={() => openDetail(row)}
                      >
                        <IconEdit size={15} />
                      </button>
                      <button
                        className={`${s.iconAction} ${s.iconActionDanger}`}
                        title={`Eliminar ${row.name}`}
                        aria-label={`Eliminar ${row.name}`}
                        onClick={() => setPendingDelete(row)}
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

      <NewKvmModal
        isOpen={modalOpen}
        environment={catalog.environment}
        onClose={() => setModalOpen(false)}
        onCreated={created => {
          setModalOpen(false)
          load()
          if (created) openDetail(created)
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Eliminar Key Value Map"
        confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      >
        Se eliminará <strong>{pendingDelete?.name}</strong> del workspace
        (<code>{pendingDelete?.source}</code>) y del runtime del emulador, con sus{' '}
        {pendingDelete?.entryCount} entrada(s). Esta acción no se puede deshacer.
      </ConfirmDialog>
    </div>
  )
}

export default KeyValueMaps
