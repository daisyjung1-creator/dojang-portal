import React, { useEffect, useState } from 'react';
import { Pencil, FileText, CalendarX, Mail, Trash2, Eye, EyeOff, Copy, Check, PauseCircle, Receipt } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import StudentFlags from '../../components/StudentFlags';
import { BELTS } from '../../lib/constants';
import { todayISO, addDaysISO, billingAnchor, nextDueDate, planMonths } from '../../lib/billingDates';
import { weeklyPlan, splitClasses } from '../../lib/classes';
import { MIN_CLASSES, classesSince } from '../../lib/beltTesting';
import { formatDate, money } from '../../lib/invoiceUtils';

// Everything about one student on one screen: details, family, health,
// classes, belt progress, attendance, billing and (for black belts) the
// Kukkiwon / Global Licence records. The less-used actions live here too.

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortTime = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return Number.isNaN(h) ? '' : `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')}`;
};
const ageOf = (dob) => {
  if (!dob) return null;
  const t = todayISO();
  let a = Number(t.slice(0, 4)) - Number(dob.slice(0, 4));
  if (t.slice(5) < String(dob).slice(5)) a--;
  return a;
};
const BB_FIELDS = [
  ['kukkiwon_no', 'Kukkiwon number'],
  ['dan_certificate_no', 'Dan certificate number'],
  ['tcon_id', 'Kukkiwon TCON ID'],
  ['tcon_password', 'Kukkiwon TCON password', true],
  ['gl_no', 'Global Licence (GL) number'],
  ['gl_id', 'GL ID'],
  ['gl_password', 'GL password', true],
];
const isBlack = (belt) => /black belt|dan|poom/i.test(String(belt || ''));

