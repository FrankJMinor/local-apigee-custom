import { useState, useEffect } from 'react'
import { IconX, IconWarning, IconCheck, IconCloud } from './Icons'
import { fetchEdgeEnvironments, importFromEdgeStreaming } from '../utils/kvmApi'
import s from './EdgeSyncModal.module.css'

// Qué hacer ante cada tipo de fallo que clasifica el backend.
const HINTS = {
  vpn: 'Comprueba que la VPN corporativa esté levantada: estos hosts no responden fuera de ella.',
  auth: 'Revisa el usuario y la contraseña. Si son correctos, pide que te habiliten permisos en este ambiente.',
  forbidden: 'Tu usuario está autenticado pero no tiene permiso de lectura sobre los KVM de este ambiente.',
  tls: 'El certificado lo emite una CA interna. Monta ese certificado y apunta APIGEE_EDGE_CA_BUNDLE, o deja APIGEE_EDGE_VERIFY_TLS=false.',
  notfound: 'Revisa la organización y el nombre del environment configurados en el backend.',
}

/**
 * Trae los Key Value Maps de la instalación real de Apigee Edge.
 *
 * Las credenciales se piden en cada sincronización y viven solo en el estado de
 * este componente mientras dura la llamada: no se guardan en localStorage ni en
 * el backend, así que no queda ninguna copia que proteger.
 */
