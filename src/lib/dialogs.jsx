import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Info } from 'lucide-react';
import { styles } from './uiStyles';

// The portal's own replacements for window.alert / window.confirm
// (DESIGN.md: no browser pop-ups). Call from anywhere, no host needed:
//   await notice('Allow pop-ups to print.');
//   if (!(await askConfirm('Charge $50?', { confirmLabel: 'Charge' }))) return;

function Dialog({ title, message, confirmLabel, cancelLabel, tone, onDone }) {
  const okRef = useRef(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onDone(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return (
    <div style={{ ...styles.overlay, zIndex: 2000 }} onClick={() => onDone(false)}>
      <div role="alertdialog" aria-modal="true" aria-label={title || 'Message'} style={{ ...styles.modal, maxWidth: 420, fontFamily: 'var(--dp-font)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '20px 20px 4px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Icon size={20} color={tone === 'warn' ? 'var(--dp-warning)' : 'var(--dp-ink-soft)'} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            {title && <div style={{ fontSize: 'var(--dp-text-title)', fontWeight: 700, marginBottom: 6 }}>{title}</div>}
            <p style={{ fontSize: 'var(--dp-text-body)', lineHeight: 1.5, margin: 0, color: 'var(--dp-ink)', whiteSpace: 'pre-line', overflowWrap: 'anywhere', userSelect: 'text' }}>{message}</p>
          </div>
        </div>
        <div style={styles.modalFooter}>
          {cancelLabel && <button className="dp-btn" onClick={() => onDone(false)}>{cancelLabel}</button>}
          <button ref={okRef} className="dp-btn dp-btn-primary" onClick={() => onDone(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function open(props) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const onDone = (v) => {
      root.unmount();
      el.remove();
      resolve(v);
    };
    root.render(<Dialog {...props} onDone={onDone} />);
  });
}

export const notice = (message, { title = '', confirmLabel = 'OK' } = {}) => open({ message, title, confirmLabel, tone: 'info' });

export const askConfirm = (message, { title = '', confirmLabel = 'Continue', cancelLabel = 'Cancel' } = {}) =>
  open({ message, title, confirmLabel, cancelLabel, tone: 'warn' });
