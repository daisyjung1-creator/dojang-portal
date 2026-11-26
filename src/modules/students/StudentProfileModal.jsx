import React, { useEffect, useState } from 'react';
import { ArrowLeft, Phone, Pencil, FileText, CalendarX, Mail, Trash2, Eye, EyeOff, Copy, Check, PauseCircle, Receipt, Flame, Medal } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import TapeList from '../../components/TapeList';
import BeltWithTapes from '../../components/BeltWithTapes';
import { beltPaint } from '../../components/BeltStrip';
import { CardLinkButton } from '../invoices/CardLink';
import CardWallet from '../../components/CardWallet';
import { hasTapes, loadTapes, TAPE_COUNT } from '../../lib/tapes';
import StudentFlags from '../../components/StudentFlags';
import { BELTS } from '../../lib/constants';
import { todayISO, addDaysISO, billingAnchor, nextDueDate, planMonths } from '../../lib/billingDates';
import { weeklyPlan, splitClasses, classColor } from '../../lib/classes';
import { MIN_CLASSES, classesSince } from '../../lib/beltTesting';
import { formatDate, money, calcTotals, round2 } from '../../lib/invoiceUtils';
import { tuitionLines, isBillable, onHold as onHoldOn } from '../../lib/tuitionBilling';
import { studentSummary } from '../../lib/attendanceStats';
import { PATCHES } from '../../lib/testAwards';

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
  const [gstRate, setGstRate] = useState(5);
  const [makeups, setMakeups] = useState(null);
  const [lastBill, setLastBill] = useState(undefined); // { cycle, total, balance, number } | null
  const [tapes, setTapes] = useState(null);
  useEffect(() => {
    loadTapes([s]).then((m) => setTapes(m[s.id] || new Set()));
  }, [s.id, s.belt]);

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

  // Last tuition billing for this student: their lines on the most recent
  // (not voided) tuition invoice, with GST, and whether it has been paid.
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    (async () => {
      const [{ data: st }, { data: ls }] = await Promise.all([
        supabase.from('invoice_settings').select('gst_rate').eq('id', 1).maybeSingle(),
        supabase.from('invoice_lines').select('invoice_id, cycle_start, amount, taxable, line_kind, quantity, unit_price').eq('student_id', s.id).not('cycle_start', 'is', null).order('cycle_start', { ascending: false }).limit(40),
      ]);
      const rate = st?.gst_rate ?? 5;
      if (!live) return;
      setGstRate(rate);
      const ids = Array.from(new Set((ls || []).map((l) => l.invoice_id)));
      if (!ids.length) return setLastBill(null);
      const { data: invs } = await supabase.from('invoice_summary').select('id, invoice_number, balance, total, voided').in('id', ids);
      const ok = new Map((invs || []).filter((i) => !i.voided).map((i) => [i.id, i]));
      const top = (ls || []).find((l) => ok.has(l.invoice_id));
      if (!live) return;
      if (!top) return setLastBill(null);
      const lines = ls.filter((l) => l.invoice_id === top.invoice_id);
      const inv = ok.get(top.invoice_id);
      setLastBill({ cycle: top.cycle_start, total: calcTotals(lines, rate).total, balance: Number(inv.balance || 0), number: inv.invoice_number, invoiceTotal: Number(inv.total || 0) });
    })();
    return () => {
      live = false;
    };
  }, [s.id, isAdmin]);

  useEffect(() => {
    supabase.from('makeup_records').select('id, absence_date, class_name, status, expiration_date, reservation_date, reservation_class_name, conditional').eq('student_id', s.id).order('absence_date', { ascending: false }).limit(30).then(({ data }) => setMakeups(data || []));
  }, [s.id]);

  const belt = BELTS.find((b) => b.value === s.belt) || BELTS[0];
  const plan = weeklyPlan(s, schedule);
  const age = ageOf(s.dob);
  const since = att ? classesSince(s, att) : null;
  const last = att?.find((r) => ['present', 'double'].includes(r.status));
  const withdrawn = s.status === 'withdrawn';
  const next = billingAnchor(s) ? nextDueDate(s, todayISO()) : null;
  // Next billing: this student's lines (tuition, family discount, subsidy) + GST,
  // and the family total when brothers/sisters are billed the same day.
  const nextLines = next && Number(s.tuition) > 0 && !s.billing_exempt ? tuitionLines(subUsed != null ? { ...s, _subsidyUsed: subUsed } : s, next) : null;
  const nextCalc = nextLines ? calcTotals(nextLines, gstRate) : null;
  const sameDaySibs = next ? siblings.filter((x) => isBillable(x) && nextDueDate(x, todayISO()) === next && !onHoldOn(x, next)) : [];
  const familyNext = nextCalc && sameDaySibs.length ? round2(nextCalc.total + sameDaySibs.reduce((n, x) => n + calcTotals(tuitionLines(x, next), gstRate).total, 0)) : null;
  const attSum = att ? studentSummary(s, att) : null;
  const streak = att ? weekStreak(att) : 0;
  const card = { border: '1px solid var(--dp-line)', borderRadius: 12, padding: '16px 18px', background: '#fff' };

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

  const btn = { fontSize: 13 };

  const actions =
        isAdmin ? (
          <>
            <button className="dp-btn dp-btn-danger" style={{ ...btn, order: 9, marginLeft: 'auto' }} onClick={onDelete}><Trash2 size={13} /> Delete</button>
            {withdrawn ? (
              <button className="dp-btn" style={btn} onClick={onReactivate}>Reactivate</button>
            ) : (
              <>
                <button className="dp-btn" style={btn} onClick={onHold}><PauseCircle size={14} /> Hold{s.hold_until && s.hold_until >= todayISO() && <Check size={14} aria-label="on hold" />}</button>
                <button className="dp-btn" style={btn} onClick={onWithdraw}>Withdraw</button>
                <button className="dp-btn" style={{ ...btn, ...(s.billing_end_date ? { color: 'var(--dp-danger)', borderColor: 'var(--dp-danger-tint)' } : {}) }} onClick={onCancel}><CalendarX size={13} /> Cancellation</button>
                <button className="dp-btn" style={btn} disabled={!s.guardian_email} onClick={onWelcome}><Mail size={14} /> Welcome email{s.welcome_sent_at && <Check size={14} aria-label="sent" />}</button>
              </>
            )}
          </>
        ) : null;

  // A full page (not a pop-up). Changes go through "Edit details".
  return (
    <div data-testid="student-page">
      <button className="dp-link-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, marginBottom: 14, color: 'var(--dp-ink-soft)', fontSize: 14, minHeight: 38, cursor: 'pointer', fontFamily: 'inherit' }} onClick={onClose}>
        <ArrowLeft size={15} /> Students
      </button>

      {/* Header: who, belt, status, streak, age, joined */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div aria-hidden style={{ width: 64, height: 64, borderRadius: 12, border: '1px solid var(--dp-line)', background: 'var(--dp-paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, color: 'var(--dp-ink-soft)', flexShrink: 0 }}>
          {initials(s.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ ...styles.title, fontSize: 'var(--dp-text-display)', margin: '0 0 6px' }}>{s.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14 }}>
              <BeltWithTapes belt={s.belt || 'White'} tapes={tapes} width={46} height={14} />
              {s.belt || 'White'}
            </span>
            {withdrawn ? (
              <Pill c="var(--dp-ink-soft)" bg="var(--dp-canvas)">Withdrawn{s.withdrawn_date ? ` ${formatDate(s.withdrawn_date)}` : ''}</Pill>
            ) : s.hold_until && s.hold_until >= todayISO() ? (
              <Pill c="var(--dp-warning)" bg="var(--dp-warning-tint)">On hold {s.hold_from && s.hold_from > todayISO() ? `from ${formatDate(s.hold_from)} ` : ''}until {formatDate(s.hold_until)}{s.hold_reason ? ` — ${s.hold_reason}` : ''}</Pill>
            ) : (
              <Pill c="var(--dp-success)" bg="var(--dp-success-tint)">Active</Pill>
            )}
            {streak > 1 && <Pill c="var(--dp-warning)" bg="var(--dp-warning-tint)"><Flame size={12} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 3 }} />{streak}-week streak</Pill>}
            {age != null && <span style={{ fontSize: 14, color: 'var(--dp-ink-soft)' }}>Age {age}</span>}
            {s.enroll_date && <span style={{ fontSize: 14, color: 'var(--dp-ink-soft)' }}>Joined {formatDate(s.enroll_date)}</span>}
            <StudentFlags s={s} />
            {s.billing_end_date && !withdrawn && <Pill c="var(--dp-danger)" bg="var(--dp-danger-tint)">Membership ends {formatDate(s.billing_end_date)}</Pill>}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {s.guardian_phone && <a className="dp-btn" href={`tel:${s.guardian_phone}`} style={{ textDecoration: 'none' }}><Phone size={14} /> Call</a>}
        {s.guardian_email && <a className="dp-btn" href={`mailto:${s.guardian_email}`} style={{ textDecoration: 'none' }}><Mail size={14} /> Email family</a>}
        {isAdmin && !withdrawn && <button className="dp-btn" onClick={onPoe}><FileText size={14} /> Proof of enrollment</button>}
        {isAdmin && <button className="dp-btn" onClick={onStatement}><Receipt size={14} /> Statement</button>}
        {isAdmin && <button className="dp-btn dp-btn-primary" onClick={onEdit}><Pencil size={14} /> Edit details</button>}
      </div>

      <BeltJourney s={s} since={since} tapes={tapes}>
        {hasTapes(s.belt) && <TapeList student={s} onChange={setTapes} editable />}
      </BeltJourney>

      {/* Tapes + family side by side */}
      <div style={{ marginBottom: 14 }} className="dp-student-split">
        {/* Family + Billing side by side (stacked on narrow screens). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start', minWidth: 0 }}>
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px' }}>Family</h2>
            <Row k="Parent / guardian">{s.guardian_name || '—'}</Row>
            <Row k="Phone">{s.guardian_phone ? <a href={`tel:${s.guardian_phone}`}>{s.guardian_phone}</a> : '—'}</Row>
            <Row k="Email">{s.guardian_email || '—'}</Row>
            <Row k="Address">{s.address || '—'}</Row>
            <Row k="Emergency">{[s.emergency_name, s.emergency_phone].filter(Boolean).join(' · ') || '—'}</Row>
            {siblings.length > 0 && <Row k="Siblings">{siblings.map((x) => x.name).join(', ')}</Row>}
            {family?.name && <Row k="Family account">{family.name}</Row>}
            {isAdmin && s.customer_id && <Row k="Parent portal"><ParentInvite customerId={s.customer_id} /></Row>}
          </div>
          {isAdmin && (
            <Box title="Billing">
              {s.billing_exempt ? (
                <Row k="Plan">Staff — no invoices</Row>
              ) : (
                <>
                  <Row k="Plan">{s.plan || '1 Month'} · {s.tuition ? `${money(s.tuition)}${planMonths(s) > 1 ? ' / 3 months' : ' / month'} + GST` : 'tuition not set'}</Row>
                  <Row k="Pays by">{family?.payment_type === 'manual' ? 'Manual (debit / cash / e-transfer)' : 'Pre-authorized credit card'}</Row>
                  {s.customer_id && <Row k="Card"><FamilyCard customerId={s.customer_id} /></Row>}
                  <Row k="Next billing">
                    {s.billing_end_date && next && next > s.billing_end_date ? `none — ends ${formatDate(s.billing_end_date)}` : next ? (
                      <>
                        <div>{formatDate(next)}{nextCalc && <> · <b style={{ fontWeight: 700 }}>{money(nextCalc.total)}</b></>}</div>
                        {nextLines && (
                          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--dp-ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
                            {nextLines.map((l, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8 }}>
                                <span style={{ flex: 1 }}>{l.line_kind === 'tuition' ? 'Tuition' : l.line_kind === 'discount' ? 'Family discount' : l.line_kind === 'subsidy' ? (s.subsidy_name || 'Subsidy').trim() : 'Re-registration fee'}</span>
                                <span>{Number(l.quantity * l.unit_price) < 0 ? '−' : ''}{money(Math.abs(l.quantity * l.unit_price))}</span>
                              </div>
                            ))}
                            {nextCalc.gst > 0 && <div style={{ display: 'flex', gap: 8 }}><span style={{ flex: 1 }}>GST</span><span>{money(nextCalc.gst)}</span></div>}
                            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--dp-line)', marginTop: 3, paddingTop: 3, color: 'var(--dp-ink)', fontWeight: 600 }}><span style={{ flex: 1 }}>{s.name.split(' ')[0]} pays</span><span>{money(nextCalc.total)}</span></div>
                            {familyNext != null && (
                              <div style={{ display: 'flex', gap: 8, color: 'var(--dp-ink)', fontWeight: 600 }}><span style={{ flex: 1 }}>Family total ({sameDaySibs.length + 1} kids)</span><span>{money(familyNext)}</span></div>
                            )}
                          </div>
                        )}
                      </>
                    ) : '—'}
                  </Row>
                  <Row k="Last billing">
                    {lastBill === undefined ? <span style={{ color: 'var(--dp-ink-faint)' }}>…</span> : !lastBill ? '—' : (
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatDate(lastBill.cycle)} · <b style={{ fontWeight: 700 }}>{money(lastBill.total)}</b>{' '}
                        {lastBill.balance > 0.004 ? (
                          <span style={{ color: 'var(--dp-danger)', fontSize: 12.5, whiteSpace: 'nowrap' }}>Unpaid</span>
                        ) : (
                          <span style={{ color: 'var(--dp-success)', fontSize: 12.5, whiteSpace: 'nowrap' }}>Paid</span>
                        )}
                        {Math.abs(lastBill.invoiceTotal - lastBill.total) > 0.004 && (
                          <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)' }}>Family invoice #{lastBill.number}: {money(lastBill.invoiceTotal)}</div>
                        )}
                        {Math.abs(lastBill.invoiceTotal - lastBill.total) <= 0.004 && <span style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)' }}> · #{lastBill.number}</span>}
                      </span>
                    )}
                  </Row>
                  {s.family_discount && <Row k="Discount">Big family −20%</Row>}
                  {s.subsidy && (
                    <Row k="Subsidy">
                      {(s.subsidy_name || 'Subsidy').trim()}{s.subsidy_amount ? ` ${money(s.subsidy_amount)} per billing` : ''}{s.subsidy_end_date ? ` until ${formatDate(s.subsidy_end_date)}` : ''}
                      {s.subsidy_status === 'pending' && <div style={{ color: 'var(--dp-warning)' }}>Waiting for approval{s.subsidy_applied_on ? ` — applied ${formatDate(s.subsidy_applied_on)}` : ''}</div>}
                      {s.subsidy_status === 'denied' && <div style={{ color: 'var(--dp-danger)' }}>Not approved{s.subsidy_applied_on ? ` (applied ${formatDate(s.subsidy_applied_on)})` : ''}</div>}
                      {s.subsidy_status === 'approved' && s.subsidy_applied_on && <div style={{ color: 'var(--dp-ink-soft)' }}>Approved — applied {formatDate(s.subsidy_applied_on)}</div>}
                      {!s.subsidy_status && s.subsidy_applied_on && <div style={{ color: 'var(--dp-ink-soft)' }}>Applied {formatDate(s.subsidy_applied_on)}</div>}
                      {Number(s.subsidy_total) > 0 && subUsed != null && <div style={{ color: 'var(--dp-success)' }}>{money(Math.max(Number(s.subsidy_total) - subUsed, 0))} left of the {money(s.subsidy_total)} grant</div>}
                    </Row>
                  )}
                  {family?.credit > 0.004 && <Row k="Family credit">{money(family.credit)}</Row>}
                  {s.reregistration_fee_due && <Row k="Next invoice">+ $20 re-registration fee</Row>}
                </>
              )}
            </Box>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 14, border: '1px solid var(--dp-line)', borderRadius: 12, padding: '16px 18px', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>Attendance</h2>
          <button type="button" className="dp-btn" style={{ fontSize: 13 }} onClick={() => (window.location.hash = `attendance/history/${s.id}`)}>
            <Pencil size={12} /> Edit in Attendance
          </button>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
          <Ring label="This month" value={attSum?.month.classes} goal={attSum?.month.expected} sub={attSum ? `${attSum.month.absent} absent · ${attSum.month.excused} excused` : ''} />
          <Ring label="This billing cycle" value={attSum?.cycle?.classes} goal={attSum?.cycle?.expected} sub={attSum?.cycle ? `${formatDate(attSum.cycle.from).replace(/, \d{4}$/, '')} – ${formatDate(attSum.cycle.to).replace(/, \d{4}$/, '')}` : 'No billing date'} />
          <Ring label="Since last test" value={since} goal={MIN_CLASSES} done={since != null && since >= MIN_CLASSES} sub={since != null && since >= MIN_CLASSES ? 'Eligible to test' : s.last_test_date ? `Last test ${formatDate(s.last_test_date)}` : 'No test yet'} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--dp-ink-soft)', marginBottom: 8 }}>
          Last class: {last ? `${WD[new Date(last.date + 'T00:00:00').getDay()]} ${formatDate(last.date)}` : '—'}
        </div>
        {att == null ? (
          <span style={{ color: 'var(--dp-ink-faint)', fontSize: 13 }}>…</span>
        ) : att.length === 0 ? (
          <span style={{ color: 'var(--dp-ink-faint)', fontSize: 13 }}>No classes recorded in the last year.</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {att.slice(0, 16).map((r, i) => {
              const ok = ['present', 'double'].includes(r.status);
              const col = ok ? ['var(--dp-success)', 'var(--dp-success-tint)'] : r.status === 'absent' ? ['var(--dp-danger)', 'var(--dp-danger-tint)'] : ['var(--dp-warning)', 'var(--dp-warning-tint)'];
              return (
                <span key={i} title={`${r.class_name} · ${r.status}`} style={{ fontSize: 13, color: col[0], background: col[1], borderRadius: 6, padding: '3px 9px' }}>
                  {WD[new Date(r.date + 'T00:00:00').getDay()]} {r.date.slice(5).replace('-', '/')} · {r.status === 'present' ? 'here' : r.status}
                </span>
              );
            })}
          </div>
        )}
        <MakeupList makeups={makeups} onOpen={() => (window.location.hash = `attendance/makeup/${s.id}`)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Box title="Classes">
          <Row k="Classes">{splitClasses(s.class_name).join(', ') || '—'}</Row>
          <Row k="Every week">
            {plan.length ? (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {plan.map((c, i) => { const cc = classColor(c.class_name); return <Pill key={i} wrap c={cc.text} bg={cc.bg}>{WD[c.weekday]} {shortTime(c.start_time)} · {c.class_name}</Pill>; })}
              </span>
            ) : '—'}
          </Row>
          <Row k="Per week">{s.classes_per_week || '—'}</Row>
          <Row k="Enrolled">{s.enroll_date ? formatDate(s.enroll_date) : '—'}</Row>
        </Box>


        <AwardsBox studentId={s.id} />

        <Box title="Health & consent">
          <Row k="Medical">{String(s.medical || '').trim() ? <span style={{ color: 'var(--dp-danger)' }}>{s.medical}</span> : 'None noted'}</Row>
          <Row k="Photos / videos">{s.photo_consent === false ? <span style={{ color: 'var(--dp-danger)' }}>No</span> : s.photo_consent === true ? 'Yes' : '—'}</Row>
          <Row k="Date of birth">{s.dob ? formatDate(s.dob) : '—'}</Row>
          {s.notes && <Row k="Notes"><span style={{ whiteSpace: 'pre-line' }}>{s.notes}</span></Row>}
        </Box>

        {isAdmin && (
          <Box
            title={isBlack(s.belt) ? "Black belt — Kukkiwon & Global Licence" : "Kukkiwon & Global Licence"}
            action={!bbEdit && <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 13, minHeight: 32 }} onClick={() => setBbEdit({ ...(bb || {}) })}><Pencil size={11} /> {bb ? 'Edit' : 'Add'}</button>}
          >
            {bbEdit ? (
              <>
                {BB_FIELDS.map(([k, label]) => (
                  <label key={k} style={{ display: 'block', fontSize: 12, color: 'var(--dp-ink-soft)', marginBottom: 6 }}>
                    {label}
                    <input className="dp-input" style={{ width: '100%', marginTop: 2 }} autoComplete="off" value={bbEdit[k] || ''} onChange={(e) => setBbEdit({ ...bbEdit, [k]: e.target.value })} />
                  </label>
                ))}
                <label style={{ display: 'block', fontSize: 12, color: 'var(--dp-ink-soft)', marginBottom: 8 }}>
                  Notes
                  <input className="dp-input" style={{ width: '100%', marginTop: 2 }} value={bbEdit.notes || ''} onChange={(e) => setBbEdit({ ...bbEdit, notes: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="dp-btn" style={btn} onClick={() => setBbEdit(null)}>Cancel</button>
                  <button className="dp-btn dp-btn-primary" style={btn} onClick={saveBb}><Check size={13} /> Save</button>
                </div>
                {msg && <p style={{ color: 'var(--dp-danger)', fontSize: 13 }}>{msg}</p>}
              </>
            ) : !bb ? (
              <p style={{ fontSize: 13, color: 'var(--dp-ink-faint)', margin: 0 }}>No Kukkiwon / GL details yet.</p>
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
                          {copied === k ? <Check size={13} color="var(--dp-success)" /> : <Copy size={13} />}
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

      {actions && (
        <div style={{ marginTop: 14, border: '1px solid var(--dp-line)', borderRadius: 12, padding: '16px 18px', background: '#fff' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px' }}>Membership</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{actions}</div>
        </div>
      )}
    </div>
  );
}

// Medals and character patches from belt tests (portal only — not shown to
// parents). Each patch is given once; the rest are still to earn.
function AwardsBox({ studentId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase
      .from('belt_test_entries')
      .select('medal, patch, current_belt, target_belt, belt_tests(test_date, title)')
      .eq('student_id', studentId)
      .then(({ data }) => setRows((data || []).filter((r) => r.medal || r.patch).sort((a, b) => ((a.belt_tests?.test_date || '') < (b.belt_tests?.test_date || '') ? 1 : -1))));
  }, [studentId]);
  const medals = (rows || []).filter((r) => r.medal);
  const got = new Map((rows || []).filter((r) => r.patch).map((r) => [r.patch, r.belt_tests?.test_date]));
  return (
    <Box title="Awards">
      <div data-testid="awards">
        <Row k="Medals">
          {rows == null ? '…' : medals.length ? (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {medals.map((r, i) => <Pill key={i} c="var(--dp-warning)" bg="var(--dp-warning-tint)"><Medal size={12} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 3 }} />{r.belt_tests?.test_date ? formatDate(r.belt_tests.test_date) : 'test'} · {r.current_belt}</Pill>)}
            </span>
          ) : 'None yet'}
        </Row>
        <Row k={`Patches (${got.size}/${PATCHES.length})`}>
          {rows == null ? '…' : (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PATCHES.map((p) =>
                got.has(p.name) ? (
                  <Pill key={p.name} c="var(--dp-success)" bg="var(--dp-success-tint)"><span title={got.get(p.name) ? `Given ${formatDate(got.get(p.name))}` : ''}><Check size={12} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 3 }} />{p.name}</span></Pill>
                ) : (
                  <Pill key={p.name} c="var(--dp-ink-faint)" bg="var(--dp-canvas)">{p.name}</Pill>
                ),
              )}
            </span>
          )}
        </Row>
        <p style={{ fontSize: 13, color: 'var(--dp-ink-faint)', margin: '6px 0 0' }}>Given on Belt Testing → Awards. Not shown in the parent portal.</p>
      </div>
    </Box>
  );
}

// Makeup classes from excused absences: open ones first (to book / booked),
// then the latest used or expired ones.
function MakeupList({ makeups, onOpen }) {
  if (makeups == null) return null;
  const today = todayISO();
  const state = (m) => (m.status === 'completed' ? 'used' : m.status === 'reserved' ? 'booked' : m.expiration_date && m.expiration_date < today ? 'expired' : 'open');
  const open = makeups.filter((m) => ['open', 'booked'].includes(state(m)));
  const past = makeups.filter((m) => !['open', 'booked'].includes(state(m))).slice(0, 4);
  const md = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
  const tone = { open: ['var(--dp-warning)', 'var(--dp-warning-tint)'], booked: ['var(--dp-info)', 'var(--dp-canvas)'], used: ['var(--dp-success)', 'var(--dp-success-tint)'], expired: ['var(--dp-ink-faint)', 'var(--dp-canvas)'] };
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--dp-line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>
          Makeup classes{open.length ? <span style={{ color: 'var(--dp-warning)', fontWeight: 600 }}> · {open.length} open</span> : ''}
        </h3>
        <button type="button" className="dp-btn" style={{ fontSize: 13 }} onClick={onOpen}><Pencil size={12} /> Edit makeups</button>
      </div>
      {open.length + past.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>No makeup classes. They come from excused absences.</span>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {[...open, ...past].map((m) => {
            const st = state(m);
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: tone[st][0], background: tone[st][1], border: '1px solid var(--dp-line)', borderRadius: 999, padding: '1px 8px', minWidth: 58, textAlign: 'center' }}>{st === 'open' ? 'To book' : st === 'booked' ? 'Booked' : st === 'used' ? 'Used' : 'Expired'}</span>
                <span>Missed {md(m.absence_date)} · {m.class_name}</span>
                <span style={{ color: 'var(--dp-ink-soft)' }}>
                  {st === 'booked' ? `→ ${md(m.reservation_date)}${m.reservation_class_name && m.reservation_class_name !== m.class_name ? ` · ${m.reservation_class_name}` : ''}` : st === 'open' ? `use by ${md(m.expiration_date)}${m.conditional ? ' (after next payment)' : ''}` : st === 'used' && m.reservation_date ? `on ${md(m.reservation_date)}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Donut: classes done against what's expected for the period.
function Ring({ label, value, goal, sub, done }) {
  const size = 96, w = 9, rad = (size - w) / 2, circ = 2 * Math.PI * rad;
  const v = value == null ? 0 : value;
  const pct = goal ? Math.min(v / goal, 1) : 0;
  const color = done || (goal && v >= goal) ? 'var(--dp-success)' : 'var(--dp-ink)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 210 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value ?? '—'}${goal ? ` of ${goal}` : ''}`}>
        <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="var(--dp-line)" strokeWidth={w} />
        {pct > 0 && <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${circ * pct} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 24, fontWeight: 700, fill: 'var(--dp-ink)', fontVariantNumeric: 'tabular-nums' }}>{value == null ? '…' : value}</text>
        {goal ? <text x="50%" y="70%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 12, fill: 'var(--dp-ink-soft)' }}>of {goal}</text> : null}
      </svg>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Box({ title, action, children }) {
  return (
    <div style={{ border: '1px solid var(--dp-line)', borderRadius: 12, padding: '16px 18px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1, color: 'var(--dp-ink)' }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ k, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0', lineHeight: 1.45 }}>
      <span style={{ width: 110, flexShrink: 0, color: 'var(--dp-ink-faint)' }}>{k}</span>
      <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

function Pill({ c, bg, children, wrap }) {
  return <span style={{ fontSize: 13, color: c, background: bg, borderRadius: wrap ? 8 : 999, padding: '2px 8px', whiteSpace: wrap ? 'normal' : 'nowrap', maxWidth: '100%', overflowWrap: 'anywhere' }}>{children}</span>;
}

// Parent portal login for this family: who has one, and (re)send the invite
// email with a "set your password" link (one per email on the family).
function ParentInvite({ customerId }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function load() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('customers').select('email, portal_invited_at').eq('id', customerId).single(),
      supabase.from('profiles').select('id').eq('role', 'parent').eq('customer_id', customerId),
    ]);
    setState({ email: c?.email || '', invited: c?.portal_invited_at, logins: (p || []).length });
  }
  useEffect(() => {
    load();
  }, [customerId]);
  async function invite() {
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.functions.invoke('parent-portal', { body: { action: 'invite', customer_id: customerId, origin: window.location.origin } });
    setBusy(false);
    let err = error?.message;
    if (error) {
      try {
        const j = await error.context?.json?.();
        if (j?.error) err = j.error;
      } catch {
        /* keep message */
      }
    }
    if (err) return setMsg(err);
    const parts = [];
    if (data?.sent?.length) parts.push(`Invite emailed to ${data.sent.join(', ')}.`);
    (data?.skipped || []).forEach((x) => parts.push(`Not sent to ${x.email}: ${x.reason}.`));
    setMsg(parts.join(' '));
    load();
  }
  if (!state) return <span style={{ color: 'var(--dp-ink-faint)' }}>…</span>;
  return (
    <div>
      <span style={{ color: state.logins ? 'var(--dp-success)' : 'var(--dp-ink-soft)' }}>
        {state.logins ? `${state.logins} login${state.logins > 1 ? 's' : ''}` : 'Not invited'}
        {state.invited ? ` · invited ${formatDate(String(state.invited).slice(0, 10))}` : ''}
      </span>{' '}
      <button className="dp-btn" style={{ padding: '1px 8px', fontSize: 12 }} disabled={busy || !state.email} title={state.email ? `Email ${state.email}` : 'Add an email to the family first'} onClick={invite}>
        {busy ? 'Sending…' : state.invited ? 'Resend invite' : 'Send invite'}
      </button>
      <a className="dp-btn" style={{ padding: '1px 8px', fontSize: 12, marginLeft: 6, textDecoration: 'none' }} href={`/parent?preview=${customerId}`} target="_blank" rel="noopener" title="Open this family's parent portal as they see it (read only)">
        View as parent
      </a>
      {msg && <div style={{ fontSize: 12, color: 'var(--dp-ink-soft)', marginTop: 3 }}>{msg}</div>}
    </div>
  );
}

