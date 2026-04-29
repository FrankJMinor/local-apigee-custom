import React, { useState } from 'react';
import styles from './ProxyDetail.module.css';

function ProxyDetail({ proxy, onClose }) {
  // Estado local para los campos editables
  const [displayName, setDisplayName] = useState(proxy.displayName || proxy.name || '');
  const [description, setDescription] = useState(proxy.description || '');
  const [basePath, setBasePath] = useState(proxy.basePath || '');
  const [targetUrl, setTargetUrl] = useState(proxy.targetUrl || '');

  // Simulación de guardar cambios
  const handleSave = () => {
    alert('Cambios guardados (simulado)');
    // Aquí iría la lógica real de guardado
  };

  return (
    <div className={styles.detailWrapper}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.breadcrumbs}>
            <span className={styles.link} onClick={onClose}>{'< API Proxies'}</span>
            <span className={styles.sep}>/</span>
            <span className={styles.proxyName}>{proxy.name}</span>
          </div>
          <h1 className={styles.title}>{displayName || proxy.name}</h1>
          <p className={styles.subtitle}>{description || 'Proxy para gestionar APIs.'}</p>
        </div>
        <div className={styles.statusBox}>
          <span className={styles.statusActive}>● Activo</span>
          <span className={styles.revBadge}>Revision {proxy.revision || '1'}</span>
        </div>
      </div>
      <div className={styles.actionsRow}>
        <button className={styles.saveBtn} onClick={handleSave}>Guardar Cambios</button>
        <button className={styles.deployBtn}>Desplegar</button>
        <button className={styles.testBtn}>Probar API</button>
        <button className={styles.historyBtn}>Historial</button>
      </div>
      <div className={styles.tabsRow}>
        <button className={styles.tabActive}>Configuracion</button>
        <button className={styles.tab}>Endpoints</button>
        <button className={styles.tab}>Policies</button>
      </div>
      <div className={styles.cardsRow}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Informacion General</h2>
          <p className={styles.cardSub}>Configuracion basica del proxy</p>
          <label className={styles.label}>Nombre para mostrar</label>
          <input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} />
          <label className={styles.label}>Descripcion</label>
          <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} />
          <label className={styles.label}>Nombre interno</label>
          <input className={styles.input} value={proxy.name} disabled />
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Configuracion de Rutas</h2>
          <p className={styles.cardSub}>Base path y target endpoint</p>
          <label className={styles.label}>Base Path</label>
          <input className={styles.input} value={basePath} onChange={e => setBasePath(e.target.value)} />
          <label className={styles.label}>Target URL</label>
          <input className={styles.input} value={targetUrl} onChange={e => setTargetUrl(e.target.value)} />
          <div className={styles.lastMod}>
            Ultima modificacion<br />
            <span className={styles.lastModDate}>{proxy.lastModified || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProxyDetail;
