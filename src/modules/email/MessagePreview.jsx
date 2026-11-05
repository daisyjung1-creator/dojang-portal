import React, { useState } from 'react';
import { Copy, CornerUpLeft } from 'lucide-react';
import Modal from '../../components/Modal';

// Preview of an email already sent, with "copy" and "use again" so the same
// message can go out another time.
export default function MessagePreview({ item, onClose, onReuse }) {
  const [copied, setCopied] = useState('');
  if (!item) return null;

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(what);
    setTimeout(() => setCopied(''), 2000);
  }

  const when = item.created_at ? new Date(item.created_at).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <Modal
      title="Sent email"
      maxWidth={620}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={() => copy(item.subject || '', 'subject')}><Copy size={14} /> {copied === 'subject' ? 'Copied!' : 'Copy subject'}</button>
          <button className="dp-btn" onClick={() => copy(item.message || '', 'message')}><Copy size={14} /> {copied === 'message' ? 'Copied!' : 'Copy message'}</button>
          {onReuse && (
            <button className="dp-btn dp-btn-primary" onClick={() => onReuse(item)}><CornerUpLeft size={14} /> Use this message</button>
          )}
        </>
      }
    >
      <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>
        {[when, item.audience || item.to].filter(Boolean).join(' · ')}
      </p>
      <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, padding: 14, fontSize: 13.5, lineHeight: 1.55, maxHeight: '55vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{item.subject}</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{item.message}</div>
      </div>
      {onReuse && (
        <p style={{ fontSize: 12, color: '#8A8D84', margin: '8px 0 0' }}>
          "Use this message" puts the subject and message back into Group email so you can change it and send it again.
        </p>
      )}
    </Modal>
  );
}
