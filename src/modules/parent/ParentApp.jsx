import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, CalendarX, CreditCard, Receipt, FileText, CalendarDays, Mail, Check, Printer, X, Eye, EyeOff, ChevronLeft, ChevronRight, Award, Download } from 'lucide-react';
import logo from '../../assets/logo.png';
import { supabase } from '../../supabaseClient';
import { useAuth, IDLE_FLAG, touch } from '../../auth/AuthContext';
import { PrintPortal } from '../invoices/InvoicePreview';
import InvoiceDocument from '../invoices/InvoiceDocument';
import ReceiptDocument from '../invoices/ReceiptDocument';
import TapeTracker from '../../components/TapeTracker';
import { hasTapes, TAPE_COUNT } from '../../lib/tapes';
import { MIN_CLASSES, classesSince, beltMeta, nextBelt, feeItemFor } from '../../lib/beltTesting';
import { weeklyPlan, splitClasses } from '../../lib/classes';
import { nextDueDate, todayISO } from '../../lib/billingDates';
import { money } from '../../lib/invoiceUtils';
import { holidaysBetween } from '../../lib/holidays';
import { FormQuestions, SignaturePad, checkAnswers } from '../../components/EventFormFields';

// Parent portal (/parent). Parents sign in with the email the dojang has on
// file (invited by the dojang, password set from the emailed link). Everything
// here is read through the parent's own login, so the database only ever
// returns their own family. Text is English (dojang materials are English).

const C = { red: '#BE1C21', ink: '#20241F', soft: '#5B5F56', faint: '#8A8D84', line: '#E6E3DA', bg: '#F7F5EF', green: '#2A5A30' };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fdate = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const addDaysIso = (iso, n) => new Date(new Date(iso + 'T12:00:00').getTime() + n * 864e5).toISOString().slice(0, 10);
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

async function callFn(body, token) {
  const { data, error } = await supabase.functions.invoke('parent-portal', { body: { origin: window.location.origin, ...body }, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });
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
  const [linkLogin, setLinkLogin] = useState(null); // { token, email } from the link
  const [linkError, setLinkError] = useState('');
  const [verifying, setVerifying] = useState(() => new URLSearchParams(window.location.search).has('token_hash'));

  useEffect(() => {
    document.title = 'Parent portal';
    const q = new URLSearchParams(window.location.search);
    const token = q.get('token_hash');
    if (!token) return;
    (async () => {
      touch();
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: q.get('type') || 'recovery' });
      window.history.replaceState(null, '', '/parent');
      if (error || !data?.session) setLinkError('This link has expired or was already used. Enter your email below and click "Forgot password?" to get a new one.');
      else {
        setLinkLogin({ token: data.session.access_token, email: data.user?.email || data.session.user?.email || '' });
        setMode('setpw');
      }
      setVerifying(false);
    })();
  }, []);

  // Set the password first (works even if the browser didn't keep the login).
  if (mode === 'setpw' && linkLogin) return <SetPassword login={linkLogin} onDone={() => { setMode(null); setLinkLogin(null); }} />;
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
        <PasswordInput autoComplete="current-password" value={password} onChange={setPassword} />
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

