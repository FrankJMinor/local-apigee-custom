import { useState } from 'react'
import { KEY_VALUE_MAPS } from '../data/mock'
import { ScopeBadge } from '../components/StatusBadge'
import { IconRefresh, IconEdit, IconTrash, IconKVM } from '../components/Icons'
import { formatDate } from '../utils/format'
import s from './table.module.css'

function KeyValueMaps() {
  const [search, setSearch] = useState('')

  const searchLower = search.toLowerCase()
  const filtered = KEY_VALUE_MAPS.filter(r =>
    [r.name, r.scope, r.encrypted ? 'si' : 'no'].join(' ').toLowerCase().includes(searchLower)
  )

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Key Value Maps</h1>
          <p className={s.pageSub}>Administra los mapas de clave-valor para configuraciones y credenciales.</p>
        </div>
        <div className={s.pageActions}>
          <button className={s.btnSecondary}>
            <IconRefresh size={14} /> Actualizar
          </button>
          <button className={s.btnPrimary}>+ Nuevo KVM</button>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.tableBar}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon}>🔍</span>
            <input
              className={s.searchInput}
              placeholder="Buscar KVM..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className={s.countLabel}>{filtered.length} de {KEY_VALUE_MAPS.length} KVMs</span>
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nombre del KVM</th>
                <th>Scope</th>
                <th>Cifrado</th>
                <th>Entradas</th>
                <th>Fecha de Modificación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className={s.empty}>Sin resultados</td></tr>
              ) : filtered.map(row => (
                <tr key={row.name}>
                  <td>
                    <span className={s.nameCell}>
                      <IconKVM size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <span className={s.itemName}>{row.name}</span>
                    </span>
                  </td>
                  <td><ScopeBadge scope={row.scope} /></td>
                  <td>
                    <span style={{
                      color: row.encrypted ? '#22c55e' : 'var(--text-secondary)',
                      fontSize: '0.88em',
                      fontWeight: 500,
                    }}>
                      {row.encrypted ? '🔒 Sí' : '🔓 No'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {row.entries}
                  </td>
                  <td className={s.dateCell}>{formatDate(row.lastModified)}</td>
                  <td>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button className={s.iconAction} title="Editar" onClick={() => alert(`Editando ${row.name}`)}>
                        <IconEdit size={15} />
                      </button>
                      <button className={`${s.iconAction} ${s.iconActionDanger}`} title="Eliminar" onClick={() => alert(`Eliminando ${row.name}`)}>
                        <IconTrash size={15} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default KeyValueMaps
