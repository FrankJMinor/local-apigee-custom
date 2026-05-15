import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import Editor, { loader } from '@monaco-editor/react';
import {
    IconRocket, IconRefresh, IconTrace, IconActivity, IconEdit,
    IconChevronRight, IconChevronDown, IconX, IconCheck,
    IconVerifyAPIKey, IconQuota, IconXMLJSON, IconSpikeArrest,
    IconKVM, IconDiana, IconSet, IconCloud, IconLaptop,
    IconSave, IconCopy, IconDownload, IconTerminal, IconSettings,
    IconPlus
} from '../components/Icons';
import { AddFlowModal } from '../components/AddFlowModal';
import { AddPolicyModal } from '../components/AddPolicyModal';
import AddResourceModal from '../components/AddResourceModal';
import SpikeArrestSVG from '../../icons/SpikeArrest.svg';
import AssignMessageSVG from '../../icons/AssignMessage.svg';
import CloudSVG from '../../icons/Cloud.svg';
import ExtractVariablesSVG from '../../icons/ExtractVariables.svg';
import FlowCalloutSVG from '../../icons/FlowCallout.svg';
import JavascriptSVG from '../../icons/Javascript.svg';
import JSONToXMLSVG from '../../icons/JSONToXML.svg';
import KeyValueMapOperationsSVG from '../../icons/KeyValueMapOperations.svg';
import RaiseFaultSVG from '../../icons/RaiseFault.svg';
import styles from '../components/ProxyDetail.module.css';
import CacheSVG from '../../icons/Cache.svg';

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
const getFileIcon = (fileName, size = 14) => {
    if (fileName.endsWith('.js')) {
        return (
            <span style={{
                backgroundColor: '#f59e0b', color: '#000', padding: '1px 3px',
                borderRadius: '2px', fontSize: '9px', fontWeight: 'bold',
                marginRight: '6px', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', width: '14px', height: '14px', lineHeight: '1'
            }}>JS</span>
        );
    }
    return <span style={{ marginRight: '6px' }}>📄</span>;
};

