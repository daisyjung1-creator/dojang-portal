import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { styles } from '../lib/uiStyles';

export default function ConfirmDialog({ message, onCancel, onConfirm, confirmLabel = '삭제' }) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={{ ...styles.modal, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '20px 20px 0' }}>
          <AlertTriangle size={20} color="#9A2B2B" />
          <p style={{ fontSize: 14.5, margin: '12px 0 0', color: '#20241F' }}>{message}</p>
        </div>
        <div style={styles.modalFooter}>
          <button className="dp-btn" onClick={onCancel}>
            취소
          </button>
          <button className="dp-btn dp-btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
