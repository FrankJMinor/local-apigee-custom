import { Link } from 'react-router-dom'
import { STATS, RECENT_ACTIVITY, SYSTEM_ALERTS } from '../data/mock'
import { timeAgo } from '../utils/format'
import { IconActivity, IconAlert, IconRefresh } from '../components/Icons'
import styles from './Dashboard.module.css'

const STAT_ICONS = ['⊞', '⚡', '☰']
const STAT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981']

function StatCard({ stat, index }) { // NOSONAR S6774
  return (
    <Link to={stat.path} className={styles.statCard}>
      <div className={styles.statTop}>
        <div>
          <p className={styles.statLabel}>{stat.label}</p>
          <p className={styles.statValue}>{stat.value}</p>
        </div>
        <span
          className={styles.statIcon}
          style={{ background: STAT_COLORS[index] + '22', color: STAT_COLORS[index] }}
        >
          {STAT_ICONS[index]}
        </span>
      </div>
      <p className={styles.statDelta}>↗ {stat.delta}</p>
    </Link>
  )
}

function Dashboard() {
  return (
    <div>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSub}>Vista general de tu entorno de API Management.</p>
        </div>
        <div className={styles.pageActions}>
          <button className={styles.btnSecondary} onClick={() => window.location.reload()}>
            <IconRefresh size={15} /> Actualizar
          </button>
          <button className={styles.btnPrimary}>+ Nuevo Proxy</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className={styles.statsRow}>
        {STATS.map((s, i) => <StatCard key={s.label} stat={s} index={i} />)}
      </div>

      {/* Bottom panels */}
      <div className={styles.panels}>
        {/* Recent activity */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <IconActivity size={17} />
            <h2 className={styles.panelTitle}>Actividad Reciente</h2>
          </div>
          <ul className={styles.activityList}>
            {RECENT_ACTIVITY.map((item, i) => (
              <li key={i} className={styles.activityItem}>
                <span className={styles.activityDot} />
                <div>
                  <p className={styles.activityAction}>{item.action}</p>
                  <p className={styles.activityTime}>{timeAgo(item.time)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* System alerts */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <IconAlert size={17} />
            <h2 className={styles.panelTitle}>Alertas del Sistema</h2>
          </div>
          <div className={styles.alertList}>
            {SYSTEM_ALERTS.map((a, i) => (
              <div
                key={i}
                className={`${styles.alert} ${a.type === 'warning' ? styles.alertWarning : styles.alertInfo}`}
              >
                <p className={styles.alertTitle}>{a.title}</p>
                <p className={styles.alertDetail}>{a.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
