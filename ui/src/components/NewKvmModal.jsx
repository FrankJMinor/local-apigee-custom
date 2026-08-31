import { useState, useEffect } from 'react'
import { IconX, IconPlus, IconTrash, IconWarning } from './Icons'
import { createKvm, SCOPE_OPTIONS, SCOPES } from '../utils/kvmApi'
import s from './NewKvmModal.module.css'

const BLANK_ENTRY = { name: '', value: '' }

/**
 * Alta de un Key Value Map, con sus entradas iniciales.
 *
 * El KVM se escribe en el `kvms.json` del scope elegido y se carga en el
 * emulador en la misma llamada, igual que hace Cloud Code al desplegar.
 */
export function NewKvmModal({ isOpen, environment, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState(SCOPES.environment)
  const [encrypted, setEncrypted] = useState(false)
  const [entries, setEntries] = useState([{ ...BLANK_ENTRY }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Cada apertura empieza limpia: si no, se arrastra lo que quedó del intento anterior.
  useEffect(() => {
    if (isOpen) {
      setName('')
      setScope(SCOPES.environment)
      setEncrypted(false)
      setEntries([{ ...BLANK_ENTRY }])
      setError('')
      setSaving(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const patchEntry = (index, field, value) =>
    setEntries(prev => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)))

  const handleSubmit = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')

    // Las filas vacías del formulario no viajan: son solo huecos de captura.
    const payload = entries.filter(e => e.name.trim()).map(e => ({
      name: e.name.trim(),
      value: e.value,
    }))

    try {
      const result = await createKvm({ name: name.trim(), scope, encrypted, entries: payload, environment })
      onCreated?.(result.keyValueMap)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className={s.overlay} onClick={saving ? undefined : onClose}>
      <form className={s.modal} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className={s.header}>
          <div>
            <div className={s.title}>Nuevo Key Value Map</div>
            <div className={s.subtitle}>
              Se guarda en el workspace y se carga en el emulador local.
            </div>
          </div>
          <button type="button" className={s.closeBtn} onClick={onClose} disabled={saving} aria-label="Cerrar">
            <IconX size={17} />
          </button>
        </div>

        <div className={s.body}>
          {error && (
            <div className={s.error}>
              <IconWarning size={15} /> <span>{error}</span>
            </div>
          )}

          <div className={s.grid}>
            <label className={s.field}>
              <span className={s.label}>Nombre del KVM</span>
              <input
                className={s.input}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="mi-kvm"
                autoFocus
                required
              />
              <span className={s.hint}>
                Mínimo dos caracteres, sin “/”.
              </span>
            </label>

            <label className={s.field}>
              <span className={s.label}>Scope</span>
              <select className={s.input} value={scope} onChange={e => setScope(e.target.value)}>
                {SCOPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className={s.hint}>
                {scope === SCOPES.environment
                  ? `environments/${environment || 'apigee-dev'}/kvms.json`
                  : 'organization/kvms.json'}
              </span>
            </label>
          </div>

          <label className={s.checkRow}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={encrypted}
              onChange={e => setEncrypted(e.target.checked)}
            />
            <span>
              <strong>Cifrado</strong>
              <span className={s.hint}> — la UI enmascara los valores al mostrarlos.</span>
            </span>
          </label>

          <div className={s.entriesHeader}>
            <span className={s.label}>Entradas iniciales</span>
            <button
              type="button"
              className={s.addBtn}
              onClick={() => setEntries(prev => [...prev, { ...BLANK_ENTRY }])}
            >
              <IconPlus size={13} /> Agregar llave
            </button>
          </div>

          <div className={s.entries}>
            {entries.map((entry, index) => (
              // Las filas todavía no tienen nombre (se está capturando), así que
              // la posición es el único identificador disponible.
              <div className={s.entryRow} key={index}>
                <input
                  className={s.input}
                  value={entry.name}
                  onChange={e => patchEntry(index, 'name', e.target.value)}
                  placeholder="llave"
                />
                <input
                  className={s.input}
                  value={entry.value}
                  onChange={e => patchEntry(index, 'value', e.target.value)}
                  placeholder="valor"
                />
                <button
                  type="button"
                  className={s.rowDelete}
                  onClick={() => setEntries(prev => prev.filter((_, i) => i !== index))}
                  disabled={entries.length === 1}
                  aria-label={`Quitar fila ${index + 1}`}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={s.footer}>
          <button type="button" className={s.btnGhost} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className={s.btnPrimary} disabled={saving || !name.trim()}>
            {saving ? 'Creando…' : 'Crear KVM'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default NewKvmModal