export function EdgeSyncModal({ isOpen, environment, onClose, onImported }) {
  const [environments, setEnvironments] = useState([])
  const [edgeEnvironment, setEdgeEnvironment] = useState('dev')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(null)

  // Cada apertura empieza limpia: sobre todo la contraseña, que no debe
  // sobrevivir a un cierre del modal.
  useEffect(() => {
    if (!isOpen) {
      setPassword('')
      return
    }

    setUsername('')
    setPassword('')
    setReplace(false)
    setError(null)
    setResult(null)
    setProgress(null)
    setBusy(false)

    fetchEdgeEnvironments()
      .then(data => {
        setEnvironments(data.environments || [])
        const preferred = (data.environments || []).find(e => e.enabled)
        if (preferred) setEdgeEnvironment(preferred.key)
      })
      .catch(err => setError({ message: err.message }))
  }, [isOpen])

  if (!isOpen) return null

  const selected = environments.find(e => e.key === edgeEnvironment)

  const handleSubmit = async event => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress({ done: 0, total: 0, current: 'Listando los KVM del ambiente…' })

    try {
      const data = await importFromEdgeStreaming(
        { username: username.trim(), password, edgeEnvironment, replace, environment },
        p => setProgress({ ...p, phase: 'fetch' }),
        p => setProgress({ done: p.total, total: p.total, phase: 'write' })
      )
      // La contraseña deja de hacer falta en cuanto responde el backend.
      setPassword('')
      setResult(data)
      onImported?.(data)
    } catch (err) {
      setError({ message: err.message, kind: err.kind })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const percent = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className={s.overlay} onClick={busy ? undefined : onClose}>
      <form className={s.modal} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className={s.header}>
          <div>
            <div className={s.title}>Sincronizar con Apigee Edge</div>
            <div className={s.subtitle}>
              Trae los KVM del ambiente elegido al workspace y los carga en el emulador.
            </div>
          </div>
          <button
            type="button"
            className={s.closeBtn}
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            <IconX size={17} />
          </button>
        </div>

        <div className={s.body}>
          {progress && (
            <div className={s.progress}>
              <div className={s.progressHead}>
                <span>
                  {progress.phase === 'write'
                    ? 'Guardando en el workspace y cargando en el emulador…'
                    : progress.total
                      ? `Descargando KVM ${progress.done} de ${progress.total}`
                      : progress.current}
                </span>
                {progress.total > 0 && <span className={s.progressPct}>{percent}%</span>}
              </div>
              <div className={s.progressTrack}>
                <div
                  className={`${s.progressBar} ${progress.total ? '' : s.progressIndeterminate}`}
                  style={progress.total ? { width: `${percent}%` } : undefined}
                />
              </div>
              {progress.phase === 'fetch' && progress.total > 0 && (
                <div className={s.progressCurrent}>{progress.current}</div>
              )}
            </div>
          )}

          {error && (
            <div className={s.error}>
              <IconWarning size={15} />
              <div>
                <div>{error.message}</div>
                {HINTS[error.kind] && <div className={s.hintLine}>{HINTS[error.kind]}</div>}
              </div>
            </div>
          )}

          {result && (
            <div className={s.success}>
              <IconCheck size={15} />
              <div>
                <div>
                  <strong>{result.fetched}</strong> KVM leídos de Edge:{' '}
                  {result.created?.length || 0} nuevos, {result.updated?.length || 0} actualizados.
                </div>
                {result.masked?.length > 0 && (
                  <div className={s.hintLine}>
                    {result.masked.length} venían cifrados y Edge no expone sus valores; se
                    importaron enmascarados: {result.masked.join(', ')}.
                  </div>
                )}
                {result.collapsed?.length > 0 && (
                  <div className={s.hintLine}>
                    {result.collapsed.length} KVM traían llaves repetidas en Edge; se conservó el
                    último valor de cada una: {result.collapsed.map(m => m.map).join(', ')}.
                  </div>
                )}
                {result.notLoadable?.length > 0 && (
                  <div className={s.hintLine}>
                    Todo quedó guardado en el workspace. El emulador no puede cargar{' '}
                    {result.notLoadable.reduce((n, m) => n + m.keys.length, 0)} llave(s) de{' '}
                    {result.notLoadable.length} KVM porque su nombre lleva “/” o tiene menos de
                    dos caracteres: {result.notLoadable.map(m => m.map).join(', ')}.
                  </div>
                )}
                {result.skipped?.length > 0 && (
                  <div className={s.hintLine}>
                    {result.skipped.length} no se pudieron guardar:{' '}
                    {result.skipped.map(x => `${x.name} (${x.reason})`).join('; ')}
                  </div>
                )}
              </div>
            </div>
          )}

          <label className={s.field}>
            <span className={s.label}>Ambiente de Edge</span>
            <select
              className={s.input}
              value={edgeEnvironment}
              onChange={e => setEdgeEnvironment(e.target.value)}
              disabled={busy}
            >
              {environments.map(env => (
                <option key={env.key} value={env.key}>
                  {env.label}{env.enabled ? '' : ' — sin permisos aún'}
                </option>
              ))}
            </select>
            {selected && <span className={s.hint}>{selected.url}</span>}
          </label>

          {selected && !selected.enabled && (
            <div className={s.warning}>
              <IconWarning size={14} />
              <span>
                Este ambiente todavía no tiene permisos concedidos: es probable que devuelva
                401 hasta que los habiliten.
              </span>
            </div>
          )}

          <div className={s.grid}>
            <label className={s.field}>
              <span className={s.label}>Usuario</span>
              <input
                className={s.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="usuario@dominio.com"
                autoComplete="off"
                disabled={busy}
                required
              />
            </label>

            <label className={s.field}>
              <span className={s.label}>Contraseña</span>
              <input
                className={s.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="off"
                disabled={busy}
                required
              />
            </label>
          </div>

          <label className={s.checkRow}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={replace}
              onChange={e => setReplace(e.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>Reemplazar</strong>
              <span className={s.hint}>
                {' '}— deja solo lo que venga de Edge y descarta los KVM locales que no estén allí.
                Sin marcar, los locales se conservan y solo se actualizan los que coincidan.
              </span>
            </span>
          </label>

          <p className={s.note}>
            Las credenciales se usan para esta consulta y no se guardan en ningún sitio.
            Requiere la VPN corporativa levantada.
          </p>
        </div>

        <div className={s.footer}>
          <button type="button" className={s.btnGhost} onClick={onClose} disabled={busy}>
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            type="submit"
            className={s.btnPrimary}
            disabled={busy || !username.trim() || !password}
          >
            <IconCloud size={14} /> {busy ? 'Consultando Edge…' : 'Sincronizar'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default EdgeSyncModal
