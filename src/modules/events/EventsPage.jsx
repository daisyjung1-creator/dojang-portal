import React, { useEffect, useMemo, useState } from 'react';
import { eventPriceLabel, eventCharge } from '../../lib/eventPricing';
import { Plus, Check, Pencil, Copy, ArrowLeft, Users, X, Eye, Lock } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import SearchSelect from '../../components/SearchSelect';
import { money, formatDate, localISO } from '../../lib/invoiceUtils';
import { fetchAll } from '../invoices/api';
import MonthlyCalendars from './MonthlyCalendars';
import FormBuilder, { cleanForm, formProblem, PreviewBody } from './FormBuilder';
import EventResponses from './EventResponses';
import EventSummary from './EventSummary';
import AdminSignup from './AdminSignup';
import { askConfirm } from '../../lib/dialogs';

// Events: camps, tournaments, movie nights… Signing a student up adds an
// invoice for the family (price per student + GST), which they can pay with
// "Pay now" (the same online payment page as invoices). Published events also
// show in the parent portal, where parents sign their own children up.
export const EVENT_KINDS = {
  camp: 'Camp',
  tournament: 'Tournament',
  movie_night: 'Movie night',
  party: 'Party',
  seminar: 'Seminar / clinic',
  other: 'Other',
};
const empty = { title: '', kind: 'camp', description: '', start_date: '', end_date: '', start_time: '', end_time: '', location: '', price: '', pricing: 'per_student', family_price: '', family_includes: 4, extra_price: '', taxable: true, fee_item_id: '', signup_deadline: '', capacity: '', published: true, allow_guests: false, guest_price: '', question: '', question_required: false, form: [], signature_required: false, signature_text: '' };
const ftime = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const when = (e) =>
  `${formatDate(e.start_date)}${e.end_date && e.end_date !== e.start_date ? ` – ${formatDate(e.end_date)}` : ''}${e.start_time ? ` · ${ftime(e.start_time)}${e.end_time ? `–${ftime(e.end_time)}` : ''}` : ''}`;

