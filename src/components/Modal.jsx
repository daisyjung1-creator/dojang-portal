import React from 'react';
import { X } from 'lucide-react';
import { styles } from '../lib/uiStyles';

// Pop-up window. It only closes through its own buttons (X / Cancel / Save):
// clicking outside it or pressing Escape does nothing, so a stray click never
// throws away what was typed.
export default function Modal({ title, onClose, children, footer, maxWidth }) {
  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, ...(maxWidth ? { maxWidth } : {}) }}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{title}</h2>
          <button className="dp-btn" style={{ padding: 6, border: 'none' }} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}
