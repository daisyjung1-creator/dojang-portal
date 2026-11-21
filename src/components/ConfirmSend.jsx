import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { styles } from '../lib/uiStyles';

// "Send this email?" check before anything goes out from a single click.
//   if (!(await confirmSend({ what: 'Receipt #123', to: 'mom@x.com' }))) return;
// With extra: true it also offers "Also send to" (this email only, not saved)
// and resolves with the recipients to use ("mom@x.com, dad@y.com"), or false.
//   const to = await confirmSend({ what, to: 'mom@x.com', extra: true }); if (!to) return;
// <ConfirmSendHost /> is mounted once in App.

let show = null;

export function confirmSend({ what, to, note, extra = false }) {
  if (!show) return Promise.resolve(extra ? to : true);
  return new Promise((resolve) => show({ what, to, note, extra, resolve }));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function joinEmails(...parts) {
  return [...new Set(parts.join(',').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export default function ConfirmSendHost() {
  const [ask, setAsk] = useState(null);
  const [more, setMore] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    show = setAsk;
    return () => (show = null);
  }, []);
  if (!ask) return null;
  const done = (ok) => {
    let result = ok;
    if (ok && ask.extra) {
      const list = joinEmails(ask.to || '', more);
      const bad = list.filter((e) => !EMAIL.test(e));
      if (!list.length) return setErr('Add an email address.');
      if (bad.length) return setErr(`Check the email address: ${bad.join(', ')}`);
      result = list.join(', ');
    }
    ask.resolve(result);
    setAsk(null);
    setMore('');
    setErr('');
  };
  return (
    <div style={{ ...styles.overlay, zIndex: 200 }}>
      <div style={{ ...styles.modal, maxWidth: 440 }} role="dialog" aria-label="Send this email?">
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Send this email?</h2>
        </div>
        <div style={styles.modalBody}>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}><b>{ask.what}</b></p>
          {(ask.to || ask.extra) && <p style={{ margin: 0, fontSize: 13.5, color: '#5B5F56', wordBreak: 'break-word' }}>To: {ask.to || <span style={{ color: '#9A2B2B' }}>no email on file — add one below</span>}</p>}
          {ask.note && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#854F0B' }}>{ask.note}</p>}
          {ask.extra && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: '#5B5F56' }}>Also send to <span style={{ color: '#8A8D84' }}>— this email only, not saved to the family</span></label>
              <input className="dp-input" style={{ width: '100%', marginTop: 3 }} placeholder="e.g. dad@example.com (separate several with commas)" value={more} onChange={(e) => { setMore(e.target.value); setErr(''); }} />
            </div>
          )}
          {err && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#9A2B2B' }}>{err}</p>}
        </div>
        <div style={styles.modalFooter}>
          <button className="dp-btn" autoFocus onClick={() => done(false)}>Cancel</button>
          <button className="dp-btn dp-btn-primary" onClick={() => done(true)}><Send size={14} /> Send</button>
        </div>
      </div>
    </div>
  );
}
