import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { 
  IconRocket, IconRefresh, IconTrace, IconActivity, IconEdit, 
  IconChevronRight, IconChevronDown, IconX, IconCheck
} from './Icons';
import styles from './ProxyDetail.module.css';

// ── SUB-COMPONENT: VisualFlowCanvas ──────────────────────────────────────────
const VisualFlowCanvas = ({ selectedPolicy, onSelectPolicy }) => {
  const getPolicyTypeClass = (name) => {
    const n = name.toLowerCase();
    if (n.includes('verify') || n.includes('apikey') || n.includes('quota') || n.includes('security')) return styles.policySecurity;
    if (n.includes('json') || n.includes('xml') || n.includes('transform') || n.includes('mediation')) return styles.policyMediation;
    return styles.policyTraffic;
  };

  return (
    <main className={styles.flowDesigner}>
      <div className={styles.flowContainer}>
        {/* Pipeline: Request */}
        <div className={styles.flowBox}>
          <div className={styles.flowLabel}>Request Pipeline</div>
          <div className={styles.pipeline}>
            <div className={styles.flowStep}>
              <div className={styles.stepIcon}>💻</div>
              <span className={styles.stepLabel}>App</span>
            </div>
            <IconChevronRight size={18} className={styles.flowArrow}/>
            
            <div 
              className={`${styles.flowStep} ${selectedPolicy?.name === 'Verify-API-Key-1' ? styles.activeStep : ''}`}
              onClick={() => onSelectPolicy({ name: 'Verify-API-Key-1', type: 'Security' })}
            >
              <div className={`${styles.stepIcon} ${getPolicyTypeClass('Verify')}`}>🛡️</div>
              <span className={styles.stepLabel}>Verify API Key</span>
            </div>
            
            <IconChevronRight size={18} className={styles.flowArrow}/>
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
            <IconChevronRight size={18} className={styles.flowArrow}/>
            
            <div 
              className={`${styles.flowStep} ${selectedPolicy?.name === 'JSON-to-XML-1' ? styles.activeStep : ''}`}
              onClick={() => onSelectPolicy({ name: 'JSON-to-XML-1', type: 'Mediation' })}
            >
              <div className={`${styles.stepIcon} ${getPolicyTypeClass('JSON')}`}>⚡</div>
              <span className={styles.stepLabel}>JSON to XML</span>
            </div>

            <IconChevronRight size={18} className={styles.flowArrow}/>
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
const XmlEditor = ({ xmlCode, setXmlCode, footerHeight, onResizerMouseDown, editorRef, isCollapsed, onToggleCollapse }) => {
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
          <div className={`${styles.codeTab} ${styles.activeCodeTab}`}>config.xml</div>
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
  onToggleCollapse: PropTypes.func.isRequired
};

// ── MAIN COMPONENT: ProxyDetail ──────────────────────────────────────────────
function ProxyDetail({ proxy, onClose }) {
  const [activeTab, setActiveTab] = useState('Develop');
  const [footerHeight, setFooterHeight] = useState(280);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [xmlCode, setXmlCode] = useState(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ProxyEndpoint name="default">
    <PreFlow name="PreFlow">
        <Request>
            <Step>
                <Name>Verify-API-Key-1</Name>
            </Step>
        </Request>
    </PreFlow>
    <PostFlow name="PostFlow">
        <Response>
            <Step>
                <Name>JSON-to-XML-1</Name>
            </Step>
        </Response>
    </PostFlow>
    <HTTPProxyConnection>
        <BasePath>/v1/hello</BasePath>
    </HTTPProxyConnection>
    <RouteRule name="default">
        <TargetEndpoint>default</TargetEndpoint>
    </RouteRule>
</ProxyEndpoint>`);

  const [expanded, setExpanded] = useState({
    policies: true,
    proxyEndpoints: true,
    endpointsDefault: true,
    targetEndpoints: false,
    scripts: false,
    xsl: false
  });

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

  const handleSelectPolicy = (policy) => {
    setSelectedPolicy(policy);
    setIsInspectorOpen(true);
    
    // Sincronización Inteligente: Scroll al tag <Name>
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
        <div className={styles.workspaceBody}>
          <aside className={styles.navigator}>
            <div className={styles.navHeader}>Project Explorer</div>
            <div className={styles.navTree}>
              {/* Policies Section */}
              <div className={styles.treeFolder} onClick={() => toggle('policies')}>
                {expanded.policies ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
                <span className={styles.folderIcon}>📁</span> Policies
              </div>
              {expanded.policies && (
                <div className={styles.treeSub}>
                  <div 
                    className={`${styles.treeItem} ${selectedPolicy?.name === 'Verify-API-Key-1' ? styles.activeTreeItem : ''}`}
                    onClick={() => handleSelectPolicy({ name: 'Verify-API-Key-1', type: 'Security' })}
                  >
                    <span className={styles.itemIcon}>⚡</span> Verify API Key 1
                  </div>
                  <div 
                    className={`${styles.treeItem} ${selectedPolicy?.name === 'JSON-to-XML-1' ? styles.activeTreeItem : ''}`}
                    onClick={() => handleSelectPolicy({ name: 'JSON-to-XML-1', type: 'Mediation' })}
                  >
                    <span className={styles.itemIcon}>⚡</span> JSON to XML 1
                  </div>
                  <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> Assign Message 1</div>
                  <div className={styles.treeItem}><span className={styles.itemIcon}>⚡</span> Quota 1</div>
                </div>
              )}

              {/* Proxy Endpoints Section */}
              <div className={styles.treeFolder} onClick={() => toggle('proxyEndpoints')}>
                {expanded.proxyEndpoints ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
                <span className={styles.folderIcon}>📁</span> Proxy Endpoints
              </div>
              {expanded.proxyEndpoints && (
                <div className={styles.treeSub}>
                  <div className={styles.treeFolder} onClick={(e) => { e.stopPropagation(); toggle('endpointsDefault'); }}>
                    {expanded.endpointsDefault ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
                    <span className={styles.folderIcon}>📁</span> default
                  </div>
                  {expanded.endpointsDefault && (
                    <div className={styles.treeSub}>
                      <div className={styles.treeItem}>
                        <span className={styles.itemIcon}>⚙️</span> PreFlow
                        <span className={styles.methodBadge}>ALL</span>
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
                        <span className={styles.methodBadge}>ALL</span>
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
              {expanded.targetEndpoints && (
                <div className={styles.treeSub}>
                  <div className={styles.treeItem}>
                    <span className={styles.itemIcon}>🔗</span> default
                  </div>
                </div>
              )}

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
            </div>
          </aside>

          <VisualFlowCanvas 
            selectedPolicy={selectedPolicy} 
            onSelectPolicy={handleSelectPolicy} 
          />
        </div>

        <PolicyInspector 
          policy={selectedPolicy} 
          isOpen={isInspectorOpen} 
          onClose={() => setIsInspectorOpen(false)} 
        />

        <XmlEditor 
          xmlCode={xmlCode} 
          setXmlCode={setXmlCode} 
          footerHeight={footerHeight}
          onResizerMouseDown={() => { isResizing.current = true; document.body.style.cursor = 'row-resize'; }}
          editorRef={editorRef}
          isCollapsed={isEditorCollapsed}
          onToggleCollapse={() => setIsEditorCollapsed(!isEditorCollapsed)}
        />
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
  onClose: PropTypes.func.isRequired
};

export default ProxyDetail;

