import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScopeBadge } from '../components/StatusBadge'
import {
  IconRefresh, IconEdit, IconTrash, IconKVM, IconCloud, IconWarning, IconCheck, IconX,
} from '../components/Icons'
import { NewKvmModal } from '../components/NewKvmModal'
import { EdgeSyncModal } from '../components/EdgeSyncModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatDate } from '../utils/format'
import { fetchKvmCatalog, deleteKvm, deleteKvms, syncKvms } from '../utils/kvmApi'
import s from './table.module.css'
import k from './KeyValueMaps.module.css'

function KeyValueMaps() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState('todos')
  const [catalog, setCatalog] = useState({ keyValueMaps: [], environment: '', runtimeAvailable: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [edgeOpen, setEdgeOpen] = useState(false)

  // Las casillas solo aparecen al entrar en modo selección: en el uso normal
  // de la tabla estorban y se marcan sin querer.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [pendingDelete, setPendingDelete] = useState(null)

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

  const exitSelection = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const handleReload = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await syncKvms(catalog.environment)
      setNotice(`${result.synced} KVM recargados en el emulador.`)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (pendingDelete.mode === 'one') {
        await deleteKvm(pendingDelete.row.scope, catalog.environment, pendingDelete.row.name)
        setNotice(`KVM "${pendingDelete.row.name}" eliminado.`)
      } else {
        const result = await deleteKvms({
          names: pendingDelete.mode === 'selected' ? pendingDelete.names : undefined,
          all: pendingDelete.mode === 'all',
          environment: catalog.environment,
        })
        setNotice(`${result.deleted.length} KVM eliminados.`)
      }
      setPendingDelete(null)
      exitSelection()
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

  const visibleNames = filtered.map(row => row.name)
  const allVisibleSelected =
    visibleNames.length > 0 && visibleNames.every(name => selected.has(name))

  const toggleOne = name => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })

  // La casilla de la cabecera solo alterna lo que el filtro tiene a la vista.
  const toggleAllVisible = () => setSelected(prev => {
    const next = new Set(prev)
    if (allVisibleSelected) visibleNames.forEach(n => next.delete(n))
    else visibleNames.forEach(n => next.add(n))
    return next
  })

  // Un KVM sin cargar en el runtime existe en el workspace pero el emulador
  // todavía no lo tiene: las políticas KeyValueMapOperations no lo verían.
  const outOfSync = maps.filter(row => !row.inSync).length
  const columnCount = selecting ? 8 : 7

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
          <button className={s.btnSecondary} onClick={handleReload} disabled={busy || loading}>
            <IconRefresh size={14} /> {busy ? 'Trabajando…' : 'Recargar en emulador'}
          </button>
          <button className={s.btnSecondary} onClick={() => setEdgeOpen(true)} disabled={busy}>
            <IconCloud size={14} /> Sincronizar con Edge
          </button>
          <button className={s.btnPrimary} onClick={() => setModalOpen(true)}>+ Nuevo KVM</button>
        </div>
      </div>

      {error && (
        <div className={k.banner} data-tone="error">
          <IconWarning size={15} /> <span>{error}</span>
        </div>
      )}

      {notice && !error && (
        <div className={k.banner} data-tone="ok">
          <IconCheck size={15} /> <span>{notice}</span>
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
            {outOfSync} KVM sin cargar en el emulador. Pulsa <strong>Recargar en emulador</strong>{' '}
            para que las políticas los vean.
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
            {selecting ? (
              <>
                <span className={s.countLabel}>{selected.size} seleccionados</span>
                <button
                  className={s.btnDanger}
                  disabled={selected.size === 0 || busy}
                  onClick={() =>
                    setPendingDelete({ mode: 'selected', names: [...selected] })
                  }
                >
                  <IconTrash size={13} /> Eliminar ({selected.size})
                </button>
                <button
                  className={s.btnDanger}
                  disabled={maps.length === 0 || busy}
                  onClick={() => setPendingDelete({ mode: 'all' })}
                >
                  <IconTrash size={13} /> Eliminar todos
                </button>
                <button className={s.btnSecondary} onClick={exitSelection}>
                  <IconX size={13} /> Cancelar
                </button>
              </>
            ) : (
              <>
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
                <button
                  className={s.btnSecondary}
                  onClick={() => setSelecting(true)}
                  disabled={maps.length === 0}
                >
                  Seleccionar
                </button>
                <span className={s.countLabel}>{filtered.length} de {maps.length} KVMs</span>
              </>
            )}
          </div>
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                {selecting && (
                  <th className={s.checkCell}>
                    <input
                      type="checkbox"
                      className={s.checkbox}
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      disabled={visibleNames.length === 0}
                      aria-label="Seleccionar todos los KVM visibles"
                    />
                  </th>
                )}
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
                  <td colSpan={columnCount} className={s.empty}>
                    {loading ? 'Cargando…' : 'Sin resultados'}
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr
                  key={`${row.scope}:${row.name}`}
                  className={selecting && selected.has(row.name) ? s.rowSelected : ''}
                >
                  {selecting && (
                    <td className={s.checkCell}>
                      <input
                        type="checkbox"
                        className={s.checkbox}
                        checked={selected.has(row.name)}
                        onChange={() => toggleOne(row.name)}
                        aria-label={`Seleccionar ${row.name}`}
                      />
                    </td>
                  )}
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
                        onClick={() => setPendingDelete({ mode: 'one', row })}
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

      <EdgeSyncModal
        isOpen={edgeOpen}
        environment={catalog.environment}
        onClose={() => setEdgeOpen(false)}
        onImported={() => load()}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={pendingDelete?.mode === 'one' ? 'Eliminar Key Value Map' : 'Eliminar Key Value Maps'}
        confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      >
        {pendingDelete?.mode === 'one' && (
          <>
            Se eliminará <strong>{pendingDelete.row.name}</strong> del workspace
            (<code>{pendingDelete.row.source}</code>) y del runtime del emulador, con sus{' '}
            {pendingDelete.row.entryCount} entrada(s). Esta acción no se puede deshacer.
          </>
        )}
        {pendingDelete?.mode === 'selected' && (
          <>
            Se eliminarán <strong>{pendingDelete.names.length} KVM</strong> del workspace y del
            runtime del emulador: {pendingDelete.names.join(', ')}. Esta acción no se puede
            deshacer.
          </>
        )}
        {pendingDelete?.mode === 'all' && (
          <>
            Se eliminarán <strong>los {maps.length} KVM</strong> de los dos scopes, tanto del
            workspace como del runtime del emulador. Los archivos <code>kvms.json</code> quedarán
            vacíos. Esta acción no se puede deshacer.
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}

export default KeyValueMaps
