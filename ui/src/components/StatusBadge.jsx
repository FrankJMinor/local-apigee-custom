import styles from './StatusBadge.module.css'

const STATE_CONFIG = {
  deployed:   { label: 'Activo',    variant: 'solid',   icon: '◎' },
  undeployed: { label: 'Inactivo',  variant: 'outline', icon: '○' },
  pending:    { label: 'Pendiente', variant: 'pending', icon: '◷' },
  error:      { label: 'Error',     variant: 'error',   icon: '⊗' },
}

const SCOPE_CONFIG = {
  organization: { label: 'Organización', variant: 'org' },
  environment:  { label: 'Entorno',      variant: 'env' },
  proxy:        { label: 'Proxy',        variant: 'proxy' },
}

export function StatusBadge({ status }) { // NOSONAR S6774
  const key  = (status || '').toLowerCase()
  const cfg  = STATE_CONFIG[key] || { label: status || '-', variant: 'outline', icon: '○' }
  const cls  = styles[`v_${cfg.variant}`]
  return (
    <span className={`${styles.badge} ${cls}`}>
      <span className={styles.icon}>{cfg.icon}</span>{cfg.label}
    </span>
  )
}

export function ScopeBadge({ scope }) { // NOSONAR S6774
  const key = (scope || '').toLowerCase()
  const cfg = SCOPE_CONFIG[key] || { label: scope || '-', variant: 'proxy' }
  const cls = styles[`s_${cfg.variant}`]
  return <span className={`${styles.scope} ${cls}`}>{cfg.label}</span>
}
