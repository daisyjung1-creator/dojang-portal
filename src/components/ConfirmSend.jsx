import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { styles } from '../lib/uiStyles';

// "Send this email?" check before anything goes out from a single click.
//   if (!(await confirmSend({ what: 'Receipt #123', to: 'mom@x.com' }))) return;
// <ConfirmSendHost /> is mounted once in App.

let show = null;

export function confirmSend({ what, to, note }) {
  if (!show) return Promise.resolve(true);
  return new Promise((resolve) => show({ what, to, note, resolve }));
}

export default function ConfirmSendHost() {
  const [ask, setAsk] = useState(null);
  useEffect(() => {
    show = setAsk;
    return () => (show = null);
  }, []);
  if (!ask) return null;
  const done = (ok) => {
    ask.resolve(ok);
    setAsk(null);
  };
  return (
    <div style={{ ...styles.overlay, zIndex: 200 }}>
      <div style={{ ...styles.modal, maxWidth: 440 }} role="dialog" aria-label="Send this email?">
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Send this email?</h2>
        </div>
        <div style={styles.modalBody}>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}><b>{ask.what}</b></p>
          {ask.to && <p style={{ margin: 0, fontSize: 13.5, color: '#5B5F56', wordBreak: 'break-word' }}>To: {ask.to}</p>}
          {ask.note && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#854F0B' }}>{ask.note}</p>}
        </div>
        <div style={styles.modalFooter}>
          <button className="dp-btn" autoFocus onClick={() => done(false)}>Cancel</button>
          <button className="dp-btn dp-btn-primary" onClick={() => done(true)}><Send size={14} /> Send</button>
        </div>
      </div>
    </div>
  );
}