export default function StudentProfileModal({ student: s, family, siblings = [], isAdmin, onClose, onEdit, onPoe, onHold, onStatement, onCancel, onWithdraw, onReactivate, onDelete, onWelcome }) {
  const [schedule, setSchedule] = useState([]);
  const [att, setAtt] = useState(null);
  const [bb, setBb] = useState(null); // saved black belt record
  const [bbEdit, setBbEdit] = useState(null);
  const [show, setShow] = useState({});
  const [copied, setCopied] = useState('');
  const [msg, setMsg] = useState('');
  const [subUsed, setSubUsed] = useState(null);

  useEffect(() => {
    const from = addDaysISO(todayISO(), -365);
    Promise.all([
      supabase.from('class_schedule').select('*').eq('active', true),
      supabase.from('attendance').select('date, class_name, status').eq('student_id', s.id).gte('date', from).order('date', { ascending: false }),
      isAdmin ? supabase.from('student_black_belt').select('*').eq('student_id', s.id).maybeSingle() : Promise.resolve({ data: null }),
      isAdmin && Number(s.subsidy_total) > 0
        ? supabase.from('invoice_lines').select('amount, cycle_start, invoices!inner(voided)').eq('student_id', s.id).eq('line_kind', 'subsidy')
        : Promise.resolve({ data: null }),
    ]).then(([{ data: sc }, { data: a }, { data: b }, { data: sub }]) => {
      if (sub) setSubUsed(sub.filter((l) => !l.invoices?.voided && (!s.subsidy_start_date || !l.cycle_start || l.cycle_start >= s.subsidy_start_date)).reduce((n, l) => n - Number(l.amount || 0), 0));
      setSchedule(sc || []);
      setAtt(a || []);
      setBb(b || null);
    });
  }, [s.id]);

  const belt = BELTS.find((b) => b.value === s.belt) || BELTS[0];
  const plan = weeklyPlan(s, schedule);
  const age = ageOf(s.dob);
  const since = att ? classesSince(s, att) : null;
  const month = todayISO().slice(0, 7);
  const thisMonth = att ? att.filter((r) => r.date.startsWith(month) && ['present', 'double'].includes(r.status)).length : null;
  const last = att?.find((r) => ['present', 'double'].includes(r.status));
  const withdrawn = s.status === 'withdrawn';
  const next = billingAnchor(s) ? nextDueDate(s, todayISO()) : null;

  async function saveBb() {
    const row = { student_id: s.id, updated_at: new Date().toISOString() };
    BB_FIELDS.forEach(([k]) => (row[k] = (bbEdit[k] || '').trim() || null));
    row.notes = (bbEdit.notes || '').trim() || null;
    const { data, error } = await supabase.from('student_black_belt').upsert(row, { onConflict: 'student_id' }).select().single();
    if (error) return setMsg(error.message);
    setBb(data);
    setBbEdit(null);
    setMsg('');
  }

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1400);
    } catch (_e) {
      /* blocked */
    }
  }

  const btn = { padding: '5px 10px', fontSize: 12.5 };

  return (
    <Modal
      title={s.name}
      maxWidth={820}
      onClose={onClose}
      footer={
        isAdmin ? (
          <>
            <button className="dp-btn dp-btn-danger" style={{ ...btn, marginRight: 'auto' }} onClick={onDelete}><Trash2 size={13} /> Delete</button>
            {withdrawn ? (
              <button className="dp-btn" style={btn} onClick={onReactivate}>Reactivate</button>
            ) : (
              <>
                <button className="dp-btn" style={btn} onClick={onHold}><PauseCircle size={13} /> {s.hold_until && s.hold_until >= todayISO() ? 'Hold ✓' : 'Hold'}</button>
                <button className="dp-btn" style={btn} onClick={onWithdraw}>Withdraw</button>
                <button className="dp-btn" style={{ ...btn, ...(s.billing_end_date ? { color: '#9A2B2B', borderColor: '#E4B8B8' } : {}) }} onClick={onCancel}><CalendarX size={13} /> Cancellation</button>
                <button className="dp-btn" style={btn} disabled={!s.guardian_email} onClick={onWelcome}><Mail size={13} /> Welcome email{s.welcome_sent_at ? ' ✓' : ''}</button>
                <button className="dp-btn" style={btn} onClick={onPoe}><FileText size={13} /> Proof of enrollment</button>
                <button className="dp-btn" style={btn} onClick={onStatement}><Receipt size={13} /> Statement</button>
              </>
            )}
            <button className="dp-btn dp-btn-primary" style={btn} onClick={onEdit}><Pencil size={13} /> Edit</button>
          </>
        ) : (
          <button className="dp-btn" onClick={onClose}>Close</button>
        )
      }
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '-4px 0 14px' }}>
        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 13, background: belt.bg, color: belt.text, border: `1px solid ${belt.border}` }}>{s.belt || 'White'}</span>
        {age != null && <span style={{ fontSize: 13, color: '#5B5F56' }}>{age} years old</span>}
        <StudentFlags s={s} />
        {withdrawn && <Pill c="#5B5F56" bg="#F1EFE7">Withdrawn{s.withdrawn_date ? ` ${formatDate(s.withdrawn_date)}` : ''}</Pill>}
        {s.hold_until && s.hold_until >= todayISO() && <Pill c="#3A4250" bg="#EEF0F3">On hold {s.hold_from && s.hold_from > todayISO() ? `from ${formatDate(s.hold_from)} ` : ''}until {formatDate(s.hold_until)}{s.hold_reason ? ` — ${s.hold_reason}` : ''}</Pill>}
        {s.billing_end_date && !withdrawn && <Pill c="#9A2B2B" bg="#FBEAEA">Membership ends {formatDate(s.billing_end_date)}</Pill>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <Box title="Classes">
          <Row k="Classes">{splitClasses(s.class_name).join(', ') || '—'}</Row>
          <Row k="Every week">
            {plan.length ? (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {plan.map((c, i) => <Pill key={i} c="#2A5A30" bg="#EEF2EA">{WD[c.weekday]} {shortTime(c.start_time)} · {c.class_name}</Pill>)}
              </span>
            ) : '—'}
          </Row>
          <Row k="Per week">{s.classes_per_week || '—'}</Row>
          <Row k="Enrolled">{s.enroll_date ? formatDate(s.enroll_date) : '—'}</Row>
        </Box>

        <Box title="Belt & attendance">
          <Row k="Last test">{s.last_test_date ? formatDate(s.last_test_date) : '—'}</Row>
          <Row k="Since last test">
            {since == null ? '…' : (
              <span style={{ color: since >= MIN_CLASSES ? '#2A5A30' : '#20241F' }}>
                <b>{since}</b> / {MIN_CLASSES} classes{since >= MIN_CLASSES ? ' — eligible' : ''}
              </span>
            )}
          </Row>
          <Row k="This month">{thisMonth == null ? '…' : `${thisMonth} class${thisMonth === 1 ? '' : 'es'}`}</Row>
          <Row k="Last class">{last ? `${WD[new Date(last.date + 'T00:00:00').getDay()]} ${formatDate(last.date)}` : '—'}</Row>
        </Box>

        <Box title="Family & contact">
          <Row k="Guardian">{s.guardian_name || '—'}</Row>
          <Row k="Phone">{s.guardian_phone ? <a href={`tel:${s.guardian_phone}`}>{s.guardian_phone}</a> : '—'}</Row>
          <Row k="Email">{s.guardian_email || '—'}</Row>
          <Row k="Address">{s.address || '—'}</Row>
          <Row k="Emergency">{[s.emergency_name, s.emergency_phone].filter(Boolean).join(' · ') || '—'}</Row>
          {siblings.length > 0 && <Row k="Siblings">{siblings.map((x) => x.name).join(', ')}</Row>}
        </Box>

        <Box title="Health & consent">
          <Row k="Medical">{String(s.medical || '').trim() ? <span style={{ color: '#9A2B2B' }}>{s.medical}</span> : 'None noted'}</Row>
          <Row k="Photos / videos">{s.photo_consent === false ? <span style={{ color: '#9A2B2B' }}>No</span> : s.photo_consent === true ? 'Yes' : '—'}</Row>
          <Row k="Date of birth">{s.dob ? formatDate(s.dob) : '—'}</Row>
          {s.notes && <Row k="Notes"><span style={{ whiteSpace: 'pre-line' }}>{s.notes}</span></Row>}
        </Box>

        {isAdmin && (
          <Box title="Billing">
            {s.billing_exempt ? (
              <Row k="Plan">Staff — no invoices</Row>
            ) : (
              <>
                <Row k="Plan">{s.plan || '1 Month'} · {s.tuition ? `${money(s.tuition)}${planMonths(s) > 1 ? ' / 3 months' : ' / month'} + GST` : 'tuition not set'}</Row>
                <Row k="Pays by">{family?.payment_type === 'manual' ? 'Manual (debit / cash / e-transfer)' : 'Pre-authorized credit card'}</Row>
                <Row k="Next billing">{s.billing_end_date && next && next > s.billing_end_date ? `none — ends ${formatDate(s.billing_end_date)}` : next ? formatDate(next) : '—'}</Row>
                {s.family_discount && <Row k="Discount">Big family −20%</Row>}
                {s.subsidy && (
                  <Row k="Subsidy">
                    {(s.subsidy_name || 'Subsidy').trim()}{s.subsidy_amount ? ` ${money(s.subsidy_amount)}/mo` : ''}{s.subsidy_end_date ? ` until ${formatDate(s.subsidy_end_date)}` : ''}
                    {Number(s.subsidy_total) > 0 && subUsed != null && <div style={{ color: '#2A5A30' }}>{money(Math.max(Number(s.subsidy_total) - subUsed, 0))} of {money(s.subsidy_total)} left</div>}
                  </Row>
                )}
                {family?.credit > 0.004 && <Row k="Family credit">{money(family.credit)}</Row>}
                {s.reregistration_fee_due && <Row k="Next invoice">+ $20 re-registration fee</Row>}
              </>
            )}
            {family?.name && <Row k="Family account">{family.name}</Row>}
          </Box>
        )}

        {isAdmin && (
          <Box
            title={isBlack(s.belt) ? "Black belt — Kukkiwon & Global Licence" : "Kukkiwon & Global Licence"}
            action={!bbEdit && <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setBbEdit({ ...(bb || {}) })}><Pencil size={11} /> {bb ? 'Edit' : 'Add'}</button>}
          >
            {bbEdit ? (
              <>
                {BB_FIELDS.map(([k, label]) => (
                  <label key={k} style={{ display: 'block', fontSize: 12, color: '#5B5F56', marginBottom: 6 }}>
                    {label}
                    <input className="dp-input" style={{ width: '100%', marginTop: 2 }} autoComplete="off" value={bbEdit[k] || ''} onChange={(e) => setBbEdit({ ...bbEdit, [k]: e.target.value })} />
                  </label>
                ))}
                <label style={{ display: 'block', fontSize: 12, color: '#5B5F56', marginBottom: 8 }}>
                  Notes
                  <input className="dp-input" style={{ width: '100%', marginTop: 2 }} value={bbEdit.notes || ''} onChange={(e) => setBbEdit({ ...bbEdit, notes: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="dp-btn" style={btn} onClick={() => setBbEdit(null)}>Cancel</button>
                  <button className="dp-btn dp-btn-primary" style={btn} onClick={saveBb}><Check size={13} /> Save</button>
                </div>
                {msg && <p style={{ color: '#9A2B2B', fontSize: 12.5 }}>{msg}</p>}
              </>
            ) : !bb ? (
              <p style={{ fontSize: 13, color: '#8A8D84', margin: 0 }}>No Kukkiwon / GL details yet.</p>
            ) : (
              <>
                {BB_FIELDS.map(([k, label, secret]) => (
                  <Row key={k} k={label}>
                    {bb[k] ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: secret && !show[k] ? 'inherit' : 'ui-monospace, Menlo, monospace' }}>{secret && !show[k] ? '••••••••' : bb[k]}</span>
                        {secret && (
                          <button className="dp-btn" style={{ padding: 3, border: 'none' }} aria-label={show[k] ? 'Hide' : 'Show'} onClick={() => setShow({ ...show, [k]: !show[k] })}>
                            {show[k] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        )}
                        <button className="dp-btn" style={{ padding: 3, border: 'none' }} aria-label="Copy" title="Copy" onClick={() => copy(bb[k], k)}>
                          {copied === k ? <Check size={13} color="#2A5A30" /> : <Copy size={13} />}
                        </button>
                      </span>
                    ) : '—'}
                  </Row>
                ))}
                {bb.notes && <Row k="Notes">{bb.notes}</Row>}
              </>
            )}
          </Box>
        )}
      </div>

      {att && att.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5B5F56', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Recent attendance</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {att.slice(0, 16).map((r, i) => {
              const ok = ['present', 'double'].includes(r.status);
              const col = ok ? ['#2A5A30', '#E8F1E9'] : r.status === 'absent' ? ['#9A2B2B', '#FBEAEA'] : ['#854F0B', '#FAEEDA'];
              return (
                <span key={i} title={`${r.class_name} · ${r.status}`} style={{ fontSize: 11.5, color: col[0], background: col[1], borderRadius: 6, padding: '2px 7px' }}>
                  {WD[new Date(r.date + 'T00:00:00').getDay()]} {r.date.slice(5).replace('-', '/')} {r.status === 'present' ? '✓' : r.status === 'double' ? '✓✓' : r.status[0].toUpperCase()}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Box({ title, action, children }) {
  return (
    <div style={{ border: '1px solid #E4E6DF', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#5B5F56', textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1 }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ k, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0', lineHeight: 1.45 }}>
      <span style={{ width: 120, flexShrink: 0, color: '#8A8D84' }}>{k}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

function Pill({ c, bg, children }) {
  return <span style={{ fontSize: 11.5, color: c, background: bg, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{children}</span>;
}