const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Weeks in a row (Mon–Sun) with at least one class, counting back from this
// week (a week with no class yet doesn't break the streak until it's over).
function weekStreak(att) {
  const weekOf = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const weeks = new Set(att.filter((r) => ['present', 'double'].includes(r.status)).map((r) => weekOf(r.date)));
  const cur = new Date(weekOf(todayISO()) + 'T12:00:00');
  let n = 0;
  if (!weeks.has(cur.toISOString().slice(0, 10))) cur.setDate(cur.getDate() - 7);
  while (weeks.has(cur.toISOString().slice(0, 10))) {
    n++;
    cur.setDate(cur.getDate() - 7);
  }
  return n;
}

// White → Black Belt 1st Dan as one bar; the current belt is outlined.
const JOURNEY = BELTS.slice(0, BELTS.findIndex((b) => b.value === 'Black Belt 1st Dan') + 1);
function BeltJourney({ s, since, tapes, children }) {
  const i = Math.max(0, JOURNEY.findIndex((b) => b.value === (s.belt || 'White')));
  const done = i >= JOURNEY.length - 1 || BELTS.findIndex((b) => b.value === s.belt) >= JOURNEY.length - 1;
  const pct = done ? 100 : Math.round((i / (JOURNEY.length - 1)) * 100);
  const next = done ? null : JOURNEY[i + 1]?.value;
  const first = String(s.name || '').split(' ')[0];
  const taped = hasTapes(s.belt);
  const left = taped && tapes ? TAPE_COUNT - tapes.size : null;
  const classesLeft = since == null ? null : Math.max(0, MIN_CLASSES - since);
  const hint = done
    ? `${first} is a black belt.`
    : [
        taped && left != null ? (left > 0 ? `${left} more tape${left === 1 ? '' : 's'}` : 'all tapes done') : null,
        classesLeft != null ? (classesLeft > 0 ? `${classesLeft} more class${classesLeft === 1 ? '' : 'es'}` : `${MIN_CLASSES} classes done`) : null,
      ]
        .filter(Boolean)
        .join(' and ');
  return (
    <div style={{ border: '1px solid var(--dp-line)', borderRadius: 12, padding: '16px 18px', background: '#fff', marginBottom: 14 }} data-testid="belt-journey">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Black belt journey</h2>
          <div style={{ fontSize: 13.5, color: 'var(--dp-ink-soft)', marginTop: 2 }}>
            {first} is on belt {i + 1} of {JOURNEY.length}
            {next && <> · next up: <b style={{ color: 'var(--dp-ink)' }}>{next}</b></>}
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{pct}<span style={{ fontSize: 14, color: 'var(--dp-ink-soft)' }}>%</span></div>
      </div>
      <div style={{ display: 'flex', gap: 3, margin: '14px 0 4px' }}>
        {JOURNEY.map((b, k) =>
          k === i ? (
            <div key={b.value} style={{ flex: 1.6, display: 'flex' }}>
              <BeltWithTapes belt={b.value} tapes={tapes} width="100%" height={22} outline="2.5px solid var(--dp-ink)" />
            </div>
          ) : (
            <JourneyBelt key={b.value} belt={b.value} faded={k > i} />
          )
        )}
      </div>
      <div style={{ display: 'flex', fontSize: 12, color: 'var(--dp-ink-faint)' }}>
        <span style={{ flex: 1 }}>White</span>
        <span>Black belt</span>
      </div>
      {!done && hint && (
        <p style={{ fontSize: 13.5, color: 'var(--dp-ink-soft)', margin: '10px 0 0' }}>
          {hint.includes('more') ? `${hint} and ${first} is ready to test for ${next}.`.replace(' and ' + first, `, then ${first}`) : `${first} is ready to test for ${next}.`}
        </p>
      )}
      {children && <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--dp-line)' }}>{children}</div>}
    </div>
  );
}