const getPolicyIcon = (type, className, size = 24) => {
    const t = type || "";
    const iconStyle = { width: size, height: size, filter: 'url(#neonGlowIcon)' };

    const cloudPolicies = [
        'MonetizationLimitsCheck', 'XSLTransform', 'OpenAPISpecValidation',
        'SOAPMessageValidation', 'AccessEntity'
    ];

    // NUEVA REGLA DE CACHE (Cache.svg)
    const cachePolicies = [
        'ResponseCache',
        'LookupCache',
        'PopulateCache',
        'InvalidateCache'
    ];

    if (cloudPolicies.includes(t) || t === 'Cloud') {
        return <img src={CloudSVG} className={className} style={iconStyle} alt="Cloud" />;
    }

    if (cachePolicies.includes(t)) {
        return <img src={CacheSVG} className={className} style={iconStyle} alt="Cache" />;
    }


    switch (t) {
        case 'AssignMessage': return <img src={AssignMessageSVG} className={className} style={iconStyle} />;
        case 'ExtractVariables': return <img src={ExtractVariablesSVG} className={className} style={iconStyle} />;
        case 'FlowCallout': return <img src={FlowCalloutSVG} className={className} style={iconStyle} />;
        case 'Javascript': case 'Script': return <img src={JavascriptSVG} className={className} style={iconStyle} />;
        case 'JSONToXML': case 'XMLToJSON': return <img src={JSONToXMLSVG} className={className} style={iconStyle} />;
        case 'KeyValueMapOperations': case 'KVM': return <img src={KeyValueMapOperationsSVG} className={className} style={iconStyle} />;
        case 'RaiseFault': return <img src={RaiseFaultSVG} className={className} style={iconStyle} />;
        case 'SpikeArrest': return <img src={SpikeArrestSVG} className={className} style={iconStyle} />;
        case 'SpikeArrest': return <img src={SpikeArrestSVG} className={className} style={iconStyle} alt="SA" />;
        case 'Laptop': return <IconLaptop size={size} className={className} />;
        case 'Set': return <IconSet size={size} className={className} />;
        default: return <span style={{ fontSize: size === 14 ? '12px' : '18px', marginRight: '6px' }}>⚙️</span>;
    }
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

const VisualFlowCanvas = ({ selectedPolicy, onSelectPolicy, flowStepsDraft, onDropPolicy, onRemovePolicy }) => {
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
        return (
            <div className={styles.flowTrack} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, target)}>
                <div className={styles.trackPill}>{label}</div>
                <div className={styles.trackLine}>
                    {steps.map((step, idx) => {
                        const isEndpoint = step.name === 'Input' || step.name === 'Output';
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

    const steps = [{ name: 'Input', type: 'Laptop' }, ...flowStepsDraft, { name: 'Output', type: 'Cloud' }];

    return (
        <main className={styles.flowDesigner}>
            <div className={styles.designerHeader}>
                <div className={styles.headerLeft}>SHARED FLOW DESIGNER</div>
                <div className={styles.headerRight}>
                    <span className={styles.statusInfo}>Status: Synchronized</span>
                </div>
            </div>
            <NeonFilter />
            <div className={styles.parallelTracks}>
                {renderTrack('STEPS', steps, 'flow')}
            </div>
        </main>
    );
};

// ── SUB-COMPONENT: PolicyInspector ───────────────────────────────────────────
const PolicyInspector = ({ policy, isOpen, onClose }) => {
    return (
        <aside className={`${styles.inspectorDrawer} ${isOpen ? styles.drawerOpen : ''}`}>
            <div className={styles.drawerHeader}>
                <div className={styles.drawerTitle}><IconEdit size={14} /><span>Policy Properties</span></div>
                <button className={styles.closeBtn} onClick={onClose}><IconX size={18} /></button>
            </div>
            {policy ? (
                <div className={styles.drawerContent}>
                    <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Policy Name</label><div className={styles.fieldValue}>{policy.name}</div></div>
                    <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Type</label><div className={`${styles.typeBadge} ${styles['type' + policy.type]}`}>{policy.type}</div></div>
                    <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Configuration (XML Snippet)</label><div className={styles.xmlSnippet}>{`<${policy.name.split('-')[0]} name="${policy.name}" />`}</div></div>
                    <button className={styles.saveBtn}><IconCheck size={14} /> Save Configuration</button>
                </div>
            ) : <div className={styles.emptyState}>Select a policy to inspect</div>}
        </aside>
    );
};

// ── SUB-COMPONENT: CodeEditor ──────────────────────────────────────────────
const CodeEditor = ({ code, setCode, footerHeight, onResizerMouseDown, isCollapsed, onToggleCollapse, selectedFile, onSave, onPlay, isSaving, isVolatile, onEditorMount, onReset }) => {
    const language = selectedFile?.full_name?.endsWith('.js') ? 'javascript' : 'xml';
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const [errorCount, setErrorCount] = useState(0);

    const isModified = selectedFile && code !== selectedFile.content;
    const bundlePath = selectedFile ? `sharedflowbundle/${selectedFile.path.split('sharedflowbundle/')[1] || selectedFile.path}` : '';

    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        if (onEditorMount) {
            onEditorMount(editor, monaco);
        }

        monaco.editor.onDidChangeMarkers(([uri]) => {
            const markers = monaco.editor.getModelMarkers({ resource: uri });
            setErrorCount(markers.filter(m => m.severity === 8).length);
        });
    };

    return (
        <footer className={`${styles.codeEditor} ${isCollapsed ? styles.editorCollapsed : ''}`} style={{ height: isCollapsed ? '36px' : `${footerHeight}px` }}>
            {!isCollapsed && <div className={styles.resizer} onMouseDown={onResizerMouseDown}><div className={styles.resizerBar} /></div>}
            {!isCollapsed && (
                <div className={styles.editorTopInfo}>
                    <div className={styles.infoLeft}><span className={styles.infoLabel}>File</span><span className={styles.infoValue}>{selectedFile?.full_name || '-'}</span><span className={styles.infoLabel} style={{ marginLeft: '15px' }}>Bundle Path</span><span className={styles.infoValuePath}>{bundlePath}</span></div>
                    <div className={styles.infoRight}><div className={styles.statusBadges}>{isModified && <span className={styles.statusModificado}>Modificado</span>}{errorCount > 0 && <span className={styles.statusError}>{errorCount} error{errorCount > 1 ? 'es' : ''}</span>}</div></div>
                </div>
            )}
            <div className={styles.codeHeader}>
                <div className={styles.codeTabs}>
                    <div className={`${styles.codeTab} ${styles.activeCodeTab}`}>
                        <span style={{ 
                            fontStyle: isVolatile ? 'italic' : 'normal', 
                            opacity: isVolatile ? 0.8 : 1 
                        }}>
                            {selectedFile?.full_name || 'config.xml'}
                        </span>
                    </div>
                </div>
                <div className={styles.codeActions}>
                    <button className={styles.iconAction} onClick={onPlay} title="Deploy"><IconRocket size={16} color="#10b981" /></button>
                    <button className={styles.iconAction} onClick={onSave} disabled={isSaving} title="Save"><IconSave size={15} /></button>
                    <button className={styles.iconAction} onClick={onReset} title="Refresh"><IconRefresh size={15} /></button>
                    <div className={styles.actionDivider} /><button className={styles.iconAction} title="Copy"><IconCopy size={15} /></button><button className={styles.iconAction} title="Download"><IconDownload size={15} /></button>
                </div>
            </div>
            {!isCollapsed && (
                <div className={styles.codeViewport} style={{ padding: 0, overflow: 'hidden' }}>
                    <Editor 
                        height="100%" 
                        language={language} 
                        theme="vs-dark" 
                        value={code} 
                        onChange={(val) => {
                            if (val !== code) {
                                setCode(val, selectedFile?.path);
                            }
                        }} 
                        onMount={handleEditorDidMount} 
                        options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, wordWrap: 'on' }} 
                    />
                </div>
            )}
        </footer>
    );
};

