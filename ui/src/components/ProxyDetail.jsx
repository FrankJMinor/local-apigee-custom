import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import Editor, { loader } from '@monaco-editor/react';
import { 
  IconRocket, IconRefresh, IconTrace, IconActivity, IconEdit, 
  IconChevronRight, IconChevronDown, IconX, IconCheck, 
  IconVerifyAPIKey, IconQuota, IconXMLJSON, IconSpikeArrest,
  IconKVM, IconDiana, IconSet, IconCloud, IconLaptop,
  IconSave, IconCopy, IconDownload, IconTerminal, IconSettings
} from './Icons';

// Configuración global de Monaco para Apigee (Rhino/ES5)
const APIGEE_JS_TYPES = `
  /** El objeto context de Apigee para acceder a variables de flujo */
  declare const context: {
    getVariable(name: string): any;
    setVariable(name: string, value: any): void;
    removeVariable(name: string): void;
  };
  /** El objeto request entrante */
  declare const request: {
    content: string;
    headers: { [key: string]: string };
    queryParams: { [key: string]: string };
    verb: string;
    url: string;
  };
  /** El objeto response saliente */
  declare const response: {
    content: string;
    headers: { [key: string]: string };
    status: number;
  };
  /** Función print para debug en logs de Apigee */
  declare function print(message: any): void;
`;

loader.init().then(monaco => {
  // Configurar JS para que sea compatible con Rhino (ES5)
  // Nota: En Monaco, la configuración de JavaScript se encuentra bajo 'typescript'
  if (monaco.languages.typescript) {
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES5,
      allowNonTsExtensions: true,
      noLib: true, 
      checkJs: true
    });

    // Inyectar tipos de Apigee
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      APIGEE_JS_TYPES,
      'ts:filename/apigee.d.ts'
    );
  }
});
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
  if (t === 'Diana') return <IconDiana size={size} className={className} />;
  if (t === 'KVM') return <IconKVM size={size} className={className} />;
  if (t === 'Set') return <IconSet size={size} className={className} />;
  if (t === 'Cloud') return <IconCloud size={size} className={className} />;
  if (t === 'Laptop') return <IconLaptop size={size} className={className} />;
  
  return <span className={className} style={{fontSize: size === 14 ? '12px' : '18px', display: 'inline-block', textAlign: 'center', width: `${size}px`}}>⚡</span>;
};

