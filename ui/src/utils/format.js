const TAG_PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#10b981', '#ec4899', '#6366f1',
]

export function tagColor(tag) {
  const hash = tag.split('').reduce((a, c) => a + c.codePointAt(0), 0)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

export function formatDate(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function timeAgo(ts) {
  if (!ts) return '-'
  const diff = Date.now() - new Date(ts).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (h < 1)  return 'hace unos minutos'
  if (h < 24) return `hace ${h} hora${h !== 1 ? 's' : ''}`
  if (d < 30) return `hace ${d} día${d !== 1 ? 's' : ''}`
  return formatDate(ts)
}
