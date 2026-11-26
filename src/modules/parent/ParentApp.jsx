import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LogOut, CalendarX, Users, PartyPopper, CreditCard, Receipt, FileText, CalendarDays, Mail, Check, Printer, X, Eye, EyeOff, ChevronLeft, ChevronRight, Award, Download, CircleCheck } from 'lucide-react';
import logo from '../../assets/logo.png';
import { supabase } from '../../supabaseClient';
import { useAuth, IDLE_FLAG, touch } from '../../auth/AuthContext';
import { PrintPortal } from '../invoices/InvoicePreview';
import InvoiceDocument from '../invoices/InvoiceDocument';
import ReceiptDocument from '../invoices/ReceiptDocument';
import TapeTracker from '../../components/TapeTracker';
import BeltStrip from '../../components/BeltStrip';
import { hasTapes, TAPE_COUNT } from '../../lib/tapes';
import { MIN_CLASSES, classesSince, nextBelt, feeItemFor } from '../../lib/beltTesting';
import { weeklyPlan, splitClasses } from '../../lib/classes';
import { nextDueDate, todayISO } from '../../lib/billingDates';
import { money } from '../../lib/invoiceUtils';
import { holidaysBetween } from '../../lib/holidays';
import { FormQuestions, SignaturePad, checkAnswers } from '../../components/EventFormFields';
import ClassChip from '../../components/ClassChip';

// Parent portal (/parent). Parents sign in with the email the dojang has on
// file (invited by the dojang, password set from the emailed link). Everything
// here is read through the parent's own login, so the database only ever
// returns their own family. Text is English (dojang materials are English).

// Colours from DESIGN.md (src/styles/tokens.css). brand = Hankook Red, accents only; red = danger text.
const C = { brand: 'var(--dp-hankook-red)', red: 'var(--dp-danger)', ink: 'var(--dp-ink)', soft: 'var(--dp-ink-soft)', faint: 'var(--dp-ink-faint)', line: 'var(--dp-line)', bg: 'var(--dp-canvas)', green: 'var(--dp-success)', greenTint: 'var(--dp-success-tint)', amber: 'var(--dp-warning)', amberTint: 'var(--dp-warning-tint)', redTint: 'var(--dp-danger-tint)' };
// Admin "View as parent" preview (/parent?preview=<family id>): the admin sees
// exactly what that family sees, but nothing can be sent, paid or saved.
const PreviewCtx = createContext(false);
const usePreview = () => useContext(PreviewCtx);
const PREVIEW_MSG = 'Preview only — nothing was sent or saved. Parents can do this from their own login.';
const PREVIEW_ID = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get('preview') || '';
    return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
})();
// Pay / card links: in the preview they don't open (no payments from here).
function PLink({ href, style, children }) {
  const preview = usePreview();
  if (!preview) return <a style={style} href={href}>{children}</a>;
  return <a style={style} href={href} onClick={(e) => { e.preventDefault(); window.alert(PREVIEW_MSG); }} title="Preview only">{children}</a>;
}

