import { IconSettings } from '../components/Icons'
import s from './table.module.css'

function Configuracion() {
  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Configuración</h1>
          <p className={s.pageSub}>Ajustes generales del entorno local de Apigee.</p>
        </div>
      </div>
      <div className={s.card} style={{ padding: '3em', textAlign: 'center' }}>
        <IconSettings size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.8em' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95em' }}>
          Sección en construcción — disponible próximamente.
        </p>
      </div>
    </div>
  )
}

export default Configuracion
