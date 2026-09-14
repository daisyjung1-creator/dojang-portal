import React from 'react';

export default function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: '#9A2B2B' }}> *</span>}
      </span>
      {children}
    </label>
  );
}