// Phone-size screens get a tighter layout (tab bar as icons, stacked rows).
const NARROW_Q = '(max-width: 600px)';
function useNarrow() {
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(NARROW_Q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(NARROW_Q);
    if (!m) return undefined;
    const on = () => setN(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return !!n;
}

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
const btn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, boxSizing: 'border-box', padding: '8px 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' };
const primary = { ...btn, background: C.ink, borderColor: C.ink, color: '#fff' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 16, fontFamily: 'inherit' };
const label = { display: 'block', fontSize: 16, fontWeight: 600, color: C.ink, margin: '14px 0 6px' };

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
  if (PREVIEW_ID && role === 'admin')
    return (
      <PreviewCtx.Provider value={true}>
        <ParentPortal preview={PREVIEW_ID} />
      </PreviewCtx.Provider>
    );
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
  const narrow = useNarrow();
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'var(--dp-font)', color: C.ink, overflowX: 'hidden' }}>
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: wide ? 980 : 560, margin: '0 auto', padding: narrow ? '10px 14px' : '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="" style={{ width: narrow ? 32 : 36, height: narrow ? 32 : 36, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ fontWeight: 700, fontSize: narrow ? 15 : 16, flex: 1, minWidth: 0, lineHeight: 1.25, fontFamily: 'var(--dp-font-display)' }}>
            {narrow ? 'Hankook Taekwondo' : 'Champion Hankook Taekwondo'}
            <div style={{ fontWeight: 400, fontSize: 13, color: C.soft }}>Parent portal</div>
          </div>
          {right}
        </div>
      </div>
      <div style={{ maxWidth: wide ? 980 : 560, margin: '0 auto', padding: narrow ? '14px 14px 40px' : '18px 16px 40px' }}>{children}</div>
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
        <p style={{ fontSize: 16, color: C.soft, margin: '0 0 6px' }}>Use the email address the dojang has on file for your family.</p>
        {idle && <p style={{ background: 'var(--dp-warning-tint)', color: 'var(--dp-warning)', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>You were signed out after 1 hour of no activity. Please sign in again.</p>}
        {notice && <p style={{ background: 'var(--dp-danger-tint)', color: 'var(--dp-danger)', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>{notice}</p>}
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
      <p style={{ fontSize: 16, color: C.faint, textAlign: 'center' }}>No account yet? Ask the dojang to send you a parent portal invite.</p>
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
        <p style={{ fontSize: 16, color: C.soft, margin: 0 }}>You'll use this with your email{login.email ? ` (${login.email})` : ''} to sign in next time.</p>
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
function ParentPortal({ onSignOut, preview }) {
  const narrow = useNarrow();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('kids');
  const [modal, setModal] = useState(null);
  const [flash, setFlash] = useState('');

  async function load() {
    if (preview) return loadPreview();
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
  // Admin preview: the same data, read for one family. The admin login can read
  // every family, so each list is narrowed to this family here.
  async function loadPreview() {
    const today = todayISO();
    const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const fam = preview;
    const { data: core, error: e1 } = await supabase.rpc('admin_parent_portal_data', { p_family: fam });
    if (e1) return setError(e1.message);
    const sids = (core.students || []).map((s) => s.id);
    const ids = sids.length ? sids : ['00000000-0000-0000-0000-000000000000'];
    const [inv, att, tapes, events, signups, guests, makeups, notices, closed, cals] = await Promise.all([
      supabase.from('invoice_summary').select('*').eq('customer_id', fam).eq('voided', false).order('invoice_date', { ascending: false }),
      supabase.from('attendance').select('student_id, date, status, class_name').in('student_id', ids).gte('date', since),
      supabase.from('student_tapes').select('student_id, belt, tape').in('student_id', ids),
      supabase.from('events').select('*').eq('published', true).eq('archived', false).order('start_date'),
      supabase.from('event_signups').select('*').eq('customer_id', fam),
      supabase.from('event_guests').select('*').eq('customer_id', fam).is('removed_at', null),
      supabase.from('makeup_records').select('*').in('student_id', ids).gte('created_at', new Date(Date.now() - 120 * 864e5).toISOString()).order('absence_date', { ascending: false }),
      supabase.from('absence_notices').select('*').eq('customer_id', fam).gte('absence_date', today).order('absence_date'),
      supabase.from('class_cancellations').select('date, class_name, reason').gte('date', today),
      supabase.from('monthly_calendars').select('month, title, file_name, mime, file_data').gte('month', today.slice(0, 8) + '01').order('month').limit(3),
    ]);
    const invIds = (inv.data || []).map((i) => i.id);
    const pays = await supabase.from('invoice_payments').select('*')
      .or(invIds.length ? `customer_id.eq.${fam},invoice_id.in.(${invIds.join(',')})` : `customer_id.eq.${fam}`)
      .order('payment_date', { ascending: false });
    const bad = [inv, att, tapes, events, signups, guests, makeups, notices, closed, cals, pays].find((r) => r.error);
    if (bad) return setError(bad.error.message);
    setD({ ...core, invoices: inv.data || [], payments: pays.data || [], attendance: att.data || [], tapes: tapes.data || [], events: events.data || [], signups: signups.data || [], guests: guests.data || [], makeups: makeups.data || [], notices: notices.data || [], closed: [...(closed.data || []), ...holidaysBetween(today, addDaysIso(today, 400)).map((h) => ({ date: h.date, class_name: null, reason: h.name, holiday: true }))], calendars: cals.data || [] });
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (preview && d?.family?.name) document.title = `Preview: ${d.family.name}`;
  }, [preview, d?.family?.name]);
  const done = (m) => {
    setModal(null);
    setFlash(m);
    load();
    window.scrollTo(0, 0);
  };

  // In the preview there's no Sign out (that would sign the admin out) — just close the tab.
  const signOutBtn = preview ? (
    <button style={{ ...btn, padding: '8px 12px', fontSize: 15, flexShrink: 0 }} onClick={() => { window.close(); window.location.href = '/'; }}><X size={16} aria-hidden="true" /> {narrow ? 'Close' : 'Close preview'}</button>
  ) : (
    <button style={{ ...btn, padding: '8px 12px', fontSize: 15, flexShrink: 0 }} onClick={onSignOut}><LogOut size={16} aria-hidden="true" /> Sign out</button>
  );
  const previewBar = preview && (
    <div role="note" style={{ background: 'var(--dp-warning-tint)', color: 'var(--dp-warning)', border: '1px solid var(--dp-warning)', borderRadius: 10, padding: narrow ? '8px 12px' : '10px 14px', fontSize: narrow ? 14 : 15, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <Eye size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span><b>Parent view preview.</b> {narrow ? 'Read only — nothing is sent, paid or saved.' : 'This is what this family sees when they sign in. Read only: nothing can be sent, paid or saved here.'}</span>
    </div>
  );
  if (error) return <Shell right={signOutBtn}><div style={card}>Something went wrong: {error}</div></Shell>;
  if (!d) return <Shell right={signOutBtn}><p style={{ color: C.soft }}>Loading…</p></Shell>;

  const open = d.invoices.filter((i) => Number(i.balance) > 0.004);
  const due = open.reduce((t, i) => t + Number(i.balance), 0);
  const TABS = [
    ['kids', narrow ? 'Children' : 'My children', Users],
    ['billing', 'Billing', FileText],
    ['events', 'Events', PartyPopper],
    ['calendar', 'Calendar', CalendarDays],
    ['contact', 'Contact', Mail],
  ];

  return (
    <Shell right={signOutBtn} wide>
      {previewBar}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: narrow ? 24 : 28, fontWeight: 700, lineHeight: 1.15, margin: 0 }}>{d.family?.name}</h1>
        {due > 0 && (
          <button style={{ ...btn, padding: '6px 14px', fontSize: 16, color: C.red, borderColor: C.redTint, background: C.redTint, borderRadius: 999 }} onClick={() => setTab('billing')}>
            {money(due)} due
          </button>
        )}
      </div>
      {/* Phones: five equal tabs with an icon over a short label, so all fit on one row. */}
      <div role="tablist" style={narrow ? { display: 'grid', gridTemplateColumns: `repeat(${TABS.length}, 1fr)`, borderBottom: `1px solid ${C.line}`, marginBottom: 14 } : { display: 'flex', gap: 4, borderBottom: `1px solid ${C.line}`, marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(([id, l, Icon]) => {
          const on = tab === id;
          const badge = id === 'billing' && open.length > 0;
          return (
            <button key={id} role="tab" aria-selected={on} aria-label={badge ? `${l}, ${open.length} to pay` : undefined} onClick={() => { setTab(id); setFlash(''); }}
              style={narrow
                ? { position: 'relative', border: 'none', background: 'none', minHeight: 56, padding: '8px 2px 6px', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.ink : C.soft, borderBottom: `3px solid ${on ? C.brand : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 }
                : { border: 'none', background: 'none', minHeight: 48, padding: '10px 14px', fontSize: 16, fontWeight: on ? 700 : 500, color: on ? C.ink : C.soft, borderBottom: `3px solid ${on ? C.brand : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              {narrow && <Icon size={20} aria-hidden="true" />}
              <span style={narrow ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' } : undefined}>
                {l}{!narrow && badge ? ` (${open.length})` : ''}
              </span>
              {narrow && badge && <span aria-hidden="true" style={{ position: 'absolute', top: 4, left: '50%', marginLeft: 8, minWidth: 18, height: 18, borderRadius: 9, background: C.brand, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{open.length}</span>}
            </button>
          );
        })}
      </div>
      {flash && <p role="status" style={{ background: C.greenTint, color: C.green, padding: '12px 14px', borderRadius: 10, fontSize: 15, display: 'flex', gap: 8, alignItems: 'flex-start' }}><CircleCheck size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />{flash}</p>}

      {tab === 'kids' && <Kids d={d} onAbsence={(s) => setModal({ kind: 'absence', student: s })} onTest={(s) => setModal({ kind: 'test', student: s })} />}
      {tab === 'billing' && <Billing d={d} open={open} onDoc={(m) => setModal(m)} />}
      {tab === 'events' && <Events d={d} onSignUp={(e) => setModal({ kind: 'signup', event: e })} />}
      {tab === 'calendar' && <CalendarTab d={d} />}
      {tab === 'contact' && <Contact d={d} onSent={() => done('Thank you — your message was sent to the dojang. We will reply by email.')} />}

      {modal?.kind === 'absence' && <AbsenceModal d={d} student={modal.student} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'test' && <TestModal d={d} student={modal.student} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'signup' && <SignUpModal d={d} event={modal.event} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'invoice' && <DocModal title={`Invoice #${modal.invoice.invoice_number}`} onClose={() => setModal(null)} doc={<InvoiceDoc d={d} invoice={modal.invoice} />} />}
      {modal?.kind === 'many' && <DocModal title={modal.title} onClose={() => setModal(null)} doc={<>{modal.docs.map((doc, i) => <div key={i} style={{ breakAfter: 'page', pageBreakAfter: 'always' }}>{doc}</div>)}</>} />}
      {modal?.kind === 'receipt' && <DocModal title={`Receipt #${modal.payment.receipt_number}`} onClose={() => setModal(null)} doc={<ReceiptDoc d={d} payment={modal.payment} />} />}
    </Shell>
  );
}

function BeltChip({ belt }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, color: C.soft, marginTop: 4 }}>
      <BeltStrip belt={belt} width={64} />
      {belt || 'White'}
    </span>
  );
}

// How each attendance mark reads for parents. Excused = told the dojang ahead
// (gets a make-up); unexcused = absent without notice (no make-up).
function attLook(st) {
  if (st === 'present' || st === 'double') return { t: 'present', bg: C.greenTint, c: C.green };
  if (st === 'private') return { t: 'private lesson', bg: C.greenTint, c: C.green };
  if (st === 'excused') return { t: 'excused', bg: C.amberTint, c: C.amber };
  if (st === 'vacation') return { t: 'vacation', bg: 'var(--dp-canvas)', c: C.soft };
  return { t: 'unexcused', bg: C.redTint, c: C.red };
}

function Kids({ d, onAbsence, onTest }) {
  const today = todayISO();
  if (!d.students.length) return <div style={card}>No active students on this account.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
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
                <div style={{ fontSize: 20, fontWeight: 700 }}>{s.name}</div>
                <BeltChip belt={s.belt} />
              </div>
              {onHold && <span style={{ fontSize: 13, fontWeight: 600, background: C.amberTint, color: C.amber, borderRadius: 999, padding: '3px 10px' }}>On a break</span>}
            </div>

            <Section title="Classes">
              {plan.length ? (
                plan.map((c, i) => (
                  <div key={i} style={{ fontSize: 16 }}>
                    <b style={{ fontWeight: 600 }}>{WD[c.weekday]}</b> {ftime(c.start_time)}–{ftime(c.end_time)} <ClassChip name={c.class_name} size={14} style={{ marginLeft: 4 }} />
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 16 }}>{splitClasses(s.class_name).join(', ') || '—'}</div>
              )}
            </Section>

            <Section title="Progress">
              {hasTapes(s.belt) && (
                <div style={{ marginBottom: 6 }}>
                  <TapeTracker student={s} earned={tapes} editable={false} size="lg" />
                  <div style={{ fontSize: 16, color: C.faint, marginTop: 2 }}>Curriculum tapes for {s.belt} ({tapes.size} of {TAPE_COUNT})</div>
                </div>
              )}
              <div style={{ fontSize: 16 }}>
                <b style={{ fontWeight: 600 }}>{n}</b> of {MIN_CLASSES} classes since {s.last_test_date ? `the last test (${fdate(s.last_test_date)})` : 'starting'}
              </div>
              <div style={{ height: 8, background: C.line, borderRadius: 4, margin: '6px 0 6px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (n / MIN_CLASSES) * 100)}%`, height: '100%', background: n >= MIN_CLASSES ? C.green : C.ink }} />
              </div>
              <TestStatus d={d} s={s} n={n} tapes={tapes.size} onHold={onHold} onTest={onTest} />
            </Section>

            <Section title="Recent classes">
              {recent.length === 0 ? (
                <div style={{ fontSize: 16, color: C.faint }}>No classes recorded yet.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {recent.map((a, i) => (
                    <span key={i} title={a.class_name} style={{ fontSize: 13, padding: '4px 9px', borderRadius: 8, background: attLook(a.status).bg, color: attLook(a.status).c }}>
                      {fday(a.date)} · {attLook(a.status).t}
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
  const box = (bg, c) => ({ fontSize: 15, padding: '12px 14px', borderRadius: 10, background: bg, color: c, marginTop: 8, lineHeight: 1.45 });
  if (entry)
    return (
      <div style={box(C.greenTint, C.green)} data-testid="test-registered">
        <CircleCheck size={16} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 4 }} /><b>Registered for the belt test</b> on {fdate(nt.date)} — testing for {entry.target_belt}.
        <div style={{ fontSize: 13, opacity: 0.9 }}>The test fee invoice is under Billing.</div>
      </div>
    );
  if (!nt)
    return <div style={{ fontSize: 13, color: C.soft }}>{missing ? `${missing} to be eligible for the next belt test.` : 'Eligible for the next belt test.'} The next test date will be posted soon.</div>;
  if (INVITE_ONLY.includes(s.belt))
    return <div style={{ fontSize: 13, color: C.soft }}>Next belt test: {fdate(nt.date)}. Black belt testing is by invitation from Master Daisy.</div>;
  if (missing)
    return (
      <div style={{ fontSize: 13, color: C.soft }} data-testid="test-need">
        <b style={{ color: C.ink, fontWeight: 600 }}>{missing}</b> to be eligible for the belt test on {fdate(nt.date)}.
        <div style={{ fontSize: 13, color: C.faint }}>To test: {MIN_CLASSES} classes since the last test{hasTapes(s.belt) ? ` and all ${TAPE_COUNT} curriculum tapes` : ''}.</div>
      </div>
    );
  const open = nt.date > today && !onHold;
  return (
    <div style={box(C.greenTint, C.green)} data-testid="test-ready">
      <CircleCheck size={16} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 4 }} /><b>Ready for the belt test on {fdate(nt.date)}</b> — {MIN_CLASSES}+ classes{hasTapes(s.belt) ? ` · all ${TAPE_COUNT} tapes` : ''}
      {open ? (
        <button style={{ ...primary, marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onTest(s)}>
          <Award size={16} /> Register for the belt test
        </button>
      ) : (
        <div style={{ fontSize: 13, marginTop: 4 }}>{onHold ? 'Registration opens again when the membership is active.' : 'Registration for this test has closed.'}</div>
      )}
    </div>
  );
}

function TestModal({ d, student, onClose, onDone }) {
  const preview = usePreview();
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
    if (preview) return setError(PREVIEW_MSG);
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
      <div style={card} data-testid="calendars">
        <h2 style={h2}><CalendarDays size={17} /> Monthly calendar</h2>
        {!d.calendars?.length && <p style={{ fontSize: 16, color: C.faint, margin: 0 }}>This month's calendar will be posted here.</p>}
        {(d.calendars || []).map((m) => (
          <div key={m.month} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <b style={{ flex: 1, fontSize: 15 }}>{m.title || monthName(m.month)}</b>
              <button style={{ ...btn, padding: '4px 10px', fontSize: 13 }} onClick={() => openData(m.file_data)}><Download size={14} /> Open</button>
            </div>
            {m.mime.startsWith('image/') ? (
              <img src={m.file_data} alt={m.title || monthName(m.month)} style={{ width: '100%', borderRadius: 8, border: `1px solid ${C.line}`, cursor: 'zoom-in' }} onClick={() => openData(m.file_data)} />
            ) : (
              <div style={{ fontSize: 16, color: C.soft }}>PDF — tap Open to view or save.</div>
            )}
          </div>
        ))}
      </div>
      <div>
        <div style={card} data-testid="closures">
          <h2 style={h2}><CalendarX size={17} /> Dojang closed (next 3 months)</h2>
          {!closed.length && <p style={{ fontSize: 16, color: C.faint, margin: 0 }}>No closures in the next 3 months.</p>}
          {closed.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 16, padding: '5px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <span style={{ width: 112, flexShrink: 0, fontWeight: 600 }}>{fday(c.date)}</span>
              <span style={{ color: C.soft }}>{c.class_name ? `No ${c.class_name} class` : 'No classes'}{c.reason ? ` — ${c.reason}` : ''}</span>
            </div>
          ))}
          <p style={{ fontSize: 13, color: C.faint, margin: '8px 0 0' }}>Make-ups aren't given for statutory holidays. If a closure leaves your child below the guaranteed number of classes, the dojang will arrange make-ups.</p>
        </div>
        <div style={card}>
          <h2 style={h2}><Award size={17} /> Key dates</h2>
          {d.next_test && (
            <div style={{ fontSize: 16, padding: '4px 0' }}>
              <b style={{ fontWeight: 600 }}>{fday(d.next_test.date)}</b> · Belt test (no regular classes)
              <div style={{ fontSize: 13, color: C.faint }}>Planned date — it may change. We'll let you know if it does.</div>
            </div>
          )}
          {events.map((e) => (
            <div key={e.id} style={{ fontSize: 16, padding: '4px 0' }}><b style={{ fontWeight: 600 }}>{fday(e.start_date)}</b> · {e.title}</div>
          ))}
          {!d.next_test && !events.length && <p style={{ fontSize: 16, color: C.faint, margin: 0 }}>Nothing scheduled yet.</p>}
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
  const pill = (bg, c) => ({ fontSize: 15, padding: '10px 12px', borderRadius: 10, background: bg, color: c, marginBottom: 6, lineHeight: 1.4 });
  return (
    <Section title="Make-up classes">
      <div data-testid="makeups">
        {booked.map((m) => (
          <div key={m.id} style={pill(C.bg, C.ink)}>
            <b>Booked:</b> {fday(m.reservation_date)}{m.reservation_class_name ? ` · ${m.reservation_class_name}` : ''}
            <div style={{ fontSize: 13, opacity: 0.85 }}>for the class missed on {fday(m.absence_date)}</div>
          </div>
        ))}
        {open.map((m) => (
          <div key={m.id} style={pill(C.amberTint, C.amber)}>
            <b>1 make-up available</b> — use by {fday(m.expiration_date || m.tentative_expiration)}
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              for {fday(m.absence_date)}{m.class_name ? ` (${m.class_name})` : ''}
              {m.conditional && m.paid_period_end ? ` · only while the membership is active (paid to ${fday(m.paid_period_end)})` : ''}
            </div>
          </div>
        ))}
        {done.map((m) => (
          <div key={m.id} style={{ fontSize: 16, color: C.soft, padding: '2px 0' }}>
            <Check size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4, color: C.green }} />Made up {m.reservation_date ? fday(m.reservation_date) : ''} for {fday(m.absence_date)}
          </div>
        ))}
        {open.length > 0 && <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>To book a make-up, ask at the front desk or email the dojang (Contact tab).</div>}
      </div>
    </Section>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.soft, margin: '0 0 6px' }}>{title}</h3>
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 600 }}>Invoice #{i.invoice_number}</b> <span style={{ color: C.soft }}>· {fdate(i.invoice_date)}</span>
                {i.notes && <div style={{ fontSize: 16, color: C.faint }}>{i.notes}</div>}
                <div style={{ fontSize: 13, color: (i.due_date || i.invoice_date) < today ? C.red : C.soft }}>Due {fdate(i.due_date || i.invoice_date)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{money(i.balance)}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button style={{ ...btn, padding: '8px 14px', fontSize: 16 }} onClick={() => onDoc({ kind: 'invoice', invoice: i })}>View</button>
                  {i.pay_token && <PLink style={{ ...primary, padding: '8px 14px', fontSize: 16 }} href={`/pay/${i.pay_token}`}>Pay now</PLink>}
                </div>
              </div>
            </Row>
          ))
        )}
        {Number(f.credit) > 0.004 && <p style={{ fontSize: 16, color: C.green, marginBottom: 0 }}>Credit on your account: {money(f.credit)}</p>}
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
            <div style={{ textAlign: 'right', fontSize: 16 }}>
              {s.billing_exempt ? (
                <span style={{ color: C.soft }}>No tuition</span>
              ) : (
                <>
                  {s.tuition != null && <div style={{ fontWeight: 600 }}>{money(s.tuition)} <span style={{ fontWeight: 400, color: C.faint, fontSize: 13 }}>+ GST</span></div>}
                  {(s.billing_start_date || s.enroll_date) && <div style={{ fontSize: 16, color: C.soft }}>Next: {fdate(nextDueDate(s, today))}</div>}
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
              {k.is_default && <span style={{ fontSize: 13, fontWeight: 600, color: C.green, background: C.greenTint, borderRadius: 999, padding: '3px 10px' }}>Used for tuition</span>}
            </Row>
          ))
        ) : (
          <p style={{ margin: '0 0 10px', fontSize: 16, color: C.soft }}>{f.payment_type === 'manual' ? 'You pay tuition by invoice (debit or cash).' : 'No card saved yet.'}</p>
        )}
        {f.card_link_token && (
          <PLink style={{ ...btn, marginTop: 10 }} href={`/card/${f.card_link_token}`}>{(d.cards || []).length ? 'Add or change cards' : 'Save a card'}</PLink>
        )}
        {(d.cards || []).length > 0 && <p style={{ fontSize: 16, color: C.faint, margin: '8px 0 0' }}>You can add cards and choose which one is used for tuition. A card can be removed only when you have another card saved.</p>}
      </div>

      <DocList
        testid="receipts"
        title="Payments & receipts"
        icon={Receipt}
        noun="receipt"
        empty="No payments yet."
        items={[...d.payments].sort((a, b) => (a.payment_date < b.payment_date ? 1 : a.payment_date > b.payment_date ? -1 : Number(b.receipt_number) - Number(a.receipt_number)))}
        dateOf={(p) => p.payment_date}
        row={(p) => (
          <DocRow
            key={p.id}
            date={fdate(p.payment_date)}
            sub={`Receipt #${p.receipt_number}${p.method ? ` · ${p.method}` : ''}`}
            amount={money(p.amount)}
            action="Receipt"
            onOpen={() => onDoc({ kind: 'receipt', payment: p })}
          />
        )}
        onDownload={(list, label) => onDoc({ kind: 'many', title: `Receipts — ${label}`, docs: list.map((p) => <ReceiptDoc key={p.id} d={d} payment={p} />) })}
      />

      {paid.length > 0 && (
        <DocList
          testid="past-invoices"
          title="Past invoices"
          icon={FileText}
          noun="invoice"
          items={[...paid].sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : a.invoice_date > b.invoice_date ? -1 : Number(b.invoice_number) - Number(a.invoice_number)))}
          dateOf={(i) => i.invoice_date}
          row={(i) => (
            <DocRow
              key={i.id}
              date={fdate(i.invoice_date)}
              sub={`Invoice #${i.invoice_number} · Paid`}
              amount={money(i.total)}
              action="View"
              onOpen={() => onDoc({ kind: 'invoice', invoice: i })}
            />
          )}
          onDownload={(list, label) => onDoc({ kind: 'many', title: `Invoices — ${label}`, docs: list.map((i) => <InvoiceDoc key={i.id} d={d} invoice={i} />) })}
        />
      )}
    </>
  );
}
const h2 = { fontSize: 20, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 };

