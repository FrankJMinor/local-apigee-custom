import React, { useState } from 'react';
import styles from './AddPolicyModal.module.css';
import { IconX } from './Icons';

const POLICY_CATALOG = [
  {
    category: 'Traffic Management',
    policies: [
      { name: 'Quota', type: 'Quota', description: 'Control consumption limits on API clients.' },
      { name: 'Spike Arrest', type: 'SpikeArrest', description: 'Protect against sudden traffic surges.' },
      { name: 'Response Cache', type: 'ResponseCache', description: 'Improve performance by caching backend data.' }
    ]
  },
  {
    category: 'Security',
    policies: [
      { name: 'Verify API Key', type: 'VerifyAPIKey', description: 'Enforce API key validation at runtime.' },
      { name: 'JSON Threat Protection', type: 'JSONThreatProtection', description: 'Minimize risk from malicious payloads.' },
      { name: 'OAuth v2.0', type: 'OAuthV2', description: 'Standard OAuth 2.0 authorization framework.' }
    ]
  },
  {
    category: 'Mediation',
    policies: [
      { name: 'Assign Message', type: 'AssignMessage', description: 'Create or modify request/response messages.' },
      { name: 'Extract Variables', type: 'ExtractVariables', description: 'Extract content from request or response.' },
      { name: 'JSON to XML', type: 'JSONToXML', description: 'Convert JSON content to XML format.' }
    ]
  }
];

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

export const AddPolicyModal = ({ isOpen, onClose, onAdd }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [formData, setFormData] = useState({ displayName: '', name: '' });
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const handleSelect = (policy) => {
    setSelectedType(policy);
    setFormData({ 
      displayName: policy.name, 
      name: `${policy.type}-1` 
    });
  };

  const filteredCatalog = POLICY_CATALOG.map(group => ({
    ...group,
    policies: group.policies.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(group => group.policies.length > 0);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <h2>Add Policy</h2>
            <span className={styles.headerSubtitle}>Select a policy type to add to your proxy</span>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <IconX size={18} strokeWidth={2.5} />
          </button>
        </header>

        <div className={styles.container}>
          <aside className={styles.sidebar}>
            <div className={styles.searchWrapper}>
              <div className={styles.searchIconPos}><SearchIcon /></div>
              <input 
                placeholder="Search policies..." 
                className={styles.searchInput}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.categoryList}>
              {filteredCatalog.map(group => (
                <div key={group.category}>
                  <div className={styles.groupLabel}>{group.category}</div>
                  {group.policies.map(p => (
                    <div 
                      key={p.name} 
                      className={`${styles.policyItem} ${selectedType?.name === p.name ? styles.active : ''}`}
                      onClick={() => handleSelect(p)}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          <main className={styles.formArea}>
            {selectedType ? (
              <div className={styles.formContainer}>
                <div className={styles.heroInfo}>
                  <h3>{selectedType.name}</h3>
                  <p>{selectedType.description}</p>
                </div>
                <div className={styles.inputField}>
                  <label>Display Name</label>
                  <input 
                    value={formData.displayName} 
                    onChange={e => setFormData({...formData, displayName: e.target.value})}
                  />
                </div>
                <div className={styles.inputField}>
                  <label>Name</label>
                  <input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>
            ) : (
              <div className={styles.placeholder}>
                <p>Select a policy type from the left panel to configure it.</p>
              </div>
            )}
          </main>
        </div>

        <footer className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button 
            className={styles.btnAdd} 
            disabled={!selectedType || !formData.name}
            onClick={() => onAdd({ ...selectedType, ...formData })}
          >
            Add Policy
          </button>
        </footer>
      </div>
    </div>
  );
};