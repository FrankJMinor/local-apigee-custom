function Svg({ size = 18, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      {...rest}>
      {children}
    </svg>
  )
}

export function IconDashboard({ size }) {
  return <Svg size={size}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></Svg>
}
export function IconProxies({ size }) {
  return <Svg size={size}><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M10 17l-3-2M14 17l3-2"/></Svg>
}
export function IconFlows({ size }) {
  return <Svg size={size}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></Svg>
}
export function IconKVM({ size }) {
  return <Svg size={size}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></Svg>
}
export function IconSettings({ size }) {
  return <Svg size={size}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Svg>
}
export function IconBell({ size }) {
  return <Svg size={size}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Svg>
}
export function IconUser({ size }) {
  return <Svg size={size}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Svg>
}
export function IconRefresh({ size }) {
  return <Svg size={size}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></Svg>
}
export function IconEdit({ size }) {
  return <Svg size={size}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg>
}
export function IconTrash({ size }) {
  return <Svg size={size}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></Svg>
}
export function IconRocket({ size }) {
  return <Svg size={size}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></Svg>
}
export function IconActivity({ size }) {
  return <Svg size={size}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></Svg>
}
export function IconAlert({ size }) {
  return <Svg size={size}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></Svg>
}
export function IconTrace({ size }) {
  return <Svg size={size}><path d="M2 12h3l3-9 4 18 3-9h3"/><circle cx="19" cy="12" r="3"/></Svg>
}
export function IconUpload({ size }) {
  return <Svg size={size}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></Svg>
}
export function IconChevronRight({ size }) {
  return <Svg size={size}><polyline points="9 18 15 12 9 6"/></Svg>
}
export function IconChevronDown({ size }) {
  return <Svg size={size}><polyline points="6 9 12 15 18 9"/></Svg>
}
export function IconX({ size }) {
  return <Svg size={size}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Svg>
}
export function IconWarning({ size }) {
  return <Svg size={size}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Svg>
}
export function IconCheck({ size }) {
  return <Svg size={size}><polyline points="20 6 9 17 4 12"/></Svg>
}
export function IconLaptop({ size }) {
  return <Svg size={size}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="1" y1="20" x2="23" y2="20"/><path d="M4 17h16"/></Svg>
}
export function IconDiana({ size }) {
  return <Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></Svg>
}
export function IconSet({ size }) {
  return (
    <Svg size={size}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15l3-3-3-3" />
      <path d="M13 12h4" />
    </Svg>
  )
}
export function IconCloud({ size }) {
  return <Svg size={size}><path d="M17.5 19c3.037 0 5.5-2.463 5.5-5.5 0-2.822-2.124-5.147-4.887-5.458C17.587 4.603 14.103 2 10 2 6.134 2 3 5.134 3 9c0 .034.001.068.002.102C1.267 10.12 0 11.916 0 14c0 3.037 2.463 5.5 5.5 5.5h12z"/></Svg>
}
export function IconInfo({ size }) {
  return <Svg size={size}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></Svg>
}

export function IconLogo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="9" fill="#1e3a5f"/>
      <circle cx="10" cy="10" r="3" fill="#60a5fa"/>
      <circle cx="24" cy="10" r="3" fill="#60a5fa"/>
      <circle cx="10" cy="24" r="3" fill="#60a5fa"/>
      <circle cx="24" cy="24" r="3" fill="#93c5fd"/>
      <line x1="10" y1="10" x2="24" y2="24" stroke="#3b82f6" strokeWidth="1.5"/>
      <line x1="24" y1="10" x2="10" y2="24" stroke="#3b82f6" strokeWidth="1.5"/>
      <line x1="10" y1="10" x2="24" y2="10" stroke="#3b82f6" strokeWidth="1.5"/>
      <line x1="10" y1="24" x2="24" y2="24" stroke="#3b82f6" strokeWidth="1.5"/>
    </svg>
  )
}

export function IconAssignMessage({ size = 18, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      <rect x="10" y="10" width="80" height="80" rx="12" stroke="currentColor" strokeWidth="4" opacity="0.9" />
      <circle cx="35" cy="50" r="12" stroke="currentColor" strokeWidth="5" />
      <path d="M47 50 H75" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M60 50 V65" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 50 V65" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

export function IconKeyValueMapOperations({ size = 18, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* El Contenedor (Caja) */}
      <rect x="10" y="10" width="80" height="80" rx="12" stroke="currentColor" strokeWidth="4" opacity="0.9" />
      {/* La "Llave" del KVM */}
      <circle cx="35" cy="50" r="12" stroke="currentColor" strokeWidth="5" />
      <path d="M47 50 H75" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M60 50 V65" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 50 V65" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}


export function IconVerifyAPIKey({ size = 18, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>
    </svg>
  )
}

export function IconQuota({ size = 18, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

export function IconXMLJSON({ size = 18, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>
    </svg>
  )
}

export function IconSpikeArrest({ size = 18, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  )
}
