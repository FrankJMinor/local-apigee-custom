import { useState, useRef, useCallback, useEffect } from 'react'
import PropTypes from 'prop-types'
import { IconX, IconUpload, IconCheck } from './Icons'
import { importProxyBundle, ARTIFACT_KINDS } from '../utils/importProxyBundle'
import s from './NewProxyModal.module.css'

const STEPS = ['Tipo', 'Detalles', 'Construir', 'Resumen']

// Mismo catálogo que muestra el asistente "Build a Proxy" de Apigee. Por ahora
// el emulador local solo admite la importación de bundles ya construidos.
const TYPES_BY_KIND = {
  proxy: [
    {
      id: 'reverse',
      name: 'Reverse proxy (el más común)',
      desc: 'Enruta las peticiones entrantes hacia un servicio backend.',
      enabled: false,
    },
    {
      id: 'soap',
      name: 'SOAP service',
      desc: 'Crea un proxy REST o pass-through para un servicio SOAP.',
      enabled: false,
    },
    {
      id: 'notarget',
      name: 'No Target',
      desc: 'Crea un proxy simple que no enruta a ningún backend.',
      enabled: false,
    },
    {
      id: 'bundle',
      name: 'Proxy bundle',
      desc: 'Importa un proxy existente desde un archivo ZIP.',
      enabled: true,
    },
  ],
  sharedflow: [
    {
      id: 'blank',
      name: 'Shared flow vacío',
      desc: 'Crea un shared flow sin políticas para empezar desde cero.',
      enabled: false,
    },
    {
      id: 'bundle',
      name: 'Shared flow bundle',
      desc: 'Importa un shared flow existente desde un archivo ZIP.',
      enabled: true,
    },
  ],
}

// Misma restricción que aplica la consola de Apigee al nombre del proxy.
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/

const INITIAL = {
  step: 0,
  type: 'bundle',
  file: null,
  name: '',
  overwrite: false,
  error: null,
  result: null,
}

