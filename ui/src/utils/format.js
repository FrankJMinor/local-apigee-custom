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

export const getPolicyAcronym = (policyName) => {
  if (!policyName) return '';

  // 1. Mapa para políticas con prefijos convencionales específicos en Apigee
  const specialCases = {
    'JavaScript': 'JS-',
    'Quota': 'QUOTA-',
    'Key Value Map Operations': 'KVM-',
    'JSON to XML': 'J2X-',
    'XML to JSON': 'X2J-',
    'OAuth v2.0': 'OAUTH-'
  };

  if (specialCases[policyName]) {
    return specialCases[policyName];
  }

  // 2. Normalizar CamelCase a texto separado por espacios
  // Esto convierte "AssignMessage" -> "Assign Message"
  // Pero deja "Extract Variables" igual.
  const normalizedName = policyName.replace(/([a-z])([A-Z])/g, '$1 $2');

  // 3. Lógica general: Toma la primera letra de cada palabra
  const acronym = normalizedName
    .split(/[\s_-]+/) // Separamos por espacios, guiones o guiones bajos por si acaso
    .filter(word => word.length > 0)
    .map(word => word[0].toUpperCase())
    .join('');

  return `${acronym}-`;
};