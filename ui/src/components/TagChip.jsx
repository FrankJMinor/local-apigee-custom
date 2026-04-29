import { tagColor } from '../utils/format'

export function TagChip({ tag }) { // NOSONAR S6774
  const color = tagColor(tag)
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: '10px',
      fontSize: '0.78em',
      fontWeight: 600,
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
    }}>
      {tag}
    </span>
  )
}
