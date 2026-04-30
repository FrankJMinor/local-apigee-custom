import React, { useState, useEffect, useRef } from 'react';
import { 
  IconRocket, IconRefresh, IconTrace, IconActivity, IconEdit, 
  IconChevronRight, IconTrash, IconChevronDown 
} from './Icons';
import styles from './ProxyDetail.module.css';

function ProxyDetail({ proxy, onClose }) {
  const [activeTab, setActiveTab] = useState('Develop');
  const [footerHeight, setFooterHeight] = useState(250);
  const isResizing = useRef(false);

  const [expanded, setExpanded] = useState({
    policies: true,
    proxyEndpoints: true,
    endpointsDefault: true,
    targetEndpoints: false,
    scripts: false,
    xsl: false
  });

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const [xmlCode, setXmlCode] = useState(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VerifyAPIKey async="false" continueOnError="false" enabled="true" name="Verify-API-Key-1">
    <DisplayName>Verify API Key 1</DisplayName>
    <Properties/>
    <APIKey ref="request.header.x-apikey"/>
</VerifyAPIKey>`);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 100 && newHeight < 600) {
        setFooterHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = () => {
    isResizing.current = true;
    document.body.style.cursor = 'row-resize';
  };

  return (
    <div className={styles.detailWrapper}>
      {/* Header Area */}
      <div className={styles.headerRow}>
        <div>
          <div className={styles.breadcrumbs}>
            <span className={styles.link} onClick={onClose}>API Proxies</span>
            <span>/</span>
            <span>{proxy.name}</span>
          </div>
          <h1 className={styles.title}>{proxy.name}</h1>
          <p className={styles.subtitle}>Proxy para gestionar APIs.</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.statusBadge}>● Activo</div>
          <div className={styles.revBadge}>Revision {proxy.revision || '3'}</div>
          <div className={styles.btnGroup}>
            <button className={styles.btn}><IconEdit size={14}/> Guardar Cambios</button>
            <button className={`${styles.btn} ${styles.btnSecondary}`}><IconRocket size={14}/> Desplegar</button>
            <button className={styles.btn}><IconActivity size={14}/> Probar API</button>
            <button className={styles.btn}><IconRefresh size={14}/> Historial</button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className={styles.navTabs}>
        {['Develop', 'Trace', 'Performance'].map(tab => (
          <div
            key={tab}
            className={`${styles.navTab} ${activeTab === tab ? styles.navTabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Develop' && <IconEdit size={14}/>}
            {tab === 'Trace' && <IconTrace size={14}/>}
            {tab === 'Performance' && <IconActivity size={14}/>}
            {tab}
          </div>
        ))}
      </div>

      {/* Editor Main Area */}
      <div className={styles.editorContainer}>
        <div className={styles.mainEditorArea}>
          {/* Left Navigator */}
          <aside className={styles.navigator}>
            <div className={styles.panelHeader}>
              Navigator <span>+</span>
            </div>
            
            {/* Policies Section */}
            <div className={styles.treeFolder} onClick={() => toggle('policies')}>
              {expanded.policies ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Policies
            </div>
            {expanded.policies && (
              <div className={styles.treeSubItems}>
                <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> Assign Message 1</div>
                <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> JSON to XML 1</div>
                <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> Monetization Limits Check</div>
                <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> Quota 1</div>
                <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> Remove API key</div>
                <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> Verify API Key 1</div>
                <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> XSL Transform 1</div>
              </div>
            )}

            {/* Proxy Endpoints Section */}
            <div className={styles.treeFolder} onClick={() => toggle('proxyEndpoints')}>
              {expanded.proxyEndpoints ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Proxy Endpoints
            </div>
            {expanded.proxyEndpoints && (
              <div className={styles.treeSubItems}>
                <div className={styles.treeFolder} onClick={(e) => { e.stopPropagation(); toggle('endpointsDefault'); }}>
                  {expanded.endpointsDefault ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
                  <span className={styles.folderIcon}>📁</span> default
                </div>
                {expanded.endpointsDefault && (
                  <div className={styles.treeSubItems}>
                    <div className={styles.treeItem}>
                      <span className={styles.itemIcon}>⚙️</span> PreFlow
                      <span className={styles.methodBadge} data-method="all">ALL</span>
                    </div>
                    <div className={styles.treeItem}>
                      <span className={styles.itemIcon}>🔗</span> search
                      <span className={styles.methodBadge} data-method="get">GET</span>
                    </div>
                    <div className={styles.treeItem}>
                      <span className={styles.itemIcon}>🔗</span> issue
                      <span className={styles.methodBadge} data-method="get">GET</span>
                    </div>
                    <div className={styles.treeItem}>
                      <span className={styles.itemIcon}>⚙️</span> PostFlow
                      <span className={styles.methodBadge} data-method="all">ALL</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Target Endpoints Section */}
            <div className={styles.treeFolder} onClick={() => toggle('targetEndpoints')}>
              {expanded.targetEndpoints ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Target Endpoints
            </div>

            {/* Scripts Section */}
            <div className={styles.treeFolder} onClick={() => toggle('scripts')}>
              {expanded.scripts ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Scripts
            </div>

            {/* XSL Section */}
            <div className={styles.treeFolder} onClick={() => toggle('xsl')}>
              {expanded.xsl ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> xsl
            </div>
          </aside>

          {/* Center Flow Designer */}
          <main className={styles.flowDesigner}>
            <div className={styles.flowContainer}>
              <div className={styles.flowBox}>
                <span className={styles.flowLabel}>Request</span>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                  <div className={styles.flowStep}>
                    <div className={styles.stepIcon}>💻</div>
                    <span className={styles.stepLabel}>App</span>
                  </div>
                  <IconChevronRight size={18}/>
                  <div className={styles.flowStep}>
                    <div className={`${styles.stepIcon} ${styles.stepIconActive}`}>🛡️</div>
                    <span className={styles.stepLabel}>Verify API Key 1</span>
                  </div>
                  <IconChevronRight size={18}/>
                  <div className={styles.flowStep}>
                    <div className={styles.stepIcon}>☁️</div>
                    <span className={styles.stepLabel}>Server</span>
                  </div>
                </div>
              </div>

              <div className={styles.flowBox}>
                <span className={styles.flowLabel}>Response</span>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                  <div className={styles.flowStep}>
                    <div className={styles.stepIcon}>☁️</div>
                    <span className={styles.stepLabel}>Server</span>
                  </div>
                  <IconChevronRight size={18}/>
                  <div className={styles.flowStep}>
                    <div className={styles.stepIcon}>⚡</div>
                    <span className={styles.stepLabel}>JSON-to-XML-1</span>
                  </div>
                  <IconChevronRight size={18}/>
                  <div className={styles.flowStep}>
                    <div className={styles.stepIcon}>💻</div>
                    <span className={styles.stepLabel}>App</span>
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* Right Inspector */}
          <aside className={styles.inspector}>
            <div className={styles.inspectorTitle}>Property Inspector</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select a policy to view properties</p>
            
            <div className={styles.inspectorLabel}>Policy Name</div>
            <div className={styles.inspectorValue}>Verify-API-Key-1</div>
            
            <div className={styles.inspectorLabel}>Display Name</div>
            <input className={styles.inspectorValue} defaultValue="Verify API Key 1" style={{ width: '100%' }} />
            
            <div className={styles.inspectorLabel}>API Key Reference</div>
            <div className={styles.inspectorValue}>request.header.x-apikey</div>
          </aside>
        </div>

        {/* Resizer Handle */}
        <div className={styles.resizer} onMouseDown={startResizing}>
          <div className={styles.resizerDots}>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
          </div>
        </div>

        {/* Bottom Editor */}
        <footer className={styles.codeEditor} style={{ height: `${footerHeight}px`, flex: 'none' }}>
          <div className={styles.codeHeader}>
            <span>Code: <strong>Verify-API-Key-1.xml</strong></span>
            <div className={styles.codeActions}>
              <span className={styles.iconBtn} title="Copiar"><IconEdit size={14}/></span>
              <span className={styles.iconBtn} title="Descargar"><IconRocket size={14}/></span>
            </div>
          </div>
          <div className={styles.codeContent} style={{ height: 'calc(100% - 35px)' }}>
            <textarea
              className={styles.xmlTextArea}
              value={xmlCode}
              onChange={(e) => setXmlCode(e.target.value)}
              spellCheck="false"
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default ProxyDetail;

