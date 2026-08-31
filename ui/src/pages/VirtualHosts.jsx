import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  IconRefresh, IconTrash, IconPlus, IconWarning, IconCheck, IconInfo, IconCloud,
} from '../components/Icons'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  fetchVirtualHosts, saveVirtualHosts, aliasesToText, textToAliases,
} from '../utils/virtualHostApi'
import s from './table.module.css'
import v from './VirtualHosts.module.css'

/** Filas listas para editar, con un id local estable mientras dura la edición. */
function toRows(hosts) {
  return hosts.map((host, index) => ({
    id: `${host.name}-${index}`,
    name: host.name,
    port: host.port,
    aliases: aliasesToText(host.hostAliases),
    ssl: host.ssl,
    urls: host.urls || [],
    isNew: false,
  }))
}

function VirtualHosts() {
  const [environment, setEnvironment] = useState('')
  const [source, setSource] = useState('')
  const [runtimeUrl, setRuntimeUrl] = useState('')
  const [saved, setSaved] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setNotice('')
    fetchVirtualHosts()
      .then(data => {
        setEnvironment(data.environment)
        setSource(data.source)
        setRuntimeUrl(data.localRuntimeUrl)
        setSaved(data.virtualHosts)
        setRows(toRows(data.virtualHosts))
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const dirty = useMemo(() => {
    const limpio = list => JSON.stringify(list.map(r => [r.name, r.port, r.aliases, r.ssl]))
    return limpio(rows) !== limpio(toRows(saved))
  }, [rows, saved])

  const patch = (id, changes) =>
    setRows(prev => prev.map(row => (row.id === id ? { ...row, ...changes } : row)))

  const addRow = () =>
    setRows(prev => [
      ...prev,
      {
        id: `nuevo-${Date.now()}`,
        name: '',
        port: '9001',
        aliases: '',
        ssl: true,
        urls: [],
        isNew: true,
      },
    ])

  const removeRow = row => {
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
      const result = await saveVirtualHosts(
        rows.map(({ name, port, aliases, ssl }) => ({
          name: name.trim(),
          port,
          hostAliases: textToAliases(aliases),
          ssl,
        })),
        environment
      )
      setSaved(result.virtualHosts)
      setRows(toRows(result.virtualHosts))
      setNotice(`${result.saved} virtual host(s) guardados en el workspace.`)
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

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Virtual Hosts</h1>
          <p className={s.pageSub}>
            Dominios y puertos por los que Apigee Edge publica los proxies del environment
            {environment ? ` ${environment}` : ''}
            {source ? <> — <code className={v.source}>{source}</code></> : ''}
          </p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={load} disabled={loading || saving}>
            <IconRefresh size={14} /> {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <button className={s.btnPrimary} onClick={addRow} disabled={saving}>
            <IconPlus size={14} /> Virtual Host
          </button>
        </div>
      </div>

      <div className={v.banner} data-tone="info">
        <IconInfo size={15} />
        <span>
          El emulador local no monta estos puertos: su contrato no tiene siquiera un campo para
          virtual hosts, y un <code>&lt;VirtualHost&gt;</code> dentro del{' '}
          <code>&lt;HTTPProxyConnection&gt;</code> de un proxy se ignora. En local{' '}
          <strong>todos los proxies responden en <code>{runtimeUrl || 'el runtime'}</code></strong>,
          sea cual sea el virtual host. Esta pantalla documenta el mapa real de Edge y sirve para
          traducir cada URL.
        </span>
      </div>

      {error && (
        <div className={v.banner} data-tone="error">
          <IconWarning size={15} /> <span>{error}</span>
        </div>
      )}

      {notice && !error && (
        <div className={v.banner} data-tone="ok">
          <IconCheck size={15} /> <span>{notice}</span>
        </div>
      )}

      <div className={s.card}>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={v.colName}>Nombre</th>
                <th className={v.colPort}>Puerto</th>
                <th className={v.colAlias}>Alias</th>
                <th className={v.colSsl}>SSL</th>
                <th className={v.colUrl}>URL de los proxies</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={s.empty}>
                    {loading
                      ? 'Cargando…'
                      : 'No hay virtual hosts configurados. Usa «+ Virtual Host» para agregar el primero.'}
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr key={row.id} className={row.isNew ? v.newRow : ''}>
                  <td>
                    <input
                      className={v.cellInput}
                      value={row.name}
                      onChange={e => patch(row.id, { name: e.target.value })}
                      placeholder="default"
                      aria-label="Nombre del virtual host"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      className={v.cellInput}
                      value={row.port}
                      onChange={e => patch(row.id, { port: e.target.value })}
                      aria-label={`Puerto de ${row.name || 'el virtual host nuevo'}`}
                    />
                  </td>
                  <td>
                    <input
                      className={v.cellInput}
                      value={row.aliases}
                      onChange={e => patch(row.id, { aliases: e.target.value })}
                      placeholder="api-dev.svamx.com"
                      aria-label={`Alias de ${row.name || 'el virtual host nuevo'}`}
                    />
                    <span className={v.hint}>Varios, separados por comas</span>
                  </td>
                  <td className={v.sslCell}>
                    <input
                      type="checkbox"
                      className={s.checkbox}
                      checked={row.ssl}
                      onChange={e => patch(row.id, { ssl: e.target.checked })}
                      aria-label={`SSL de ${row.name || 'el virtual host nuevo'}`}
                    />
                  </td>
                  <td>
                    {/* Se pinta a partir de lo que hay escrito, no de lo guardado,
                        para que se vea el efecto mientras se edita. */}
                    <UrlPreview aliases={row.aliases} ssl={row.ssl} />
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

        <div className={v.footer}>
          <span className={v.footerHint}>
            <IconCloud size={13} /> En local: <code>{runtimeUrl}/&lt;basepath&gt;</code>
          </span>
          <div className={v.footerActions}>
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
        title="Eliminar virtual host"
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

/** Las URL con las que se consumiría cada proxy a través de este virtual host. */
function UrlPreview({ aliases, ssl }) {
  const lista = textToAliases(aliases)

  if (lista.length === 0) {
    return <span className={v.urlEmpty}>—</span>
  }

  const scheme = ssl ? 'https' : 'http'

  return (
    <div className={v.urlList}>
      {lista.map(alias => (
        <code key={alias} className={v.url}>
          {scheme}://{alias}/&lt;basepath&gt;
        </code>
      ))}
    </div>
  )
}

export default VirtualHosts
