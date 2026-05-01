import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { 
  IconRocket, IconRefresh, IconTrace, IconActivity, IconEdit, 
  IconChevronRight, IconChevronDown, IconX, IconCheck, 
  IconVerifyAPIKey, IconQuota, IconXMLJSON, IconSpikeArrest
} from './Icons';
import AssignMessageSVG from '../../icons/AssignMessage.svg';
import KeyValueMapOperationsSVG from '../../icons/KeyValueMapOperations.svg';
import styles from './ProxyDetail.module.css';

// ── SUB-COMPONENT: NeonFilter ──────────────────────────────────────────────
const NeonFilter = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }}>
    <defs>
      <filter id="neonGlowIcon" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  </svg>
);

// ── UTILS ──────────────────────────────────────────────────────────────────
const getPolicyTypeClass = (name) => {
  const n = name.toLowerCase();
  if (n.includes('verify') || n.includes('apikey') || n.includes('quota') || n.includes('security')) return styles.policySecurity;
  if (n.includes('json') || n.includes('xml') || n.includes('transform') || n.includes('mediation')) return styles.policyMediation;
  return styles.policyTraffic;
};

const getPolicyIcon = (type, className, size = 24) => {
  const t = type || "";
  if (t === 'AssignMessage') return <img src={AssignMessageSVG} className={className} style={{ width: size, height: size }} alt="AssignMessage" />;
  if (t === 'KeyValueMapOperations') return <img src={KeyValueMapOperationsSVG} className={className} style={{ width: size, height: size }} alt="KeyValueMapOperations" />;
  if (t === 'VerifyAPIKey') return <IconVerifyAPIKey size={size} className={className} />;
  if (t === 'Quota') return <IconQuota size={size} className={className} />;
  if (t === 'JSONToXML' || t === 'XMLToJSON') return <IconXMLJSON size={size} className={className} />;
  if (t === 'SpikeArrest') return <IconSpikeArrest size={size} className={className} />;
  
  return <span className={className} style={{fontSize: size === 14 ? '12px' : '18px', display: 'inline-block', textAlign: 'center', width: `${size}px`}}>⚡</span>;
};

// ── SUB-COMPONENT: VisualFlowCanvas ──────────────────────────────────────────
const FlowConnection = ({ reverse = false }) => (
  <div className={`${styles.flowLink} ${reverse ? styles.reverseFlow : ''}`}>
    <div className={styles.gasEffect}></div>
    <div className={styles.flowArrows}></div>
  </div>
);

