export const SHARED_FLOWS = [
  { name: 'auth-validation-flow',  revision: '4', state: 'deployed',   usage: 12, lastModified: '2026-04-26T11:30:00' },
  { name: 'rate-limiting-flow',    revision: '7', state: 'deployed',   usage: 8,  lastModified: '2026-04-25T09:15:00' },
  { name: 'logging-shared-flow',   revision: '2', state: 'deployed',   usage: 15, lastModified: '2026-04-24T14:00:00' },
  { name: 'cors-headers-flow',     revision: '3', state: 'pending',    usage: 6,  lastModified: '2026-04-23T16:45:00' },
  { name: 'error-handling-flow',   revision: '5', state: 'undeployed', usage: 3,  lastModified: '2026-04-20T10:20:00' },
  { name: 'jwt-validation-flow',   revision: '1', state: 'error',      usage: 0,  lastModified: '2026-04-22T08:30:00' },
]

export const RECENT_ACTIVITY = [
  { action: 'Desplegado users-api-proxy',       time: '2026-04-29T07:00:00' },
  { action: 'Actualizado auth-validation-flow', time: '2026-04-29T05:00:00' },
  { action: 'Creado feature-flags',             time: '2026-04-28T10:00:00' },
  { action: 'Desplegado payments-gateway',      time: '2026-04-27T10:00:00' },
]

export const SYSTEM_ALERTS = [
  { type: 'warning', title: '1 proxy con estado de error',  detail: 'analytics-proxy requiere atención' },
  { type: 'info',    title: '2 despliegues pendientes',     detail: 'auth-service-proxy, cors-headers-flow' },
]

export const STATS = [
  { label: 'API Proxies',    value: 7, delta: '+2 este mes', path: '/proxies',      color: '#3b82f6', icon: '⊞' },
  { label: 'Shared Flows',   value: 6, delta: '+1 este mes', path: '/shared-flows', color: '#8b5cf6', icon: '⚡' },
  { label: 'Key Value Maps', value: 7, delta: 'Sin cambios', path: '/kvm',          color: '#10b981', icon: '☰' },
]
