import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import { todayISO } from '../../lib/billingDates';
import { formatDate } from '../../lib/invoiceUtils';
import { computeCancellation, NOTICE_DAYS } from '../../lib/cancellation';

// Record a membership cancellation email (agreement Part 6) and work out the
// last paid day with the 14-day rule. Saving stops tuition after that day; the
// student is withdrawn automatically the day after.
export default function CancellationModal({ student, onClose, onSaved }) {
  const [receivedOn, setReceivedOn] = useState(todayISO());
  const [requested, setRequested] = useState('');
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.from('cancellation_requests').select('*').eq('student_id', student.id).order('created_at', { ascending: false }).then(({ data }) => setHistory(data || []));
  }, [student.id]);

  const c = computeCancellation(student, receivedOn, requested || null);
  const first = student.name.split(' ')[0];

  async function save() {
    if (!c) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('cancellation_requests').insert({
      student_id: student.id,
      received_on: receivedOn,
      requested_date: requested || null,
      next_payment_date: c.next,
      days_notice: c.days,
      renewal_cancelled: c.renewalCancelled,
      billing_end_date: c.end,
      notes: notes.trim() || null,
    });
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    const { data } = await supabase.from('students').update({ billing_end_date: c.end }).eq('id', student.id).select().single();
    setBusy(false);
    onSaved(data);
  }

  async function undo() {
    setBusy(true);
    const { data } = await supabase.from('students').update({ billing_end_date: null }).eq('id', student.id).select().single();
    setBusy(false);
    onSaved(data);
  }

  return (
    <Modal
      title={`Membership cancellation — ${student.name}`}
      maxWidth={560}
      onClose={onClose}
      footer={
        <>
          {student.billing_end_date && <button className="dp-btn" style={{ marginRight: 'auto' }} disabled={busy} onClick={undo}>Undo cancellation (keep billing)</button>}
          <button className="dp-btn" onClick={onClose}>Close</button>
          <button className="dp-btn dp-btn-primary" disabled={busy || !c} onClick={save}>{busy ? 'Saving…' : 'Save cancellation'}</button>
        </>
      }
    >
      {student.billing_end_date && (
        <p style={{ background: '#FBEAEA', color: '#9A2B2B', borderRadius: 6, padding: '7px 12px', fontSize: 13, margin: '0 0 12px' }}>
          Already cancelled: membership ends {formatDate(student.billing_end_date)}.
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Cancellation email received on">
          <input type="date" className="dp-input" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </Field>
        <Field label="Cancellation date they asked for (optional)">
          <input type="date" className="dp-input" value={requested} onChange={(e) => setRequested(e.target.value)} />
        </Field>
      </div>
      {!c ? (
        <p style={{ fontSize: 13.5, color: '#9A2B2B' }}>{first} has no billing date (enrollment / billing start), so the 14-day rule can't be worked out.</p>
      ) : (
        <div style={{ border: `1px solid ${c.renewalCancelled ? '#BFDCC3' : '#F0D9A8'}`, background: c.renewalCancelled ? '#E8F1E9' : '#FAEEDA', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.55, margin: '4px 0 12px' }}>
          <div>Next payment date: <b>{formatDate(c.next)}</b> — the email came <b>{c.days} day{c.days === 1 ? '' : 's'}</b> before it.</div>
          {c.renewalCancelled ? (
            <div style={{ color: '#2A5A30' }}>{NOTICE_DAYS}+ days' notice → the {formatDate(c.next)} renewal is <b>cancelled</b>.</div>
          ) : (
            <div style={{ color: '#854F0B' }}>Less than {NOTICE_DAYS} days' notice → the {formatDate(c.next)} renewal <b>still goes ahead</b> (Part 6).</div>
          )}
          <div style={{ marginTop: 4 }}>
            Last paid day: <b>{formatDate(c.end)}</b>. No tuition is invoiced after that, and {first} is withdrawn automatically the next day.
          </div>
        </div>
      )}
      <Field label="Notes (optional)">
        <input className="dp-input" style={{ width: '100%' }} placeholder="e.g. moving to Calgary" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <p style={{ fontSize: 12, color: '#8A8D84', margin: '4px 0 0' }}>Remember to confirm receipt to the family by email (Part 6). PAD at the bank is cancelled separately.</p>
      {err && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{err}</p>}
      {history.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: '#5B5F56' }}>
          <b>Earlier requests</b>
          {history.map((h) => (
            <div key={h.id}>
              {formatDate(h.received_on)} · {h.days_notice} days' notice · {h.renewal_cancelled ? 'renewal cancelled' : 'renewal went ahead'} · ends {formatDate(h.billing_end_date)}{h.notes ? ` · ${h.notes}` : ''}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
