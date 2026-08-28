import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { IconX, IconTrash, IconWarning } from './Icons'
import { deleteProxies } from '../utils/deleteProxies'
import s from './DeleteProxiesModal.module.css'

/**
 * Confirmación de borrado de proxies.
 *
 * Eliminar toca el workspace versionado en Git y el runtime del emulador, así que
 * se pide confirmación explícita y se enumera exactamente lo que se va a borrar.
 */
export function DeleteProxiesModal({ isOpen, proxies, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setBusy(false)
      setError(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, busy, onClose])

  if (!isOpen) return null

  const many = proxies.length > 1

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteProxies(proxies)
      onDeleted?.(result)
      onClose()
    } catch (e) {
      setError({ message: e.message, reverted: e.reverted })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label="Eliminar proxies">
        <div className={s.header}>
          <div className={s.headerIcon}><IconWarning size={18} /></div>
          <div>
            <div className={s.title}>
              {many ? `Eliminar ${proxies.length} proxies` : 'Eliminar proxy'}
            </div>
            <div className={s.subtitle}>Esta acción no se puede deshacer desde la UI.</div>
          </div>
          <button className={s.closeBtn} onClick={onClose} disabled={busy} aria-label="Cerrar">
            <IconX size={18} />
          </button>
        </div>

        <div className={s.body}>
          <p className={s.lead}>
            {many ? 'Se eliminarán estos proxies:' : 'Se eliminará este proxy:'}
          </p>

          <ul className={s.list}>
            {proxies.map(name => <li key={name} className={s.listItem}>{name}</li>)}
          </ul>

          <p className={s.note}>
            Se borran de <code>src/main/apigee/apiproxies/</code>, se desregistran del
            environment y se redespliega el emulador para que dejen de existir en el
            contenedor. Si tienes el proxy versionado en Git, podrás recuperarlo desde ahí.
          </p>

          {error && (
            <div className={s.errorBox}>
              <span>
                {error.message}
                {error.reverted && (
                  <span className={s.errorHint}>
                    Los proxies se restauraron: no se eliminó nada.
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className={s.footer}>
          <button className={`${s.btn} ${s.btnGhost}`} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={`${s.btn} ${s.btnDanger}`} onClick={confirm} disabled={busy}>
            {busy ? <><span className={s.spinner} /> Eliminando…</> : <><IconTrash size={14} /> Eliminar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

DeleteProxiesModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  proxies: PropTypes.arrayOf(PropTypes.string).isRequired,
  onClose: PropTypes.func.isRequired,
  onDeleted: PropTypes.func,
}

export default DeleteProxiesModal
