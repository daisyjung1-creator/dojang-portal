import React, { useState } from 'react';
import { Copy, Check, MessageSquare } from 'lucide-react';
import Modal from './Modal';
import Field from './Field';

// A text message to send from the dojang phone: copy the number and the
// message (both editable), or open this device's Messages app.
// msg = { title, phone, body, onDone } — onDone runs once it's copied or opened.
export default function TextCopyModal({ msg, onClose }) {
  const [body, setBody] = useState(msg.body || '');
  const [copied, setCopied] = useState('');
  const phone = String(msg.phone || '').trim();

  async function copy(what, value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // older browsers: select-and-copy fallback
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(what);
    setTimeout(() => setCopied(''), 1800);
    if (what === 'text') msg.onDone?.();
  }
  const smsHref = `sms:${phone.replace(/[^\d+]/g, '')}${/iPhone|iPad|Mac/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`;

  return (
    <Modal
      title={msg.title || 'Text message'}
      maxWidth={560}
      onClose={onClose}
      footer={
        <>
          <a className="dp-btn" href={smsHref} style={{ textDecoration: 'none' }} onClick={() => msg.onDone?.()} title="Opens Messages on this device">
            <MessageSquare size={14} /> Open Messages
          </a>
          <button className="dp-btn dp-btn-primary" onClick={() => copy('text', body)}>
            {copied === 'text' ? <Check size={15} /> : <Copy size={15} />} {copied === 'text' ? 'Copied' : 'Copy text'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--dp-ink-soft)', margin: '0 0 10px' }}>Copy the message and send it from the dojang phone.</p>
      {phone && (
        <Field label="Phone">
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="dp-input" readOnly style={{ flex: 1 }} value={phone} />
            <button className="dp-btn" onClick={() => copy('phone', phone)}>{copied === 'phone' ? <Check size={14} /> : <Copy size={14} />} {copied === 'phone' ? 'Copied' : 'Copy number'}</button>
          </div>
        </Field>
      )}
      <Field label="Message (you can edit it)">
        <textarea className="dp-input" rows={9} style={{ width: '100%', resize: 'vertical', fontSize: 13.5, lineHeight: 1.5 }} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
    </Modal>
  );
}
