import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, RotateCcw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';

// Every email the portal has sent (or tried to): invoices, reminders,
// receipts, welcome, makeup, absence check, trial, grant reminders, group emails.
const TYPES = {
  invoice: 'Invoice',
  reminder: 'Payment reminder',
  receipt: 'Receipt',
  refund: 'Refund',
  welcome: 'Welcome',
  tryout_confirmation: 'Trial confirmation',
  subsidy_reminder: 'Grant reminder',
  broadcast: 'Group email',
  makeup: 'Makeup class',
  absence_check: 'Absence check',
};
const kindOf = (q) => (q.type === 'invoice' && q.payload?.reminder ? 'reminder' : q.type);

export default function EmailLog() {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [invNums, setInvNums] = useState({});
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('email_queue').select('*').order('created_at', { ascending: false }).limit(500);
    const list = data || [];
    const sids = [...new Set(list.map((r) => r.student_id).filter(Boolean))];
    const iids = [...new Set(list.map((r) => r.payload?.invoice_id).filter(Boolean))];
    const [{ data: st }, { data: inv }] = await Promise.all([
      sids.length ? supabase.from('students').select('id, name').in('id', sids) : { data: [] },
      iids.length ? supabase.from('invoices').select('id, invoice_number, customer_name').in('id', iids) : { data: [] },
    ]);
    setNames(Object.fromEntries((st || []).map((s) => [s.id, s.name])));
    setInvNums(Object.fromEntries((inv || []).map((i) => [i.id, i])));
    setRows(list);
    setLoading(false);
  }

  function subjectOf(r) {
    if (r.payload?.subject) return r.payload.subject;
    const inv = invNums[r.payload?.invoice_id];
    if (r.type === 'invoice') return `${r.payload?.reminder ? 'Reminder — ' : ''}Invoice #${inv?.invoice_number ?? '?'}`;
    if (r.type === 'receipt') return 'Payment receipt';
    if (r.type === 'refund') return 'Refund confirmation';
    return '';
  }
  function whoOf(r) {
    return names[r.student_id] || invNums[r.payload?.invoice_id]?.customer_name || '';
  }
  const stateOf = (r) => (r.sent ? 'sent' : r.error ? 'failed' : 'waiting');

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === 'all' || kindOf(r) === kind) &&
        (status === 'all' || stateOf(r) === status) &&
        (!k || [r.recipient_email, subjectOf(r), whoOf(r)].some((v) => (v || '').toLowerCase().includes(k)))
    );
  }, [rows, kind, status, q, names, invNums]);

  const counts = useMemo(() => ({ sent: rows.filter((r) => r.sent).length, failed: rows.filter((r) => !r.sent && r.error).length, waiting: rows.filter((r) => !r.sent && !r.error).length }), [rows]);

  async function resend(r) {
    const { error } = await supabase.from('email_queue').insert({ type: r.type, student_id: r.student_id, recipient_email: r.recipient_email, payload: r.payload, broadcast_id: r.broadcast_id || null });
    setFlash(error ? 'Could not resend: ' + error.message : `Sent again to ${r.recipient_email}.`);
    setTimeout(load, 2500);
  }

  return (
    <>
      {flash && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}
      <div style={{ ...styles.filterBar, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={styles.searchBox}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Email, student, subject…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="dp-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All kinds</option>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="dp-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          <option value="sent">Sent ({counts.sent})</option>
          <option value="failed">Failed ({counts.failed})</option>
          <option value="waiting">Waiting ({counts.waiting})</option>
        </select>
        <button className="dp-btn" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>
      <div style={styles.card}>
        {loading ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Loading…</p>
        ) : shown.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No emails.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>For</th>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = stateOf(r);
                return (
                  <tr key={r.id} className="dp-row">
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{new Date(r.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td style={{ fontSize: 12.5 }}>{TYPES[kindOf(r)] || r.type}</td>
                    <td style={{ fontSize: 12.5 }}>{whoOf(r)}</td>
                    <td style={{ fontSize: 12.5, color: '#5B5F56', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.recipient_email}>{r.recipient_email}</td>
                    <td style={{ fontSize: 12.5 }}>{subjectOf(r)}</td>
                    <td>
                      <span
                        title={r.error || ''}
                        style={{ fontSize: 12, padding: '1px 8px', borderRadius: 999, background: st === 'sent' ? '#E8F1E9' : st === 'failed' ? '#FBEAEA' : '#FAEEDA', color: st === 'sent' ? '#2A5A30' : st === 'failed' ? '#9A2B2B' : '#854F0B' }}
                      >
                        {st === 'sent' ? 'Sent' : st === 'failed' ? 'Failed' : 'Waiting'}
                      </span>
                      {st === 'failed' && <div style={{ fontSize: 11, color: '#9A2B2B', maxWidth: 220, marginTop: 2 }}>{String(r.error).slice(0, 120)}</div>}
                    </td>
                    <td>
                      {st !== 'waiting' && (
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => resend(r)}><RotateCcw size={12} /> Resend</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#8A8D84', marginTop: 8 }}>Shows the last 500 emails. "Sent" means the email service accepted it for delivery.</p>
    </>
  );
}
