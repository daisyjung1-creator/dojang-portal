import React from 'react';

export default function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12, flex: '1 1 150px', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--dp-ink-soft)', marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: 'var(--dp-danger)' }}> *</span>}
      </span>
      {children}
    </label>
  );
}
