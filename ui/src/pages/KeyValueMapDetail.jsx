import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ScopeBadge } from '../components/StatusBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  IconKVM, IconPlus, IconTrash, IconEdit, IconRefresh, IconCheck, IconX,
  IconCopy, IconWarning, IconChevronRight,
} from '../components/Icons'
import { formatDate } from '../utils/format'
import {
  fetchKvm, updateKvm, createEntry, updateEntry, deleteEntry, SCOPES,
} from '../utils/kvmApi'
import s from './KeyValueMapDetail.module.css'

const PAGE_SIZES = [10, 25, 50, 100]
const MASK = '••••••••'

/** Filtros de la columna Valor, al estilo de un cliente de base de datos. */
const VALUE_FILTERS = {
  todas: () => true,
  'con-valor': entry => entry.value !== '',
  vacias: entry => entry.value === '',
}

/**
 * Vista de edición de un Key Value Map: tabla estilo cliente de base de datos
 * para buscar, filtrar, ordenar y editar las llaves.
 *
 * Cada cambio se escribe en el `kvms.json` del workspace y se recarga en el
 * emulador; si el emulador lo rechaza, el backend revierte el archivo.
 */
function KeyValueMapDetail() {
  const { kvmName } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const scope = searchParams.get('scope') === SCOPES.organization
    ? SCOPES.organization
    : SCOPES.environment

  const [kvm, setKvm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // ── Controles de la tabla ──
  const [search, setSearch] = useState('')
  const [searchField, setSearchField] = useState('todo')
  const [valueFilter, setValueFilter] = useState('todas')
  const [sort, setSort] = useState({ column: 'name', dir: 'asc' })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [reveal, setReveal] = useState(false)

  // ── Edición ──
  // Las casillas solo aparecen al entrar en modo selección; con la tabla en uso
  // normal estorban y se marcan sin querer.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [editing, setEditing] = useState(null)     // { original, name, value }
  const [draft, setDraft] = useState(null)         // fila de alta
  const [pendingDelete, setPendingDelete] = useState(null)
  const [renaming, setRenaming] = useState(null)   // { name, encrypted }

  const environment = kvm?.environment

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetchKvm(scope, searchParams.get('environment') || undefined, kvmName)
      .then(setKvm)
      .catch(err => { setError(err.message); setKvm(null) })
      .finally(() => setLoading(false))
  }, [scope, kvmName, searchParams])

  useEffect(() => { load() }, [load])

  /** Ejecuta una mutación, refresca el KVM y deja el mensaje de resultado. */
  const run = async (action, message) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await action()
      setKvm(result.keyValueMap)
      setNotice(message)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const entries = useMemo(() => kvm?.entries || [], [kvm])

  // Llaves que están en el archivo pero que el cargador del emulador rechaza
  // (nombre con “/” o de un solo carácter): existen en el workspace, no en el
  // runtime local. Las de los KVM de rutas de Edge caen todas aquí.
  const notLoadable = useMemo(() => new Set(kvm?.notLoadableKeys || []), [kvm])

  // Buscar → filtrar → ordenar. El paginado se aplica después, sobre el resultado.
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()

    const matches = entry => {
      if (!needle) return true
      const name = entry.name.toLowerCase()
      const value = entry.value.toLowerCase()
      if (searchField === 'llave') return name.includes(needle)
      if (searchField === 'valor') return value.includes(needle)
      return name.includes(needle) || value.includes(needle)
    }

    const rows = entries.filter(e => matches(e) && VALUE_FILTERS[valueFilter](e))
    const factor = sort.dir === 'asc' ? 1 : -1

    return [...rows].sort(
      (a, b) => factor * a[sort.column].localeCompare(b[sort.column], 'es', { numeric: true })
    )
  }, [entries, search, searchField, valueFilter, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  // Cambiar de filtro con la vista en la última página dejaría la tabla vacía.
  useEffect(() => { setPage(0) }, [search, searchField, valueFilter, pageSize])

  const toggleSort = column =>
    setSort(prev => ({
      column,
      dir: prev.column === column && prev.dir === 'asc' ? 'desc' : 'asc',
    }))

  const visibleNames = visible.map(e => e.name)
  const allVisibleSelected = visibleNames.length > 0 && visibleNames.every(n => selected.has(n))

  const toggleOne = name => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })

  const toggleAllVisible = () => setSelected(prev => {
    const next = new Set(prev)
    if (allVisibleSelected) visibleNames.forEach(n => next.delete(n))
    else visibleNames.forEach(n => next.add(n))
    return next
  })

  const exitSelection = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  // ── Acciones ──

  const saveDraft = async () => {
    const ok = await run(
      () => createEntry(scope, environment, kvm.name, {
        name: draft.name.trim(),
        value: draft.value,
      }),
      `Llave "${draft.name.trim()}" agregada.`
    )
    if (ok) setDraft(null)
  }

  const saveEditing = async () => {
    const ok = await run(
      () => updateEntry(scope, environment, kvm.name, editing.original, {
        name: editing.name.trim(),
        value: editing.value,
      }),
      `Llave "${editing.name.trim()}" actualizada.`
    )
    if (ok) setEditing(null)
  }

  const confirmDelete = async () => {
    const names = pendingDelete
    const ok = names.length === 1
      ? await run(
          () => deleteEntry(scope, environment, kvm.name, names[0]),
          `Llave "${names[0]}" eliminada.`
        )
      // El borrado múltiple va en una sola escritura para no encadenar
      // sincronizaciones con el emulador.
      : await run(
          () => updateKvm(scope, environment, kvm.name, {
            entries: entries.filter(e => !names.includes(e.name)),
          }),
          `${names.length} llaves eliminadas.`
        )

    if (ok) {
      exitSelection()
      setPendingDelete(null)
    }
  }

  const saveProperties = async () => {
    const ok = await run(
      () => updateKvm(scope, environment, kvm.name, {
        name: renaming.name.trim(),
        encrypted: renaming.encrypted,
      }),
      'Propiedades del KVM actualizadas.'
    )
    if (ok) {
      const finalName = renaming.name.trim()
      setRenaming(null)
      if (finalName !== kvm.name) {
        navigate(`/kvm/${encodeURIComponent(finalName)}?scope=${scope}`, { replace: true })
      }
    }
  }

  const copyValue = async value => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice('Valor copiado al portapapeles.')
    } catch {
      setError('El navegador no permitió copiar al portapapeles.')
    }
  }

  const maskValue = value => (kvm?.encrypted && !reveal ? MASK : value)

  if (loading) {
    return <div className={s.state}>Cargando Key Value Map…</div>
  }

  if (!kvm) {
    return (
      <div className={s.state}>
        <div className={s.banner} data-tone="error">
          <IconWarning size={15} /> <span>{error || `No se encontró el KVM "${kvmName}".`}</span>
        </div>
        <button className={s.btnGhost} onClick={() => navigate('/kvm')}>Volver a la lista</button>
      </div>
    )
  }

  // Mientras se seleccionan filas, editar o borrar una suelta confunde: la
  // acción visible en ese momento es la del bloque.
  const editingLocked = busy || Boolean(draft) || selecting

  return (
    <div>
      {/* ── Cabecera ── */}
      <nav className={s.breadcrumb}>
        <button className={s.crumbLink} onClick={() => navigate('/kvm')}>Key Value Maps</button>
        <IconChevronRight size={13} />
        <span className={s.crumbCurrent}>{kvm.name}</span>
      </nav>

      <div className={s.header}>
        <div className={s.headerMain}>
          <span className={s.headerIcon}><IconKVM size={20} /></span>
          <div>
            {renaming ? (
              <div className={s.renameRow}>
                <input
                  className={s.input}
                  value={renaming.name}
                  onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
                  aria-label="Nombre del KVM"
                  autoFocus
                />
                <label className={s.inlineCheck}>
                  <input
                    type="checkbox"
                    className={s.checkbox}
                    checked={renaming.encrypted}
                    onChange={e => setRenaming(r => ({ ...r, encrypted: e.target.checked }))}
                  />
                  Cifrado
                </label>
                <button className={s.btnPrimary} onClick={saveProperties} disabled={busy}>
                  <IconCheck size={13} /> Guardar
                </button>
                <button className={s.btnGhost} onClick={() => setRenaming(null)} disabled={busy}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className={s.titleRow}>
                <h1 className={s.title}>{kvm.name}</h1>
                <button
                  className={s.iconAction}
                  title="Editar propiedades del KVM"
                  aria-label="Editar propiedades del KVM"
                  onClick={() => setRenaming({ name: kvm.name, encrypted: kvm.encrypted })}
                >
                  <IconEdit size={14} />
                </button>
              </div>
            )}
            <p className={s.sourcePath}><code>{kvm.source}</code></p>
          </div>
        </div>

        <div className={s.headerActions}>
          <button className={s.btnGhost} onClick={load} disabled={busy}>
            <IconRefresh size={14} /> Recargar
          </button>
          <button
            className={s.btnPrimary}
            onClick={() => { setEditing(null); setDraft({ name: '', value: '' }) }}
            disabled={busy || Boolean(draft) || selecting}
          >
            <IconPlus size={14} /> Nueva llave
          </button>
        </div>
      </div>

      {/* ── Metadatos reales del KVM ── */}
      <div className={s.metaGrid}>
        <div className={s.metaCard}>
          <span className={s.metaLabel}>Scope</span>
          <span className={s.metaValue}><ScopeBadge scope={kvm.scope} /></span>
          <span className={s.metaHint}>{kvm.environment || 'toda la organización'}</span>
        </div>
        <div className={s.metaCard}>
          <span className={s.metaLabel}>Cifrado</span>
          <span className={s.metaValue}>{kvm.encrypted ? '🔒 Sí' : '🔓 No'}</span>
          <span className={s.metaHint}>
            {kvm.encrypted ? 'valores enmascarados en la tabla' : 'valores visibles'}
          </span>
        </div>
        <div className={s.metaCard}>
          <span className={s.metaLabel}>Entradas</span>
          <span className={s.metaValue}>{kvm.entryCount}</span>
          <span className={s.metaHint}>llaves en el mapa</span>
        </div>
        <div className={s.metaCard}>
          <span className={s.metaLabel}>Última modificación</span>
          <span className={s.metaValueSmall}>{formatDate(kvm.lastModifiedAt)}</span>
          <span className={s.metaHint}>creado {formatDate(kvm.createdAt)}</span>
        </div>
      </div>

      {notLoadable.size > 0 && (
        <div className={s.banner} data-tone="warn">
          <IconWarning size={15} />
          <span>
            {notLoadable.size} de las {entries.length} llaves están en el workspace pero el
            emulador no las puede cargar: su nombre lleva “/” o tiene menos de dos caracteres.
            Las políticas locales no las verán; en Apigee Edge siguen intactas.
          </span>
        </div>
      )}

      {error && (
        <div className={s.banner} data-tone="error">
          <IconWarning size={15} /> <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className={s.banner} data-tone="ok">
          <IconCheck size={15} /> <span>{notice}</span>
        </div>
      )}

      {/* ── Tabla de llaves ── */}
      <div className={s.card}>
        <div className={s.toolbar}>
          <div className={s.searchGroup}>
            <div className={s.searchWrap}>
              <span className={s.searchIcon}>🔍</span>
              <input
                className={s.searchInput}
                placeholder="Buscar llave o valor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className={s.clearBtn} onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
                  <IconX size={13} />
                </button>
              )}
            </div>
            <select
              className={s.select}
              value={searchField}
              onChange={e => setSearchField(e.target.value)}
              aria-label="Columna donde buscar"
            >
              <option value="todo">Todas las columnas</option>
              <option value="llave">Solo llave</option>
              <option value="valor">Solo valor</option>
            </select>
            <select
              className={s.select}
              value={valueFilter}
              onChange={e => setValueFilter(e.target.value)}
              aria-label="Filtrar por valor"
            >
              <option value="todas">Todas las filas</option>
              <option value="con-valor">Con valor</option>
              <option value="vacias">Valor vacío</option>
            </select>
          </div>

          <div className={s.toolbarRight}>
            {selecting ? (
              <>
                <span className={s.countLabel}>{selected.size} seleccionadas</span>
                <button
                  className={s.btnDanger}
                  disabled={selected.size === 0 || busy}
                  onClick={() => setPendingDelete([...selected])}
                >
                  <IconTrash size={13} /> Eliminar ({selected.size})
                </button>
                <button
                  className={s.btnDanger}
                  disabled={entries.length === 0 || busy}
                  onClick={() => setPendingDelete(entries.map(e => e.name))}
                >
                  <IconTrash size={13} /> Eliminar todas
                </button>
                <button className={s.btnGhostSm} onClick={exitSelection}>
                  <IconX size={13} /> Cancelar
                </button>
              </>
            ) : (
              <>
                {kvm.encrypted && (
                  <button className={s.btnGhost} onClick={() => setReveal(r => !r)}>
                    {reveal ? 'Ocultar valores' : 'Mostrar valores'}
                  </button>
                )}
                <button
                  className={s.btnGhost}
                  onClick={() => { setEditing(null); setDraft(null); setSelecting(true) }}
                  disabled={entries.length === 0}
                >
                  Seleccionar
                </button>
                <span className={s.countLabel}>
                  {filtered.length} de {entries.length} llaves
                </span>
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
                      aria-label="Seleccionar las llaves visibles"
                    />
                  </th>
                )}
                <th>
                  <button className={s.sortBtn} onClick={() => toggleSort('name')}>
                    Llave <SortMark active={sort.column === 'name'} dir={sort.dir} />
                  </button>
                </th>
                <th>
                  <button className={s.sortBtn} onClick={() => toggleSort('value')}>
                    Valor <SortMark active={sort.column === 'value'} dir={sort.dir} />
                  </button>
                </th>
                <th className={s.actionsHead}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {draft && (
                <tr className={s.draftRow}>
                  {selecting && <td className={s.checkCell} />}
                  <td>
                    <input
                      className={s.cellInput}
                      value={draft.name}
                      onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="nombre de la llave"
                      autoFocus
                      onKeyDown={e => e.key === 'Escape' && setDraft(null)}
                    />
                  </td>
                  <td>
                    <input
                      className={s.cellInput}
                      value={draft.value}
                      onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
                      placeholder="valor"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && draft.name.trim()) saveDraft()
                        if (e.key === 'Escape') setDraft(null)
                      }}
                    />
                  </td>
                  <td>
                    <div className={s.actionCell}>
                      <button
                        className={s.btnPrimarySm}
                        onClick={saveDraft}
                        disabled={busy || !draft.name.trim()}
                      >
                        <IconCheck size={13} /> Guardar
                      </button>
                      <button className={s.btnGhostSm} onClick={() => setDraft(null)} disabled={busy}>
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {visible.length === 0 && !draft ? (
                <tr>
                  <td colSpan={selecting ? 4 : 3} className={s.empty}>
                    {entries.length === 0
                      ? 'Este KVM todavía no tiene llaves. Usa “Nueva llave” para agregar la primera.'
                      : 'Ninguna llave coincide con la búsqueda.'}
                  </td>
                </tr>
              ) : visible.map(entry => {
                const isEditing = editing?.original === entry.name
                return (
                  <tr
                    key={entry.name}
                    className={selecting && selected.has(entry.name) ? s.rowSelected : ''}
                  >
                    {selecting && (
                      <td className={s.checkCell}>
                        <input
                          type="checkbox"
                          className={s.checkbox}
                          checked={selected.has(entry.name)}
                          onChange={() => toggleOne(entry.name)}
                          disabled={isEditing}
                          aria-label={`Seleccionar ${entry.name}`}
                        />
                      </td>
                    )}
                    <td>
                      {isEditing ? (
                        <input
                          className={s.cellInput}
                          value={editing.name}
                          onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
                          autoFocus
                          onKeyDown={e => e.key === 'Escape' && setEditing(null)}
                        />
                      ) : (
                        <span className={s.keyName}>
                          {entry.name}
                          {notLoadable.has(entry.name) && (
                            <span
                              className={s.offRuntime}
                              title="El emulador no puede cargar esta llave: su nombre lleva “/” o tiene menos de dos caracteres. Está en el workspace, pero las políticas locales no la verán."
                            >
                              sin runtime
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={s.valueCell}>
                      {isEditing ? (
                        <input
                          className={s.cellInput}
                          value={editing.value}
                          onChange={e => setEditing(v => ({ ...v, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && editing.name.trim()) saveEditing()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                        />
                      ) : (
                        <span className={entry.value ? s.value : s.valueEmpty}>
                          {entry.value ? maskValue(entry.value) : 'vacío'}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className={s.actionCell}>
                        {isEditing ? (
                          <>
                            <button
                              className={s.btnPrimarySm}
                              onClick={saveEditing}
                              disabled={busy || !editing.name.trim()}
                            >
                              <IconCheck size={13} /> Guardar
                            </button>
                            <button
                              className={s.btnGhostSm}
                              onClick={() => setEditing(null)}
                              disabled={busy}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={s.iconAction}
                              title={`Editar ${entry.name}`}
                              aria-label={`Editar ${entry.name}`}
                              disabled={editingLocked}
                              onClick={() =>
                                setEditing({
                                  original: entry.name,
                                  name: entry.name,
                                  value: entry.value,
                                })
                              }
                            >
                              <IconEdit size={15} />
                            </button>
                            <button
                              className={s.iconAction}
                              title="Copiar valor"
                              aria-label={`Copiar el valor de ${entry.name}`}
                              onClick={() => copyValue(entry.value)}
                            >
                              <IconCopy size={15} />
                            </button>
                            <button
                              className={`${s.iconAction} ${s.iconActionDanger}`}
                              title={`Eliminar ${entry.name}`}
                              aria-label={`Eliminar ${entry.name}`}
                              disabled={editingLocked}
                              onClick={() => setPendingDelete([entry.name])}
                            >
                              <IconTrash size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className={s.pager}>
          <label className={s.pageSize}>
            Filas por página
            <select
              className={s.select}
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className={s.pagerNav}>
            <span className={s.countLabel}>Página {safePage + 1} de {pageCount}</span>
            <button
              className={s.btnGhostSm}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              Anterior
            </button>
            <button
              className={s.btnGhostSm}
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={pendingDelete?.length === 1 ? 'Eliminar llave' : 'Eliminar llaves'}
        confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      >
        {pendingDelete?.length === 1 ? (
          <>Se eliminará la llave <strong>{pendingDelete[0]}</strong> del KVM
          <strong> {kvm.name}</strong> y se recargará el mapa en el emulador.</>
        ) : (
          <>Se eliminarán <strong>{pendingDelete?.length} llaves</strong> del KVM
          <strong> {kvm.name}</strong> y se recargará el mapa en el emulador.</>
        )}
      </ConfirmDialog>
    </div>
  )
}

/** Indicador de orden de la columna. */
function SortMark({ active, dir }) {
  if (!active) return <span className={s.sortIdle}>↕</span>
  return <span className={s.sortActive}>{dir === 'asc' ? '↑' : '↓'}</span>
}

export default KeyValueMapDetail
