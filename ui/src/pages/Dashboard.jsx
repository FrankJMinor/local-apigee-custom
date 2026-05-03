import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { STATS as MOCK_STATS, RECENT_ACTIVITY, SYSTEM_ALERTS } from '../data/mock'
import { timeAgo } from '../utils/format'
import { IconActivity, IconAlert, IconRefresh } from '../components/Icons'
import { fetchDeployedProxiesCount } from '../utils/fetchDeployedProxiesCount'
import s from './table.module.css'
import styles from './Dashboard.module.css'

function StatCard({ stat }) { // NOSONAR S6774
  return (
    <Link to={stat.path} className={styles.statCard}>
      <div className={styles.statTop}>
        <div>
          <p className={styles.statLabel}>{stat.label}</p>
          <p className={styles.statValue}>{stat.value}</p>
        </div>
        <span
          className={styles.statIcon}
          style={{ background: `${stat.color}22`, color: stat.color }}
        >
          {stat.icon}
        </span>
      </div>
      <p className={styles.statDelta}>↗ {stat.delta}</p>
    </Link>
  )
}


function Dashboard() {
  const [, forceRefresh] = useState(0)
  const [stats, setStats] = useState(MOCK_STATS)
  const [loading, setLoading] = useState(false)


  // Función para cargar el total de proxies desplegados
  const loadProxiesCount = () => {
    setLoading(true)
    fetchDeployedProxiesCount().then(total => {
      setStats(prev => prev.map(stat =>
        stat.label === 'API Proxies' ? { ...stat, value: total } : stat
      ))
      setLoading(false)
    })
  }

  useEffect(() => {
    loadProxiesCount()
    // eslint-disable-next-line
  }, [])

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Dashboard</h1>
          <p className={s.pageSub}>Vista general de tu entorno de API Management.</p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={loadProxiesCount} disabled={loading}>
            <IconRefresh size={15} /> {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button className={s.btnPrimary}>+ Nuevo Proxy</button>
        </div>
      </div>

      <div className={styles.statsRow}>
        {stats.map(stat => <StatCard key={stat.label} stat={stat} />)}
      </div>

      <div className={styles.panels}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <IconActivity size={17} />
            <h2 className={styles.panelTitle}>Actividad Reciente</h2>
          </div>
          <ul className={styles.activityList}>
            {RECENT_ACTIVITY.map(item => (
              <li key={item.action} className={styles.activityItem}>
                <span className={styles.activityDot} />
                <div>
                  <p className={styles.activityAction}>{item.action}</p>
                  <p className={styles.activityTime}>{timeAgo(item.time)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <IconAlert size={17} />
            <h2 className={styles.panelTitle}>Alertas del Sistema</h2>
          </div>
          <div className={styles.alertList}>
            {SYSTEM_ALERTS.map(a => (
              <div
                key={a.title}
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
