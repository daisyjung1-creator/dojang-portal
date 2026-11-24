import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, CalendarX, CreditCard, Receipt, FileText, CalendarDays, Mail, Check, Printer, X } from 'lucide-react';
import logo from '../../assets/logo.png';
import { supabase } from '../../supabaseClient';
import { useAuth, IDLE_FLAG, touch } from '../../auth/AuthContext';
import { PrintPortal } from '../invoices/InvoicePreview';
import InvoiceDocument from '../invoices/InvoiceDocument';
import ReceiptDocument from '../invoices/ReceiptDocument';
import TapeTracker from '../../components/TapeTracker';
import { hasTapes, TAPE_COUNT } from '../../lib/tapes';
import { MIN_CLASSES, classesSince, beltMeta } from '../../lib/beltTesting';
import { weeklyPlan, splitClasses } from '../../lib/classes';
import { nextDueDate, todayISO } from '../../lib/billingDates';
import { money } from '../../lib/invoiceUtils';

// Parent portal (/parent). Parents sign in with the email the dojang has on
// file (invited by the dojang, password set from the emailed link). Everything
// here is read through the parent's own login, so the database only ever
// returns their own family. Text is English (dojang materials are English).

const C = { red: '#BE1C21', ink: '#20241F', soft: '#5B5F56', faint: '#8A8D84', line: '#E6E3DA', bg: '#F7F5EF', green: '#2A5A30' };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fdate = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const fday = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
const ftime = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? ' AM' : ' PM'}`;
};
const card = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' };
const primary = { ...btn, background: C.red, borderColor: C.red, color: '#fff' };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 15, fontFamily: 'inherit' };
const label = { display: 'block', fontSize: 13, color: C.soft, margin: '10px 0 4px' };

async function callFn(body) {
  const { data, error } = await supabase.functions.invoke('parent-portal', { body: { origin: window.location.origin, ...body } });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.error) msg = j.error;
    } catch {
      /* keep the generic message */
    }
    return { error: msg };
  }
  return data || {};
}

export default function ParentApp() {
  const { session, loading, role, signOut } = useAuth();
  const [mode, setMode] = useState(null); // 'setpw' after following an emailed link
  const [linkError, setLinkError] = useState('');
  const [verifying, setVerifying] = useState(() => new URLSearchParams(window.location.search).has('token_hash'));

  useEffect(() => {
    document.title = 'Parent portal';
    const q = new URLSearchParams(window.location.search);
    const token = q.get('token_hash');
    if (!token) return;
    (async () => {
      touch();
      const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: q.get('type') || 'recovery' });
      window.history.replaceState(null, '', '/parent');
      if (error) setLinkError('This link has expired or was already used. Enter your email below and click "Forgot password?" to get a new one.');
      else setMode('setpw');
      setVerifying(false);
    })();
  }, []);

  if (loading || verifying || (session && !role)) return <Shell><p style={{ color: C.soft }}>Loading…</p></Shell>;
  if (!session) return <ParentLogin notice={linkError} />;
  if (role !== 'parent')
    return (
      <Shell>
        <div style={card}>
          <p style={{ marginTop: 0 }}>This page is for parents. You're signed in with a dojang account.</p>
          <a href="/" style={primary}>Go to the dojang portal</a>
        </div>
      </Shell>
    );
  if (mode === 'setpw') return <SetPassword onDone={() => setMode(null)} />;
  return <ParentPortal onSignOut={signOut} />;
}

function Shell({ children, right, wide }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: C.ink }}>
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: wide ? 980 : 560, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Champion Hankook Taekwondo<div style={{ fontWeight: 400, fontSize: 12.5, color: C.soft }}>Parent portal</div></div>
          {right}
        </div>
      </div>
      <div style={{ maxWidth: wide ? 980 : 560, margin: '0 auto', padding: '18px 16px 40px' }}>{children}</div>
    </div>
  );
}

function ParentLogin({ notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [idle] = useState(() => {
    try {
      const v = sessionStorage.getItem(IDLE_FLAG);
      sessionStorage.removeItem(IDLE_FLAG);
      return !!v;
    } catch {
      return false;
    }
  });
  async function submit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    touch();
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError('Sign-in failed. Check your email and password, or click "Forgot password?".');
  }
  async function forgot() {
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter your email address first.');
    setBusy(true);
    await callFn({ action: 'reset', email: email.trim() });
    setBusy(false);
    setInfo(`If ${email.trim()} has a parent portal account, we've emailed it a link to set a new password. Check your inbox (and spam folder).`);
  }
  return (
    <Shell>
      <form onSubmit={submit} style={card}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Sign in</h1>
        <p style={{ fontSize: 13.5, color: C.soft, margin: '0 0 6px' }}>Use the email address the dojang has on file for your family.</p>
        {idle && <p style={{ background: '#FAEEDA', color: '#854F0B', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>You were signed out after 1 hour of no activity. Please sign in again.</p>}
        {notice && <p style={{ background: '#FBEAEA', color: '#7A1F1F', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>{notice}</p>}
        <label style={label}>Email</label>
        <input type="email" autoComplete="email" style={input} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={label}>Password</label>
        <input type="password" autoComplete="current-password" style={input} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
        {info && <p style={{ color: C.green, fontSize: 13 }}>{info}</p>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <button type="submit" style={primary} disabled={busy}>Sign in</button>
          <button type="button" style={{ ...btn, border: 'none', color: C.soft }} onClick={forgot} disabled={busy}>Forgot password?</button>
        </div>
      </form>
      <p style={{ fontSize: 12.5, color: C.faint, textAlign: 'center' }}>No account yet? Ask the dojang to send you a parent portal invite.</p>
    </Shell>
  );
}

function SetPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError("The two passwords don't match.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  }
  return (
    <Shell>
      <form onSubmit={save} style={card}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Set your password</h1>
        <p style={{ fontSize: 13.5, color: C.soft, margin: 0 }}>You'll use this with your email to sign in next time.</p>
        <label style={label}>New password (8+ characters)</label>
        <input type="password" autoComplete="new-password" style={input} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        <label style={label}>Type it again</label>
        <input type="password" autoComplete="new-password" style={input} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
        <button type="submit" style={{ ...primary, marginTop: 14 }} disabled={busy}>Save password</button>
      </form>
    </Shell>
  );
}

// ── The portal ─────────────────────────────────────────────────────────────
function ParentPortal({ onSignOut }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('kids');
  const [modal, setModal] = useState(null);
  const [flash, setFlash] = useState('');

  async function load() {
    const today = todayISO();
    const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const [{ data: core, error: e1 }, inv, pays, att, tapes, events, signups, notices] = await Promise.all([
      supabase.rpc('parent_portal_data'),
      supabase.from('invoice_summary').select('*').eq('voided', false).order('invoice_date', { ascending: false }),
      supabase.from('invoice_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('attendance').select('student_id, date, status, class_name').gte('date', since),
      supabase.from('student_tapes').select('student_id, belt, tape'),
      supabase.from('events').select('*').order('start_date'),
      supabase.from('event_signups').select('*'),
      supabase.from('absence_notices').select('*').gte('absence_date', today).order('absence_date'),
    ]);
    if (e1) return setError(e1.message);
    setD({ ...core, invoices: inv.data || [], payments: pays.data || [], attendance: att.data || [], tapes: tapes.data || [], events: events.data || [], signups: signups.data || [], notices: notices.data || [] });
  }
  useEffect(() => {
    load();
  }, []);
  const done = (m) => {
    setModal(null);
    setFlash(m);
    load();
    window.scrollTo(0, 0);
  };

  const signOutBtn = (
    <button style={{ ...btn, padding: '6px 10px', fontSize: 13 }} onClick={onSignOut}><LogOut size={14} /> Sign out</button>
  );
  if (error) return <Shell right={signOutBtn}><div style={card}>Something went wrong: {error}</div></Shell>;
  if (!d) return <Shell right={signOutBtn}><p style={{ color: C.soft }}>Loading…</p></Shell>;

  const open = d.invoices.filter((i) => Number(i.balance) > 0.004);
  const due = open.reduce((t, i) => t + Number(i.balance), 0);
  const TABS = [
    ['kids', 'My children'],
    ['billing', `Billing${open.length ? ` (${open.length})` : ''}`],
    ['events', 'Events'],
    ['contact', 'Contact'],
  ];

  return (
    <Shell right={signOutBtn} wide>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{d.family?.name}</h1>
        {due > 0 && (
          <button style={{ ...btn, padding: '3px 10px', fontSize: 13, color: C.red, borderColor: '#F0C9C9', background: '#FBEAEA' }} onClick={() => setTab('billing')}>
            {money(due)} due
          </button>
        )}
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.line}`, marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setFlash(''); }} style={{ border: 'none', background: 'none', padding: '10px 12px', fontSize: 15, fontWeight: tab === id ? 700 : 500, color: tab === id ? C.ink : C.soft, borderBottom: `3px solid ${tab === id ? C.red : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            {l}
          </button>
        ))}
      </div>
      {flash && <p style={{ background: '#E8F1E9', color: C.green, padding: '10px 12px', borderRadius: 8, fontSize: 14 }}>{flash}</p>}

      {tab === 'kids' && <Kids d={d} onAbsence={(s) => setModal({ kind: 'absence', student: s })} />}
      {tab === 'billing' && <Billing d={d} open={open} onDoc={(m) => setModal(m)} />}
      {tab === 'events' && <Events d={d} onSignUp={(e) => setModal({ kind: 'signup', event: e })} />}
      {tab === 'contact' && <Contact d={d} onSent={() => done('Thank you — your message was sent to the dojang. We will reply by email.')} />}

      {modal?.kind === 'absence' && <AbsenceModal d={d} student={modal.student} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'signup' && <SignUpModal d={d} event={modal.event} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'invoice' && <DocModal title={`Invoice #${modal.invoice.invoice_number}`} onClose={() => setModal(null)} doc={<InvoiceDoc d={d} invoice={modal.invoice} />} />}
      {modal?.kind === 'receipt' && <DocModal title={`Receipt #${modal.payment.receipt_number}`} onClose={() => setModal(null)} doc={<ReceiptDoc d={d} payment={modal.payment} />} />}
    </Shell>
  );
}

function BeltChip({ belt }) {
  const m = beltMeta(belt);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.soft }}>
      <span style={{ width: 26, height: 10, borderRadius: 2, background: m.bg, border: `1px solid ${m.border}` }} />
      {belt}
    </span>
  );
}

