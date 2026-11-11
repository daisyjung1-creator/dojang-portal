import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import { todayISO, addDaysISO, nextDueDate, billingAnchor } from '../../lib/billingDates';
import { onHold } from '../../lib/tuitionBilling';
import { formatDate } from '../../lib/invoiceUtils';

// Membership hold (휴관): a break with a return date. No tuition cycles are
// billed and nobody marks the student absent until they're back.
export default function HoldModal({ student: s, onClose, onSaved }) {
  const today = todayISO();
  const [f, setF] = useState({ from: s.hold_from || today, until: s.hold_until || addDaysISO(today, 30), reason: s.hold_reason || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const first = s.name.split(' ')[0];

  // Billing dates that fall inside the hold (those cycles are skipped).
  const skipped = [];
  if (billingAnchor(s) && f.from && f.until && f.until >= f.from) {
    let d = nextDueDate(s, addDaysISO(f.from, -1));
    for (let i = 0; i < 24 && d <= f.until; i++) {
      skipped.push(d);
      d = nextDueDate(s, d);
    }
  }

  async function save(clear) {
    if (!clear && (!f.until || f.until < f.from)) return setErr('Pick a return date after the start.');
    setBusy(true);
    const patch = clear ? { hold_from: null, hold_until: null, hold_reason: null } : { hold_from: f.from, hold_until: f.until, hold_reason: f.reason.trim() || null };
    const { data, error } = await supabase.from('students').update(patch).eq('id', s.id).select().single();
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved(data);
  }

  return (
    <Modal
      title={`Hold — ${s.name}`}
      maxWidth={480}
      onClose={onClose}
      footer={
        <>
          {s.hold_until && <button className="dp-btn" style={{ marginRight: 'auto' }} disabled={busy} onClick={() => save(true)}>End hold now</button>}
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save hold'}</button>
        </>
      }
    >
      {onHold(s, today) && <p style={{ background: '#EEF0F3', color: '#3A4250', borderRadius: 6, padding: '7px 12px', fontSize: 13, margin: '0 0 12px' }}>{first} is on hold until {formatDate(s.hold_until)}.</p>}
      <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 12px' }}>For a break with a return date (travel, injury…). While on hold {first} isn't billed and isn't marked absent. After the return date everything carries on as usual.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Field label="Hold starts"><input type="date" className="dp-input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Back on (last day of hold)"><input type="date" className="dp-input" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '-4px 0 10px', flexWrap: 'wrap' }}>
        {[1, 2, 3].map((n) => (
          <button key={n} type="button" className="dp-btn" style={{ padding: '3px 9px', fontSize: 12 }} onClick={() => setF({ ...f, until: addDaysISO(f.from, n * 30) })}>{n} month{n > 1 ? 's' : ''}</button>
        ))}
      </div>
      <Field label="Reason (optional)"><input className="dp-input" style={{ width: '100%' }} placeholder="e.g. Travelling to India" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      {skipped.length > 0 && (
        <p style={{ fontSize: 12.5, color: '#854F0B', background: '#FAEEDA', borderRadius: 6, padding: '7px 12px', margin: 0 }}>
          Not billed: {skipped.map(formatDate).join(', ')}. Billing picks up again on the next billing date after {formatDate(f.until)}.
        </p>
      )}
      {err && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{err}</p>}
    </Modal>
  );
}
