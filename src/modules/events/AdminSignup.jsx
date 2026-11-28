import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import { money } from '../../lib/invoiceUtils';
import { eventCharge, isFamilyPriced } from '../../lib/eventPricing';
import { FormQuestions, checkAnswers } from '../../components/EventFormFields';

// The dojang signs a family up for an event (e.g. a parent asked in person):
// the same choices the parent portal offers — which children, guests and the
// sign-up form — without the parent's signature. Makes the same invoice.
export default function AdminSignup({ event, student, students, signups, guests, onClose, onDone }) {
  const fam = student.customer_id;
  const taken = new Set(signups.filter((s) => s.event_id === event.id && s.status === 'signed_up').map((s) => s.student_id));
  const kids = students.filter((s) => s.customer_id === fam && !taken.has(s.id));
  const already = students.some((s) => s.customer_id === fam && taken.has(s.id));
  const [pick, setPick] = useState(() => (taken.has(student.id) ? [] : [student.id]));
  const [names, setNames] = useState([]);
  const [answers, setAnswers] = useState({});
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const form = Array.isArray(event.form) ? event.form : [];
  const pickedKids = kids.filter((k) => pick.includes(k.id));
  const guestNames = names.map((g) => g.trim()).filter(Boolean);
  const prevPeople = useMemo(
    () => signups.filter((s) => s.event_id === event.id && s.status === 'signed_up' && s.customer_id === fam).length + guests.filter((g) => g.event_id === event.id && g.customer_id === fam).length,
    [signups, guests, event.id, fam],
  );
  const sub = eventCharge(event, { prevPeople, kids: pick.length, guests: event.allow_guests ? guestNames.length : 0 });
  const total = sub + (event.taxable ? Math.round(sub * 5) / 100 : 0);
  const family = student.name.split(' ').slice(-1)[0];

  async function go() {
    setErr('');
    if (!pick.length && !guestNames.length) return setErr('Choose who is coming.');
    if (!pick.length && !already) return setErr('Choose at least one student — guests come with a student.');
    if (names.some((g) => !g.trim())) return setErr("Enter each guest's name (or remove the empty line).");
    if (pick.length) {
      const problem = checkAnswers(form, pickedKids, answers);
      if (problem) return setErr(problem);
    }
    const sent = Object.fromEntries(
      form.map((q) => [q.id, q.per_child ? Object.fromEntries(pick.map((id) => [id, answers?.[q.id]?.[id]]).filter(([, v]) => v != null)) : answers?.[q.id]]).filter(([, v]) => v != null),
    );
    setBusy(true);
    // Guests only (family already signed up) go through with the first signed-up child.
    const ids = pick.length ? pick : [students.find((s) => s.customer_id === fam && taken.has(s.id)).id];
    const { data, error } = await supabase.rpc('event_register_form', {
      p_event: event.id, p_students: ids, p_note: note.trim() ? `${note.trim()} (signed up by the dojang)` : 'Signed up by the dojang',
      p_guests: event.allow_guests ? guestNames : [], p_answers: pick.length ? sent : {}, p_signer: null, p_signature: null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    const who = [...pickedKids.map((k) => k.name), ...guestNames.map((g) => `${g} (guest)`)].join(', ');
    onDone(data?.invoice_number ? `${who} signed up · invoice #${data.invoice_number} (${money(data.total)}) created.` : `${who} signed up.`);
  }

  return (
    <Modal
      title={`Sign up — ${family} family`}
      maxWidth={620}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={busy} onClick={go}>{busy ? 'Signing up…' : `Sign up${sub > 0 ? ` · ${money(total)}` : ''}`}</button>
        </>
      }
    >
      <div data-testid="admin-signup">
        {kids.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dp-ink-soft)', margin: '2px 0 4px' }}>Who is coming?</div>
            {kids.map((k) => (
              <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 14 }}>
                <input type="checkbox" checked={pick.includes(k.id)} onChange={(ev) => setPick((p) => (ev.target.checked ? [...p, k.id] : p.filter((x) => x !== k.id)))} />
                {k.name}{k.class_name ? <span style={{ color: 'var(--dp-ink-faint)', fontSize: 12.5 }}> · {k.class_name}</span> : null}
              </label>
            ))}
          </>
        )}
        {already && <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '6px 0 0' }}>Already signed up: {students.filter((s) => s.customer_id === fam && taken.has(s.id)).map((s) => s.name).join(', ')}</p>}
        {event.allow_guests && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dp-ink-soft)', marginBottom: 4 }}>
              Guests {isFamilyPriced(event) ? `(count toward the family's ${event.family_includes || 4})` : Number(event.guest_price) > 0 ? `(${money(event.guest_price)} each)` : '(free)'}
            </div>
            {names.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input className="dp-input" style={{ flex: 1 }} placeholder="Guest's name" aria-label={`Guest ${i + 1} name`} value={g} maxLength={80} onChange={(ev) => setNames((x) => x.map((y, j) => (j === i ? ev.target.value : y)))} />
                <button type="button" className="dp-btn" aria-label="Remove guest" onClick={() => setNames((x) => x.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            ))}
            {names.length < 10 && <button type="button" className="dp-btn" style={{ fontSize: 13 }} onClick={() => setNames((x) => [...x, ''])}>+ Add guest</button>}
          </div>
        )}
        {pick.length > 0 && form.length > 0 && <FormQuestions form={form} kids={pickedKids} answers={answers} onChange={setAnswers} />}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dp-ink-soft)', margin: '10px 0 4px' }}>Note (optional)</div>
        <input className="dp-input" style={{ width: '100%' }} value={note} maxLength={250} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Mom asked at the front desk" />
        {event.signature_required && <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '10px 0 0' }}>No parent signature is collected when the dojang signs up — get a paper consent if you need one.</p>}
        {sub > 0 && <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '8px 0 0' }}>An invoice for {money(total)}{event.taxable ? ' (incl. GST)' : ''} is added to the family's account.</p>}
        {err && <p style={{ color: 'var(--dp-danger)', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
      </div>
    </Modal>
  );
}
