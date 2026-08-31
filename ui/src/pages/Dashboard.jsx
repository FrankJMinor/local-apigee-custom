import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { timeAgo } from '../utils/format'
import { IconActivity, IconAlert, IconRefresh, IconWarning } from '../components/Icons'
import { fetchDashboard, EMPTY_DASHBOARD } from '../utils/fetchDashboard'
import s from './table.module.css'
import styles from './Dashboard.module.css'

// Color y punto de cada tipo de evento de la actividad reciente.
const EVENT_TONE = {
  deploy: '#3b82f6',
  proxy: '#8b5cf6',
  sharedflow: '#06b6d4',
  kvm: '#10b981',
}

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
      <p className={styles.statDelta}>{stat.detail}</p>
    </Link>
  )
}

function Dashboard() {
  const [data, setData] = useState(EMPTY_DASHBOARD)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetchDashboard()
      .then(setData)
      .catch(err => {
        setError(err.message)
        setData(EMPTY_DASHBOARD)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const { proxies, sharedFlows, keyValueMaps } = data.stats

  const cards = [
    {
      label: 'API Proxies',
      value: proxies.total,
      detail: proxies.detail,
      path: '/proxies',
      color: '#3b82f6',
      icon: '⊞',
    },
    {
      label: 'Shared Flows',
      value: sharedFlows.total,
      detail: sharedFlows.detail,
      path: '/shared-flows',
      color: '#8b5cf6',
      icon: '⚡',
    },
    {
      label: 'Key Value Maps',
      value: keyValueMaps.total,
      detail: keyValueMaps.detail,
      path: '/kvm',
      color: '#10b981',
      icon: '☰',
    },
  ]

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Dashboard</h1>
          <p className={s.pageSub}>
            Estado del emulador local
            {data.environment ? ` (environment ${data.environment}` : ''}
            {data.environment && data.revision ? `, revisión ${data.revision}` : ''}
            {data.environment ? ')' : ''}.
          </p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary} onClick={load} disabled={loading}>
            <IconRefresh size={15} /> {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
          <Link to="/proxies" className={s.btnPrimary}>+ Nuevo Proxy</Link>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <IconWarning size={15} /> <span>{error}</span>
        </div>
      )}

      <div className={styles.statsRow}>
        {cards.map(stat => <StatCard key={stat.label} stat={stat} />)}
      </div>

      <div className={styles.panels}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <IconActivity size={17} />
            <h2 className={styles.panelTitle}>Actividad Reciente</h2>
          </div>
          {data.activity.length === 0 ? (
            <p className={styles.panelEmpty}>
              {loading ? 'Cargando…' : 'Todavía no hay actividad en este entorno.'}
            </p>
          ) : (
            <ul className={styles.activityList}>
              {data.activity.map(item => (
                <li key={`${item.type}-${item.time}-${item.action}`} className={styles.activityItem}>
                  <span
                    className={styles.activityDot}
                    style={{ background: EVENT_TONE[item.type] || 'var(--text-muted)' }}
                  />
                  <div className={styles.activityBody}>
                    <p className={styles.activityAction}>{item.action}</p>
                    <p className={styles.activityDetail}>{item.detail}</p>
                    <p className={styles.activityTime}>{timeAgo(item.time)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <IconAlert size={17} />
            <h2 className={styles.panelTitle}>Alertas del Sistema</h2>
          </div>
          {data.alerts.length === 0 ? (
            <p className={styles.panelEmpty}>{loading ? 'Cargando…' : 'Sin alertas.'}</p>
          ) : (
            <div className={styles.alertList}>
              {data.alerts.map(a => (
                <div
                  key={a.title}
                  className={`${styles.alert} ${a.type === 'warning' ? styles.alertWarning : styles.alertInfo}`}
                >
                  <p className={styles.alertTitle}>{a.title}</p>
                  <p className={styles.alertDetail}>{a.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
