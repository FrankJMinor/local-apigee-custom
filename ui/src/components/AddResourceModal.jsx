import React, { useState, useRef, useEffect } from 'react';
import styles from './AddResourceModal.module.css';
import { IconX } from './Icons';

const FILE_TYPES = [
  { label: 'JAR', value: 'JAR', ext: '.jar', folder: 'java' },
  { label: 'JavaScript', value: 'JavaScript', ext: '.js', folder: 'jsc' },
  { label: 'Node', value: 'Node', ext: '.js', folder: 'node' },
  { label: 'Python', value: 'Python', ext: '.py', folder: 'py' },
  { label: 'WSDL', value: 'WSDL', ext: '.wsdl', folder: 'xsl' },
  { label: 'XSD', value: 'XSD', ext: '.xsd', folder: 'xsl' },
  { label: 'XSL Transformation', value: 'XSL', ext: '.xsl', folder: 'xsl' }
];

const AddResourceModal = ({ open, onClose, onAdd }) => {
  const [source, setSource] = useState('new'); // 'new' or 'import'
  const [fileType, setFileType] = useState(FILE_TYPES[1]); // Default to JavaScript
  const [fileName, setFileName] = useState('Script-1');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSource('new');
      setFileType(FILE_TYPES[1]);
      setFileName('Script-1');
      setSelectedFile(null);
    }
  }, [open]);

  if (!open) return null;

  const handleAdd = () => {
    let name = fileName;
    if (source === 'import' && selectedFile) {
      name = selectedFile.name;
    } else {
      // Force extension
      const extension = fileType.ext;
      if (!name.toLowerCase().endsWith(extension)) {
        // Remove any other extension if user typed it wrong? 
        // Simple append for now as requested.
        name += extension;
      }
    }

    const resourceData = {
      source,
      type: fileType.value,
      name: name,
      folder: fileType.folder,
      file: selectedFile,
      content: source === 'new' ? `/* ${fileType.label} Resource: ${name} */\n` : null
    };

    onAdd(resourceData);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <h2>New Resource</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <IconX size={18} strokeWidth={2.5} />
          </button>
        </header>

        <div className={styles.container}>
          <div className={styles.infoBox}>
            Add an existing file or specify a name to create a new file.
          </div>

          <main className={styles.formArea}>
            <div className={styles.formGroup}>
              <label>Source</label>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input 
                    type="radio" 
                    value="new" 
                    checked={source === 'new'} 
                    onChange={() => setSource('new')} 
                  />
                  Create new file
                </label>
                <label className={styles.radioLabel}>
                  <input 
                    type="radio" 
                    value="import" 
                    checked={source === 'import'} 
                    onChange={() => setSource('import')} 
                  />
                  Import file
                </label>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>File Type</label>
              <select 
                className={styles.select}
                value={fileType.value}
                onChange={(e) => setFileType(FILE_TYPES.find(t => t.value === e.target.value))}
              >
                {FILE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>File Name</label>
              {source === 'new' ? (
                <input 
                  type="text" 
                  className={styles.input}
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Script-1.js"
                />
              ) : (
                <div className={styles.fileUpload}>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <button 
                    className={styles.browseBtn}
                    onClick={() => fileInputRef.current.click()}
                  >
                    {selectedFile ? selectedFile.name : 'Choose File'}
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>

        <footer className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button 
            className={styles.btnAdd} 
            onClick={handleAdd}
            disabled={source === 'import' && !selectedFile}
          >
            Add
          </button>
        </footer>
      </div>
    </div>
  );
};

export default AddResourceModal;