const VisualFlowCanvas = ({ selectedPolicy, onSelectPolicy }) => {
  return (
    <main className={styles.flowDesigner}>
      <NeonFilter />
      <div className={styles.flowContainer}>
        {/* Pipeline: Request */}
        <div className={styles.flowBox}>
          <div className={styles.flowLabel}>Request Pipeline</div>
          <div className={styles.pipeline}>
            <div className={styles.flowStep}>
              <div className={styles.stepIcon}>💻</div>
              <span className={styles.stepLabel}>App</span>
            </div>
            
            <FlowConnection />
            
            <div 
              className={`${styles.flowStep} ${selectedPolicy?.name === 'Verify-API-Key-1' ? styles.activeStep : ''}`}
              onClick={() => onSelectPolicy({ name: 'Verify-API-Key-1', type: 'Security' })}
            >
              <div className={`${styles.stepIcon} ${getPolicyTypeClass('Verify')}`}>
                {getPolicyIcon('VerifyAPIKey', styles.canvasNodeIcon)}
              </div>
              <span className={styles.stepLabel}>Verify API Key</span>
            </div>
            
            <FlowConnection />

            <div className={styles.flowStep}>
              <div className={styles.stepIcon}>☁️</div>
              <span className={styles.stepLabel}>Target</span>
            </div>
          </div>
        </div>

        {/* Pipeline: Response */}
        <div className={styles.flowBox}>
          <div className={styles.flowLabel}>Response Pipeline</div>
          <div className={styles.pipeline}>
            <div className={styles.flowStep}>
              <div className={styles.stepIcon}>☁️</div>
              <span className={styles.stepLabel}>Target</span>
            </div>

            <FlowConnection reverse />
            
            <div 
              className={`${styles.flowStep} ${selectedPolicy?.name === 'JSON-to-XML-1' ? styles.activeStep : ''}`}
              onClick={() => onSelectPolicy({ name: 'JSON-to-XML-1', type: 'Mediation' })}
            >
              <div className={`${styles.stepIcon} ${getPolicyTypeClass('JSON')}`}>
                {getPolicyIcon('JSONToXML', styles.canvasNodeIcon)}
              </div>
              <span className={styles.stepLabel}>JSON to XML</span>
            </div>

            <FlowConnection reverse />

            <div className={styles.flowStep}>
              <div className={styles.stepIcon}>💻</div>
              <span className={styles.stepLabel}>App</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

VisualFlowCanvas.propTypes = {
  selectedPolicy: PropTypes.shape({ name: PropTypes.string, type: PropTypes.string }),
  onSelectPolicy: PropTypes.func.isRequired
};

// ── SUB-COMPONENT: PolicyInspector ───────────────────────────────────────────
const PolicyInspector = ({ policy, isOpen, onClose }) => {
  return (
    <aside className={`${styles.inspectorDrawer} ${isOpen ? styles.drawerOpen : ''}`}>
      <div className={styles.drawerHeader}>
        <div className={styles.drawerTitle}>
          <IconEdit size={14} />
          <span>Policy Properties</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose}><IconX size={18} /></button>
      </div>
      
      {policy ? (
        <div className={styles.drawerContent}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Policy Name</label>
            <div className={styles.fieldValue}>{policy.name}</div>
          </div>
          
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Type</label>
            <div className={`${styles.typeBadge} ${styles['type' + policy.type]}`}>
              {policy.type}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Display Name</label>
            <input 
              type="text" 
              className={styles.drawerInput} 
              defaultValue={policy.name.replaceAll('-', ' ')} 
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Configuration (XML Snippet)</label>
            <div className={styles.xmlSnippet}>
              {`<${policy.name.split('-')[0]} name="${policy.name}" />`}
            </div>
          </div>

          <button className={styles.saveBtn}>
            <IconCheck size={14} /> Save Configuration
          </button>
        </div>
      ) : (
        <div className={styles.emptyState}>Select a policy to inspect</div>
      )}
    </aside>
  );
};

PolicyInspector.propTypes = {
  policy: PropTypes.shape({ name: PropTypes.string, type: PropTypes.string }),
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

// ── SUB-COMPONENT: XmlEditor ─────────────────────────────────────────────────
const XmlEditor = ({ xmlCode, setXmlCode, footerHeight, onResizerMouseDown, editorRef, isCollapsed, onToggleCollapse, currentFileName }) => {
  const lineNumbers = xmlCode.split('\n').map((_, i) => i + 1);

  return (
    <footer className={`${styles.codeEditor} ${isCollapsed ? styles.editorCollapsed : ''}`} style={{ height: isCollapsed ? '36px' : `${footerHeight}px` }}>
      {!isCollapsed && (
        <div className={styles.resizer} onMouseDown={onResizerMouseDown}>
          <div className={styles.resizerBar} />
        </div>
      )}
      
      <div className={styles.codeHeader}>
        <div className={styles.codeTabs}>
          <div className={`${styles.codeTab} ${styles.activeCodeTab}`}>{currentFileName || 'config.xml'}</div>
        </div>
        <div className={styles.codeActions}>
          <button className={styles.iconAction} title="Copy"><IconEdit size={14}/></button>
          <button className={styles.iconAction} title="Format"><IconRefresh size={14}/></button>
          <button 
            className={`${styles.iconAction} ${styles.collapseToggle}`} 
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            <IconChevronDown size={16} style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}/>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className={styles.codeViewport}>
          <div className={styles.lineNumbers}>
            {lineNumbers.map(n => <div key={n}>{n}</div>)}
          </div>
          <textarea
            ref={editorRef}
            className={styles.xmlTextArea}
            value={xmlCode}
            onChange={(e) => setXmlCode(e.target.value)}
            spellCheck="false"
            wrap="off"
            onScroll={(e) => {
              const lineNumbersDiv = e.target.previousSibling;
              if (lineNumbersDiv) lineNumbersDiv.scrollTop = e.target.scrollTop;
            }}
          />
        </div>
      )}
    </footer>
  );
};

XmlEditor.propTypes = {
  xmlCode: PropTypes.string.isRequired,
  setXmlCode: PropTypes.func.isRequired,
  footerHeight: PropTypes.number.isRequired,
  onResizerMouseDown: PropTypes.func.isRequired,
  editorRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
  isCollapsed: PropTypes.bool.isRequired,
  onToggleCollapse: PropTypes.func.isRequired,
  currentFileName: PropTypes.string
};