// Password box with an eye button to show / hide what's typed.
function PasswordInput({ value, onChange, autoComplete, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} style={{ ...input, paddingRight: 44 }} value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow((v) => !v)}
        style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', padding: 8, cursor: 'pointer', color: C.soft, display: 'flex' }}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function SetPassword({ login, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError("The two passwords don't match.");
    setBusy(true);
    // Saved on the server for the login in the emailed link…
    const r = await callFn({ action: 'set_password', password: pw }, login.token);
    if (r.error) {
      setBusy(false);
      return setError(r.error);
    }
    // …then sign in with it as usual.
    touch();
    const { error: err } = await supabase.auth.signInWithPassword({ email: r.email || login.email, password: pw });
    setBusy(false);
    if (err) return setError(`Your password is saved. Please sign in with it below. (${err.message})`);
    onDone();
  }
  return (
    <Shell>
      <form onSubmit={save} style={card}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Set your password</h1>
        <p style={{ fontSize: 13.5, color: C.soft, margin: 0 }}>You'll use this with your email{login.email ? ` (${login.email})` : ''} to sign in next time.</p>
        <label style={label}>New password (8+ characters)</label>
        <PasswordInput autoComplete="new-password" value={pw} onChange={setPw} autoFocus />
        <label style={label}>Type it again</label>
        <PasswordInput autoComplete="new-password" value={pw2} onChange={setPw2} />
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
    const [{ data: core, error: e1 }, inv, pays, att, tapes, events, signups, guests, makeups, notices, closed, cals] = await Promise.all([
      supabase.rpc('parent_portal_data'),
      supabase.from('invoice_summary').select('*').eq('voided', false).order('invoice_date', { ascending: false }),
      supabase.from('invoice_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('attendance').select('student_id, date, status, class_name').gte('date', since),
      supabase.from('student_tapes').select('student_id, belt, tape'),
      supabase.from('events').select('*').order('start_date'),
      supabase.from('event_signups').select('*'),
      supabase.from('event_guests').select('*').is('removed_at', null),
      supabase.from('makeup_records').select('*').gte('created_at', new Date(Date.now() - 120 * 864e5).toISOString()).order('absence_date', { ascending: false }),
      supabase.from('absence_notices').select('*').gte('absence_date', today).order('absence_date'),
      supabase.from('class_cancellations').select('date, class_name, reason').gte('date', today),
      supabase.from('monthly_calendars').select('month, title, file_name, mime, file_data').gte('month', today.slice(0, 8) + '01').order('month').limit(3),
    ]);
    if (e1) return setError(e1.message);
    setD({ ...core, invoices: inv.data || [], payments: pays.data || [], attendance: att.data || [], tapes: tapes.data || [], events: events.data || [], signups: signups.data || [], guests: guests.data || [], makeups: makeups.data || [], notices: notices.data || [], closed: [...(closed.data || []), ...holidaysBetween(today, addDaysIso(today, 400)).map((h) => ({ date: h.date, class_name: null, reason: h.name, holiday: true }))], calendars: cals.data || [] });
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
    ['calendar', 'Calendar'],
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

      {tab === 'kids' && <Kids d={d} onAbsence={(s) => setModal({ kind: 'absence', student: s })} onTest={(s) => setModal({ kind: 'test', student: s })} />}
      {tab === 'billing' && <Billing d={d} open={open} onDoc={(m) => setModal(m)} />}
      {tab === 'events' && <Events d={d} onSignUp={(e) => setModal({ kind: 'signup', event: e })} />}
      {tab === 'calendar' && <CalendarTab d={d} />}
      {tab === 'contact' && <Contact d={d} onSent={() => done('Thank you — your message was sent to the dojang. We will reply by email.')} />}

      {modal?.kind === 'absence' && <AbsenceModal d={d} student={modal.student} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'test' && <TestModal d={d} student={modal.student} onClose={() => setModal(null)} onDone={done} />}
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

function Kids({ d, onAbsence, onTest }) {
  const today = todayISO();
  if (!d.students.length) return <div style={card}>No active students on this account.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
      {d.students.map((s) => {
        const att = d.attendance.filter((a) => a.student_id === s.id);
        const n = s.classes_since_test ?? classesSince(s, att);
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
              <TestStatus d={d} s={s} n={n} tapes={tapes.size} onHold={onHold} onTest={onTest} />
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

            <Makeups list={(d.makeups || []).filter((m) => m.student_id === s.id)} />

            <button style={{ ...btn, marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => onAbsence(s)}>
              <CalendarX size={16} /> My child will be absent
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Belt test: how close the child is, and registration once eligible.
const INVITE_ONLY = ['Black Stripe 4', 'Black Belt 1st Dan', 'Black Belt 2nd Dan', 'Black Belt 3rd Dan'];
function TestStatus({ d, s, n, tapes, onHold, onTest }) {
  const nt = d.next_test;
  const today = todayISO();
  const entry = (d.test_entries || []).find((e) => e.student_id === s.id);
  const need = Math.max(0, MIN_CLASSES - n);
  const needTapes = hasTapes(s.belt) ? Math.max(0, TAPE_COUNT - tapes) : 0;
  const missing = [need && `${need} more class${need === 1 ? '' : 'es'}`, needTapes && `${needTapes} more tape${needTapes === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
  const box = (bg, c) => ({ fontSize: 13.5, padding: '8px 10px', borderRadius: 8, background: bg, color: c, marginTop: 6 });
  if (entry)
    return (
      <div style={box('#E8F1E9', C.green)} data-testid="test-registered">
        <b>Registered for the belt test</b> on {fdate(nt.date)} ✓ — testing for {entry.target_belt}.
        <div style={{ fontSize: 12, opacity: 0.9 }}>The test fee invoice is under Billing.</div>
      </div>
    );
  if (!nt)
    return <div style={{ fontSize: 13, color: C.soft }}>{missing ? `${missing} to be eligible for the next belt test.` : 'Eligible for the next belt test ✓'} The next test date will be posted soon.</div>;
  if (INVITE_ONLY.includes(s.belt))
    return <div style={{ fontSize: 13, color: C.soft }}>Next belt test: {fdate(nt.date)}. Black belt testing is by invitation from Master Daisy.</div>;
  if (missing)
    return (
      <div style={{ fontSize: 13, color: C.soft }} data-testid="test-need">
        <b style={{ color: C.ink, fontWeight: 600 }}>{missing}</b> to be eligible for the belt test on {fdate(nt.date)}.
        <div style={{ fontSize: 12, color: C.faint }}>To test: {MIN_CLASSES} classes since the last test{hasTapes(s.belt) ? ` and all ${TAPE_COUNT} curriculum tapes` : ''}.</div>
      </div>
    );
  const open = nt.date > today && !onHold;
  return (
    <div style={box('#FDF6E3', '#6B4B0B')} data-testid="test-ready">
      <b>Ready for the belt test on {fdate(nt.date)}</b> — {MIN_CLASSES}+ classes ✓{hasTapes(s.belt) ? ` · ${TAPE_COUNT} tapes ✓` : ''}
      {open ? (
        <button style={{ ...primary, marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onTest(s)}>
          <Award size={16} /> Register for the belt test
        </button>
      ) : (
        <div style={{ fontSize: 12, marginTop: 4 }}>{onHold ? 'Registration opens again when the membership is active.' : 'Registration for this test has closed.'}</div>
      )}
    </div>
  );
}

function TestModal({ d, student, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const item = feeItemFor(student.belt);
  const fee = d.test_fees?.[item];
  const amt = Number(fee?.amount) || 0;
  const total = amt + (fee?.taxable !== false ? Math.round(amt * 5) / 100 : 0);
  const first = student.name.split(' ')[0];
  const finish = () => onDone(`${first} is registered for the belt test on ${fdate(d.next_test.date)}.${result?.invoice_number ? ` Invoice #${result.invoice_number} is under Billing.` : ''}`);
  async function go() {
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('parent_test_register', { p_student: student.id });
    setBusy(false);
    if (err) return setError(err.message);
    if (data?.pay_token) setResult(data);
    else onDone(`${first} is registered for the belt test on ${fdate(d.next_test.date)}.`);
  }
  if (result)
    return (
      <Modal title="Registered!" onClose={finish}>
        <p style={{ fontSize: 15 }}>{first} is registered for the belt test on <b>{fdate(d.next_test.date)}</b>. Invoice #{result.invoice_number} for <b>{money(result.total)}</b> was added to your account (due on the test day).</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a style={primary} href={`/pay/${result.pay_token}`}>Pay now</a>
          <button style={btn} onClick={finish}>Pay later</button>
        </div>
      </Modal>
    );
  return (
    <Modal title={`Belt test — ${student.name}`} onClose={onClose} footer={<><button style={btn} onClick={onClose}>Cancel</button><button style={primary} disabled={busy} onClick={go}>{busy ? 'Registering…' : `Register${total ? ` · ${money(total)}` : ''}`}</button></>}>
      <div style={{ fontSize: 15, lineHeight: 1.6 }}>
        <div><b>Test day:</b> {fday(d.next_test.date)}{d.next_test.title ? ` · ${d.next_test.title}` : ''}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><b>Belt:</b> <BeltChip belt={student.belt} /> → <BeltChip belt={nextBelt(student.belt)} /></div>
        {amt > 0 && <div><b>Test fee:</b> {money(amt)}{fee?.taxable !== false ? ' + GST' : ''} = {money(total)}</div>}
      </div>
      <p style={{ fontSize: 13, color: C.soft }}>An invoice for the test fee is added to your account, due on the test day. You can pay it right away or later under Billing. There are no regular classes on test day.</p>
      {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

// Calendar: the dojang's monthly calendar, closures and key dates.
function openData(dataUrl) {
  fetch(dataUrl).then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b), '_blank'));
}
function CalendarTab({ d }) {
  const today = todayISO();
  const until = addDaysIso(today, 90);
  const closed = (d.closed || [])
    .filter((c) => c.date >= today && c.date <= until)
    .filter((c, i, all) => all.findIndex((x) => x.date === c.date && (x.class_name || '') === (c.class_name || '')) === i)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const events = (d.events || []).filter((e) => e.published && !e.archived && (e.end_date || e.start_date) >= today).slice(0, 6);
  const monthName = (m) => new Date(m.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
      <div style={card} data-testid="calendars">
        <h2 style={h2}><CalendarDays size={17} /> Monthly calendar</h2>
        {!d.calendars?.length && <p style={{ fontSize: 14, color: C.faint, margin: 0 }}>This month's calendar will be posted here.</p>}
        {(d.calendars || []).map((m) => (
          <div key={m.month} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <b style={{ flex: 1, fontSize: 15 }}>{m.title || monthName(m.month)}</b>
              <button style={{ ...btn, padding: '4px 10px', fontSize: 13 }} onClick={() => openData(m.file_data)}><Download size={14} /> Open</button>
            </div>
            {m.mime.startsWith('image/') ? (
              <img src={m.file_data} alt={m.title || monthName(m.month)} style={{ width: '100%', borderRadius: 8, border: `1px solid ${C.line}`, cursor: 'zoom-in' }} onClick={() => openData(m.file_data)} />
            ) : (
              <div style={{ fontSize: 13.5, color: C.soft }}>PDF — tap Open to view or save.</div>
            )}
          </div>
        ))}
      </div>
      <div>
        <div style={card} data-testid="closures">
          <h2 style={h2}><CalendarX size={17} /> Dojang closed (next 3 months)</h2>
          {!closed.length && <p style={{ fontSize: 14, color: C.faint, margin: 0 }}>No closures in the next 3 months.</p>}
          {closed.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 14, padding: '5px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <span style={{ width: 118, flexShrink: 0, fontWeight: 600 }}>{fday(c.date)}</span>
              <span style={{ color: C.soft }}>{c.class_name ? `No ${c.class_name} class` : 'No classes'}{c.reason ? ` — ${c.reason}` : ''}</span>
            </div>
          ))}
          <p style={{ fontSize: 12, color: C.faint, margin: '8px 0 0' }}>Make-ups aren't given for statutory holidays. If a closure leaves your child below the guaranteed number of classes, the dojang will arrange make-ups.</p>
        </div>
        <div style={card}>
          <h2 style={h2}><Award size={17} /> Key dates</h2>
          {d.next_test && (
            <div style={{ fontSize: 14, padding: '4px 0' }}><b style={{ fontWeight: 600 }}>{fday(d.next_test.date)}</b> · Belt test (no regular classes)</div>
          )}
          {events.map((e) => (
            <div key={e.id} style={{ fontSize: 14, padding: '4px 0' }}><b style={{ fontWeight: 600 }}>{fday(e.start_date)}</b> · {e.title}</div>
          ))}
          {!d.next_test && !events.length && <p style={{ fontSize: 14, color: C.faint, margin: 0 }}>Nothing scheduled yet.</p>}
        </div>
      </div>
    </div>
  );
}

// Make-up classes: open ones (with the last day to use them), booked ones,
// and the ones done in the last weeks.
function Makeups({ list }) {
  const today = todayISO();
  const open = list.filter((m) => m.status === 'pending' && (!m.expiration_date || m.expiration_date >= today));
  const booked = list.filter((m) => m.status === 'reserved');
  const done = list.filter((m) => m.status === 'completed').slice(0, 3);
  if (!open.length && !booked.length && !done.length) return null;
  const pill = (bg, c) => ({ fontSize: 12.5, padding: '6px 9px', borderRadius: 8, background: bg, color: c, marginBottom: 5 });
  return (
    <Section title="Make-up classes">
      <div data-testid="makeups">
        {booked.map((m) => (
          <div key={m.id} style={pill('#EEF0F3', '#3A4250')}>
            <b>Booked:</b> {fday(m.reservation_date)}{m.reservation_class_name ? ` · ${m.reservation_class_name}` : ''}
            <div style={{ fontSize: 11.5, opacity: 0.85 }}>for the class missed on {fday(m.absence_date)}</div>
          </div>
        ))}
        {open.map((m) => (
          <div key={m.id} style={pill('#FAEEDA', '#854F0B')}>
            <b>1 make-up available</b> — use by {fday(m.expiration_date || m.tentative_expiration)}
            <div style={{ fontSize: 11.5, opacity: 0.9 }}>
              for {fday(m.absence_date)}{m.class_name ? ` (${m.class_name})` : ''}
              {m.conditional && m.paid_period_end ? ` · only while the membership is active (paid to ${fday(m.paid_period_end)})` : ''}
            </div>
          </div>
        ))}
        {done.map((m) => (
          <div key={m.id} style={{ fontSize: 12.5, color: C.soft, padding: '2px 0' }}>
            ✓ Made up {m.reservation_date ? fday(m.reservation_date) : ''} for {fday(m.absence_date)}
          </div>
        ))}
        {open.length > 0 && <div style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>To book a make-up, ask at the front desk or email the dojang (Contact tab).</div>}
      </div>
    </Section>
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
        <h2 style={h2}><CreditCard size={17} /> Saved cards</h2>
        {(d.cards || []).length ? (
          (d.cards || []).map((k, i) => (
            <Row key={i}>
              <div style={{ flex: 1 }}>
                {k.type || 'Card'} ending <b>{k.last4}</b>
                {k.expiry ? <span style={{ color: C.soft }}> · expires {k.expiry}</span> : null}
              </div>
              {k.is_default && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.green, background: '#E8F1E9', borderRadius: 999, padding: '2px 9px' }}>Used for tuition</span>}
            </Row>
          ))
        ) : (
          <p style={{ margin: '0 0 10px', fontSize: 14, color: C.soft }}>{f.payment_type === 'manual' ? 'You pay tuition by invoice (debit or cash).' : 'No card saved yet.'}</p>
        )}
        {f.card_link_token && (
          <a style={{ ...btn, marginTop: 10 }} href={`/card/${f.card_link_token}`}>{(d.cards || []).length ? 'Add or change cards' : 'Save a card'}</a>
        )}
        {(d.cards || []).length > 0 && <p style={{ fontSize: 12.5, color: C.faint, margin: '8px 0 0' }}>You can add cards and choose which one is used for tuition. A card can be removed only when you have another card saved.</p>}
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
    const myGuests = (d.guests || []).filter((g) => g.event_id === e.id);
    const answer = mine.find((m) => m.answer)?.answer;
    const closed = e.signup_deadline && e.signup_deadline < today;
    const canAdd = !closed && d.students.some((k) => !mine.some((m) => m.student_id === k.id));
    const inv = [...mine, ...myGuests].map((m) => d.invoices.find((i) => i.id === m.invoice_id)).filter(Boolean);
    const canGuests = !closed && e.allow_guests && mine.length > 0;
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
            {e.allow_guests && <div style={{ fontSize: 12, color: C.faint }}>Guests {Number(e.guest_price) > 0 ? `${money(e.guest_price)} each` : 'free'}</div>}
          </div>
        </div>
        {e.description && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '10px 0 0' }}>{e.description}</p>}
        {e.signup_deadline && <p style={{ fontSize: 13, color: closed ? C.red : C.soft, margin: '8px 0 0' }}>{closed ? 'Sign-up closed' : `Sign up by ${fdate(e.signup_deadline)}`}</p>}
        {names.length > 0 && <p style={{ fontSize: 14, color: C.green, margin: '8px 0 0' }}><Check size={15} style={{ verticalAlign: -2 }} /> Signed up: {names.join(', ')}{myGuests.length ? ` + guests: ${myGuests.map((g) => g.name).join(', ')}` : ''}</p>}
        {answer && e.question && <p style={{ fontSize: 13.5, color: C.soft, margin: '4px 0 0' }}>{e.question} <b style={{ color: C.ink }}>{answer}</b></p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {canAdd && <button style={primary} onClick={() => onSignUp(e)}>Sign up</button>}
          {!canAdd && canGuests && <button style={btn} onClick={() => onSignUp(e)}>Add guests</button>}
          {owing.map((i) => (
            <a key={i.id} style={btn} href={`/pay/${i.pay_token}`}>Pay {money(i.balance)}</a>
          ))}
        </div>
      </div>
    );
  });
}

function Modal({ title, children, onClose, footer, maxWidth = 480, sticky = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,18,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 12px', zIndex: 50, overflowY: 'auto' }} onClick={sticky ? undefined : onClose}>
      <div role="dialog" aria-label={title} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth, padding: 18 }} onClick={(e) => e.stopPropagation()}>
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

// Class days for this child over the next weeks (closures left out).
function classDays(student, d, weeks = 5) {
  const plan = weeklyPlan(student, d.schedule);
  const out = [];
  const start = new Date(todayISO() + 'T12:00:00');
  for (let k = 0; k < weeks * 7; k++) {
    const day = new Date(start.getTime() + k * 864e5);
    const iso = day.toISOString().slice(0, 10);
    const classes = plan
      .filter((p) => p.weekday === day.getDay())
      .filter((p) => !(d.closed || []).some((c) => c.date === iso && (!c.class_name || c.class_name === p.class_name)));
    if (classes.length) out.push({ date: iso, classes });
  }
  return out;
}

function AbsenceModal({ d, student, onClose, onDone }) {
  const today = todayISO();
  const days = useMemo(() => classDays(student, d), [student, d]);
  const byDate = Object.fromEntries(days.map((x) => [x.date, x]));
  const told = new Set(d.notices.filter((x) => x.student_id === student.id).map((x) => x.absence_date));
  const [date, setDate] = useState(() => days.find((x) => !told.has(x.date))?.date || '');
  const [cls, setCls] = useState(() => byDate[days.find((x) => !told.has(x.date))?.date]?.classes[0]?.class_name || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onHold = student.hold_from && student.hold_from <= today && (!student.hold_until || student.hold_until >= today);
  const first = student.name.split(' ')[0];
  function pick(iso) {
    setDate(iso);
    setCls(byDate[iso]?.classes[0]?.class_name || '');
  }
  async function send() {
    if (!date) return setError('Pick the class day.');
    setError('');
    setBusy(true);
    const r = await callFn({ action: 'absence', student_id: student.id, date, class_name: cls, note });
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone(`Thanks — we've let the dojang know ${first} will be absent on ${fday(date)}.`);
  }
  // calendar: weeks from this week's Sunday
  const start = new Date(today + 'T12:00:00');
  start.setDate(start.getDate() - start.getDay());
  const cells = Array.from({ length: 35 }, (_, k) => new Date(start.getTime() + k * 864e5).toISOString().slice(0, 10));
  const chosen = byDate[date];
  return (
    <Modal title={`Absence — ${student.name}`} onClose={onClose} footer={<><button style={btn} onClick={onClose}>Cancel</button><button style={primary} onClick={send} disabled={busy || !date}>Send to the dojang</button></>}>
      <label style={label}>Which class will {first} miss?</label>
      <div data-testid="absence-calendar" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
        {WD.map((w) => <div key={w} style={{ fontSize: 11.5, color: C.faint, padding: '2px 0' }}>{w}</div>)}
        {cells.map((iso) => {
          const ok = !!byDate[iso] && !told.has(iso);
          const on = iso === date;
          const dt = new Date(iso + 'T12:00:00');
          return (
            <button
              key={iso}
              type="button"
              disabled={!ok}
              data-day={iso}
              data-open={ok ? '1' : '0'}
              onClick={() => pick(iso)}
              title={told.has(iso) ? 'Already told the dojang' : ok ? byDate[iso].classes.map((c) => c.class_name).join(', ') : ''}
              style={{
                padding: '7px 0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                border: on ? `2px solid ${C.red}` : `1px solid ${ok ? '#CFE3D1' : 'transparent'}`,
                background: on ? '#FBEAEA' : ok ? '#F1F7F1' : 'transparent',
                color: ok ? C.ink : told.has(iso) ? C.green : '#C9C6BA',
                fontWeight: ok ? 600 : 400,
                cursor: ok ? 'pointer' : 'default',
              }}
            >
              {told.has(iso) ? '✓' : dt.getDate()}
              {dt.getDate() === 1 || iso === cells[0] ? <div style={{ fontSize: 9.5, fontWeight: 400, color: C.faint }}>{dt.toLocaleDateString('en-CA', { month: 'short' })}</div> : null}
            </button>
          );
        })}
      </div>
      {days.length === 0 && <p style={{ fontSize: 13, color: '#854F0B' }}>No upcoming classes found for {first}. Please email the dojang instead.</p>}
      {chosen && (
        <p style={{ fontSize: 14, margin: '10px 0 0' }}>
          <b>{fday(date)}</b>
          {chosen.classes.length === 1 ? ` · ${chosen.classes[0].class_name} ${ftime(chosen.classes[0].start_time)}` : ''}
        </p>
      )}
      {chosen && chosen.classes.length > 1 && (
        <select style={{ ...input, marginTop: 6 }} value={cls} onChange={(e) => setCls(e.target.value)}>
          {chosen.classes.map((c) => <option key={c.class_name} value={c.class_name}>{c.class_name} · {ftime(c.start_time)}</option>)}
        </select>
      )}
      <label style={label}>Note (optional)</label>
      <textarea style={{ ...input, minHeight: 60 }} placeholder="e.g. sick, family trip" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      {onHold && <p style={{ fontSize: 13, color: '#854F0B', margin: '8px 0 0' }}>{first}'s membership is on a break right now, so make-up classes can't be booked until it's active again.</p>}
      {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
      <div style={{ marginTop: 14, padding: '10px 12px', background: C.bg, borderRadius: 8, fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, color: C.ink, marginBottom: 2 }}>Make-up class policy</div>
        <div>• Make-ups are only for excused absences — please tell us <b>before</b> the class.</div>
        <div>• Take the make-up within <b>30 days</b> of the missed class (you can also do it before).</div>
        <div>• The membership must be <b>active</b> — no make-ups while on a break (hold) or after the membership ends.</div>
        <div>• No make-ups for statutory holidays or dojang closures.</div>
        <div>• Competition Team is unlimited, so it doesn't need make-ups.</div>
      </div>
    </Modal>
  );
}

function SignUpModal({ d, event, onClose, onDone }) {
  const taken = new Set(d.signups.filter((s) => s.event_id === event.id && s.status === 'signed_up').map((s) => s.student_id));
  const kids = d.students.filter((k) => !taken.has(k.id));
  const already = taken.size > 0 && d.students.some((k) => taken.has(k.id));
  const [pick, setPick] = useState(() => (kids.length === 1 ? [kids[0].id] : []));
  const [guests, setGuests] = useState([]);
  const [answers, setAnswers] = useState({});
  const [signer, setSigner] = useState('');
  const [signature, setSignature] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const price = Number(event.price) || 0;
  const gprice = Number(event.guest_price) || 0;
  const names = guests.map((g) => g.trim()).filter(Boolean);
  const sub = price * pick.length + (event.allow_guests ? gprice * names.length : 0);
  const total = sub + (event.taxable ? Math.round(sub * 5) / 100 : 0);
  const form = Array.isArray(event.form) ? event.form : [];
  const pickedKids = kids.filter((k) => pick.includes(k.id));
  const needSign = event.signature_required && pick.length > 0;
  async function go() {
    if (!pick.length && !names.length) return setError(kids.length ? 'Choose who is coming.' : 'Add at least one guest.');
    if (!pick.length && !already) return setError('Choose at least one student — guests come with a student.');
    if (guests.some((g) => !g.trim())) return setError("Enter each guest's name (or remove the empty line).");
    if (pick.length) {
      const problem = checkAnswers(form, pickedKids, answers);
      if (problem) return setError(problem);
      if (needSign && !signature) return setError('Please sign in the signature box.');
      if (needSign && !signer.trim()) return setError('Please type your full name under the signature.');
    }
    setBusy(true);
    setError('');
    // keep only the answers for the children being signed up
    const sent = Object.fromEntries(
      form.map((q) => [q.id, q.per_child ? Object.fromEntries(pick.map((id) => [id, answers?.[q.id]?.[id]]).filter(([, v]) => v != null)) : answers?.[q.id]]).filter(([, v]) => v != null),
    );
    const { data, error: err } = await supabase.rpc('event_register_form', {
      p_event: event.id, p_students: pick, p_note: note || null, p_guests: names,
      p_answers: pick.length ? sent : {}, p_signer: needSign ? signer.trim() : null, p_signature: needSign ? signature : null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    const what = `${event.title}${names.length ? ` (with ${names.length} guest${names.length > 1 ? 's' : ''})` : ''}`;
    if (data?.pay_token) setResult({ ...data, what });
    else onDone(`You're signed up for ${what}!`);
  }
  if (result)
    return (
      <Modal title="You're signed up!" onClose={() => onDone(`You're signed up for ${result.what}. Invoice #${result.invoice_number} is under Billing.`)}>
        <p style={{ fontSize: 15 }}>Invoice #{result.invoice_number} for <b>{money(result.total)}</b> was added to your account.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a style={primary} href={`/pay/${result.pay_token}`}>Pay now</a>
          <button style={btn} onClick={() => onDone(`You're signed up for ${result.what}. Invoice #${result.invoice_number} is under Billing.`)}>Pay later</button>
        </div>
      </Modal>
    );
  return (
    <Modal title={`${kids.length ? 'Sign up' : 'Add guests'} — ${event.title}`} onClose={onClose} maxWidth={form.length || event.signature_required ? 620 : 480} sticky footer={<><button style={btn} onClick={onClose}>Cancel</button><button style={primary} onClick={go} disabled={busy || (!pick.length && !names.length)}>{kids.length ? 'Sign up' : 'Add guests'}{sub > 0 ? ` · ${money(total)}` : ''}</button></>}>
      {kids.length > 0 && (
        <>
          <label style={label}>Who is coming?</label>
          {kids.map((k) => (
            <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 15 }}>
              <input type="checkbox" checked={pick.includes(k.id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, k.id] : p.filter((x) => x !== k.id)))} />
              {k.name}
            </label>
          ))}
        </>
      )}
      {event.allow_guests && (
        <div data-testid="guests">
          <label style={label}>Guests {gprice > 0 ? `(${money(gprice)} each${event.taxable ? ' + GST' : ''})` : '(free)'}</label>
          {guests.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input style={input} placeholder="Guest's name" aria-label={`Guest ${i + 1} name`} value={g} maxLength={80} autoFocus={i === guests.length - 1} onChange={(e) => setGuests((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
              <button type="button" aria-label="Remove guest" style={{ ...btn, padding: '6px 10px' }} onClick={() => setGuests((x) => x.filter((_, j) => j !== i))}><X size={15} /></button>
            </div>
          ))}
          {guests.length < 10 && <button type="button" style={{ ...btn, padding: '6px 12px', fontSize: 13.5 }} onClick={() => setGuests((x) => [...x, ''])}>+ Add guest</button>}
        </div>
      )}
      {kids.length > 0 && form.length > 0 && <FormQuestions form={form} kids={pickedKids} answers={answers} onChange={setAnswers} st={{ input }} />}
      {kids.length > 0 && (
        <>
          <label style={label}>Note for the dojang (optional)</label>
          <input style={input} placeholder="Allergies, pick-up time…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </>
      )}
      {needSign && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px', margin: '14px 0 4px', background: '#FBFAF6' }} data-testid="signature">
          <div style={{ fontSize: 15, fontWeight: 600 }}>Parent / guardian signature <span style={{ color: C.red }}>*</span></div>
          {event.signature_text && <p style={{ fontSize: 13.5, color: C.soft, whiteSpace: 'pre-wrap', margin: '6px 0 10px', lineHeight: 1.5 }}>{event.signature_text}</p>}
          <SignaturePad onChange={setSignature} />
          <label style={label}>Full name of parent / guardian *</label>
          <input style={input} value={signer} onChange={(e) => setSigner(e.target.value)} maxLength={120} aria-label="Full name of parent or guardian" />
          <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>Signed {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })} for {pickedKids.map((k) => k.name).join(', ')}.</div>
        </div>
      )}
      {sub > 0 && <p style={{ fontSize: 13, color: C.soft }}>An invoice for {money(total)} (incl. GST) is added to your account. You can pay it right away or later under Billing.</p>}
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