export function NewProxyModal({ isOpen, onClose, onCreated, onOpenProxy, kind = ARTIFACT_KINDS.proxy }) {
  const { labels } = kind
  const PROXY_TYPES = TYPES_BY_KIND[kind.key]
  const [state, setState] = useState(INITIAL)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef(null)

  const patch = useCallback(updates => setState(prev => ({ ...prev, ...updates })), [])

  // Cada apertura arranca el asistente desde cero.
  useEffect(() => {
    if (isOpen) {
      setState(INITIAL)
      setBusy(false)
    }
  }, [isOpen])

  // Escape cierra el asistente, salvo mientras se está desplegando.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, busy, onClose])

  if (!isOpen) return null

  const { step, type, file, name, overwrite, error, result } = state

  const handleFile = e => {
    const picked = e.target.files?.[0] || null
    if (!picked) return
    // Apigee propone el nombre del archivo como nombre del proxy; sigue siendo editable.
    const suggested = picked.name.replace(/\.zip$/i, '')
    patch({ file: picked, name: name || suggested, error: null })
  }

  const nameError = name && !NAME_PATTERN.test(name)
    ? 'Solo se permiten letras, números, guion (-) y guion bajo (_).'
    : null

  const canContinue = step === 0
    ? Boolean(type)
    : step === 1
      ? Boolean(file) && Boolean(name) && !nameError
      : true

  const build = async () => {
    setBusy(true)
    patch({ error: null })
    try {
      const data = await importProxyBundle({ file, name, overwrite, kind })
      patch({ step: 3, result: data, error: null })
      onCreated?.(data)
    } catch (err) {
      patch({ error: { message: err.message, detail: err.detail } })
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    if (step === 2) return build()
    patch({ step: step + 1, error: null })
  }

  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={labels.titleNew}>
        <div className={s.header}>
          <div>
            <div className={s.title}>{labels.titleNew}</div>
            <div className={s.subtitle}>{labels.subtitleNew}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose} disabled={busy} aria-label="Cerrar">
            <IconX size={18} />
          </button>
        </div>

        <div className={s.stepper}>
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`${s.step} ${i === step ? s.stepActive : ''} ${i < step ? s.stepDone : ''}`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className={s.body}>
          {step === 0 && (
            <>
              <p className={s.sectionLead}>{labels.lead}</p>
              <div className={s.typeList}>
                {PROXY_TYPES.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!option.enabled}
                    className={`${s.typeCard} ${type === option.id ? s.typeCardSelected : ''}`}
                    onClick={() => patch({ type: option.id })}
                  >
                    <span className={`${s.radio} ${type === option.id ? s.radioOn : ''}`} />
                    <span>
                      <span className={s.typeName}>
                        {option.name}
                        {!option.enabled && <span className={s.soonTag}>Próximamente</span>}
                      </span>
                      <span className={s.typeDesc}>{option.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className={s.sectionLead}>{`Especifica los detalles del ${labels.one}.`}</p>

              <div className={s.field}>
                <label className={s.label}>
                  ZIP Bundle<span className={s.required}>*</span>
                </label>
                <div className={s.filePicker}>
                  <button
                    type="button"
                    className={s.fileBtn}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconUpload size={14} /> Seleccionar archivo
                  </button>
                  {file
                    ? <span className={s.fileName}>{file.name} ({Math.ceil(file.size / 1024)} KB)</span>
                    : <span className={s.fileEmpty}>Ningún archivo seleccionado</span>}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className={s.hiddenInput}
                    onChange={handleFile}
                  />
                </div>
                <p className={s.hint}>
                  El ZIP debe contener la carpeta <code>{kind.bundleRoot}</code> en su raíz.
                </p>
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="proxy-name">
                  {labels.nameField}<span className={s.required}>*</span>
                </label>
                <input
                  id="proxy-name"
                  className={s.input}
                  value={name}
                  autoComplete="off"
                  onChange={e => patch({ name: e.target.value, error: null })}
                />
                <p className={s.hint} style={nameError ? { color: '#ef4444' } : undefined}>
                  {nameError || 'Los caracteres válidos son letras, números, guion (-) y guion bajo (_).'}
                </p>
              </div>

              <label className={s.checkboxRow}>
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={e => patch({ overwrite: e.target.checked })}
                />
                {`Sobrescribir si ya existe un ${labels.one} con ese nombre`}
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <p className={s.sectionLead}>{`Todo listo para construir tu ${labels.one}.`}</p>
              <div className={s.summaryGrid}>
                <span className={s.summaryLabel}>{labels.nameField}</span>
                <span className={s.summaryValue}>{name}</span>
                <span className={s.summaryLabel}>Tipo</span>
                <span className={s.summaryValue}>{labels.typeName}</span>
                <span className={s.summaryLabel}>Zip Bundle</span>
                <span className={s.summaryValue}>{file?.name}</span>
                <span className={s.summaryLabel}>Sobrescribir</span>
                <span className={s.summaryValue}>{overwrite ? 'Sí' : 'No'}</span>
              </div>

              {error && (
                <div className={s.errorBox}>
                  <span>
                    {error.message}
                    {error.detail && <code className={s.errorDetail}>{error.detail}</code>}
                  </span>
                </div>
              )}
            </>
          )}

          {step === 3 && result && (
            <>
              <div className={s.successBanner}>
                <IconCheck size={16} /> {labels.successTitle}
              </div>
              <p className={s.resultText}>
                Abrir{' '}
                <button className={s.resultLink} onClick={() => onOpenProxy?.(result.name)}>
                  {result.name}
                </button>{' '}
                en el editor.
              </p>
              <div className={s.summaryGrid}>
                <span className={s.summaryLabel}>Revisión</span>
                <span className={s.summaryValue}>v{result.revision}</span>
                <span className={s.summaryLabel}>Environment</span>
                <span className={s.summaryValue}>{result.environment}</span>
                {kind.key === 'proxy' && (
                  <>
                    <span className={s.summaryLabel}>Basepaths</span>
                    <span className={s.summaryValue}>{result.basepaths?.join(', ') || '—'}</span>
                  </>
                )}
                <span className={s.summaryLabel}>{kind.key === 'proxy' ? 'Endpoints' : 'Flows'}</span>
                <span className={s.summaryValue}>{(result.proxies || result.flows)?.join(', ') || '—'}</span>
                <span className={s.summaryLabel}>Políticas</span>
                <span className={s.summaryValue}>{result.policies?.join(', ') || '—'}</span>
              </div>
            </>
          )}
        </div>

        <div className={s.footer}>
          <div className={s.footerSide}>
            {step > 0 && step < 3 && (
              <button className={`${s.btn} ${s.btnGhost}`} onClick={() => patch({ step: step - 1, error: null })} disabled={busy}>
                Anterior
              </button>
            )}
          </div>

          {step < 3 ? (
            <>
              <button className={`${s.btn} ${s.btnGhost}`} onClick={onClose} disabled={busy}>
                Salir sin guardar
              </button>
              <div className={`${s.footerSide} ${s.footerSideEnd}`}>
                <button className={`${s.btn} ${s.btnPrimary}`} onClick={next} disabled={!canContinue || busy}>
                  {busy && <span className={s.spinner} />}
                  {step === 2 ? (busy ? 'Desplegando…' : 'Construir') : 'Siguiente'}
                </button>
              </div>
            </>
          ) : (
            <div className={`${s.footerSide} ${s.footerSideEnd}`} style={{ marginLeft: 'auto' }}>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={onClose}>Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

NewProxyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func,
  onOpenProxy: PropTypes.func,
  kind: PropTypes.object,
}

export default NewProxyModal
