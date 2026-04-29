import React from 'react';
import styles from './Modal.module.css';

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>
          ×
        </button>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}

export default Modal;
