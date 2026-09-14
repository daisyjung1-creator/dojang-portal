import React from 'react';
import { X } from 'lucide-react';
import { styles } from '../lib/uiStyles';

export default function Modal({ title, onClose, children, footer, maxWidth }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, ...(maxWidth ? { maxWidth } : {}) }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{title}</h2>
          <button className="dp-btn" style={{ padding: 6, border: 'none' }} onClick={onClose} aria-label="닫기">
            <X size={16} />
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}