// ── SUB-COMPONENT: VisualFlowCanvas ──────────────────────────────────────────
const FlowConnection = ({ reverse = false, track, index, dragOverInfo, setDragOverInfo, onDropPolicy }) => {
  const isDragOver = dragOverInfo?.track === track && dragOverInfo?.index === index;
  
  return (
    <div 
      className={`${styles.flowLink} ${reverse ? styles.reverseFlow : ''} ${isDragOver ? styles.dragOverActive : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (setDragOverInfo) setDragOverInfo({ track, index });
      }}
      onDragLeave={() => {
        if (setDragOverInfo) setDragOverInfo({ track: null, index: null });
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (setDragOverInfo) setDragOverInfo({ track: null, index: null });
        const policyName = e.dataTransfer.getData('policyName');
        const policyType = e.dataTransfer.getData('policyType');
        if (policyName && onDropPolicy) {
          onDropPolicy({ name: policyName, type: policyType }, track, index);
        }
      }}
    >
      <div className={styles.gasEffect}></div>
      <div className={styles.flowArrows}></div>
    </div>
  );
};

// Drag & Drop VisualFlowCanvas con diseño paralelo estilo Apigee
const VisualFlowCanvas = ({ selectedPolicy, onSelectPolicy, requestFlowDraft, responseFlowDraft, onDropPolicy, onRemovePolicy, isTarget }) => {
  const [dragOverInfo, setDragOverInfo] = useState({ track: null, index: null });

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e, target) => {
    e.preventDefault();
    const policyName = e.dataTransfer.getData('policyName');
    const policyType = e.dataTransfer.getData('policyType');
    if (policyName) onDropPolicy({ name: policyName, type: policyType }, target);
    setDragOverInfo({ track: null, index: null });
  };

  const renderTrack = (label, steps, target) => {
    const isReverse = target === 'response';
    return (
      <div className={styles.flowTrack} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, target)}>
        <div className={styles.trackPill}>{label}</div>
        <div className={styles.trackLine}>
          {steps.map((step, idx) => {
            const isEndpoint = step.name === 'App' || step.name === 'Target' || step.name === 'Backend';
            return (
              <React.Fragment key={step.id || step.name + idx}>
                <div 
                  className={`${styles.flowStep} ${selectedPolicy?.name === step.name ? styles.activeStep : ''}`}
                  onClick={() => onSelectPolicy(step)}
                >
                  <div className={styles.iconContainer}>
                    {getPolicyIcon(step.type, styles.trackIcon, 24)}
                    {!isEndpoint && (
                      <button 
                        className={styles.removeStepBtn} 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemovePolicy(step, target);
                        }}
                        title="Remove Policy"
                      >
                        <IconX size={10} />
                      </button>
                    )}
                  </div>
                  <span className={styles.stepLabel}>{step.name}</span>
                </div>
                {idx < steps.length - 1 && (
                  <FlowConnection 
                    reverse={isReverse} 
                    track={target}
                    index={idx}
                    dragOverInfo={dragOverInfo}
                    setDragOverInfo={setDragOverInfo}
                    onDropPolicy={onDropPolicy}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  const requestSteps = isTarget 
    ? [{ name: 'Proxy', type: 'Set' }, ...requestFlowDraft, { name: 'Backend', type: 'Cloud' }]
    : [{ name: 'App', type: 'Laptop' }, ...requestFlowDraft, { name: 'Target', type: 'Cloud' }];

  const responseSteps = isTarget
    ? [{ name: 'Backend', type: 'Cloud' }, ...responseFlowDraft, { name: 'Proxy', type: 'Set' }]
    : [{ name: 'Target', type: 'Cloud' }, ...responseFlowDraft, { name: 'App', type: 'Laptop' }];

  return (
    <main className={styles.flowDesigner}>
      <div className={styles.designerHeader}>
        <div className={styles.headerLeft}>SERVICE FLOW DESIGNER</div>
        <div className={styles.headerRight}>
          <span className={styles.sessionInfo}>Active Session: Flow-1</span>
          <span className={styles.statusInfo}>Status: Synchronized</span>
        </div>
      </div>
      <NeonFilter />
      <div className={styles.parallelTracks}>
        {renderTrack('REQUEST', requestSteps, 'request')}
        {renderTrack('RESPONSE', responseSteps, 'response')}
      </div>
    </main>
  );
};

VisualFlowCanvas.propTypes = {
  selectedPolicy: PropTypes.shape({ name: PropTypes.string, type: PropTypes.string }),
  onSelectPolicy: PropTypes.func.isRequired,
  requestFlowDraft: PropTypes.array.isRequired,
  responseFlowDraft: PropTypes.array.isRequired,
  onDropPolicy: PropTypes.func.isRequired,
  onRemovePolicy: PropTypes.func.isRequired
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

// ── SUB-COMPONENT: CodeEditor (Reemplaza a XmlEditor) ───────────────────────
const CodeEditor = ({ code, setCode, footerHeight, onResizerMouseDown, isCollapsed, onToggleCollapse, selectedFile, onSave, onPlay, isSaving, proxyName }) => {
  const language = selectedFile?.full_name?.endsWith('.js') ? 'javascript' : 'xml';
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const [errorCount, setErrorCount] = useState(0);

  const isModified = selectedFile && code !== selectedFile.content;
  const bundlePath = selectedFile ? `apiproxy/${selectedFile.path}` : '';

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Escuchar cambios en los markers para contar errores
    monaco.editor.onDidChangeMarkers(([uri]) => {
      const markers = monaco.editor.getModelMarkers({ resource: uri });
      setErrorCount(markers.filter(m => m.severity === 8).length);
    });
  };

  const handlePlayClick = () => {
    if (language === 'javascript' && monacoRef.current && editorRef.current) {
      const markers = monacoRef.current.editor.getModelMarkers({ owner: 'javascript' });
      const errors = markers.filter(m => m.severity === 8);
      
      if (errors.length > 0) {
        alert(`Error de sintaxis ES5 (Rhino):\n${errors[0].message} en línea ${errors[0].startLineNumber}`);
        return;
      }
    }
    onPlay();
  };

  return (
    <footer className={`${styles.codeEditor} ${isCollapsed ? styles.editorCollapsed : ''}`} style={{ height: isCollapsed ? '36px' : `${footerHeight}px` }}>
      {!isCollapsed && (
        <div className={styles.resizer} onMouseDown={onResizerMouseDown}>
          <div className={styles.resizerBar} />
        </div>
      )}

      {/* NEW: Top Info Header */}
      {!isCollapsed && (
        <div className={styles.editorTopInfo}>
          <div className={styles.infoLeft}>
            <span className={styles.infoLabel}>File</span>
            <span className={styles.infoValue}>{selectedFile?.full_name || '-'}</span>
            <span className={styles.infoLabel} style={{ marginLeft: '15px' }}>Bundle Path</span>
            <span className={styles.infoValuePath}>{bundlePath}</span>
          </div>
          <div className={styles.infoRight}>
            <div className={styles.usedIn}>
              <span className={styles.infoLabel}>Used in</span>
              <span className={styles.badgeJS}>JS</span>
              <span className={styles.badgePolicy}>{selectedFile?.name}</span>
              <span className={styles.badgeFlow}>LoggingPolicy</span>
            </div>
            <div className={styles.statusBadges}>
              {isModified && <span className={styles.statusModificado}>Modificado</span>}
              {errorCount > 0 && <span className={styles.statusError}>{errorCount} error{errorCount > 1 ? 'es' : ''}</span>}
            </div>
          </div>
        </div>
      )}
      
      <div className={styles.codeHeader}>
        <div className={styles.codeTabs}>
          <div className={`${styles.codeTab} ${styles.activeCodeTab}`}>
            {selectedFile?.full_name?.endsWith('.js') ? <span style={{color: '#f59e0b', marginRight: '6px', fontSize: '10px'}}>JS</span> : <span style={{color: '#3b82f6', marginRight: '6px', fontSize: '10px'}}>XML</span>}
            {selectedFile?.full_name || 'config.xml'}
            {isModified && <span className={styles.unsavedDot} />}
          </div>
        </div>
        <div className={styles.codeActions}>
          <button className={styles.iconAction} onClick={handlePlayClick} title="Validar y Desplegar"><IconRocket size={16} color="#10b981" /></button>
          <button className={styles.iconAction} onClick={onSave} title="Guardar" disabled={isSaving}><IconSave size={15} /></button>
          <button className={styles.iconAction} title="Reset"><IconRefresh size={15} /></button>
          <button className={styles.iconAction} title="Settings"><IconSettings size={15} /></button>
          <div className={styles.actionDivider} />
          <button className={styles.iconAction} title="Copy"><IconCopy size={15} /></button>
          <button className={styles.iconAction} title="Download"><IconDownload size={15} /></button>
          <button className={styles.iconAction} onClick={onToggleCollapse} title={isCollapsed ? "Expand" : "Collapse"}>
            <IconChevronDown size={16} style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}/>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className={styles.codeViewport} style={{ padding: 0, overflow: 'hidden' }}>
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            value={code}
            onChange={(val) => setCode(val)}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'Fira Code', 'Cascadia Code', monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              wordWrap: 'on',
              lineNumbersMinChars: 3,
              glyphMargin: false,
              folding: true,
              renderValidationDecorations: 'on',
              lineHeight: 22
            }}
          />
        </div>
      )}
    </footer>
  );
};

CodeEditor.propTypes = {
  code: PropTypes.string.isRequired,
  setCode: PropTypes.func.isRequired,
  footerHeight: PropTypes.number.isRequired,
  onResizerMouseDown: PropTypes.func.isRequired,
  isCollapsed: PropTypes.bool.isRequired,
  onToggleCollapse: PropTypes.func.isRequired,
  selectedFile: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onPlay: PropTypes.func.isRequired,
  isSaving: PropTypes.bool,
  proxyName: PropTypes.string
};

// ── MAIN COMPONENT: ProxyDetail ──────────────────────────────────────────────
function ProxyDetail({ proxy, fileTree, onClose }) {
  const [activeTab, setActiveTab] = useState('Develop');
  const [footerHeight, setFooterHeight] = useState(280);
  const [navigatorWidth, setNavigatorWidth] = useState(260);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFlow, setSelectedFlow] = useState({ name: 'PreFlow', method: 'ALL' });
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [xmlCode, setXmlCode] = useState('');
  const [fileCache, setFileCache] = useState({}); // Cache para persistir cambios entre archivos
  const [isSaving, setIsSaving] = useState(false);

  // Extraer flujos de un XML de Endpoint
  const getFlowsFromXml = (xml) => {
    if (!xml) return [];
    const flows = [];
    
    // 1. PreFlow
    if (xml.includes('<PreFlow')) flows.push({ name: 'PreFlow', method: 'ALL' });
    
    // 2. Flows condicionales - Extraer nombre y método (si existe en Condition)
    const flowRegex = /<Flow name="(.*?)">/gi;
    let match;
    while ((match = flowRegex.exec(xml)) !== null) {
      const flowName = match[1];
      // Buscar el bloque de este flujo para encontrar el método
      const blockRegex = new RegExp(`<Flow name="${flowName}">([\\s\\S]*?)<\\/Flow>`, 'i');
      const blockMatch = xml.match(blockRegex);
      let method = 'ALL';
      
      if (blockMatch) {
        const condition = blockMatch[1].match(/<Condition>[\s\S]*?request\.verb\s*=\s*"(.*?)"[\s\S]*?<\/Condition>/i);
        if (condition) method = condition[1].toUpperCase();
      }

      flows.push({ name: flowName, method });
    }

    // 3. PostFlow
    if (xml.includes('<PostFlow')) flows.push({ name: 'PostFlow', method: 'ALL' });
    
    // 4. PostClientFlow (solo en ProxyEndpoints)
    if (xml.includes('<PostClientFlow')) flows.push({ name: 'PostClientFlow', method: 'ALL' });
    
    return flows;
  };

  // Inicializar cache con los contenidos que ya vienen del backend
  useEffect(() => {
    if (fileTree) {
      const newCache = {};
      const traverse = (files) => {
        if (!files) return;
        files.forEach(f => {
          if (f.path) newCache[f.path] = f.content || "";
        });
      };
      
      // El root config
      if (fileTree.root_config) newCache[fileTree.root_config.path] = fileTree.root_config.content || "";
      
      // Las carpetas
      traverse(fileTree.policies);
      traverse(fileTree.proxy_endpoints);
      traverse(fileTree.target_endpoints);
      traverse(fileTree.scripts);
      
      setFileCache(newCache);
    }
  }, [fileTree]);

  const [expanded, setExpanded] = useState({
    policies: true,
    proxyEndpoints: true,
    endpointsDefault: true,
    targetEndpoints: true,
    scripts: false,
    xsl: false
  });

  // Arrastre de la pestaña de Properties
  const [inspectorTop, setInspectorTop] = useState(null);
  const [isDraggingInspector, setIsDraggingInspector] = useState(false);
  const [isResizingNav, setIsResizingNav] = useState(false);
  const dragStartY = useRef(0);
  const dragStartTop = useRef(0);
  const hasMovedInspector = useRef(false);
  const workspaceRef = useRef(null);

  const handleInspectorMouseDown = (e) => {
    setIsDraggingInspector(true);
    dragStartY.current = e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    const workspaceRect = workspaceRef.current.getBoundingClientRect();
    dragStartTop.current = rect.top - workspaceRect.top;
    hasMovedInspector.current = false;
    e.stopPropagation();
  };

  const handleNavResizeMouseDown = (e) => {
    setIsResizingNav(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Manejo de redimensión del Navigator (Left Sidebar)
      if (isResizingNav) {
        const newWidth = e.clientX - workspaceRef.current.getBoundingClientRect().left;
        if (newWidth > 150 && newWidth < 500) {
          setNavigatorWidth(newWidth);
        }
        return;
      }

      if (!isDraggingInspector) return;
      const deltaY = e.clientY - dragStartY.current;
      if (Math.abs(deltaY) > 5) {
        hasMovedInspector.current = true;
      }
      
      const workspaceHeight = workspaceRef.current.offsetHeight;
      const nextTop = dragStartTop.current + deltaY;
      
      // Limitar el movimiento dentro del workspace
      const boundedTop = Math.max(10, Math.min(nextTop, workspaceHeight - 120));
      setInspectorTop(boundedTop);
    };

    const handleMouseUp = () => {
      setIsDraggingInspector(false);
      setIsResizingNav(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    };

    if (isDraggingInspector || isResizingNav) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingInspector, isResizingNav]);

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
    
    // Si seleccionamos un endpoint, por defecto seleccionamos PreFlow
    if (file.type === 'ProxyEndpoint' || file.type === 'TargetEndpoint') {
      setSelectedFlow({ name: 'PreFlow', method: 'ALL' });
    } else {
      setSelectedFlow(null);
    }
    
    // 1. Prioridad: Usar el contenido que ya viene en el objeto (del backend)
    const initialContent = file.content !== undefined ? file.content : fileCache[file.path];
    
    if (initialContent !== undefined) {
      setXmlCode(initialContent);
      
      // Asegurar que esté en cache para persistencia de ediciones
      if (fileCache[file.path] === undefined) {
        setFileCache(prev => ({ ...prev, [file.path]: initialContent }));
      }

      // Si es una política, actualizamos la selección
      if (file.path.includes('policies')) {
        setSelectedPolicy({ name: file.name, type: file.type || 'Mediation' });
      }
      return;
    }

    // 2. Fallback: Carga manual (si por alguna razón no venía en el tree)
    try {
      const response = await fetch(`http://localhost:8446/v1/proxies/${proxy.name}/content?path=${encodeURIComponent(file.path)}`);
      const data = await response.json();
      if (data.content) {
        setXmlCode(data.content);
        setFileCache(prev => ({ ...prev, [file.path]: data.content }));
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

  // Estado temporal para el flujo de request y response (draft)
  const [requestFlowDraft, setRequestFlowDraft] = useState([]);
  const [responseFlowDraft, setResponseFlowDraft] = useState([]);

  // Actualizar el draft cuando se selecciona un ProxyEndpoint o TargetEndpoint o cambia el flujo
  useEffect(() => {
    if (selectedFile && (selectedFile.type === 'ProxyEndpoint' || selectedFile.type === 'TargetEndpoint')) {
      // Prioridad: Usar primero lo que está en caché (cambios locales), luego el contenido original
      const content = fileCache[selectedFile.path] || selectedFile.content || "";
      
      if (content && selectedFlow) {
        // Parser para obtener steps de UN flujo específico
        const getStepsFromFlow = (xml, flowName) => {
          let flowContent = "";
          
          if (flowName === 'PreFlow') {
            const match = xml.match(/<PreFlow[\s\S]*?>([\s\S]*?)<\/PreFlow>/i);
            if (match) flowContent = match[1];
          } else if (flowName === 'PostFlow') {
            const match = xml.match(/<PostFlow[\s\S]*?>([\s\S]*?)<\/PostFlow>/i);
            if (match) flowContent = match[1];
          } else if (flowName === 'PostClientFlow') {
            const match = xml.match(/<PostClientFlow[\s\S]*?>([\s\S]*?)<\/PostClientFlow>/i);
            if (match) flowContent = match[1];
          } else {
            const match = xml.match(new RegExp(`<Flow name="${flowName}">([\\s\\S]*?)<\\/Flow>`, 'i'));
            if (match) flowContent = match[1];
          }

          const parseSection = (xmlStr, sectionTag) => {
            if (!xmlStr) return [];
            const steps = [];
            const sectionRegex = new RegExp(`<${sectionTag}>([\\s\\S]*?)<\\/${sectionTag}>`, 'i');
            const sectionMatch = xmlStr.match(sectionRegex);
            if (!sectionMatch) return [];
            
            const stepRegex = /<Step>\s*<Name>(.*?)<\/Name>\s*<\/Step>/g;
            const sectionContent = sectionMatch[1];
            let sMatch;
            while ((sMatch = stepRegex.exec(sectionContent)) !== null) {
              const policyName = sMatch[1];
              const policyInfo = fileTree?.policies?.find(p => p.name === policyName);
              steps.push({ 
                name: policyName, 
                type: policyInfo?.type || 'Mediation',
                id: `${policyName}-${Math.random().toString(36).substr(2, 9)}`
              });
            }
            return steps;
          };

          return {
            req: parseSection(flowContent, 'Request'),
            res: parseSection(flowContent, 'Response')
          };
        };

        const { req, res } = getStepsFromFlow(content, selectedFlow.name);
        setRequestFlowDraft(req);
        setResponseFlowDraft(res);
      }
    } else {
      setRequestFlowDraft([]);
      setResponseFlowDraft([]);
    }
  }, [selectedFile, selectedFlow, fileCache, fileTree]);

  // Función para actualizar SOLO la sección del flujo seleccionado en el XML
  const syncDraftToXml = (requestSteps, responseSteps) => {
    if (!selectedFile || !selectedFlow) return;
    
    // Usar el XML actual de la caché si existe, si no el original
    const currentXml = fileCache[selectedFile.path] || selectedFile.content || "";
    
    // Generar el nuevo bloque de Request/Response
    let newReq = "        <Request>";
    requestSteps.forEach(p => { newReq += `\n            <Step>\n                <Name>${p.name}</Name>\n            </Step>`; });
    newReq += "\n        </Request>";

    let newRes = "        <Response>";
    responseSteps.forEach(p => { newRes += `\n            <Step>\n                <Name>${p.name}</Name>\n            </Step>`; });
    newRes += "\n        </Response>";

    let updatedXml = currentXml;

    if (selectedFlow.name === 'PreFlow') {
      const regex = /(<PreFlow[\s\S]*?>)[\s\S]*?(<\/PreFlow>)/i;
      updatedXml = currentXml.replace(regex, `$1\n${newReq}\n${newRes}\n    $2`);
    } else if (selectedFlow.name === 'PostFlow') {
      const regex = /(<PostFlow[\s\S]*?>)[\s\S]*?(<\/PostFlow>)/i;
      updatedXml = currentXml.replace(regex, `$1\n${newReq}\n${newRes}\n    $2`);
    } else if (selectedFlow.name === 'PostClientFlow') {
      const regex = /(<PostClientFlow[\s\S]*?>)[\s\S]*?(<\/PostClientFlow>)/i;
      updatedXml = currentXml.replace(regex, `$1\n${newRes}\n    $2`); // PostClientFlow solo tiene Response
    } else {
      const regex = new RegExp(`(<Flow name="${selectedFlow.name}">)[\\s\\S]*?(<\\/Flow>)`, 'i');
      updatedXml = currentXml.replace(regex, `$1\n${newReq}\n${newRes}\n    $2`);
    }

    setXmlCode(updatedXml);
    setFileCache(prev => ({ ...prev, [selectedFile.path]: updatedXml }));
  };

  // Handler para drop de política
  const handleDropPolicy = (policy, target, index) => {
    // Crear un nuevo step con ID único
    const newStep = { ...policy, id: `${policy.name}-${Date.now()}` };
    
    let nextReq = [...requestFlowDraft];
    let nextRes = [...responseFlowDraft];

    if (target === 'request') {
      if (index !== undefined && index !== null) nextReq.splice(index, 0, newStep);
      else nextReq.push(newStep);
      setRequestFlowDraft(nextReq);
    } else if (target === 'response') {
      if (index !== undefined && index !== null) nextRes.splice(index, 0, newStep);
      else nextRes.push(newStep);
      setResponseFlowDraft(nextRes);
    }

    // Sincronizar al XML inmediatamente
    syncDraftToXml(nextReq, nextRes);
  };

  const handleRemovePolicy = (policyToRemove, target) => {
    let nextReq = [...requestFlowDraft];
    let nextRes = [...responseFlowDraft];

    if (target === 'request') {
      nextReq = nextReq.filter(p => p.id !== policyToRemove.id);
      setRequestFlowDraft(nextReq);
    } else if (target === 'response') {
      nextRes = nextRes.filter(p => p.id !== policyToRemove.id);
      setResponseFlowDraft(nextRes);
    }

    if (selectedPolicy?.id === policyToRemove.id) {
      setSelectedPolicy(null);
    }

    // Sincronizar al XML inmediatamente
    syncDraftToXml(nextReq, nextRes);
  };

  // Hacer policies draggables
  const makePolicyDraggable = (policy) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData('policyName', policy.name);
      e.dataTransfer.setData('policyType', policy.type);
    }
  });

  const handleSave = async () => {
    if (!selectedFile) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`http://localhost:8446/v1/proxies/${proxy.name}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile.path,
          content: xmlCode
        })
      });

      if (!response.ok) throw new Error('Error al guardar archivo');
      
      // Actualizar el objeto selectedFile localmente para que content coincida
      selectedFile.content = xmlCode;
      alert('Archivo guardado correctamente');
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlay = async () => {
    await handleSave();
    alert('Proxy actualizado en el emulador');
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
      <div className={styles.workspace} ref={workspaceRef}>
        <aside className={styles.navigator} style={{ width: navigatorWidth }}>
          <div className={styles.navHeader}>Project Explorer</div>
          <div 
            className={`${styles.navResizer} ${isResizingNav ? styles.navResizing : ''}`} 
            onMouseDown={handleNavResizeMouseDown} 
          />
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
                      {...makePolicyDraggable(policy)}
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
                    <React.Fragment key={endpoint.path}>
                      <div 
                        className={`${styles.treeItem} ${selectedFile?.path === endpoint.path && !selectedFlow ? styles.activeTreeItem : ''}`}
                        onClick={() => handleSelectFile(endpoint)}
                      >
                        <span className={styles.itemIcon}>⚙️</span> {endpoint.name}
                      </div>
                      {selectedFile?.path === endpoint.path && (
                        <div className={styles.treeSub}>
                          {getFlowsFromXml(selectedFile.content || fileCache[selectedFile.path] || "").map(flow => (
                            <div 
                              key={flow.name}
                              className={`${styles.flowItem} ${selectedFlow?.name === flow.name ? styles.activeFlowItem : ''}`}
                              onClick={() => setSelectedFlow(flow)}
                            >
                              <span className={`${styles.methodBadge} ${styles['method' + flow.method]}`}>
                                {flow.method}
                              </span>
                              <span className={styles.flowName}>{flow.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
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
                    <React.Fragment key={target.path}>
                      <div 
                        className={`${styles.treeItem} ${selectedFile?.path === target.path && !selectedFlow ? styles.activeTreeItem : ''}`}
                        onClick={() => handleSelectFile(target)}
                      >
                        <span className={styles.itemIcon}>🔗</span> {target.name}
                      </div>
                      {selectedFile?.path === target.path && (
                        <div className={styles.treeSub}>
                          {getFlowsFromXml(selectedFile.content || fileCache[selectedFile.path] || "").map(flow => (
                            <div 
                              key={flow.name}
                              className={`${styles.flowItem} ${selectedFlow?.name === flow.name ? styles.activeFlowItem : ''}`}
                              onClick={() => setSelectedFlow(flow)}
                            >
                              <span className={`${styles.methodBadge} ${styles['method' + flow.method]}`}>
                                {flow.method}
                              </span>
                              <span className={styles.flowName}>{flow.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
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
            requestFlowDraft={requestFlowDraft}
            responseFlowDraft={responseFlowDraft}
            onDropPolicy={handleDropPolicy}
            onRemovePolicy={handleRemovePolicy}
            isTarget={selectedFile?.type === 'TargetEndpoint'}
          />

          <CodeEditor 
            code={xmlCode} 
            setCode={(newVal) => {
              setXmlCode(newVal);
              if (selectedFile) {
                setFileCache(prev => ({ ...prev, [selectedFile.path]: newVal }));
              }
            }} 
            footerHeight={footerHeight}
            onResizerMouseDown={() => { 
              isResizing.current = true; 
              document.body.style.cursor = 'row-resize'; 
              document.body.style.userSelect = 'none';
            }}
            isCollapsed={isEditorCollapsed}
            onToggleCollapse={() => setIsEditorCollapsed(!isEditorCollapsed)}
            selectedFile={selectedFile}
            onSave={handleSave}
            onPlay={handlePlay}
            isSaving={isSaving}
            proxyName={proxy.name}
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
            onMouseDown={handleInspectorMouseDown}
            onClick={() => {
              if (!hasMovedInspector.current) {
                setIsInspectorOpen(true);
              }
            }}
            style={inspectorTop !== null ? { top: inspectorTop, transform: 'none' } : {}}
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

