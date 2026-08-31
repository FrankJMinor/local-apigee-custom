import { Link, useLocation } from 'react-router-dom'
import {
  IconLogo, IconDashboard, IconProxies,
  IconFlows, IconKVM, IconCache, IconSettings, IconTrace,
} from './Icons'
import styles from './Sidebar.module.css'

const NAV = [
  { path: '/',             label: 'Dashboard',      Icon: IconDashboard },
  { section: 'DEVELOP' },
  { path: '/proxies',      label: 'API Proxies',    Icon: IconProxies },
  { path: '/shared-flows', label: 'Shared Flows',   Icon: IconFlows },
  { section: 'ADMIN' },
  { path: '/kvm',          label: 'Key Value Maps', Icon: IconKVM },
  { path: '/caches',       label: 'Caches',         Icon: IconCache },
  { path: '/flow-hooks',   label: 'Flow Hooks',     Icon: IconFlows },
  { path: '/config',       label: 'Configuración',  Icon: IconSettings },
  { section: 'HERRAMIENTAS' },
  { path: '/trace',        label: 'Trace Analyzer', Icon: IconTrace },
]

export function Sidebar({ isCollapsed }) {
  const { pathname } = useLocation()
  return (
    <nav className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.logo}>
        <IconLogo size={isCollapsed ? 28 : 36} />
        {!isCollapsed && (
          <div>
            <div className={styles.logoName}>API Manager</div>
            <div className={styles.logoSub}>Apigee Console</div>
          </div>
        )}
      </div>

      <div className={styles.nav}>
        {NAV.map((item, i) =>
          item.section ? (
            !isCollapsed && <p key={i} className={styles.section}>{item.section}</p>
          ) : (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}
              title={isCollapsed ? item.label : ''}
            >
              <item.Icon size={18} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          )
        )}
      </div>

      <div className={styles.footer}>
        {isCollapsed ? (
          <div className={styles.envDot} title="prod-environment" />
        ) : (
          <>
            <span className={styles.footerLabel}>Entorno</span>
            <span className={styles.footerEnv}>prod-environment</span>
          </>
        )}
      </div>
    </nav>
  )
}