// One belt in the journey strip: the belt colour, and for stripe belts the
// next colour as a stripe along the middle (like the real belt).
function JourneyBelt({ belt, faded }) {
  const p = beltPaint(belt);
  return (
    <div title={belt} style={{ flex: 1, height: 22, borderRadius: 4, background: p.fill, border: `1px solid ${p.edge}`, boxSizing: 'border-box', position: 'relative', overflow: 'hidden', opacity: faded ? 0.25 : 1 }}>
      {p.stripe && <div style={{ position: 'absolute', left: 0, right: 0, top: '34%', height: '32%', background: p.stripe }} />}
    </div>
  );
}

// Saved card (TD payment profile) for the family, with the same "Change card /
// Card link" email as the Customers page, and a shortcut to the family's
// payment settings there.
function FamilyCard({ customerId }) {
  const [c, setC] = useState(null);
  useEffect(() => {
    supabase.from('customers').select('*').eq('id', customerId).single().then(({ data }) => setC(data || {}));
  }, [customerId]);
  if (!c) return <span style={{ color: 'var(--dp-ink-faint)' }}>…</span>;
  return (
    <div>
      {c.card_declined_at && c.card_profile_code && (
        <div style={{ color: 'var(--dp-danger)', fontSize: 12 }}>Last charge declined {String(c.card_declined_at).slice(0, 10)}{c.card_decline_message ? `: ${c.card_decline_message}` : ''}</div>
      )}
      {c.rb_account_id && !c.card_profile_code ? <div>TD Recurring Billing{c.rb_card_last4 ? ` · ···${c.rb_card_last4}` : ''}</div> : <CardWallet customerId={customerId} />}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        <CardLinkButton customer={c} onSent={(at) => setC((x) => ({ ...x, card_link_sent_at: at }))} />
        <button type="button" className="dp-btn" style={{ padding: '1px 8px', fontSize: 13 }} onClick={() => (window.location.hash = `customers/${customerId}`)}>
          Payment settings
        </button>
      </div>
    </div>
  );
}