// ── MAIN PAGE COMPONENT: SharedFlowDetailPage ──────────────────────────────
function SharedFlowDetailPage() {
    const { sharedFlowName } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sharedFlow, setSharedFlow] = useState(null);
    const [fileTree, setFileTree] = useState(null);

    const [activeTab, setActiveTab] = useState('Develop');
    const [footerHeight, setFooterHeight] = useState(280);
    const [navigatorWidth, setNavigatorWidth] = useState(260);
    const [selectedPolicy, setSelectedPolicy] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
    const [xmlCode, setXmlCode] = useState('');
    const [fileCache, setFileCache] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [flowStepsDraft, setFlowStepsDraft] = useState([]);


    // --- ESTADOS PARA MODALES Y VOLATILIDAD ---
    const [isAddPolicyModalOpen, setIsAddPolicyModalOpen] = useState(false);
    const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
    const [isAddFlowModalOpen, setIsAddFlowModalOpen] = useState(false); 

    const [localFiles, setLocalFiles] = useState([]); // Políticas
    const [localScripts, setLocalScripts] = useState([]); // Scripts
    const [localSharedFlows, setLocalSharedFlows] = useState([]); // Archivos de Shared Flow
    const [isVolatile, setIsVolatile] = useState(true);

    const [expanded, setExpanded] = useState({ policies: true, sharedFlows: true, flow: true, scripts: false });
    const [inspectorTop, setInspectorTop] = useState(null);
    const [isDraggingInspector, setIsDraggingInspector] = useState(false);
    const [isResizingNav, setIsResizingNav] = useState(false);
    const dragStartY = useRef(0);
    const dragStartTop = useRef(0);
    const workspaceRef = useRef(null);
    const isResizing = useRef(false);
    const requestRef = useRef();

    // Optimización de Resize con requestAnimationFrame
    const handleFooterMouseMove = useCallback((e) => {
        if (!isResizing.current) return;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);

        requestRef.current = requestAnimationFrame(() => {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 120 && newHeight < 600) {
                setFooterHeight(newHeight);
            }
        });
    }, []);

    const handleFooterMouseUp = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }, []);

    useEffect(() => {
        globalThis.addEventListener('mousemove', handleFooterMouseMove);
        globalThis.addEventListener('mouseup', handleFooterMouseUp);
        return () => {
            globalThis.removeEventListener('mousemove', handleFooterMouseMove);
            globalThis.removeEventListener('mouseup', handleFooterMouseUp);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [handleFooterMouseMove, handleFooterMouseUp]);

    useEffect(() => {
        setLoading(true);
        const fetchGeneral = fetch('http://localhost:8446/v1/sharedflows/deployed')
            .then(res => res.json())
            .then(data => {
                const found = (data.shared_flows || []).find(n => n === sharedFlowName);
                return found ? { name: found, revision: data.revision || '1' } : { name: sharedFlowName, revision: '1' };
            });

        const fetchFiles = fetch(`http://localhost:8446/v1/sharedflows/${sharedFlowName}/files`)
            .then(res => { if (!res.ok) throw new Error(`Error: ${res.status}`); return res.json(); });

        Promise.all([fetchGeneral, fetchFiles])
            .then(([foundFlow, fileData]) => {
                setSharedFlow(foundFlow);
                setFileTree(fileData.files);

                // Prioridad: Buscar default.xml en la carpeta sharedflows
                const defaultXml = fileData.files?.shared_flows?.find(f => f.full_name === 'default.xml');

                // Fallback: Buscar XML principal del SharedFlow (tipo SharedFlow) o el root_config
                const mainXml = defaultXml || fileData.files?.policies?.find(p => p.type === 'SharedFlow') || fileData.files?.root_config;

                if (mainXml) handleSelectFile(mainXml);
                else if (fileData.files?.policies?.length > 0) handleSelectFile(fileData.files.policies[0]);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [sharedFlowName]);

    useEffect(() => {
        if (fileTree) {
            setLocalFiles(fileTree.policies || []);
            setLocalScripts(fileTree.scripts || []);
            setLocalSharedFlows(fileTree.shared_flows || []);

            const newCache = {};
            const traverse = (files) => files?.forEach(f => { if (f.path) newCache[f.path] = f.content || ""; });
            if (fileTree.root_config) newCache[fileTree.root_config.path] = fileTree.root_config.content || "";
            traverse(fileTree.policies);
            traverse(fileTree.shared_flows);
            traverse(fileTree.scripts);
            setFileCache(prev => ({ ...prev, ...newCache }));


        }
    }, [fileTree]);

    const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

    const handleSelectFile = async (file) => {
        setSelectedFile(file);
        const initialContent = file.content !== undefined ? file.content : fileCache[file.path];
        if (initialContent !== undefined) {
            setXmlCode(initialContent);
            if (file.path.includes('policies')) setSelectedPolicy({ name: file.name, type: file.type || 'Mediation' });
            return;
        }
        try {
            const res = await fetch(`http://localhost:8446/v1/sharedflows/${sharedFlowName}/content?path=${encodeURIComponent(file.path)}`);
            const data = await res.json();
            if (data.content) {
                setXmlCode(data.content);
                setFileCache(prev => ({ ...prev, [file.path]: data.content }));
            }
        } catch (e) { setXmlCode(`<!-- Error loading ${file.path} -->`); }
    };

    const handleSelectPolicy = (policy) => {
        const policyFile = fileTree?.policies?.find(f => f.name === policy.name);
        if (policyFile) handleSelectFile(policyFile);
        setSelectedPolicy(policy);
    };

    useEffect(() => {
        const content = fileCache[selectedFile?.path] || selectedFile?.content || "";
        if (content && selectedFile?.full_name?.endsWith('.xml')) {
            const steps = [];
            const stepRegex = /<Step>\s*<Name>(.*?)<\/Name>\s*<\/Step>/g;
            let sMatch;
            while ((sMatch = stepRegex.exec(content)) !== null) {
                const pName = sMatch[1];
                // BUSQUEDA CLAVE: Ahora localFiles es una dependencia, por lo que siempre encontrará el tipo
                const pInfo = localFiles?.find(p => p.name === pName || p.name === `${pName}.xml`); 
                steps.push({ 
                    name: pName, 
                    type: pInfo?.type || 'Mediation', // Si no lo encuentra, usa Mediation (engrane)
                    id: `${pName}-${Math.random().toString(36).substr(2, 9)}` 
                });
            }
            setFlowStepsDraft(steps);
        }
        // AGREGAR localFiles aquí es vital para que el icono cargue tras crear la política
    }, [selectedFile, fileCache, fileTree, localFiles]);

    const handleSave = async () => {
        if (!selectedFile) return;
        setIsSaving(true);
        try {
            const res = await fetch(`http://localhost:8446/v1/sharedflows/${sharedFlowName}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: selectedFile.path, content: xmlCode })
            });
            if (!res.ok) throw new Error('Error al guardar');
            selectedFile.content = xmlCode;
            alert('Guardado correctamente');
        } catch (e) { alert(e.message); } finally { setIsSaving(false); }
    };

    const handleDropPolicy = (policy, target, index) => {
        const newStep = { ...policy, id: `${policy.name}-${Date.now()}` };
        const nextSteps = [...flowStepsDraft];
        if (index !== undefined && index !== null) nextSteps.splice(index, 0, newStep);
        else nextSteps.push(newStep);

        let newStepsXml = "";
        nextSteps.forEach(p => { newStepsXml += `\n    <Step>\n        <Name>${p.name}</Name>\n    </Step>`; });
        const currentXml = fileCache[selectedFile.path] || selectedFile.content || "";
        const updatedXml = currentXml.replace(/(<SharedFlow[\s\S]*?>)[\s\S]*?(<\/SharedFlow>)/i, `$1${newStepsXml}\n$2`);

        setXmlCode(updatedXml);
        setFileCache(prev => ({ ...prev, [selectedFile.path]: updatedXml }));
        setFlowStepsDraft(nextSteps);
    };

    const handleRemovePolicy = (policyToRemove) => {
        const nextSteps = flowStepsDraft.filter(p => p.id !== policyToRemove.id);
        let newStepsXml = "";
        nextSteps.forEach(p => { newStepsXml += `\n    <Step>\n        <Name>${p.name}</Name>\n    </Step>`; });
        const currentXml = fileCache[selectedFile.path] || selectedFile.content || "";
        const updatedXml = currentXml.replace(/(<SharedFlow[\s\S]*?>)[\s\S]*?(<\/SharedFlow>)/i, `$1${newStepsXml}\n$2`);

        setXmlCode(updatedXml);
        setFileCache(prev => ({ ...prev, [selectedFile.path]: updatedXml }));
        setFlowStepsDraft(nextSteps);
    };

    const handleCreatePolicy = (selectedType, formData) => {
        try {
            const policyName = formData.name;
            let xmlContent = selectedType.xml_template;

            if (!xmlContent) return;

            xmlContent = xmlContent.replace(/name="[^"]*"/, `name="${policyName}"`);
            xmlContent = xmlContent.replace(/<DisplayName>.*?<\/DisplayName>/, `<DisplayName>${policyName}</DisplayName>`);

            const newFile = {
                name: policyName,
                full_name: `${policyName}.xml`,
                type: selectedType.name,
                content: xmlContent,
                path: `policies/${policyName}.xml`
            };

            setLocalFiles(prev => [...prev, newFile]);
            setFileCache(prev => ({ ...prev, [newFile.path]: xmlContent }));
            handleSelectFile(newFile);
            setIsAddPolicyModalOpen(false);
        } catch (error) {
            console.error("Error adding policy:", error);
        }
    };

    // --- HANDLER DE RECURSOS (SCRIPTS) VOLÁTILES ---
    const handleAddLocalResource = async (resourceData) => {
        const { name, folder, content, file, source, type } = resourceData;
        const path = `resources/${folder}/${name}`;

        try {
            let finalContent = content;
            if (source === 'import' && file) {
                finalContent = await file.text();
            }

            const newFile = {
                name,
                full_name: name,
                path,
                content: finalContent || '',
                type: type || 'Script'
            };

            // Actualizar estados locales (Volátil)
            setLocalScripts(prev => [...prev, newFile]);
            setFileCache(prev => ({ ...prev, [path]: newFile.content }));

            // Abrir automáticamente en el editor
            handleSelectFile(newFile, true); 
            setIsAddResourceModalOpen(false);
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    const handleAddFlow = (xmlData) => {
            // Extraemos el nombre del flujo del XML generado por el modal
            const flowName = xmlData.match(/name="(.*?)"/)?.[1] || "NewSharedFlow";
            const path = `sharedflows/${flowName}.xml`;

            const sharedFlowXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <SharedFlow name="${flowName}">
                    <Description/>
                    <Step>
                        <Name>Default-Policy</Name>
                    </Step>
                </SharedFlow>`;

            const newFile = {
                name: flowName,
                full_name: `${flowName}.xml`,
                path: path,
                content: sharedFlowXml,
                type: 'SharedFlow'
            };

            // Actualizamos el estado local para el Navigator y la caché
            setLocalSharedFlows(prev => [...prev, newFile]);
            setFileCache(prev => ({ ...prev, [path]: sharedFlowXml }));
            
            handleSelectFile(newFile, true);
            setIsAddFlowModalOpen(false);
        };

    const handleDeletePolicy = (policyName) => {
        const cleanName = policyName.replace('.xml', '');

        // 1. Eliminar de localFiles y limpiar default.xml si estuviese dentro
        setLocalFiles(prev => {
            return prev
                .filter(file => file.name !== `${cleanName}.xml` && file.name !== cleanName)
                .map(file => {
                    if (file.name === 'default.xml' || file.name === 'default') {
                        const stepRegex = new RegExp(`<Step>[\\s\\S]*?<Name>${cleanName}</Name>[\\s\\S]*?</Step>\\s*`, 'gi');
                        return { ...file, content: file.content.replace(stepRegex, '') };
                    }
                    return file;
                });
        });

        // 2. Limpieza de XML en fileCache (Endpoints/SharedFlows)
        setFileCache(prevCache => {
            const newCache = { ...prevCache };
            Object.keys(newCache).forEach(path => {
                if (path.endsWith('default.xml')) {
                    const stepRegex = new RegExp(`<Step>[\\s\\S]*?<Name>${cleanName}</Name>[\\s\\S]*?</Step>\\s*`, 'gi');
                    newCache[path] = newCache[path].replace(stepRegex, '');
                }
            });
            if (selectedFile && selectedFile.path.endsWith('default.xml')) {
                setXmlCode(newCache[selectedFile.path]);
            }
            return newCache;
        });

        // 3. Limpiar de los flujos visuales
        setFlowStepsDraft(prev => prev.filter(p => p.name !== cleanName));

        // 4. Limpiar estado del editor
        if (selectedFile && (selectedFile.name === cleanName || selectedFile.name === `${cleanName}.xml`)) {
            setSelectedFile(null);
            setSelectedPolicy(null);
            setXmlCode('');
        }
    };

    const handleNavResizeMouseDown = (e) => {
        setIsResizingNav(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleInspectorMouseDown = (e) => {
        setIsDraggingInspector(true);
        dragStartY.current = e.clientY;
        const rect = e.currentTarget.getBoundingClientRect();
        const workspaceRect = workspaceRef.current.getBoundingClientRect();
        dragStartTop.current = rect.top - workspaceRect.top;
        e.stopPropagation();
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isResizingNav) {
                const newWidth = e.clientX - workspaceRef.current.getBoundingClientRect().left;
                if (newWidth > 150 && newWidth < 500) setNavigatorWidth(newWidth);
                return;
            }
            if (!isDraggingInspector) return;
            const deltaY = e.clientY - dragStartY.current;
            const workspaceHeight = workspaceRef.current.offsetHeight;
            const nextTop = dragStartTop.current + deltaY;
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

    if (loading) return <div style={{ padding: 40 }}>Cargando Shared Flow...</div>;
    if (error) return <div style={{ padding: 40, color: '#ef4444' }}>Error: {error}</div>;

    return (
        <div className={styles.detailWrapper}>
            <header className={styles.headerRow}>
                <div className={styles.headerTitleArea}>
                    <div className={styles.breadcrumbs}>
                        <span className={styles.breadcrumbLink} onClick={() => navigate('/shared-flows')}>Shared Flows</span>
                        <IconChevronRight size={12} /><span className={styles.currentBreadcrumb}>{sharedFlowName}</span>
                    </div>
                    <h1 className={styles.proxyTitle}>{sharedFlowName}</h1>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.revIndicator}><span className={styles.revLabel}>Revision</span><span className={styles.revValue}>{sharedFlow.revision}</span></div>
                    <div className={styles.statusChip}>● Active</div>
                    <div className={styles.actionGroup}>
                        <button className={styles.btnSave} onClick={handleSave}><IconEdit size={14} /> Save</button>
                        <button className={styles.btnDeploy} onClick={handleSave}><IconRocket size={14} /> Deploy</button>
                    </div>
                </div>
            </header>
            <nav className={styles.navTabs}>
                {['Develop', 'Trace'].map(tab => (
                    <button key={tab} className={`${styles.navTab} ${activeTab === tab ? styles.activeTab : ''}`} onClick={() => setActiveTab(tab)}>
                        {tab === 'Develop' ? <IconEdit size={14} /> : <IconTrace size={14} />}<span>{tab}</span>
                    </button>
                ))}
            </nav>
            <div className={styles.workspace} ref={workspaceRef}>
                <aside className={styles.navigator} style={{ width: navigatorWidth }}>
                    <div className={styles.navHeader}>Project Explorer</div>
                    <div className={`${styles.navResizer} ${isResizingNav ? styles.navResizing : ''}`} onMouseDown={handleNavResizeMouseDown} />
                    <div className={styles.navTree}>
                        {fileTree?.root_config && (
                            <div className={`${styles.treeItem} ${selectedFile?.path === fileTree.root_config.path ? styles.activeTreeItem : ''}`} onClick={() => handleSelectFile(fileTree.root_config)} style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                                <span className={styles.itemIcon}>📄</span> {fileTree.root_config.full_name}
                            </div>
                        )}
                        <div className={styles.treeFolder} onClick={() => toggle('policies')}>
                            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                {expanded.policies ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                <span className={styles.folderIcon}>📁</span> Policies
                            </div>
                            <button className={styles.addBtnSmall} onClick={(e) => { e.stopPropagation(); setIsAddPolicyModalOpen(true); }} title="Add Policy">
                                <IconPlus size={14} />
                            </button>
                        </div>
                        {expanded.policies && (
                            <div className={styles.treeSub}>
                                {localFiles?.map(policy => (
                                    <div 
                                        key={policy.path} 
                                        className={`${styles.treeItem} ${selectedFile?.path === policy.path ? styles.activeTreeItem : ''}`} 
                                        onClick={() => handleSelectFile(policy)}
                                        draggable 
                                        onDragStart={(e) => { 
                                            // Pasamos el tipo exacto para que getPolicyIcon sepa qué SVG usar
                                            e.dataTransfer.setData('policyName', policy.name.replace('.xml', '')); 
                                            e.dataTransfer.setData('policyType', policy.type); 
                                        }}
                                    >
                                        <span className={styles.itemIcon}>
                                            {/* Aquí usamos el tamaño 14 para el Navigator */}
                                            {getPolicyIcon(policy.type, styles.sidebarIcon, 14)}
                                        </span> 
                                        <span className={styles.itemName}>{policy.name}</span>
                                        {/* ... botón de eliminar ... */}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Folder para SharedFlows (ej. default.xml) */}
                        <div className={styles.treeFolder} onClick={() => toggle('sharedFlows')}>
                            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                {expanded.sharedFlows ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                <span className={styles.folderIcon}>📁</span> Shared Flows
                            </div>
                        </div>

                        {expanded.sharedFlows && (
                            <div className={styles.treeSub}>
                                {localSharedFlows?.map(sf => (
                                    <div 
                                        key={sf.path} 
                                        className={`${styles.treeItem} ${selectedFile?.path === sf.path ? styles.activeTreeItem : ''}`} 
                                        onClick={() => handleSelectFile(sf)}
                                    >
                                        <span className={styles.itemIcon}>⚡</span> {sf.name}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className={styles.treeFolder} onClick={() => toggle('scripts')}>
                            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                {expanded.scripts ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                <span className={styles.folderIcon}>📁</span> Scripts
                            </div>
                            <button className={styles.addBtnSmall} onClick={(e) => { e.stopPropagation(); setIsAddResourceModalOpen(true); }} title="Add Resource">
                                <IconPlus size={14} />
                            </button>
                        </div>
                        {expanded.scripts && (
                            <div className={styles.treeSub}>
                                {localScripts?.map(script => (
                                    <div 
                                        key={script.path} 
                                        className={`${styles.treeItem} ${selectedFile?.path === script.path ? styles.activeTreeItem : ''}`} 
                                        onClick={() => handleSelectFile(script)}
                                    >
                                        <span className={styles.itemIcon}>{getFileIcon(script.name)}</span>
                                        <span className={styles.itemName}>{script.name}</span>
                                        <button 
                                            className={styles.deletePolicyBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if(window.confirm(`¿Borrar el recurso ${script.name}?`)) {
                                                    setLocalScripts(prev => prev.filter(s => s.path !== script.path));
                                                }
                                            }}
                                        >
                                            <IconX size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>
                <div className={styles.mainArea}>
                    <VisualFlowCanvas selectedPolicy={selectedPolicy} onSelectPolicy={handleSelectPolicy} flowStepsDraft={flowStepsDraft} onDropPolicy={handleDropPolicy} onRemovePolicy={handleRemovePolicy} />
                    <CodeEditor
                        code={xmlCode}
                        setCode={(newVal) => {
                            setXmlCode(newVal);
                            if (selectedFile) {
                                setFileCache(prev => ({ ...prev, [selectedFile.path]: newVal }));
                            }
                        }}
                        footerHeight={footerHeight}
                        isCollapsed={isEditorCollapsed}
                        onToggleCollapse={() => setIsEditorCollapsed(!isEditorCollapsed)}
                        selectedFile={selectedFile}
                        onSave={handleSave}
                        onPlay={() => { }}
                        isSaving={isSaving}
                        onResizerMouseDown={() => {
                            isResizing.current = true;
                            document.body.style.cursor = 'row-resize';
                            document.body.style.userSelect = 'none';
                        }}
                    />
                </div>
                <PolicyInspector policy={selectedPolicy} isOpen={isInspectorOpen} onClose={() => setIsInspectorOpen(false)} />
                {!isInspectorOpen && (
                    <button className={styles.inspectorToggle} onMouseDown={handleInspectorMouseDown} onClick={() => setIsInspectorOpen(true)} style={inspectorTop !== null ? { top: inspectorTop, transform: 'none' } : {}} title="Open Properties"><IconEdit size={14} /><span>Properties</span></button>
                )}
            </div>

            <AddPolicyModal 
                isOpen={isAddPolicyModalOpen} 
                onClose={() => setIsAddPolicyModalOpen(false)} 
                onAdd={handleCreatePolicy} 
            />
            <AddResourceModal 
                open={isAddResourceModalOpen} 
                onClose={() => setIsAddResourceModalOpen(false)} 
                onAdd={handleAddLocalResource} 
            />

        </div>
    );
}

export default SharedFlowDetailPage;
