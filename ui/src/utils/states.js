export const DOT_COLORS = {
  deployed:   '#22c55e',
  undeployed: '#94a3b8',
  pending:    '#f59e0b',
  error:      '#ef4444',
}

export const getDotColor = state =>
  DOT_COLORS[(state || '').toLowerCase()] || '#94a3b8'

export const isErrorState = state =>
  (state || '').toLowerCase() === 'error'