// Receipts / invoices, newest first. The latest few show; past that, pick
// dates (or a year) to list older ones and download them all as one PDF.
const RECENT = 5;
// Full-width date box (iOS shows an empty date input as a blank grey pill otherwise).
const dateInput = { ...input, display: 'block', width: '100%', minWidth: 0, marginTop: 4, padding: '8px 10px', background: '#fff', color: C.ink, WebkitAppearance: 'none', appearance: 'none', textAlign: 'left' };
const MAX_DOWNLOAD = 60;
function DocList({ testid, title, icon: Icon, noun, empty, items, dateOf, row, onDownload }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const years = [...new Set(items.map((x) => (dateOf(x) || '').slice(0, 4)).filter(Boolean))];
  const many = items.length > RECENT;
  const ranged = many && (from || to);
  const inRange = items.filter((x) => (!from || dateOf(x) >= from) && (!to || dateOf(x) <= to));
  const shown = ranged ? inRange : items.slice(0, RECENT);
  const label = from && to && from.slice(0, 4) === to.slice(0, 4) && from.endsWith('-01-01') && to.endsWith('-12-31') ? from.slice(0, 4) : `${from ? fdate(from) : 'start'} – ${to ? fdate(to) : 'today'}`;
  const pickYear = (y) => { setFrom(`${y}-01-01`); setTo(`${y}-12-31`); };
  const chip = (on) => ({ ...btn, padding: '6px 12px', fontSize: 15, ...(on ? { background: C.ink, color: '#fff', border: `1px solid ${C.ink}` } : {}) });
  return (
    <div style={card} data-testid={testid}>
      <h2 style={h2}><Icon size={17} /> {title}</h2>
      {items.length === 0 && <p style={{ margin: 0, color: C.soft, fontSize: 16 }}>{empty}</p>}
      {many && (
        <div style={{ background: C.bg, borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}>
          <div style={{ fontSize: 15, color: C.soft, marginBottom: 6 }}>{ranged ? `${inRange.length} ${noun}${inRange.length === 1 ? '' : 's'} from ${label}` : `Showing the latest ${RECENT} of ${items.length}. Pick dates to find older ${noun}s or download them.`}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {years.map((y) => <button key={y} type="button" style={chip(from === `${y}-01-01` && to === `${y}-12-31`)} onClick={() => pickYear(y)}>{y}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, maxWidth: 420 }}>
            <label style={{ fontSize: 14, color: C.soft, minWidth: 0 }}>From<input type="date" aria-label={`${title} from`} style={dateInput} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
            <label style={{ fontSize: 14, color: C.soft, minWidth: 0 }}>To<input type="date" aria-label={`${title} to`} style={dateInput} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          {ranged && <button type="button" style={{ ...btn, padding: '7px 12px', fontSize: 15, marginTop: 8 }} onClick={() => { setFrom(''); setTo(''); }}>Latest only</button>}
          {ranged && inRange.length > 0 && (
            <button type="button" style={{ ...primary, marginTop: 10 }} disabled={inRange.length > MAX_DOWNLOAD} onClick={() => onDownload([...inRange].reverse(), label)}>
              <Download size={16} /> Download {inRange.length} {noun}{inRange.length === 1 ? '' : 's'} (PDF)
            </button>
          )}
          {ranged && inRange.length > MAX_DOWNLOAD && <div style={{ fontSize: 14, color: C.red, marginTop: 6 }}>Up to {MAX_DOWNLOAD} at a time — please pick a shorter range.</div>}
        </div>
      )}
      {ranged && !inRange.length && <p style={{ margin: '8px 0 0', color: C.soft, fontSize: 16 }}>No {noun}s in these dates.</p>}
      {shown.map(row)}
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: `1px solid ${C.line}`, fontSize: 16 }}>{children}</div>;
}

