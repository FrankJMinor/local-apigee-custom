import { Link, useLocation } from 'react-router-dom'
import {
  IconLogo, IconDashboard, IconProxies,
  IconFlows, IconKVM, IconSettings, IconTrace,
} from './Icons'
import styles from './Sidebar.module.css'

const NAV = [
  { path: '/',             label: 'Dashboard',      Icon: IconDashboard },
  { section: 'DEVELOP' },
  { path: '/proxies',      label: 'API Proxies',    Icon: IconProxies },
  { path: '/shared-flows', label: 'Shared Flows',   Icon: IconFlows },
  { section: 'ADMIN' },
  { path: '/kvm',          label: 'Key Value Maps', Icon: IconKVM },
  { path: '/config',       label: 'Configuración',  Icon: IconSettings },
  { section: 'HERRAMIENTAS' },
  { path: '/trace',        label: 'Trace Analyzer', Icon: IconTrace },
]

export function Sidebar() {
  const { pathname } = useLocation()
  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <IconLogo size={36} />
        <div>
          <div className={styles.logoName}>API Manager</div>
          <div className={styles.logoSub}>Apigee Console</div>
        </div>
      </div>

      <div className={styles.nav}>
        {NAV.map((item, i) =>
          item.section ? (
            <p key={i} className={styles.section}>{item.section}</p>
          ) : (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}
            >
              <item.Icon size={16} />
              {item.label}
            </Link>
          )
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerLabel}>Entorno</span>
        <span className={styles.footerEnv}>prod-environment</span>
      </div>
    </nav>
  )
}
