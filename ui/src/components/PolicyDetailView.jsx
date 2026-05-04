import React, { useState } from 'react';
import { X, ExternalLink, CheckCircle2, Settings2, Clock, Link2 } from 'lucide-react';

export function PolicyDetailView({ policy, xmlCode, onClose, onSave }) {
  if (!policy) return null;

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0a', // Fondo muy oscuro
      borderBottom: '1px solid #1e293b',
      animation: 'fadeIn 0.3s ease' // Para que no aparezca de golpe
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
            defaultValue={policy.name}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '12px' }}>
              <CheckCircle2 size={14} /> Enabled
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1a1a1a', color: '#64748b', fontSize: '12px' }}>
              <Settings2 size={14} /> Continue on Error
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}