// One receipt / invoice line: date and details on the left, amount and button on the right.
function DocRow({ date, sub, amount, action, onOpen }) {
  return (
    <Row>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{date}</div>
        <div style={{ fontSize: 14, color: C.soft, lineHeight: 1.35 }}>{sub}</div>
      </div>
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{amount}</div>
      <button style={{ ...btn, padding: '8px 12px', fontSize: 15, flexShrink: 0 }} onClick={onOpen}>{action}</button>
    </Row>
  );
}

function Events({ d, onSignUp }) {
  const narrow = useNarrow();
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: narrow ? 'column' : 'row' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{e.title}</div>
            <div style={{ fontSize: 16, color: C.soft, marginTop: 2 }}>
              {fday(e.start_date)}
              {e.end_date && e.end_date !== e.start_date ? ` – ${fday(e.end_date)}` : ''}
              {e.start_time ? ` · ${ftime(e.start_time)}${e.end_time ? `–${ftime(e.end_time)}` : ''}` : ''}
            </div>
            {e.location && <div style={{ fontSize: 16, color: C.soft }}>{e.location}</div>}
          </div>
          {narrow ? (
            <div style={{ fontSize: 15, color: C.soft, background: C.bg, borderRadius: 8, padding: '6px 10px', alignSelf: 'stretch' }}>
              <b style={{ color: C.ink, fontSize: 16 }}>{Number(e.price) > 0 ? money(e.price) : 'Free'}</b>
              {Number(e.price) > 0 ? ` per student${e.taxable ? ' + GST' : ''}` : ''}
              {e.allow_guests ? ` · Guests ${Number(e.guest_price) > 0 ? `${money(e.guest_price)} each` : 'free'}` : ''}
            </div>
          ) : (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 700 }}>{Number(e.price) > 0 ? money(e.price) : 'Free'}</div>
              {Number(e.price) > 0 && <div style={{ fontSize: 13, color: C.faint }}>per student{e.taxable ? ' + GST' : ''}</div>}
              {e.allow_guests && <div style={{ fontSize: 13, color: C.faint }}>Guests {Number(e.guest_price) > 0 ? `${money(e.guest_price)} each` : 'free'}</div>}
            </div>
          )}
        </div>
        {e.description && <p style={{ fontSize: 16, whiteSpace: 'pre-wrap', margin: '10px 0 0' }}>{e.description}</p>}
        {e.signup_deadline && <p style={{ fontSize: 13, color: closed ? C.red : C.soft, margin: '8px 0 0' }}>{closed ? 'Sign-up closed' : `Sign up by ${fdate(e.signup_deadline)}`}</p>}
        {names.length > 0 && <p style={{ fontSize: 16, color: C.green, margin: '8px 0 0' }}><Check size={15} style={{ verticalAlign: -2 }} /> Signed up: {names.join(', ')}{myGuests.length ? ` + guests: ${myGuests.map((g) => g.name).join(', ')}` : ''}</p>}
        {answer && e.question && <p style={{ fontSize: 16, color: C.soft, margin: '4px 0 0' }}>{e.question} <b style={{ color: C.ink }}>{answer}</b></p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {canAdd && <button style={{ ...primary, ...(narrow ? { flex: 1 } : {}) }} onClick={() => onSignUp(e)}>Sign up</button>}
          {!canAdd && canGuests && <button style={btn} onClick={() => onSignUp(e)}>Add guests</button>}
          {owing.map((i) => (
            <PLink key={i.id} style={btn} href={`/pay/${i.pay_token}`}>Pay {money(i.balance)}</PLink>
          ))}
        </div>
      </div>
    );
  });
}

