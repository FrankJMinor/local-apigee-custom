import { IconWarning, IconX } from './Icons'
import s from './ConfirmDialog.module.css'

/**
 * Diálogo de confirmación para acciones destructivas.
 *
 * @param {boolean} isOpen         Si se muestra.
 * @param {string}  title          Título del diálogo.
 * @param {string}  confirmLabel   Texto del botón de confirmación.
 * @param {boolean} busy           Bloquea los botones mientras corre la acción.
 * @param {Function} onCancel      Cierra sin hacer nada.
 * @param {Function} onConfirm     Ejecuta la acción.
 * @param {React.ReactNode} children Explicación de lo que va a pasar.
 */
export function ConfirmDialog({
  isOpen,
  title,
  confirmLabel = 'Confirmar',
  busy = false,
  onCancel,
  onConfirm,
  children,
}) {
  if (!isOpen) return null

  return (
    <div className={s.overlay} onClick={busy ? undefined : onCancel}>
      <div className={s.dialog} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.icon}><IconWarning size={17} /></span>
          <h2 className={s.title}>{title}</h2>
          <button
            className={s.closeBtn}
            onClick={onCancel}
            disabled={busy}
            aria-label="Cerrar"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className={s.body}>{children}</div>

        <div className={s.footer}>
          <button className={s.btnGhost} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className={s.btnDanger} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
