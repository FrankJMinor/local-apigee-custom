import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  IconRefresh, IconTrash, IconPlus, IconWarning, IconCheck, IconInfo, IconCache,
} from '../components/Icons'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatDate } from '../utils/format'
import {
  fetchCaches, saveCaches, defaultExpiryValue, toInputDate,
  EXPIRY_OPTIONS, EXPIRY_TIMEOUT, EXPIRY_TIME_OF_DAY, EXPIRY_DATE,
} from '../utils/cacheApi'
import s from './table.module.css'
import c from './Caches.module.css'

/** Filas listas para editar, con un id local estable mientras dura la edición. */
function toRows(caches) {
  return caches.map((item, index) => ({
    id: `${item.name}-${index}`,
    name: item.name,
    description: item.description,
    expiryType: item.expiryType,
    expiryValue: item.expiryValue,
    lastModifiedAt: item.lastModifiedAt,
    isNew: false,
  }))
}

function Caches() {
  const [environment, setEnvironment] = useState('')
  const [source, setSource] = useState('')
  const [saved, setSaved] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setNotice('')
    fetchCaches()
      .then(data => {
        setEnvironment(data.environment)
        setSource(data.source)
        setSaved(data.caches)
        setRows(toRows(data.caches))
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // La tabla se edita en local y se guarda entera, como el Save de la consola
  // de Edge. Se compara con lo cargado para saber si hay algo que guardar.
  const dirty = useMemo(() => {
    const limpio = list => JSON.stringify(
      list.map(r => [r.name, r.description || '', r.expiryType, r.expiryValue])
    )
    return limpio(rows) !== limpio(toRows(saved))
  }, [rows, saved])

  const patch = (id, changes) =>
    setRows(prev => prev.map(row => (row.id === id ? { ...row, ...changes } : row)))

  const changeType = (id, expiryType) =>
    patch(id, { expiryType, expiryValue: defaultExpiryValue(expiryType) })

  const addRow = () =>
    setRows(prev => [
      ...prev,
      {
        id: `nuevo-${Date.now()}`,
        name: '',
        description: '',
        expiryType: EXPIRY_TIMEOUT,
        expiryValue: '300',
        lastModifiedAt: null,
        isNew: true,
      },
    ])

  const removeRow = row => {
    // Una fila nueva todavía no existe en el archivo: se quita sin preguntar.
    if (row.isNew) {
      setRows(prev => prev.filter(r => r.id !== row.id))
      return
    }
    setPendingDelete(row)
  }

  const confirmRemove = () => {
    setRows(prev => prev.filter(r => r.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await saveCaches(
        rows.map(({ name, description, expiryType, expiryValue }) => ({
          name: name.trim(),
          description,
          expiryType,
          expiryValue,
        })),
        environment
      )
      setSaved(result.caches)
      setRows(toRows(result.caches))
      setNotice(`${result.saved} cache(s) guardados en el workspace.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setRows(toRows(saved))
    setError('')
    setNotice('')
  }

  const searchLower = search.trim().toLowerCase()
  const visible = rows.filter(row =>
    !searchLower ||
    [row.name, row.description, row.expiryValue].join(' ').toLowerCase().includes(searchLower)
  )

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Caches</h1>
          <p className={s.pageSub}>
            Configuración de caches del environment
            {environment ? ` ${environment}` : ''}
            {source ? <> — <code className={c.source}>{source}</code></> : ''}
          </p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={load} disabled={loading || saving}>
            <IconRefresh size={14} /> {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <button className={s.btnPrimary} onClick={addRow} disabled={saving}>
            <IconPlus size={14} /> Cache
          </button>
        </div>
      </div>

      <div className={c.banner} data-tone="info">
        <IconInfo size={15} />
        <span>
          El emulador local no aplica este archivo: crea los caches bajo demanda cuando una
          política <code>PopulateCache</code> o <code>LookupCache</code> los referencia. Esta
          configuración es la que exige Apigee Edge, versionada en Git y lista para promover.
        </span>
      </div>

      {error && (
        <div className={c.banner} data-tone="error">
          <IconWarning size={15} /> <span>{error}</span>
        </div>
      )}

      {notice && !error && (
        <div className={c.banner} data-tone="ok">
          <IconCheck size={15} /> <span>{notice}</span>
        </div>
      )}

      <div className={s.card}>
        <div className={s.tableBar}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon}>🔍</span>
            <input
              className={s.searchInput}
              placeholder="Buscar cache..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className={s.tableBarRight}>
            {dirty && <span className={c.dirtyPill}>Cambios sin guardar</span>}
            <span className={s.countLabel}>{visible.length} de {rows.length} caches</span>
          </div>
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={c.colName}>Nombre</th>
                <th className={c.colDescription}>Descripción</th>
                <th className={c.colType}>Tipo de caducidad</th>
                <th className={c.colExpiry}>Caducidad</th>
                <th className={c.colModified}>Modificado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className={s.empty}>
                    {loading
                      ? 'Cargando…'
                      : rows.length === 0
                        ? 'No hay caches configurados. Usa «+ Cache» para agregar el primero.'
                        : 'Ningún cache coincide con la búsqueda.'}
                  </td>
                </tr>
              ) : visible.map(row => (
                <tr key={row.id} className={row.isNew ? c.newRow : ''}>
                  <td>
                    {row.isNew ? (
                      <input
                        className={c.cellInput}
                        value={row.name}
                        onChange={e => patch(row.id, { name: e.target.value })}
                        placeholder="nombre-del-cache"
                        aria-label="Nombre del cache"
                      />
                    ) : (
                      // El nombre es la referencia que usan los <CacheResource>
                      // de las políticas: en Edge tampoco se puede cambiar.
                      <span className={c.cacheName}>
                        <IconCache size={14} /> {row.name}
                      </span>
                    )}
                  </td>
                  <td>
                    <input
                      className={c.cellInput}
                      value={row.description}
                      onChange={e => patch(row.id, { description: e.target.value })}
                      placeholder="Sin descripción"
                      aria-label={`Descripción de ${row.name || 'el cache nuevo'}`}
                    />
                  </td>
                  <td>
                    <select
                      className={c.cellSelect}
                      value={row.expiryType}
                      onChange={e => changeType(row.id, e.target.value)}
                      aria-label={`Tipo de caducidad de ${row.name || 'el cache nuevo'}`}
                    >
                      {EXPIRY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <ExpiryInput row={row} onChange={value => patch(row.id, { expiryValue: value })} />
                  </td>
                  <td className={s.dateCell}>
                    {row.isNew ? '—' : formatDate(row.lastModifiedAt)}
                  </td>
                  <td>
                    <button
                      className={`${s.iconAction} ${s.iconActionDanger}`}
                      onClick={() => removeRow(row)}
                      title={`Eliminar ${row.name || 'la fila nueva'}`}
                      aria-label={`Eliminar ${row.name || 'la fila nueva'}`}
                    >
                      <IconTrash size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={c.footer}>
          <span className={c.footerHint}>
            {dirty
              ? 'Los cambios se escriben en el workspace al guardar.'
              : 'No hay cambios pendientes.'}
          </span>
          <div className={c.footerActions}>
            <button className={s.btnSecondary} onClick={handleCancel} disabled={!dirty || saving}>
              Cancelar
            </button>
            <button className={s.btnPrimary} onClick={handleSave} disabled={!dirty || saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Eliminar cache"
        confirmLabel="Eliminar"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
      >
        Se quitará <strong>{pendingDelete?.name}</strong> de la tabla. El archivo del workspace
        no cambia hasta que pulses <strong>Guardar</strong>.
      </ConfirmDialog>
    </div>
  )
}

/** El control de caducidad cambia según el tipo, igual que en la consola de Edge. */
function ExpiryInput({ row, onChange }) {
  const etiqueta = `Caducidad de ${row.name || 'el cache nuevo'}`

  if (row.expiryType === EXPIRY_TIME_OF_DAY) {
    return (
      <input
        type="time"
        step="1"
        className={c.cellInput}
        value={row.expiryValue}
        onChange={e => onChange(e.target.value)}
        aria-label={etiqueta}
      />
    )
  }

  if (row.expiryType === EXPIRY_DATE) {
    return (
      <input
        type="date"
        className={c.cellInput}
        value={toInputDate(row.expiryValue)}
        onChange={e => onChange(e.target.value)}
        aria-label={etiqueta}
      />
    )
  }

  return (
    <span className={c.timeoutWrap}>
      <input
        type="number"
        min="1"
        className={c.cellInput}
        value={row.expiryValue}
        onChange={e => onChange(e.target.value)}
        aria-label={etiqueta}
      />
      <span className={c.unit}>seg</span>
    </span>
  )
}

export default Caches