function Kids({ d, onAbsence }) {
  const today = todayISO();
  if (!d.students.length) return <div style={card}>No active students on this account.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
      {d.students.map((s) => {
        const att = d.attendance.filter((a) => a.student_id === s.id);
        const n = classesSince(s, att);
        const tapes = new Set(d.tapes.filter((t) => t.student_id === s.id && t.belt === s.belt).map((t) => t.tape));
        const plan = weeklyPlan(s, d.schedule);
        const recent = att.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
        const notices = d.notices.filter((x) => x.student_id === s.id);
        const onHold = s.hold_from && s.hold_from <= today && (!s.hold_until || s.hold_until >= today);
        return (
          <div key={s.id} style={{ ...card, marginBottom: 0 }} data-child={s.name}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{s.name}</div>
                <BeltChip belt={s.belt} />
              </div>
              {onHold && <span style={{ fontSize: 12, background: '#FAEEDA', color: '#854F0B', borderRadius: 999, padding: '2px 8px' }}>On a break</span>}
            </div>

            <Section title="Classes">
              {plan.length ? (
                plan.map((c, i) => (
                  <div key={i} style={{ fontSize: 14 }}>
                    <b style={{ fontWeight: 600 }}>{WD[c.weekday]}</b> {ftime(c.start_time)}–{ftime(c.end_time)} · {c.class_name}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 14 }}>{splitClasses(s.class_name).join(', ') || '—'}</div>
              )}
            </Section>

            <Section title="Progress">
              {hasTapes(s.belt) && (
                <div style={{ marginBottom: 6 }}>
                  <TapeTracker student={s} earned={tapes} editable={false} size="lg" />
                  <div style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>Curriculum tapes for {s.belt} ({tapes.size} of {TAPE_COUNT})</div>
                </div>
              )}
              <div style={{ fontSize: 14 }}>
                <b style={{ fontWeight: 600 }}>{n}</b> of {MIN_CLASSES} classes since {s.last_test_date ? `the last test (${fdate(s.last_test_date)})` : 'starting'}
              </div>
              <div style={{ height: 6, background: '#F1EFE7', borderRadius: 3, margin: '5px 0 4px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (n / MIN_CLASSES) * 100)}%`, height: '100%', background: n >= MIN_CLASSES ? C.green : C.red }} />
              </div>
              {d.next_test && <div style={{ fontSize: 13, color: C.soft }}>Next belt test: {fdate(d.next_test.date)}</div>}
            </Section>

            <Section title="Recent classes">
              {recent.length === 0 ? (
                <div style={{ fontSize: 13.5, color: C.faint }}>No classes recorded yet.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {recent.map((a, i) => (
                    <span key={i} title={a.class_name} style={{ fontSize: 12, padding: '2px 7px', borderRadius: 6, background: a.status === 'present' ? '#E8F1E9' : '#FBEAEA', color: a.status === 'present' ? C.green : '#7A1F1F' }}>
                      {fday(a.date)} · {a.status === 'present' ? 'present' : 'absent'}
                    </span>
                  ))}
                </div>
              )}
              {notices.length > 0 && (
                <div style={{ fontSize: 13, color: C.soft, marginTop: 6 }}>
                  Absence you told us about: {notices.map((x) => fday(x.absence_date)).join(', ')}
                </div>
              )}
            </Section>

            <button style={{ ...btn, marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => onAbsence(s)}>
              <CalendarX size={16} /> My child will be absent
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11.5, letterSpacing: 0.5, textTransform: 'uppercase', color: C.faint, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function Billing({ d, open, onDoc }) {
  const f = d.family || {};
  const today = todayISO();
  const paid = d.invoices.filter((i) => Number(i.balance) <= 0.004);
  return (
    <>
      <div style={card}>
        <h2 style={h2}><FileText size={17} /> To pay</h2>
        {open.length === 0 ? (
          <p style={{ margin: 0, color: C.green }}><Check size={15} style={{ verticalAlign: -2 }} /> Nothing due. Thank you!</p>
        ) : (
          open.map((i) => (
            <Row key={i.id}>
              <div style={{ flex: 1 }}>
                <b style={{ fontWeight: 600 }}>Invoice #{i.invoice_number}</b> <span style={{ color: C.soft }}>· {fdate(i.invoice_date)}</span>
                {i.notes && <div style={{ fontSize: 12.5, color: C.faint }}>{i.notes}</div>}
                <div style={{ fontSize: 13, color: (i.due_date || i.invoice_date) < today ? C.red : C.soft }}>Due {fdate(i.due_date || i.invoice_date)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{money(i.balance)}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button style={{ ...btn, padding: '5px 10px', fontSize: 13 }} onClick={() => onDoc({ kind: 'invoice', invoice: i })}>View</button>
                  {i.pay_token && <a style={{ ...primary, padding: '5px 12px', fontSize: 13 }} href={`/pay/${i.pay_token}`}>Pay now</a>}
                </div>
              </div>
            </Row>
          ))
        )}
        {Number(f.credit) > 0.004 && <p style={{ fontSize: 13.5, color: C.green, marginBottom: 0 }}>Credit on your account: {money(f.credit)}</p>}
      </div>

      <div style={card}>
        <h2 style={h2}><CalendarDays size={17} /> Tuition</h2>
        {d.students.map((s) => (
          <Row key={s.id}>
            <div style={{ flex: 1 }}>
              <b style={{ fontWeight: 600 }}>{s.name}</b>
              <div style={{ fontSize: 13, color: C.soft }}>
                {s.plan === '3 Months' ? 'Every 3 months' : 'Monthly'}
                {s.classes_per_week ? ` · ${s.classes_per_week}x a week` : ''}
                {s.subsidy && s.subsidy_name ? ` · ${s.subsidy_name}${s.subsidy_end_date ? ` until ${fdate(s.subsidy_end_date)}` : ''}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 14 }}>
              {s.billing_exempt ? (
                <span style={{ color: C.soft }}>No tuition</span>
              ) : (
                <>
                  {s.tuition != null && <div style={{ fontWeight: 600 }}>{money(s.tuition)} <span style={{ fontWeight: 400, color: C.faint, fontSize: 12 }}>+ GST</span></div>}
                  {(s.billing_start_date || s.enroll_date) && <div style={{ fontSize: 12.5, color: C.soft }}>Next: {fdate(nextDueDate(s, today))}</div>}
                </>
              )}
            </div>
          </Row>
        ))}
      </div>

      <div style={card}>
        <h2 style={h2}><CreditCard size={17} /> Card for tuition</h2>
        {f.card_saved ? (
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>
            {f.card_type || 'Card'} ending in <b>{f.card_last4}</b>
            {f.card_expiry ? ` · expires ${String(f.card_expiry).replace(/^(\d\d)(\d\d)$/, '$1/$2')}` : ''} — tuition is charged to it automatically.
          </p>
        ) : (
          <p style={{ margin: '0 0 10px', fontSize: 14, color: C.soft }}>{f.payment_type === 'manual' ? 'You pay tuition by invoice (debit or cash).' : 'No card saved yet.'}</p>
        )}
        {f.card_link_token && (
          <a style={btn} href={`/card/${f.card_link_token}`}>{f.card_saved ? 'Update card' : 'Save a card'}</a>
        )}
      </div>

      <div style={card}>
        <h2 style={h2}><Receipt size={17} /> Payments & receipts</h2>
        {d.payments.length === 0 ? (
          <p style={{ margin: 0, color: C.soft, fontSize: 14 }}>No payments yet.</p>
        ) : (
          d.payments.slice(0, 60).map((p) => (
            <Row key={p.id}>
              <div style={{ flex: 1 }}>
                {fdate(p.payment_date)} <span style={{ color: C.soft }}>· Receipt #{p.receipt_number}</span>
                <div style={{ fontSize: 12.5, color: C.faint }}>{p.method}</div>
              </div>
              <div style={{ fontWeight: 600, marginRight: 8 }}>{money(p.amount)}</div>
              <button style={{ ...btn, padding: '5px 10px', fontSize: 13 }} onClick={() => onDoc({ kind: 'receipt', payment: p })}>Receipt</button>
            </Row>
          ))
        )}
      </div>

      {paid.length > 0 && (
        <div style={card}>
          <h2 style={h2}><FileText size={17} /> Past invoices</h2>
          {paid.slice(0, 60).map((i) => (
            <Row key={i.id}>
              <div style={{ flex: 1 }}>
                Invoice #{i.invoice_number} <span style={{ color: C.soft }}>· {fdate(i.invoice_date)}</span>
              </div>
              <div style={{ marginRight: 8 }}>{money(i.total)}</div>
              <button style={{ ...btn, padding: '5px 10px', fontSize: 13 }} onClick={() => onDoc({ kind: 'invoice', invoice: i })}>View</button>
            </Row>
          ))}
        </div>
      )}
    </>
  );
}
const h2 = { fontSize: 16, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 7 };
function Row({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.line}`, fontSize: 14 }}>{children}</div>;
}

function Events({ d, onSignUp }) {
  const today = todayISO();
  const upcoming = d.events.filter((e) => (e.end_date || e.start_date || today) >= today);
  if (!upcoming.length) return <div style={card}>No upcoming events right now. Check back soon!</div>;
  return upcoming.map((e) => {
    const mine = d.signups.filter((s) => s.event_id === e.id && s.status === 'signed_up');
    const names = mine.map((s) => d.students.find((k) => k.id === s.student_id)?.name).filter(Boolean);
    const closed = e.signup_deadline && e.signup_deadline < today;
    const canAdd = !closed && d.students.some((k) => !mine.some((m) => m.student_id === k.id));
    const inv = mine.map((m) => d.invoices.find((i) => i.id === m.invoice_id)).filter(Boolean);
    const owing = [...new Map(inv.map((i) => [i.id, i])).values()].filter((i) => Number(i.balance) > 0.004);
    return (
      <div key={e.id} style={card} data-event={e.title}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{e.title}</div>
            <div style={{ fontSize: 14, color: C.soft }}>
              {fday(e.start_date)}
              {e.end_date && e.end_date !== e.start_date ? ` – ${fday(e.end_date)}` : ''}
              {e.start_time ? ` · ${ftime(e.start_time)}${e.end_time ? `–${ftime(e.end_time)}` : ''}` : ''}
              {e.location ? ` · ${e.location}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700 }}>{Number(e.price) > 0 ? money(e.price) : 'Free'}</div>
            {Number(e.price) > 0 && <div style={{ fontSize: 12, color: C.faint }}>per student{e.taxable ? ' + GST' : ''}</div>}
          </div>
        </div>
        {e.description && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '10px 0 0' }}>{e.description}</p>}
        {e.signup_deadline && <p style={{ fontSize: 13, color: closed ? C.red : C.soft, margin: '8px 0 0' }}>{closed ? 'Sign-up closed' : `Sign up by ${fdate(e.signup_deadline)}`}</p>}
        {names.length > 0 && <p style={{ fontSize: 14, color: C.green, margin: '8px 0 0' }}><Check size={15} style={{ verticalAlign: -2 }} /> Signed up: {names.join(', ')}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {canAdd && <button style={primary} onClick={() => onSignUp(e)}>Sign up</button>}
          {owing.map((i) => (
            <a key={i.id} style={btn} href={`/pay/${i.pay_token}`}>Pay {money(i.balance)}</a>
          ))}
        </div>
      </div>
    );
  });
}

function Modal({ title, children, onClose, footer }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,18,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 12px', zIndex: 50, overflowY: 'auto' }} onClick={onClose}>
      <div role="dialog" aria-label={title} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, padding: 18 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 18, margin: 0, flex: 1 }}>{title}</h2>
          <button aria-label="Close" style={{ ...btn, border: 'none', padding: 4 }} onClick={onClose}><X size={18} /></button>
        </div>
        {children}
        {footer && <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}

function nextClassDate(s, schedule) {
  const plan = weeklyPlan(s, schedule);
  const today = new Date(todayISO() + 'T12:00:00');
  for (let k = 0; k < 14; k++) {
    const day = new Date(today.getTime() + k * 864e5);
    const c = plan.find((p) => p.weekday === day.getDay());
    if (c) return { date: day.toISOString().slice(0, 10), cls: c.class_name };
  }
  return { date: todayISO(), cls: splitClasses(s.class_name)[0] || '' };
}

function AbsenceModal({ d, student, onClose, onDone }) {
  const first = nextClassDate(student, d.schedule);
  const [date, setDate] = useState(first.date);
  const classes = splitClasses(student.class_name);
  const [cls, setCls] = useState(first.cls);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wd = new Date(date + 'T12:00:00').getDay();
  const that = weeklyPlan(student, d.schedule).filter((p) => p.weekday === wd);
  useEffect(() => {
    if (that.length && !that.some((p) => p.class_name === cls)) setCls(that[0].class_name);
  }, [date]);
  async function send() {
    setError('');
    setBusy(true);
    const r = await callFn({ action: 'absence', student_id: student.id, date, class_name: cls, note });
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone(`Thanks — we've let the dojang know ${student.name.split(' ')[0]} will be absent on ${fday(date)}.`);
  }
  return (
    <Modal title={`Absence — ${student.name}`} onClose={onClose} footer={<><button style={btn} onClick={onClose}>Cancel</button><button style={primary} onClick={send} disabled={busy}>Send to the dojang</button></>}>
      <label style={label}>Date</label>
      <input type="date" style={input} value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} />
      {that.length === 0 && <p style={{ fontSize: 12.5, color: '#854F0B', margin: '4px 0 0' }}>{student.name.split(' ')[0]} doesn't usually have class on this day.</p>}
      {classes.length > 0 && (
        <>
          <label style={label}>Class</label>
          <select style={input} value={cls} onChange={(e) => setCls(e.target.value)}>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </>
      )}
      <label style={label}>Note (optional)</label>
      <textarea style={{ ...input, minHeight: 70 }} placeholder="e.g. sick, family trip" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <p style={{ fontSize: 12.5, color: C.faint, margin: '8px 0 0' }}>Telling us before class counts as an excused absence (make-up classes are only for excused absences).</p>
      {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

function SignUpModal({ d, event, onClose, onDone }) {
  const taken = new Set(d.signups.filter((s) => s.event_id === event.id && s.status === 'signed_up').map((s) => s.student_id));
  const kids = d.students.filter((k) => !taken.has(k.id));
  const [pick, setPick] = useState(() => (kids.length === 1 ? [kids[0].id] : []));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const price = Number(event.price) || 0;
  const sub = price * pick.length;
  const total = sub + (event.taxable ? Math.round(sub * 5) / 100 : 0);
  async function go() {
    if (!pick.length) return setError('Choose who is coming.');
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('event_signup', { p_event: event.id, p_students: pick, p_note: note || null });
    setBusy(false);
    if (err) return setError(err.message);
    if (data?.pay_token) setResult(data);
    else onDone(`You're signed up for ${event.title}!`);
  }
  if (result)
    return (
      <Modal title="You're signed up!" onClose={() => onDone(`You're signed up for ${event.title}. Invoice #${result.invoice_number} is under Billing.`)}>
        <p style={{ fontSize: 15 }}>Invoice #{result.invoice_number} for <b>{money(result.total)}</b> was added to your account.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a style={primary} href={`/pay/${result.pay_token}`}>Pay now</a>
          <button style={btn} onClick={() => onDone(`You're signed up for ${event.title}. Invoice #${result.invoice_number} is under Billing.`)}>Pay later</button>
        </div>
      </Modal>
    );
  return (
    <Modal title={`Sign up — ${event.title}`} onClose={onClose} footer={<><button style={btn} onClick={onClose}>Cancel</button><button style={primary} onClick={go} disabled={busy || !pick.length}>Sign up{price > 0 && pick.length ? ` · ${money(total)}` : ''}</button></>}>
      <label style={label}>Who is coming?</label>
      {kids.map((k) => (
        <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 15 }}>
          <input type="checkbox" checked={pick.includes(k.id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, k.id] : p.filter((x) => x !== k.id)))} />
          {k.name}
        </label>
      ))}
      <label style={label}>Note for the dojang (optional)</label>
      <input style={input} placeholder="Allergies, pick-up time…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      {price > 0 && <p style={{ fontSize: 13, color: C.soft }}>An invoice ({money(price)} per student{event.taxable ? ' + GST' : ''}) is added to your account. You can pay it right away or later under Billing.</p>}
      {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

function Contact({ d, onSent }) {
  const b = d.business || {};
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setError('');
    if (message.trim().length < 2) return setError('Write your message first.');
    setBusy(true);
    const r = await callFn({ action: 'message', subject, message });
    setBusy(false);
    if (r.error) return setError(r.error);
    setSubject('');
    setMessage('');
    onSent();
  }
  return (
    <>
      <div style={card}>
        <h2 style={h2}><Mail size={17} /> Email the dojang</h2>
        <label style={label}>Subject</label>
        <input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
        <label style={label}>Message</label>
        <textarea style={{ ...input, minHeight: 130 }} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
        {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
        <button style={{ ...primary, marginTop: 12 }} onClick={send} disabled={busy}>Send</button>
        <p style={{ fontSize: 12.5, color: C.faint, marginBottom: 0 }}>We'll reply to {d.family?.email?.split(/[,;\s]+/)[0] || 'your email'}.</p>
      </div>
      <div style={{ ...card, fontSize: 14, color: C.soft }}>
        <div style={{ fontWeight: 600, color: C.ink }}>{b.business_name || 'Champion Hankook Taekwondo'}</div>
        {b.address && <div style={{ whiteSpace: 'pre-wrap' }}>{b.address}</div>}
        {b.phone && <div>{b.phone}</div>}
        {b.email && <div>{b.email}</div>}
      </div>
    </>
  );
}

// Invoice / receipt documents, the same layout the dojang prints. Print / Save as PDF.
function DocModal({ title, doc, onClose }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,18,.45)', zIndex: 50, overflowY: 'auto', padding: '3vh 8px' }} onClick={onClose}>
        <div style={{ background: '#fff', borderRadius: 12, maxWidth: 860, margin: '0 auto', padding: 14 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h2 style={{ fontSize: 17, margin: 0, flex: 1 }}>{title}</h2>
            <button style={primary} onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button>
            <button aria-label="Close" style={{ ...btn, padding: 6 }} onClick={onClose}><X size={16} /></button>
          </div>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflowX: 'auto' }}>{doc}</div>
        </div>
      </div>
      <PrintPortal>{doc}</PrintPortal>
    </>
  );
}

function useInvoiceParts(invoiceId) {
  const [parts, setParts] = useState(null);
  useEffect(() => {
    if (!invoiceId) return setParts({ lines: [], payments: [], refunds: [], used: [] });
    Promise.all([
      supabase.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('position'),
      supabase.from('invoice_payments').select('*').eq('invoice_id', invoiceId),
      supabase.from('invoice_refunds').select('*').eq('invoice_id', invoiceId),
      supabase.from('credit_applications').select('amount, applied_date, created_at').eq('invoice_id', invoiceId),
    ]).then(([l, p, r, u]) => setParts({ lines: l.data || [], payments: p.data || [], refunds: r.data || [], used: u.data || [] }));
  }, [invoiceId]);
  return parts;
}

function InvoiceDoc({ d, invoice }) {
  const parts = useInvoiceParts(invoice.id);
  if (!parts) return <p style={{ padding: 20 }}>Loading…</p>;
  return <InvoiceDocument invoice={invoice} lines={parts.lines} payments={parts.payments} refunds={parts.refunds} settings={d.business} />;
}

function ReceiptDoc({ d, payment: p }) {
  const parts = useInvoiceParts(p.invoice_id);
  const invoice = useMemo(() => d.invoices.find((i) => i.id === p.invoice_id) || null, [d, p]);
  if (!parts) return <p style={{ padding: 20 }}>Loading…</p>;
  const earlier =
    parts.payments
      .filter((o) => o.id !== p.id && (o.payment_date < p.payment_date || (o.payment_date === p.payment_date && Number(o.receipt_number) < Number(p.receipt_number))))
      .reduce((t, o) => t + Number(o.amount || 0) - Number(o.credit_amount || 0), 0) +
    parts.used.filter((c) => c.applied_date <= p.payment_date).reduce((t, c) => t + Number(c.amount || 0), 0);
  const f = d.family || {};
  return <ReceiptDocument payment={p} invoice={invoice} lines={parts.lines} earlier={earlier} customer={{ name: f.name, email: f.email, address: f.address }} settings={d.business} />;
}