export default function EventsPage() {
  const [events, setEvents] = useState(null);
  const [signups, setSignups] = useState([]);
  const [guests, setGuests] = useState([]);
  const [invoices, setInvoices] = useState({});
  const [students, setStudents] = useState([]);
  const [items, setItems] = useState([]);
  const [showPast, setShowPast] = useState(false);
  const [edit, setEdit] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [flash, setFlash] = useState('');

  async function load() {
    const [{ data: ev }, { data: su }, { data: gu }, { data: st }, { data: fi }] = await Promise.all([
      supabase.from('events').select('*').order('start_date', { ascending: false }),
      fetchAll(() => supabase.from('event_signups').select('*')),
      fetchAll(() => supabase.from('event_guests').select('*').is('removed_at', null)),
      fetchAll(() => supabase.from('students').select('id, name, customer_id, status, class_name, belt').order('name')),
      supabase.from('fee_items').select('id, name, description, default_amount, taxable').eq('active', true).order('name'),
    ]);
    const ids = [...new Set([...(su || []), ...(gu || [])].map((s) => s.invoice_id).filter(Boolean))];
    const inv = {};
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await supabase.from('invoice_summary').select('id, invoice_number, total, balance, voided, pay_token').in('id', ids.slice(i, i + 150));
      (data || []).forEach((x) => (inv[x.id] = x));
    }
    setEvents(ev || []);
    setSignups(su || []);
    setGuests(gu || []);
    setInvoices(inv);
    setStudents((st || []).filter((s) => (s.status || 'active') !== 'withdrawn'));
    setItems(fi || []);
  }
  useEffect(() => {
    load();
  }, []);

  const today = localISO();
  const list = (events || []).filter((e) => !e.archived && (showPast || (e.end_date || e.start_date || today) >= today)).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const stats = (id) => {
    const su = signups.filter((s) => s.event_id === id && s.status === 'signed_up');
    const gu = guests.filter((g) => g.event_id === id);
    const inv = [...new Set([...su, ...gu].map((s) => s.invoice_id).filter(Boolean))].map((x) => invoices[x]).filter(Boolean);
    return { count: su.length, guests: gu.length, owing: inv.filter((i) => !i.voided && Number(i.balance) > 0.004).reduce((t, i) => t + Number(i.balance), 0), parents: su.filter((s) => s.source === 'parent').length };
  };
  const done = (m) => {
    setEdit(null);
    setFlash(m);
    load();
  };

  const current = openId && (events || []).find((e) => e.id === openId);
  if (current)
    return (
      <EventDetail
        event={current}
        signups={signups.filter((s) => s.event_id === current.id)}
        guests={guests.filter((g) => g.event_id === current.id)}
        invoices={invoices}
        students={students}
        onBack={() => { setOpenId(null); setFlash(''); }}
        onEdit={() => setEdit(current)}
        reload={load}
        editModal={edit && <EventForm event={edit} items={items} onClose={() => setEdit(null)} onDone={done} />}
      />
    );

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Events</h1>
          <p style={styles.subtitle}>Camps, tournaments, movie nights… Sign-ups create an invoice the family can pay online. Published events appear in the parent portal.</p>
        </div>
        <button className="dp-btn dp-btn-primary" onClick={() => setEdit({ ...empty })}><Plus size={15} /> New event</button>
      </div>
      {flash && <p style={{ background: 'var(--dp-success-tint)', color: 'var(--dp-success)', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}
      <label style={{ fontSize: 13, color: 'var(--dp-ink-soft)', display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past events
      </label>
      {events === null ? (
        <p style={{ color: 'var(--dp-ink-soft)' }}>Loading…</p>
      ) : list.length === 0 ? (
        <div style={{ ...styles.card, padding: 20, color: 'var(--dp-ink-soft)', fontSize: 14 }}>No upcoming events. Click “New event”.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {list.map((e) => {
            const st = stats(e.id);
            return (
              <button key={e.id} data-event={e.title} onClick={() => setOpenId(e.id)} style={{ ...styles.card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #EDEAE0' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--dp-ink-faint)', flex: 1 }}>{EVENT_KINDS[e.kind] || e.kind}</span>
                  <span style={{ fontSize: 12, padding: '1px 7px', borderRadius: 999, background: e.published ? 'var(--dp-success-tint)' : 'var(--dp-canvas)', color: e.published ? 'var(--dp-success)' : 'var(--dp-ink-soft)' }}>{e.published ? 'In parent portal' : 'Hidden from parents'}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--dp-ink)' }}>{e.title}</div>
                <div style={{ fontSize: 13, color: 'var(--dp-ink-soft)', margin: '2px 0 8px' }}>{when(e)}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--dp-ink)' }}>
                  <span><Users size={13} style={{ verticalAlign: -2 }} /> {st.count}{st.guests ? ` + ${st.guests} guest${st.guests > 1 ? 's' : ''}` : ''}{e.capacity ? ` / ${e.capacity}` : ''} signed up</span>
                  {e.signups_closed && <span style={{ color: 'var(--dp-danger)', fontWeight: 600 }}>Sign-up closed</span>}
                  <span>{eventPriceLabel(e, { gst: false })}</span>
                  {st.owing > 0 && <span style={{ color: 'var(--dp-danger)' }}>{money(st.owing)} unpaid</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <MonthlyCalendars />
      {edit && <EventForm event={edit} items={items} onClose={() => setEdit(null)} onDone={done} />}
    </>
  );
}

function EventDetail({ event: e, signups, guests = [], invoices, students, onBack, onEdit, reload, editModal }) {
  const [pick, setPick] = useState('');
  const [signFor, setSignFor] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const byId = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  // Form answers, newest first — shared by the summary (top) and the list (bottom).
  const [respRows, setRespRows] = useState(null);
  useEffect(() => {
    supabase.from('event_responses').select('*').eq('event_id', e.id).order('created_at', { ascending: false }).then(({ data }) => setRespRows(data || []));
  }, [e.id, signups.length]);
  const active = signups.filter((s) => s.status === 'signed_up');
  const taken = new Set(active.map((s) => s.student_id));
  // Already-signed-up students stay in the list so guests can be added to their family.
  const options = students.map((s) => ({ value: s.id, label: s.name, hint: taken.has(s.id) ? 'signed up — add family / guests' : s.class_name || '' }));
  const payUrl = (tok) => `${window.location.origin}/pay/${tok}`;

  async function add() {
    if (!pick) return;
    setErr('');
    setMsg('');
    const s = byId[pick];
    if (!s?.customer_id) return setErr(`${s?.name || 'This student'} has no family account yet (Customers), so no invoice can be made.`);
    // Opens the same choices parents get: brothers & sisters, guests, the sign-up form.
    setSignFor(s);
  }
  async function toggleClosed() {
    const closing = !e.signups_closed;
    if (closing && !(await askConfirm(`Parents will see "Sign-up is closed" and can't sign up. You can still sign families up here, and reopen any time.`, { title: `Close sign-up for ${e.title}?`, confirmLabel: 'Close sign-up' }))) return;
    setBusy(true);
    const { error } = await supabase.from('events').update({ signups_closed: closing }).eq('id', e.id);
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg(closing ? 'Sign-up closed. Parents now see "Sign-up is closed".' : 'Sign-up reopened for parents.');
    reload();
  }
  async function cancel(su) {
    const s = byId[su.student_id];
    const inv = invoices[su.invoice_id];
    await supabase.from('event_signups').update({ status: 'cancelled' }).eq('id', su.id);
    setMsg(`${s?.name || 'Student'} removed from the event.${inv && !inv.voided ? ` Invoice #${inv.invoice_number} is still open — void or refund it in Invoices if needed.` : ''}`);
    reload();
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Pay link copied.');
    } catch {
      setMsg(text);
    }
  }

  return (
    <>
      <button className="dp-btn" style={{ marginBottom: 12, padding: '5px 10px', fontSize: 12.5 }} onClick={onBack}><ArrowLeft size={14} /> All events</button>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{e.title}</h1>
          <p style={styles.subtitle}>
            {EVENT_KINDS[e.kind]} · {when(e)}{e.location ? ` · ${e.location}` : ''} · {eventPriceLabel(e)}
            {e.signup_deadline ? ` · sign up by ${formatDate(e.signup_deadline)}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="dp-btn"
            data-testid="toggle-signups"
            style={e.signups_closed ? { borderColor: 'var(--dp-danger)', color: 'var(--dp-danger)' } : undefined}
            disabled={busy}
            onClick={toggleClosed}
            title={e.signups_closed ? 'Parents can sign up again' : 'Stop new sign-ups now (e.g. the event is full). You can still sign families up here.'}
          >
            {e.signups_closed ? <><Lock size={14} /> Sign-up closed · Reopen</> : <><Lock size={14} /> Close sign-up</>}
          </button>
          <button className="dp-btn" onClick={() => setPreview(true)}><Eye size={14} /> Preview as parent</button>
          <button className="dp-btn" onClick={onEdit}><Pencil size={14} /> Edit event</button>
        </div>
      </div>
      {e.description && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 14px' }}>{e.description}</p>}
      {msg && <p style={{ background: 'var(--dp-success-tint)', color: 'var(--dp-success)', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{msg}</p>}
      {err && <p style={{ background: 'var(--dp-danger-tint)', color: 'var(--dp-danger)', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{err}</p>}

      <EventSummary event={e} students={active.length} guests={guests.length} rows={respRows} kidsOf={(r) => (r.student_ids || []).map((id) => byId[id] || { id, name: 'Student' })} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0 12px', maxWidth: 560 }}>
        <div style={{ flex: 1 }}><SearchSelect options={options} value={pick} onChange={setPick} placeholder="Add a student…" /></div>
        <button className="dp-btn dp-btn-primary" disabled={!pick || busy} onClick={add}><Plus size={14} /> Sign up for family</button>
      </div>
      {signFor && (
        <AdminSignup
          event={e}
          student={signFor}
          students={students}
          signups={signups}
          guests={guests}
          onClose={() => setSignFor(null)}
          onDone={(m) => { setSignFor(null); setPick(''); setMsg(m); reload(); }}
        />
      )}

      <div style={styles.card}>
        {active.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--dp-ink-soft)', fontSize: 14 }}>No one signed up yet.</p>
        ) : (
          <table className="dp-table">
            <thead><tr><th>Student</th>{e.question && <th>{e.question}</th>}<th>Signed up</th><th>Invoice</th><th style={{ textAlign: 'right' }}>Balance</th><th></th></tr></thead>
            <tbody>
              {active.map((su) => {
                const s = byId[su.student_id];
                const inv = invoices[su.invoice_id];
                const paid = inv && Number(inv.balance) <= 0.004;
                return (
                  <tr key={su.id} className="dp-row" data-signup={s?.name}>
                    <td style={{ fontWeight: 500 }}>{s?.name || '—'}{su.note && <div style={{ fontSize: 12, color: 'var(--dp-ink-faint)', fontWeight: 400 }}>“{su.note}”</div>}</td>
                    {e.question && <td style={{ fontSize: 13 }}>{su.answer || <span style={{ color: 'var(--dp-ink-faint)' }}>—</span>}</td>}
                    <td style={{ fontSize: 13, color: 'var(--dp-ink-soft)' }}>{formatDate(su.created_at?.slice(0, 10))} · {su.source === 'parent' ? 'by parent' : 'by you'}</td>
                    <td>{inv ? `#${inv.invoice_number}${inv.voided ? ' (void)' : ''}` : eventPriceLabel(e) !== 'Free' ? '—' : 'free'}</td>
                    <td style={{ textAlign: 'right', color: paid ? 'var(--dp-success)' : 'var(--dp-danger)', fontWeight: 500 }}>{inv ? (paid ? <><Check size={13} /> Paid</> : money(inv.balance)) : ''}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {inv && !paid && !inv.voided && <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => copy(payUrl(inv.pay_token))}><Copy size={12} /> Pay link</button>}
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} title="Remove from event" onClick={() => cancel(su)}><X size={12} /> Remove</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {guests.length > 0 && (
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div style={{ padding: '12px 14px 4px', fontWeight: 600 }}>Guests ({guests.length}){Number(e.guest_price) > 0 ? ` · ${money(e.guest_price)} each` : ''}</div>
          <table className="dp-table">
            <thead><tr><th>Guest</th><th>With family</th><th>Invoice</th><th></th></tr></thead>
            <tbody>
              {guests.map((g) => {
                const fam = students.find((s) => s.customer_id === g.customer_id);
                const inv = invoices[g.invoice_id];
                return (
                  <tr key={g.id} className="dp-row" data-guest={g.name}>
                    <td style={{ fontWeight: 500 }}>{g.name}</td>
                    <td style={{ fontSize: 13, color: 'var(--dp-ink-soft)' }}>{signups.filter((x) => x.customer_id === g.customer_id && x.status === 'signed_up').map((x) => byId[x.student_id]?.name).filter(Boolean).join(', ') || fam?.name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{inv ? `#${inv.invoice_number}${Number(inv.balance) <= 0.004 ? ' · paid' : ''}` : Number(e.guest_price) > 0 ? '—' : 'free'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={async () => { await supabase.from('event_guests').update({ removed_at: new Date().toISOString() }).eq('id', g.id); setMsg(`${g.name} removed.${inv && !inv.voided ? ` Adjust invoice #${inv.invoice_number} in Invoices if needed.` : ''}`); reload(); }}><X size={12} /> Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EventResponses event={e} students={students} rows={respRows} setRows={setRespRows} />
      {preview && (
        <Modal title="Preview — what families see" maxWidth={640} onClose={() => setPreview(false)} footer={<button className="dp-btn" onClick={() => setPreview(false)}>Close preview</button>}>
          <PreviewBody event={e} form={Array.isArray(e.form) ? e.form : []} signatureRequired={!!e.signature_required} signatureText={e.signature_text} />
        </Modal>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--dp-ink-faint)' }}>{active.length + guests.length}{e.capacity ? ` of ${e.capacity}` : ''} spots taken{guests.length ? ` (incl. ${guests.length} guest${guests.length > 1 ? 's' : ''})` : ''}.</p>
      {editModal}
    </>
  );
}

function EventForm({ event, items, onClose, onDone }) {
  const [f, setF] = useState(() => {
    const x = { ...empty, ...Object.fromEntries(Object.entries(event).map(([k, v]) => [k, v ?? ''])) };
    x.form = Array.isArray(event.form) ? event.form : [];
    // an old single question becomes the first form question
    if (event.question && !x.form.length) x.form = [{ id: 'q_legacy', type: 'short', label: event.question, help: '', required: !!event.question_required, per_child: false, options: [] }];
    return x;
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const itemOptions = items.map((it) => ({ value: it.id, label: it.name, hint: it.description || '' }));
  function pickItem(id) {
    const it = items.find((x) => x.id === id);
    setF((x) => ({ ...x, fee_item_id: id || '', ...(it && !x.price ? { price: it.default_amount ?? '' } : {}), ...(it ? { taxable: it.taxable !== false } : {}) }));
  }
  async function save() {
    if (!f.title.trim()) return setError('Give the event a name.');
    if (!f.start_date) return setError('Pick the date.');
    const problem = formProblem(f.form);
    if (problem) return setError(problem);
    if (f.signature_required && !String(f.signature_text).trim()) return setError('Add the text the parent agrees to when signing.');
    const row = {
      title: f.title.trim(),
      kind: f.kind,
      description: f.description.trim() || null,
      start_date: f.start_date,
      end_date: f.end_date || null,
      start_time: f.start_time || null,
      end_time: f.end_time || null,
      location: f.location.trim() || null,
      price: f.pricing === 'per_family' ? 0 : Number(f.price) || 0,
      pricing: f.pricing === 'per_family' ? 'per_family' : 'per_student',
      family_price: f.pricing === 'per_family' ? Number(f.family_price) || 0 : 0,
      family_includes: f.pricing === 'per_family' ? Math.max(1, parseInt(f.family_includes, 10) || 4) : 4,
      extra_price: f.pricing === 'per_family' ? Number(f.extra_price) || 0 : 0,
      taxable: !!f.taxable,
      fee_item_id: f.fee_item_id || null,
      signup_deadline: f.signup_deadline || null,
      capacity: f.capacity === '' ? null : Number(f.capacity),
      published: !!f.published,
      allow_guests: !!f.allow_guests,
      guest_price: f.allow_guests && f.pricing !== 'per_family' ? Number(f.guest_price) || 0 : 0,
      question: null,
      question_required: false,
      form: cleanForm(f.form),
      signature_required: !!f.signature_required,
      signature_text: f.signature_required ? String(f.signature_text).trim() : null,
    };
    const { error: e } = event.id ? await supabase.from('events').update(row).eq('id', event.id) : await supabase.from('events').insert(row);
    if (e) return setError(e.message);
    onDone(event.id ? `${row.title} saved.` : `${row.title} created${row.published ? ' — it now shows in the parent portal' : ''}.`);
  }
  async function archive() {
    await supabase.from('events').update({ archived: true }).eq('id', event.id);
    onDone(`${f.title} archived.`);
  }
  return (
    <Modal
      title={event.id ? 'Edit event' : 'New event'}
      onClose={onClose}
      maxWidth={720}
      footer={
        <>
          {event.id && <button className="dp-btn" style={{ marginRight: 'auto' }} onClick={archive}>Archive</button>}
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button>
        </>
      }
    >
      <div style={styles.formRow}>
        <Field label="Name" required><input className="dp-input" style={{ width: '100%' }} value={f.title} onChange={set('title')} placeholder="e.g. Winter Break Camp" autoFocus /></Field>
        <Field label="Type">
          <select className="dp-select" style={{ width: '100%' }} value={f.kind} onChange={set('kind')}>
            {Object.entries(EVENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <div style={styles.formRow}>
        <Field label="Date" required><input type="date" className="dp-input" style={{ width: '100%' }} value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="End date (if more than one day)"><input type="date" className="dp-input" style={{ width: '100%' }} value={f.end_date} onChange={set('end_date')} /></Field>
      </div>
      <div style={styles.formRow}>
        <Field label="Start time"><input type="time" className="dp-input" style={{ width: '100%' }} value={String(f.start_time).slice(0, 5)} onChange={set('start_time')} /></Field>
        <Field label="End time"><input type="time" className="dp-input" style={{ width: '100%' }} value={String(f.end_time).slice(0, 5)} onChange={set('end_time')} /></Field>
        <Field label="Location"><input className="dp-input" style={{ width: '100%' }} value={f.location} onChange={set('location')} placeholder="Dojang" /></Field>
      </div>
      <div style={styles.formRow}>
        <Field label="Item (for reports)"><SearchSelect options={itemOptions} value={f.fee_item_id} onChange={pickItem} placeholder="Optional — e.g. Summer Camp" /></Field>
        <Field label="Price">
          <select className="dp-select" style={{ width: '100%' }} value={f.pricing || 'per_student'} onChange={set('pricing')}>
            <option value="per_student">Per student</option>
            <option value="per_family">Per family</option>
          </select>
        </Field>
      </div>
      {f.pricing === 'per_family' ? (
        <div style={styles.formRow}>
          <Field label="Family price"><input type="number" min="0" step="0.01" className="dp-input" style={{ width: '100%' }} value={f.family_price} onChange={set('family_price')} placeholder="e.g. 50" /></Field>
          <Field label="Covers up to (people)"><input type="number" min="1" step="1" className="dp-input" style={{ width: '100%' }} value={f.family_includes} onChange={set('family_includes')} /></Field>
          <Field label="Each extra person"><input type="number" min="0" step="0.01" className="dp-input" style={{ width: '100%' }} value={f.extra_price} onChange={set('extra_price')} placeholder="e.g. 10" /></Field>
        </div>
      ) : (
        <div style={{ ...styles.formRow, maxWidth: 360 }}>
          <Field label="Price per student"><input type="number" min="0" step="0.01" className="dp-input" style={{ width: '100%' }} value={f.price} onChange={set('price')} placeholder="0 = free" /></Field>
        </div>
      )}
      {f.pricing === 'per_family' && (
        <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '-4px 0 10px' }}>
          Students and guests both count as people. e.g. 2 kids + 3 guests = 5 people → {money(Number(f.family_price) || 0)} + 1 × {money(Number(f.extra_price) || 0)} = {money(eventCharge({ ...f, pricing: 'per_family' }, { kids: 2, guests: 3 }))}{f.taxable ? ' + GST' : ''}.
        </p>
      )}
      <div style={styles.formRow}>
        <Field label="Sign up by"><input type="date" className="dp-input" style={{ width: '100%' }} value={f.signup_deadline} onChange={set('signup_deadline')} /></Field>
        <Field label="Spots (empty = no limit)"><input type="number" min="1" className="dp-input" style={{ width: '100%' }} value={f.capacity} onChange={set('capacity')} /></Field>
      </div>
      <Field label="Details for parents"><textarea className="dp-input" style={{ width: '100%', minHeight: 90 }} value={f.description} onChange={set('description')} placeholder="What to bring, pick-up time…" /></Field>
      <div style={{ border: '1px solid #E4E6DF', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
        <label style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'center' }}><input type="checkbox" checked={!!f.allow_guests} onChange={set('allow_guests')} /> Families can bring guests (they enter each guest's name)</label>
        {f.allow_guests && f.pricing !== 'per_family' && (
          <div style={{ marginTop: 8, maxWidth: 260 }}>
            <Field label="Price per guest"><input type="number" min="0" step="0.01" className="dp-input" style={{ width: '100%' }} value={f.guest_price} onChange={set('guest_price')} placeholder="0 = free" /></Field>
          </div>
        )}
      </div>
      <FormBuilder
        form={f.form}
        onForm={(form) => setF((x) => ({ ...x, form }))}
        signatureRequired={!!f.signature_required}
        onSignatureRequired={(v) => setF((x) => ({ ...x, signature_required: v }))}
        signatureText={f.signature_text}
        onSignatureText={(v) => setF((x) => ({ ...x, signature_text: v }))}
      />
      <label style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'center', marginBottom: 6 }}><input type="checkbox" checked={!!f.taxable} onChange={set('taxable')} /> Add GST</label>
      <label style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'center' }}><input type="checkbox" checked={!!f.published} onChange={set('published')} /> Show in the parent portal (parents can sign up)</label>
      {error && <p style={{ color: 'var(--dp-danger)', fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}
