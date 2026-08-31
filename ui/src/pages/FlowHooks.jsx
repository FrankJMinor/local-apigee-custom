import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { IconRefresh, IconWarning, IconCheck, IconInfo, IconFlows } from '../components/Icons'
import { fetchFlowHooks, saveFlowHooks } from '../utils/flowHookApi'
import s from './table.module.css'
import f from './FlowHooks.module.css'

const SIN_ASIGNAR = ''

function FlowHooks() {
  const [environment, setEnvironment] = useState('')
  const [source, setSource] = useState('')
  const [sharedFlows, setSharedFlows] = useState([])
  const [saved, setSaved] = useState([])
  const [hooks, setHooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setNotice('')
    fetchFlowHooks()
      .then(data => {
        setEnvironment(data.environment)
        setSource(data.source)
        setSharedFlows(data.sharedFlows || [])
        setSaved(data.flowHooks || [])
        setHooks(data.flowHooks || [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Como en la consola de Edge, se edita en local y se guarda todo de una vez.
  const dirty = useMemo(() => {
    const limpio = list => JSON.stringify(list.map(h => [h.name, h.sharedFlow]))
    return limpio(hooks) !== limpio(saved)
  }, [hooks, saved])

  const assign = (name, sharedFlow) =>
    setHooks(prev => prev.map(h => (h.name === name ? { ...h, sharedFlow } : h)))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await saveFlowHooks(
        hooks.map(({ name, sharedFlow, continueOnError }) => ({
          name,
          sharedFlow,
          continueOnError,
        })),
        environment
      )
      setSharedFlows(result.sharedFlows || [])
      setSaved(result.flowHooks || [])
      setHooks(result.flowHooks || [])
      const asignados = (result.flowHooks || []).filter(h => h.sharedFlow).length
      setNotice(
        `Guardado y desplegado en la revisión ${result.revision}: ` +
        `${asignados} de 4 ganchos asignados.`
      )
    } catch (err) {
      setError(
        err.reverted
          ? `${err.message} Los flow hooks se dejaron como estaban.`
          : err.message
      )
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setHooks(saved)
    setError('')
    setNotice('')
  }

  const huerfanos = hooks.filter(h => h.missing && h.sharedFlow)

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Flow Hooks</h1>
          <p className={s.pageSub}>
            Shared flows que se ejecutan en todos los proxies del environment
            {environment ? ` ${environment}` : ''}
            {source ? <> — <code className={f.source}>{source}</code></> : ''}
          </p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={load} disabled={loading || saving}>
            <IconRefresh size={14} /> {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className={f.banner} data-tone="info">
        <IconInfo size={15} />
        <span>
          Los flow hooks sí los aplica el emulador: se compilan dentro del contrato, así que
          guardar aquí <strong>redespliega</strong> el workspace. Solo se pueden enganchar shared
          flows desplegados; si eliges uno que no lo está, el contrato se rechazaría.
        </span>
      </div>

      {error && (
        <div className={f.banner} data-tone="error">
          <IconWarning size={15} /> <span>{error}</span>
        </div>
      )}

      {notice && !error && (
        <div className={f.banner} data-tone="ok">
          <IconCheck size={15} /> <span>{notice}</span>
        </div>
      )}

      {huerfanos.length > 0 && (
        <div className={f.banner} data-tone="warn">
          <IconWarning size={15} />
          <span>
            {huerfanos.length === 1 ? 'Un gancho apunta' : `${huerfanos.length} ganchos apuntan`} a
            un shared flow que ya no está desplegado
            ({huerfanos.map(h => h.sharedFlow).join(', ')}). El archivo lo conserva, pero el
            próximo despliegue lo rechazaría.
          </span>
        </div>
      )}

      {!loading && sharedFlows.length === 0 && (
        <div className={f.banner} data-tone="warn">
          <IconWarning size={15} />
          <span>
            No hay shared flows desplegados en el emulador. Importa uno desde{' '}
            <Link to="/shared-flows" className={f.inlineLink}>Shared Flows</Link> para poder
            engancharlo.
          </span>
        </div>
      )}

      <div className={s.card}>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={f.colHook}>Flow Hook</th>
                <th>Shared Flow</th>
              </tr>
            </thead>
            <tbody>
              {hooks.length === 0 ? (
                <tr>
                  <td colSpan={2} className={s.empty}>
                    {loading ? 'Cargando…' : 'No se pudo leer la configuración.'}
                  </td>
                </tr>
              ) : hooks.map(hook => (
                <tr key={hook.name}>
                  <td>
                    <span className={f.hookName}>
                      <IconFlows size={14} /> {hook.label}
                    </span>
                    <span className={f.hookPoint}>{hook.name}</span>
                  </td>
                  <td>
                    <select
                      className={`${f.select} ${hook.missing && hook.sharedFlow ? f.selectMissing : ''}`}
                      value={hook.sharedFlow}
                      onChange={e => assign(hook.name, e.target.value)}
                      disabled={saving}
                      aria-label={`Shared flow de ${hook.label}`}
                    >
                      <option value={SIN_ASIGNAR}>— Sin asignar —</option>
                      {/* Un gancho puede apuntar a un flow ya borrado: se mantiene
                          en la lista para no perderlo al abrir la pantalla. */}
                      {hook.sharedFlow && !sharedFlows.includes(hook.sharedFlow) && (
                        <option value={hook.sharedFlow}>
                          {hook.sharedFlow} (no desplegado)
                        </option>
                      )}
                      {sharedFlows.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={f.footer}>
          <span className={f.footerHint}>
            {dirty
              ? 'Al guardar se escribe el archivo y se redespliega el contrato.'
              : `${saved.filter(h => h.sharedFlow).length} de 4 ganchos asignados.`}
          </span>
          <div className={f.footerActions}>
            <button className={s.btnSecondary} onClick={handleCancel} disabled={!dirty || saving}>
              Cancelar
            </button>
            <button className={s.btnPrimary} onClick={handleSave} disabled={!dirty || saving}>
              {saving ? 'Guardando y desplegando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FlowHooks
