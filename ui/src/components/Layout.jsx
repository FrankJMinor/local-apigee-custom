import { Sidebar } from './Sidebar'
import { IconBell, IconUser } from './Icons'
import styles from './Layout.module.css'

export function Layout({ children, isDark, onToggleTheme }) { // NOSONAR S6774
  return (
    <div className={styles.app}>
      <Sidebar />
      <div className={styles.main}>
        <header className={styles.topBar}>
          <button
            className={styles.iconBtn}
            onClick={onToggleTheme}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <button className={styles.iconBtn} title="Notificaciones">
            <IconBell size={17} />
          </button>
          <button className={styles.iconBtn} title="Usuario">
            <IconUser size={17} />
          </button>
        </header>
        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  )
}
