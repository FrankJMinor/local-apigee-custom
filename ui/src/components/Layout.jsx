import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { IconBell, IconUser, IconChevronRight, IconChevronDown } from './Icons'
import styles from './Layout.module.css'

export function Layout({ children, isDark, onToggleTheme }) { // NOSONAR S6774
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className={`${styles.app} ${isSidebarCollapsed ? styles.collapsed : ''}`}>
      <Sidebar isCollapsed={isSidebarCollapsed} />
      <div className={styles.main}>
        <header className={styles.topBar}>
          <button 
            className={styles.collapseBtn} 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expandir" : "Contraer"}
          >
            <IconChevronRight size={16} style={{ transform: isSidebarCollapsed ? '' : 'rotate(180deg)', transition: 'transform 0.3s' }} />
          </button>
          <div style={{ flex: 1 }} />
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