function Modal({ title, children, onClose, footer, maxWidth = 480, sticky = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,18,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 10px', zIndex: 50, overflowY: 'auto' }} onClick={sticky ? undefined : onClose}>
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
  const preview = usePreview();
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
    if (preview) return setError(PREVIEW_MSG);
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
        {WD.map((w) => <div key={w} style={{ fontSize: 13, color: C.faint, padding: '2px 0' }}>{w}</div>)}
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
                fontSize: 16,
                fontFamily: 'inherit',
                border: on ? `2px solid ${C.ink}` : `1px solid ${ok ? C.line : 'transparent'}`,
                background: on ? C.amberTint : ok ? '#fff' : 'transparent',
                color: ok ? C.ink : told.has(iso) ? C.green : C.faint,
                fontWeight: ok ? 600 : 400,
                cursor: ok ? 'pointer' : 'default',
              }}
            >
              {told.has(iso) ? '✓' : dt.getDate()}
              {dt.getDate() === 1 || iso === cells[0] ? <div style={{ fontSize: 12.5, fontWeight: 400, color: C.faint }}>{dt.toLocaleDateString('en-CA', { month: 'short' })}</div> : null}
            </button>
          );
        })}
      </div>
      {days.length === 0 && <p style={{ fontSize: 13, color: 'var(--dp-warning)' }}>No upcoming classes found for {first}. Please email the dojang instead.</p>}
      {chosen && (
        <p style={{ fontSize: 16, margin: '10px 0 0' }}>
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
      {onHold && <p style={{ fontSize: 13, color: 'var(--dp-warning)', margin: '8px 0 0' }}>{first}'s membership is on a break right now, so make-up classes can't be booked until it's active again.</p>}
      {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
      <div style={{ marginTop: 14, padding: '10px 12px', background: C.bg, borderRadius: 8, fontSize: 16, color: C.soft, lineHeight: 1.5 }}>
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
  const preview = usePreview();
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
    if (preview) return setError(PREVIEW_MSG);
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
          {guests.length < 10 && <button type="button" style={{ ...btn, padding: '6px 12px', fontSize: 16 }} onClick={() => setGuests((x) => [...x, ''])}>+ Add guest</button>}
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
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px', margin: '14px 0 4px', background: C.bg }} data-testid="signature">
          <div style={{ fontSize: 15, fontWeight: 600 }}>Parent / guardian signature <span style={{ color: C.red }} aria-hidden="true">*</span></div>
          {event.signature_text && <p style={{ fontSize: 16, color: C.soft, whiteSpace: 'pre-wrap', margin: '6px 0 10px', lineHeight: 1.5 }}>{event.signature_text}</p>}
          <SignaturePad onChange={setSignature} />
          <label style={label}>Full name of parent / guardian *</label>
          <input style={input} value={signer} onChange={(e) => setSigner(e.target.value)} maxLength={120} aria-label="Full name of parent or guardian" />
          <div style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Signed {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })} for {pickedKids.map((k) => k.name).join(', ')}.</div>
        </div>
      )}
      {sub > 0 && <p style={{ fontSize: 13, color: C.soft }}>An invoice for {money(total)} (incl. GST) is added to your account. You can pay it right away or later under Billing.</p>}
      {error && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

function Contact({ d, onSent }) {
  const preview = usePreview();
  const b = d.business || {};
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setError('');
    if (message.trim().length < 2) return setError('Write your message first.');
    if (preview) return setError(PREVIEW_MSG);
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
        <p style={{ fontSize: 16, color: C.faint, marginBottom: 0 }}>We'll reply to {d.family?.email?.split(/[,;\s]+/)[0] || 'your email'}.</p>
      </div>
      <div style={{ ...card, fontSize: 16, color: C.soft }}>
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
            <h2 style={{ fontSize: 18, margin: 0, flex: 1 }}>{title}</h2>
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
