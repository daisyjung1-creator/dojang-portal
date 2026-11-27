import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Modal from './Modal';
import Field from './Field';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (v) => String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

// Review / edit an email, then put it in the send queue.
// draft = { title, type, to, subject, message, studentId, payload, note,
//           extras: [{ key, label, text, on }] } — optional paragraphs the
//           sender can tick on/off (added before the sign-off).
const SIGNOFF = /\n\n(?=(Best|Kind) regards)/i;
function addBlock(msg, text) {
  if (msg.includes(text)) return msg;
  const m = msg.match(SIGNOFF);
  return m ? msg.slice(0, m.index) + '\n\n' + text + msg.slice(m.index) : msg.replace(/\s*$/, '') + '\n\n' + text;
}
const dropBlock = (msg, text) => msg.replace('\n\n' + text, '').replace(text, '');

export default function EmailComposeModal({ draft, onClose, onSent }) {
  const [d, setD] = useState(() => {
    let message = draft.message || '';
    (draft.extras || []).forEach((x) => { if (x.on) message = addBlock(message, x.text); });
    return { ...draft, message, error: '', sending: false };
  });
  const isOn = (x) => d.message.includes(x.text);
  const toggle = (x) => setD({ ...d, message: isOn(x) ? dropBlock(d.message, x.text) : addBlock(d.message, x.text) });

  async function send() {
    const emails = splitEmails(d.to);
    if (!emails.length || emails.some((e) => !EMAIL_RE.test(e))) return setD({ ...d, error: 'Enter a valid email address.' });
    if (!d.message.trim()) return setD({ ...d, error: 'The message is empty.' });
    setD({ ...d, sending: true, error: '' });
    const { error } = await supabase.from('email_queue').insert({
      type: d.type,
      student_id: d.studentId || null,
      recipient_email: emails.join(', '),
      payload: { ...(d.payload || {}), subject: d.subject, message: d.message },
    });
    if (error) return setD({ ...d, sending: false, error: 'Could not send: ' + error.message });
    onSent && (await onSent(new Date().toISOString()));
  }

  return (
    <Modal
      title={d.title}
      maxWidth={620}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={d.sending} onClick={send}><Mail size={15} /> Send</button>
        </>
      }
    >
      {d.note && <p style={{ fontSize: 12.5, color: 'var(--dp-warning)', margin: '0 0 10px' }}>{d.note}</p>}
      <Field label="To (comma-separated)"><input className="dp-input" style={{ width: '100%' }} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} /></Field>
      <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} /></Field>
      {(d.extras || []).length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0 0 10px', fontSize: 13.5 }}>
          <span style={{ color: 'var(--dp-ink-soft)' }}>Include:</span>
          {d.extras.map((x) => (
            <label key={x.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={isOn(x)} onChange={() => toggle(x)} /> {x.label}
            </label>
          ))}
        </div>
      )}
      <Field label="Message (you can edit it before sending)">
        <textarea className="dp-input" rows={12} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} />
      </Field>
      {d.error && <p style={{ color: 'var(--dp-danger)', fontSize: 13, margin: 0 }}>{d.error}</p>}
    </Modal>
  );
}