// ── MAIN COMPONENT: ProxyDetail ──────────────────────────────────────────────
function ProxyDetail({ proxy, fileTree, onClose }) {
  const [activeTab, setActiveTab] = useState('Develop');
  const [footerHeight, setFooterHeight] = useState(280);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [xmlCode, setXmlCode] = useState('');

  const [expanded, setExpanded] = useState({
    policies: true,
    proxyEndpoints: true,
    endpointsDefault: true,
    targetEndpoints: true,
    scripts: false,
    xsl: false
  });

  // Efecto inicial para cargar el root_config (HelloWorld.xml)
  useEffect(() => {
    if (fileTree?.root_config) {
      handleSelectFile(fileTree.root_config);
    }
  }, [fileTree]);

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const isResizing = useRef(false);
  const editorRef = useRef(null);
  const requestRef = useRef();

  // Optimización de Resize con requestAnimationFrame
  const handleMouseMove = useCallback((e) => {
    if (!isResizing.current) return;
    
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    
    requestRef.current = requestAnimationFrame(() => {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 120 && newHeight < 600) {
        setFooterHeight(newHeight);
      }
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = '';
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  }, []);

  useEffect(() => {
    globalThis.addEventListener('mousemove', handleMouseMove);
    globalThis.addEventListener('mouseup', handleMouseUp);
    return () => {
      globalThis.removeEventListener('mousemove', handleMouseMove);
      globalThis.removeEventListener('mouseup', handleMouseUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleSelectFile = async (file) => {
    setSelectedFile(file);
    
    // Si es una política, activamos el inspector (opcional, según lógica previa)
    if (file.path.includes('policies')) {
      setSelectedPolicy({ name: file.name, type: file.type || 'Mediation' });
      setIsInspectorOpen(true);
    }

    try {
      const response = await fetch(`http://localhost:8446/v1/proxies/${proxy.name}/content?path=${encodeURIComponent(file.path)}`);
      const data = await response.json();
      if (data.content) {
        setXmlCode(data.content);
      }
    } catch (e) {
      console.error("Error al cargar contenido:", e);
      setXmlCode(`<!-- Error al cargar ${file.path} -->`);
    }
  };

  const handleSelectPolicy = (policy) => {
    // Buscar el archivo correspondiente en el tree para cargar su contenido
    const policyFile = fileTree?.policies?.find(f => f.name === policy.name);
    if (policyFile) {
      handleSelectFile(policyFile);
    }
    
    setSelectedPolicy(policy);
    setIsInspectorOpen(true);
    
    // Sincronización Inteligente: Scroll al tag <Name> (si ya está cargado el XML)
    if (editorRef.current) {
      const searchStr = `<Name>${policy.name}</Name>`;
      const index = xmlCode.indexOf(searchStr);
      if (index !== -1) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(index, index + searchStr.length);
        
        // Scroll aproximado
        const linesBefore = xmlCode.substring(0, index).split('\n').length;
        const lineHeight = 20; // Estimado
        editorRef.current.scrollTop = (linesBefore - 3) * lineHeight;
      }
    }
  };

  return (
    <div className={styles.detailWrapper}>
      {/* Top Bar: Actions & Breadcrumbs */}
      <header className={styles.headerRow}>
        <div className={styles.headerTitleArea}>
          <div className={styles.breadcrumbs}>
            <span className={styles.breadcrumbLink} onClick={onClose}>API Proxies</span>
            <IconChevronRight size={12} />
            <span className={styles.currentBreadcrumb}>{proxy.name}</span>
          </div>
          <h1 className={styles.proxyTitle}>{proxy.name}</h1>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.revIndicator}>
            <span className={styles.revLabel}>Revision</span>
            <span className={styles.revValue}>{proxy.revision || '1'}</span>
          </div>
          <div className={styles.statusChip}>● Active</div>
          <div className={styles.actionGroup}>
            <button className={styles.btnSave}><IconEdit size={14}/> Save</button>
            <button className={styles.btnDeploy}><IconRocket size={14}/> Deploy</button>
          </div>
        </div>
      </header>

      {/* Tabs Navigation */}
      <nav className={styles.navTabs}>
        {['Develop', 'Trace', 'Performance'].map(tab => (
          <button
            key={tab}
            className={`${styles.navTab} ${activeTab === tab ? styles.activeTab : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Develop' && <IconEdit size={14}/>}
            {tab === 'Trace' && <IconTrace size={14}/>}
            {tab === 'Performance' && <IconActivity size={14}/>}
            <span>{tab}</span>
          </button>
        ))}
      </nav>

      {/* Main Workspace */}
      <div className={styles.workspace}>
        <aside className={styles.navigator}>
          <div className={styles.navHeader}>Project Explorer</div>
          <div className={styles.navTree}>
            {/* Root Config File */}
            {fileTree?.root_config && (
              <div 
                className={`${styles.treeItem} ${selectedFile?.path === fileTree.root_config.path ? styles.activeTreeItem : ''}`}
                onClick={() => handleSelectFile(fileTree.root_config)}
                style={{ fontWeight: 'bold', marginBottom: '8px' }}
              >
                <span className={styles.itemIcon}>📄</span> {fileTree.root_config.full_name}
              </div>
            )}

            {/* Policies Section */}
            <div className={styles.treeFolder} onClick={() => toggle('policies')}>
              {expanded.policies ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Policies
            </div>
            {expanded.policies && (
              <div className={styles.treeSub}>
                {Array.isArray(fileTree?.policies) && fileTree.policies.length > 0 ? (
                  fileTree.policies.map(policy => (
                    <div 
                      key={policy.path}
                      className={`${styles.treeItem} ${selectedFile?.path === policy.path ? styles.activeTreeItem : ''}`}
                      onClick={() => handleSelectFile(policy)}
                    >
                      <span className={styles.itemIcon}>
                        {getPolicyIcon(policy.type, styles.sidebarIcon, 14)}
                      </span> {policy.name}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyTreeItem}>No policies</div>
                )}
              </div>
            )}

            {/* Proxy Endpoints Section */}
            <div className={styles.treeFolder} onClick={() => toggle('proxyEndpoints')}>
              {expanded.proxyEndpoints ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Proxy Endpoints
            </div>
            {expanded.proxyEndpoints && (
              <div className={styles.treeSub}>
                {Array.isArray(fileTree?.proxy_endpoints) && fileTree.proxy_endpoints.length > 0 ? (
                  fileTree.proxy_endpoints.map(endpoint => (
                    <div 
                      key={endpoint.path}
                      className={`${styles.treeItem} ${selectedFile?.path === endpoint.path ? styles.activeTreeItem : ''}`}
                      onClick={() => handleSelectFile(endpoint)}
                    >
                      <span className={styles.itemIcon}>⚙️</span> {endpoint.name}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyTreeItem}>No proxy endpoints</div>
                )}
              </div>
            )}

            {/* Target Endpoints Section */}
            <div className={styles.treeFolder} onClick={() => toggle('targetEndpoints')}>
              {expanded.targetEndpoints ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Target Endpoints
            </div>
            {expanded.targetEndpoints && (
              <div className={styles.treeSub}>
                {Array.isArray(fileTree?.target_endpoints) && fileTree.target_endpoints.length > 0 ? (
                  fileTree.target_endpoints.map(target => (
                    <div 
                      key={target.path}
                      className={`${styles.treeItem} ${selectedFile?.path === target.path ? styles.activeTreeItem : ''}`}
                      onClick={() => handleSelectFile(target)}
                    >
                      <span className={styles.itemIcon}>🔗</span> {target.name}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyTreeItem}>No target endpoints</div>
                )}
              </div>
            )}

            {/* Scripts Section */}
            <div className={styles.treeFolder} onClick={() => toggle('scripts')}>
              {expanded.scripts ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
              <span className={styles.folderIcon}>📁</span> Scripts
            </div>
            {expanded.scripts && (
              <div className={styles.treeSub}>
                {Array.isArray(fileTree?.scripts) && fileTree.scripts.length > 0 ? (
                  fileTree.scripts.map(script => (
                    <div 
                      key={script.path}
                      className={`${styles.treeItem} ${selectedFile?.path === script.path ? styles.activeTreeItem : ''}`}
                      onClick={() => handleSelectFile(script)}
                    >
                      <span className={styles.itemIcon}>📄</span> {script.name}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyTreeItem}>No scripts</div>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className={styles.mainArea}>
          <VisualFlowCanvas 
            selectedPolicy={selectedPolicy} 
            onSelectPolicy={handleSelectPolicy} 
          />

          <XmlEditor 
            xmlCode={xmlCode} 
            setXmlCode={setXmlCode} 
            footerHeight={footerHeight}
            onResizerMouseDown={() => { 
              isResizing.current = true; 
              document.body.style.cursor = 'row-resize'; 
              document.body.style.userSelect = 'none';
            }}
            editorRef={editorRef}
            isCollapsed={isEditorCollapsed}
            onToggleCollapse={() => setIsEditorCollapsed(!isEditorCollapsed)}
            currentFileName={selectedFile?.full_name}
          />
        </div>

        <PolicyInspector 
          policy={selectedPolicy} 
          isOpen={isInspectorOpen} 
          onClose={() => setIsInspectorOpen(false)} 
        />

        {!isInspectorOpen && (
          <button 
            className={styles.inspectorToggle} 
            onClick={() => setIsInspectorOpen(true)}
            title="Open Properties"
          >
            <IconEdit size={14} />
            <span>Properties</span>
          </button>
        )}
      </div>
    </div>
  );
}

ProxyDetail.propTypes = {
  proxy: PropTypes.shape({
    name: PropTypes.string,
    revision: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    lastModified: PropTypes.string
  }).isRequired,
  fileTree: PropTypes.object,
  onClose: PropTypes.func.isRequired
};

export default ProxyDetail;

