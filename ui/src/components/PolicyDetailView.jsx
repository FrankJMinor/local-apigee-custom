import React, { useState, useEffect } from 'react';
import { X, ExternalLink, CheckCircle2, Settings2, Clock, Link2 } from 'lucide-react';

export function PolicyDetailView({ policy, xmlCode, onUpdateXml, onUpdatePolicyName, onClose, onSave }) {
  const [localDisplayName, setLocalDisplayName] = useState(policy?.name || '');

  useEffect(() => {
    setLocalDisplayName(policy?.name || '');
  }, [policy]);

  if (!policy) return null;

  // --- XML UTILS ---
  const getAttrValue = (xml, attr) => {
    const match = xml.match(new RegExp(`${attr}="([^"]*)"`));
    return match ? match[1] : null;
  };

  const updateXmlAttribute = (xml, attr, value) => {
    // Buscar la etiqueta de apertura principal (saltando comentarios/declaraciones)
    const match = xml.match(/<([^?!/][^>]*?)>/);
    if (!match) return xml;

    const startIndex = match.index;
    const fullTag = match[0];
    const tagContent = match[1];
    
    const attrRegex = new RegExp(`(${attr}=")([^"]*)(")`);
    let updatedTagContent;

    if (tagContent.match(attrRegex)) {
      updatedTagContent = tagContent.replace(attrRegex, `$1${value}$3`);
    } else {
      // Si no existe el atributo, añadirlo después del nombre de la etiqueta
      const tagNameMatch = tagContent.match(/^([^\s>]+)/);
      const tagName = tagNameMatch ? tagNameMatch[0] : '';
      const remainingContent = tagContent.substring(tagName.length);
      updatedTagContent = `${tagName} ${attr}="${value}"${remainingContent}`;
    }

    return xml.substring(0, startIndex) + `<${updatedTagContent}>` + xml.substring(startIndex + fullTag.length);
  };

  const updateDisplayNameTag = (xml, newName) => {
    const displayNameRegex = /<DisplayName>[\s\S]*?<\/DisplayName>/;
    if (xml.match(displayNameRegex)) {
      return xml.replace(displayNameRegex, `<DisplayName>${newName}</DisplayName>`);
    }
    // Si no existe, insertarlo después de la etiqueta de apertura raíz
    return xml.replace(/(<[^?!/][^>]*?>)/, `$1\n    <DisplayName>${newName}</DisplayName>`);
  };

  // --- DERIVED STATE FROM XML ---
  const isEnabled = getAttrValue(xmlCode, 'enabled') !== 'false';
  const continueOnError = getAttrValue(xmlCode, 'continueOnError') === 'true';

  // --- HANDLERS ---
  const handleToggleEnabled = () => {
    const updatedXml = updateXmlAttribute(xmlCode, 'enabled', (!isEnabled).toString());
    onUpdateXml(updatedXml);
  };

  const handleToggleContinueOnError = () => {
    const updatedXml = updateXmlAttribute(xmlCode, 'continueOnError', (!continueOnError).toString());
    onUpdateXml(updatedXml);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      const newName = localDisplayName.trim();
      const oldName = policy.name;

      if (!newName || newName === oldName) {
        e.currentTarget.blur();
        return;
      }

      let updatedXml = xmlCode;
      updatedXml = updateXmlAttribute(updatedXml, 'name', newName);
      updatedXml = updateDisplayNameTag(updatedXml, newName);
      
      // 1. Actualizar el contenido XML
      onUpdateXml(updatedXml);
      
      // 2. Sincronizar nombre en Navigator, FileCache y Selección
      if (onUpdatePolicyName) {
        onUpdatePolicyName(oldName, newName);
      }

      e.currentTarget.blur();
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid #1e293b',
      animation: 'fadeIn 0.3s ease'
    }}>
      {/* HEADER: El título de la política */}
      <div style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        backgroundColor: '#111',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid rgba(0, 209, 255, 0.3)',
            backgroundColor: 'rgba(0, 209, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 'bold',
            color: '#00d1ff'
          }}>
            {policy.type?.substring(0,2).toUpperCase() || 'P'}
          </div>
          <span style={{ fontSize: '14px', fontWeight: '500', color: '#f8fafc' }}>
            Policy: {policy.name}
          </span>
        </div>
        <button 
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* INFO GRID: Las filas de propiedades */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Fila: Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Type</span>
          <span style={{ color: '#00d1ff', fontSize: '13px', fontFamily: 'monospace' }}>{policy.type}</span>
        </div>

        {/* Fila: Display Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Display Name</span>
          <input 
            value={localDisplayName}
            onChange={(e) => setLocalDisplayName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Fila: Attached to (Chips) */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Attached to</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#94a3b8', fontSize: '10px', border: '1px solid #334155' }}>
              PreFlow
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', fontSize: '10px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              ProxyEndpoint
            </span>
          </div>
        </div>

        {/* Fila: Options (Los botones verdes/naranjas de la imagen) */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Options</span>
          <div style={{ display: 'flex', gap: '12px' }}>
            {/* Enabled Toggle */}
            <button 
              onClick={handleToggleEnabled}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', 
                border: isEnabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #334155', 
                backgroundColor: isEnabled ? 'rgba(16, 185, 129, 0.1)' : '#1a1a1a', 
                color: isEnabled ? '#10b981' : '#64748b', 
                fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <CheckCircle2 size={14} /> Enabled
            </button>

            {/* Continue on Error Toggle */}
            <button 
              onClick={handleToggleContinueOnError}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', 
                border: continueOnError ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #334155', 
                backgroundColor: continueOnError ? 'rgba(245, 158, 11, 0.1)' : '#1a1a1a', 
                color: continueOnError ? '#f59e0b' : '#64748b', 
                fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <Settings2 size={14} /> Continue on Error
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}