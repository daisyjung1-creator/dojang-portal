import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, CalendarDays, Wallet, Clock, Award, Cake, UserPlus, Banknote, StickyNote, CircleCheck, Mail, Users } from 'lucide-react';
import { DEFAULT_MEETINGS, isMeetingDay, time12, meetingMessage, whatsappLink } from '../../lib/meetings';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { todayISO, addDaysISO, currentCycleStart, nextDueDate, billingAnchor, daysUntil } from '../../lib/billingDates';
import { isBillable, isManual } from '../../lib/tuitionBilling';
import { inClass } from '../../lib/classes';
import { money, formatDate } from '../../lib/invoiceUtils';
import { fetchAll, loadSettings, queueEmail } from '../invoices/api';
import { joinEmails } from '../../components/ConfirmSend';
import { absenceAlerts, trackingStart, NOT_SEEN_DAYS } from '../../lib/attendanceStats';
import InvoicePreview from '../invoices/InvoicePreview';
import PaymentNoticeModal from '../invoices/PaymentNotice';
import { GREEN, BLUE, RED, AMBER, PURPLE, GREY, smallBtn, linkBtn, Tag, Card, Empty } from './homeUi';
import BeltProgressCard from './BeltProgressCard';
import MeetingsCard from './MeetingsCard';
import Modal from '../../components/Modal';
import { guaranteeShortfalls } from '../../lib/guarantee';

// Home: what matters today at a glance — today's classes, who is billed
// today, overdue invoices, a calendar with notes, and anything coming up
// (belt test, trials, grants ending, birthdays, CRA remittance…).

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ym = (iso) => iso.slice(0, 7);
const monthStart = (m) => `${m}-01`;
const monthEnd = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
};
const shiftMonth = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const weekdayOf = (iso) => new Date(iso + 'T00:00:00').getDay();
const longDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
const t12 = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Billing dates (cycle starts) of one student between from and to.
function billingDatesBetween(s, from, to) {
  const anchor = billingAnchor(s);
  if (!anchor) return [];
  const out = [];
  let d = currentCycleStart(s, from);
  if (d < from) d = nextDueDate(s, from);
  for (let i = 0; i < 40 && d <= to; i++) {
    if (d >= anchor && d >= from) out.push(d);
    d = nextDueDate(s, d);
  }
  return out;
}

export default function HomePage({ setActiveTab }) {
  const today = todayISO();
  const [month, setMonth] = useState(ym(today));
  const [day, setDay] = useState(today);
  const [d, setD] = useState(null); // loaded data
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [general, setGeneral] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showShort, setShowShort] = useState(false);
  const [showDeclined, setShowDeclined] = useState(false);
  const [notice, setNotice] = useState(null); // overdue invoice being emailed
  const [noticeAt, setNoticeAt] = useState({}); // invoice id -> overdue_notice_at

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const from = addDaysISO(today, -45);
    const to = addDaysISO(today, 75);
    const far = addDaysISO(today, 200); // calendar can look ahead a few months
    const [
      { data: students },
      { data: customers },
      { data: schedule },
      { data: att },
      { data: cancels },
      { data: open },
      { data: lines },
      { data: tests },
      { data: tryouts },
      { data: leads },
      { data: makeups },
      { data: slips },
      { data: regs },
      { data: expiring },
      { data: toText },
      { data: emps },
      { data: n },
      s,
      { data: recent },
      { data: mkPeriod },
    ] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('customers').select('id, name, email, payment_type, active, card_profile_code, card_last4, card_expiry, card_declined_at, card_decline_message, card_declined_invoice_id, card_decline_emailed_at, card_decline_reminded_at, card_legacy_rb_pending'),
      supabase.from('class_schedule').select('*').eq('active', true).order('start_time'),
      supabase.from('attendance').select('student_id, class_name, status').eq('date', today),
      supabase.from('class_cancellations').select('*').gte('date', from).lte('date', far),
      fetchAll(() => supabase.from('invoice_summary').select('id, invoice_number, customer_id, customer_name, invoice_date, due_date, total, balance, voided, status').gt('balance', 0)),
      fetchAll(() => supabase.from('invoice_lines').select('invoice_id, student_id, cycle_start, line_kind').gte('cycle_start', from).lte('cycle_start', to)),
      supabase.from('belt_tests').select('*').gte('test_date', today).order('test_date').limit(1),
      supabase.from('tryouts').select('*').gte('date', from).lte('date', far).order('date'),
      supabase.from('leads').select('id, student_name, guardian_name, phone, inquiry_date, status').eq('status', 'New Inquiry'),
      supabase.from('makeup_records').select('*').eq('status', 'reserved').gte('reservation_date', today),
      supabase.from('payslips').select('employee_id, pay_date, cpp, ei, tax, emailed_at').gte('pay_date', addDaysISO(today, -70)),
      supabase.from('registrations').select('id, kids').eq('status', 'new'),
      supabase.from('makeup_records').select('student_id, absence_date, expiration_date').eq('status', 'pending').gte('expiration_date', today).lte('expiration_date', addDaysISO(today, 7)).order('expiration_date'),
      supabase.from('tryouts').select('student_name, date').eq('confirmation_sent', false).is('guardian_email', null).not('guardian_phone', 'is', null).gte('date', today).neq('status', 'Cancelled'),
      supabase.from('payroll_employees').select('id, name, email'),
      supabase.from('dashboard_notes').select('*').order('created_at'),
      loadSettings(),
      fetchAll(() => supabase.from('attendance').select('student_id, date, class_name, status').gte('date', addDaysISO(today, -90))),
      supabase.from('makeup_records').select('student_id, absence_date, status').in('status', ['reserved', 'completed']).gte('absence_date', from),
    ]);
    // Status of the tuition invoices for nearby billing dates.
    const tl = (lines || []).filter((l) => l.line_kind === 'tuition');
    const ids = [...new Set(tl.map((l) => l.invoice_id))];
    let invs = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await supabase.from('invoice_summary').select('id, invoice_number, status, balance, voided').in('id', ids.slice(i, i + 150));
      invs = invs.concat(data || []);
    }
    const invById = Object.fromEntries(invs.map((x) => [x.id, x]));
    // Today's automatic tuition run (saved cards), if it has run.
    const { data: autoRun } = await supabase.from('auto_billing_runs').select('*').eq('run_date', today).maybeSingle();
    const cycleInv = {};
    tl.forEach((l) => {
      const inv = invById[l.invoice_id];
      if (inv && !inv.voided) cycleInv[`${l.student_id}|${l.cycle_start}`] = inv;
    });
    let entries = [];
    if (tests && tests[0]) {
      const { data } = await supabase.from('belt_test_entries').select('*').eq('test_id', tests[0].id);
      entries = data || [];
    }
    setSettings(s);
    setNotes(n || []);
    setD({
      autoRun: autoRun || null,
      students: (students || []).filter((x) => (x.status || 'active') !== 'withdrawn'),
      custById: Object.fromEntries((customers || []).map((c) => [c.id, c])),
      schedule: schedule || [],
      att: att || [],
      cancels: cancels || [],
      open: (open || []).filter((i) => !i.voided),
      cycleInv,
      test: tests && tests[0],
      entries,
      tryouts: tryouts || [],
      leads: leads || [],
      makeups: makeups || [],
      slips: slips || [],
      regs: regs || [],
      expiring: expiring || [],
      toText: toText || [],
      empById: Object.fromEntries((emps || []).map((e) => [e.id, e])),
      trackStart: trackingStart(recent || []),
      mkPeriod: mkPeriod || [],
      recordsBy: (recent || []).reduce((m, r) => ((m[r.student_id] = m[r.student_id] || []).push(r), m), {}),
    });
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const billing = useMemo(() => {
    if (!d) return {};
    const lo = addDaysISO(today, -45), hi = addDaysISO(today, 75);
    const from = monthStart(month) < lo ? monthStart(month) : lo;
    const to = monthEnd(month) > hi ? monthEnd(month) : hi;
    const byDay = {};
    d.students.filter(isBillable).forEach((s) => {
      billingDatesBetween(s, from, to).forEach((date) => (byDay[date] = byDay[date] || []).push(s));
    });
    return byDay;
  }, [d, month]);

  const shortfalls = useMemo(() => (d ? guaranteeShortfalls({ students: d.students, schedule: d.schedule, cancels: d.cancels, makeups: d.mkPeriod, today }) : []), [d]);

  const studentById = useMemo(() => Object.fromEntries((d?.students || []).map((s) => [s.id, s])), [d]);

  const overdue = useMemo(
    () => (d ? d.open.filter((i) => (i.due_date || i.invoice_date) < today).sort((a, b) => ((a.due_date || a.invoice_date) < (b.due_date || b.invoice_date) ? -1 : 1)) : []),
    [d]
  );
  const overdueTotal = overdue.reduce((t, i) => t + Number(i.balance || 0), 0);

  useEffect(() => {
    const ids = overdue.map((i) => i.id);
    if (!ids.length) return;
    supabase.from('invoices').select('id, overdue_notice_at').in('id', ids).then(({ data }) => setNoticeAt(Object.fromEntries((data || []).map((x) => [x.id, x.overdue_notice_at]))));
  }, [overdue]);

  const classesOn = (date) => {
    if (!d) return [];
    const wd = weekdayOf(date);
    return d.schedule
      .filter((c) => c.weekday === wd)
      .map((c) => ({ ...c, cancelled: d.cancels.some((x) => x.date === date && (!x.class_name || x.class_name === c.class_name)) }));
  };

  const dayItems = (date) => {
    if (!d) return {};
    return {
      billing: billing[date] || [],
      trials: d.tryouts.filter((t) => t.date === date && t.status !== 'No-show'),
      test: d.test && d.test.test_date === date ? d.test : null,
      cancels: d.cancels.filter((c) => c.date === date),
      notes: notes.filter((n) => n.note_date === date),
      makeups: d.makeups.filter((m) => m.reservation_date === date),
    };
  };

  const headsUp = useMemo(() => {
    if (!d) return [];
    const out = [];
    // Belt test
    if (d.test) {
      const days = daysUntil(d.test.test_date);
      const forms = d.entries.filter((e) => !e.form_received).length;
      const notice = d.entries.filter((e) => !e.notice_sent_at).length;
      out.push({
        icon: Award,
        tab: 'testing',
        tone: days <= 7 ? 'warn' : 'info',
        title: `${d.test.title || 'Belt testing'} — ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} (${shortDay(d.test.test_date)})`,
        detail: `${d.entries.length} testing${forms ? ` · ${forms} form${forms === 1 ? '' : 's'} not received` : ' · all forms in'}${notice ? ` · ${notice} notice${notice === 1 ? '' : 's'} not sent` : ''}`,
      });
    }
    // Trials in the next 7 days
    const trials = d.tryouts.filter((t) => t.date >= today && t.date <= addDaysISO(today, 7) && (t.status || 'Scheduled') === 'Scheduled');
    if (trials.length)
      out.push({
        icon: CalendarDays,
        tab: 'tryouts',
        tone: trials.some((t) => t.date === today) ? 'warn' : 'info',
        title: `${trials.length} trial class${trials.length === 1 ? '' : 'es'} this week`,
        detail: trials.map((t) => `${t.student_name} (${t.date === today ? 'today' : shortDay(t.date)}${t.time ? ' ' + t.time.slice(0, 5) : ''})`).join(', '),
      });
    // Absent a lot / not in class for a week
    const { frequent, notSeen } = absenceAlerts(d.students, d.recordsBy, { schedule: d.schedule, cancellations: d.cancels, today, start: d.trackStart });
    if (frequent.length || notSeen.length)
      out.push({
        icon: AlertTriangle,
        tab: 'attendance',
        tone: 'warn',
        title: [frequent.length && `${frequent.length} below their classes`, notSeen.length && `${notSeen.length} not in class for ${NOT_SEEN_DAYS}+ days`].filter(Boolean).join(' · '),
        detail: frequent.length
          ? frequent.slice(0, 6).map((x) => `${x.s.name} (${x.came}/${x.expected})`).join(', ') + (frequent.length > 6 ? '…' : '')
          : notSeen.slice(0, 6).map((x) => x.s.name).join(', ') + (notSeen.length > 6 ? '…' : ''),
      });
    // Families who registered online, waiting to be enrolled
    if (d.regs.length) {
      const names = d.regs.flatMap((r) => (r.kids || []).map((k) => `${k.first || ''} ${k.last || ''}`.trim()));
      out.push({
        icon: UserPlus,
        tab: 'register',
        tone: 'warn',
        title: `${d.regs.length} online registration${d.regs.length === 1 ? '' : 's'} to review`,
        detail: names.slice(0, 5).join(', ') + (names.length > 5 ? '…' : '') + ' — confirm classes and tuition in Enrollment.',
      });
    }
    // Trials booked online with a phone only: text them the confirmation
    if (d.toText.length)
      out.push({
        icon: CalendarDays,
        tab: 'tryouts',
        tone: 'warn',
        title: `${d.toText.length} trial booking${d.toText.length === 1 ? '' : 's'} to confirm by text`,
        detail: d.toText.map((t) => `${t.student_name} (${shortDay(t.date)})`).join(', ') + ' — tap Text in Trials.',
      });
    // Make-ups expire 30 days after the missed class (Part 8.1)
    if (d.expiring.length) {
      const nameOf = (id) => d.students.find((x) => x.id === id)?.name || '?';
      out.push({
        icon: CalendarDays,
        tab: 'attendance',
        tone: 'warn',
        title: `${d.expiring.length} make-up class${d.expiring.length === 1 ? '' : 'es'} expire this week`,
        detail: d.expiring.slice(0, 6).map((m) => `${nameOf(m.student_id)} (${shortDay(m.expiration_date)})`).join(', ') + (d.expiring.length > 6 ? '…' : '') + ' — not booked yet.',
      });
    }
    // Memberships ending (cancellation requests)
    const ending = d.students.filter((x) => x.billing_end_date && (x.status || 'active') !== 'withdrawn' && daysUntil(x.billing_end_date) <= 14);
    if (ending.length)
      out.push({
        icon: CalendarDays,
        tab: 'students',
        tone: 'info',
        title: `${ending.length} membership${ending.length === 1 ? '' : 's'} ending soon`,
        detail: ending.map((x) => `${x.name} (last day ${shortDay(x.billing_end_date)})`).join(', '),
      });
    // New leads to call back
    if (d.leads.length)
      out.push({
        icon: UserPlus,
        tab: 'leads',
        tone: 'info',
        title: `${d.leads.length} new inquir${d.leads.length === 1 ? 'y' : 'ies'} to follow up`,
        detail: d.leads.slice(0, 5).map((l) => l.student_name || l.guardian_name).join(', ') + (d.leads.length > 5 ? '…' : ''),
      });
    // Grants ending
    const subs = d.students.filter((s) => s.subsidy && s.subsidy_end_date && daysUntil(s.subsidy_end_date) <= 30);
    if (subs.length)
      out.push({
        icon: AlertTriangle,
        tab: 'students',
        tone: 'warn',
        title: `${subs.length} sports grant${subs.length === 1 ? '' : 's'} ending or ended`,
        detail: subs.map((s) => `${s.name} (${daysUntil(s.subsidy_end_date) < 0 ? 'ended' : 'ends'} ${shortDay(s.subsidy_end_date)}${s.subsidy_reminded_at ? ', emailed' : ''})`).join(', '),
      });
    // Birthdays in the next 7 days
    const bdays = d.students
      .filter((s) => s.dob)
      .map((s) => {
        for (let i = 0; i <= 7; i++) {
          const date = addDaysISO(today, i);
          if (date.slice(5) === String(s.dob).slice(5)) return { s, date, age: Number(date.slice(0, 4)) - Number(String(s.dob).slice(0, 4)) };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (bdays.length)
      out.push({
        icon: Cake,
        tab: 'students',
        tone: bdays.some((b) => b.date === today) ? 'good' : 'info',
        title: `Birthday${bdays.length === 1 ? '' : 's'} this week`,
        detail: bdays.map((b) => `${b.s.name} turns ${b.age} ${b.date === today ? 'today 🎉' : shortDay(b.date)}`).join(', '),
      });
    // CRA payroll remittance (due the 15th of the month after the pay date)
    const byMonth = {};
    d.slips.forEach((s) => {
      const m = ym(s.pay_date);
      byMonth[m] = r2((byMonth[m] || 0) + Number(s.cpp || 0) * 2 + Number(s.ei || 0) * 2.4 + Number(s.tax || 0));
    });
    Object.entries(byMonth).forEach(([m, amt]) => {
      const due = `${shiftMonth(m, 1)}-15`;
      const left = daysUntil(due);
      if (left >= 0 && left <= 25)
        out.push({ icon: Banknote, tab: 'payroll', tone: left <= 5 ? 'warn' : 'info', title: `CRA payroll remittance ${money(amt)} due ${shortDay(due)}`, detail: `For payslips paid in ${new Date(m + '-01T00:00:00').toLocaleDateString('en-CA', { month: 'long' })} (CPP ×2 + EI ×2.4 + income tax).` });
    });
    const latest = d.slips.map((s) => s.pay_date).sort().pop();
    const unsent = d.slips.filter((s) => s.pay_date === latest && !s.emailed_at);
    if (unsent.length)
      out.push({ icon: Mail, tab: 'payroll', tone: 'info', title: `${unsent.length} payslip${unsent.length === 1 ? '' : 's'} not emailed yet`, detail: `${unsent.map((s) => d.empById[s.employee_id]?.name || '?').join(', ')} — pay date ${shortDay(latest)}` });
    return out;
  }, [d, notes, settings]);

  // ── Notes ────────────────────────────────────────────────────────────────
  async function addNote(date, text, reset) {
    const body = text.trim();
    if (!body) return;
    const { data, error } = await supabase.from('dashboard_notes').insert({ note_date: date, body }).select().single();
    if (!error && data) setNotes((p) => [...p, data]);
    reset('');
  }
  async function toggleNote(n) {
    await supabase.from('dashboard_notes').update({ done: !n.done }).eq('id', n.id);
    setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, done: !n.done } : x)));
  }
  async function deleteNote(n) {
    await supabase.from('dashboard_notes').delete().eq('id', n.id);
    setNotes((p) => p.filter((x) => x.id !== n.id));
  }

  if (!d) return <p style={{ color: '#5B5F56', fontSize: 14 }}>Loading…</p>;

  const todayClasses = classesOn(today);
  const billToday = billing[today] || [];
  const billSoon = Object.entries(billing)
    .filter(([date]) => date > today && date <= addDaysISO(today, 7))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const sel = dayItems(day);

  // Things to do or know about today, most urgent first.
  const todayItems = [];
  const tomorrow = addDaysISO(today, 1);
  (settings?.meetings?.length ? settings.meetings : DEFAULT_MEETINGS).forEach((m) => {
    if (isMeetingDay(m, today)) todayItems.push({ tone: 'warn', text: `${m.name} today at ${time12(m.time)} — post the reminder to the WhatsApp group`, href: whatsappLink(meetingMessage(m, today, today)), label: 'Post to WhatsApp' });
    if (isMeetingDay(m, tomorrow)) todayItems.push({ tone: 'info', text: `${m.name} tomorrow at ${time12(m.time)} — post the reminder to the WhatsApp group`, href: whatsappLink(meetingMessage(m, tomorrow, today)), label: 'Post to WhatsApp' });
  });
  if (d.test && d.test.test_date === today) todayItems.push({ tone: 'warn', text: `${d.test.title || 'Belt testing'} today`, tab: 'testing', label: 'Testing' });
  if (d.test && d.test.test_date === tomorrow) todayItems.push({ tone: 'info', text: `${d.test.title || 'Belt testing'} tomorrow`, tab: 'testing', label: 'Testing' });
  const trialsToday = d.tryouts.filter((t) => t.date === today && (t.status || 'Scheduled') === 'Scheduled');
  if (trialsToday.length) todayItems.push({ tone: 'info', text: `Trial class${trialsToday.length === 1 ? '' : 'es'}: ${trialsToday.map((t) => `${t.student_name}${t.time ? ' ' + t12(t.time) : ''}${t.class_name ? ` (${t.class_name})` : ''}`).join(', ')}`, tab: 'tryouts', label: 'Trials' });
  if (d.toText.length) todayItems.push({ tone: 'warn', text: `Text ${d.toText.length} trial confirmation${d.toText.length === 1 ? '' : 's'} (phone only)`, tab: 'tryouts', label: 'Trials' });
  if (billToday.length) todayItems.push({ tone: 'info', text: `Billing today: ${billToday.map((x) => x.name).join(', ')}`, tab: 'billing', label: 'Billing' });
  if (d.regs.length) todayItems.push({ tone: 'warn', text: `${d.regs.length} online registration${d.regs.length === 1 ? '' : 's'} to review`, tab: 'register', label: 'Enrollment' });
  const mkToday = d.makeups.filter((m) => m.reservation_date === today);
  if (mkToday.length) todayItems.push({ tone: 'info', text: `Makeup today: ${mkToday.map((m) => `${studentById[m.student_id]?.name || '?'} (${m.reservation_class_name})`).join(', ')}`, tab: 'attendance', label: 'Attendance' });
  const expToday = d.expiring.filter((m) => m.expiration_date === today);
  if (expToday.length) todayItems.push({ tone: 'warn', text: `Makeup expires today: ${expToday.map((m) => studentById[m.student_id]?.name || '?').join(', ')}`, tab: 'attendance', label: 'Attendance' });
  // Subsidy applications still waiting for approval 30+ days after applying.
  const waitingSubs = d.students.filter((x) => x.subsidy && x.subsidy_status === 'pending' && x.subsidy_applied_on && x.subsidy_applied_on <= addDaysISO(today, -30));
  if (waitingSubs.length)
    todayItems.push({
      tone: 'warn',
      text: `Subsidy waiting 30+ days for approval: ${waitingSubs.map((x) => `${x.name} (${(x.subsidy_name || 'Subsidy').trim()}, applied ${new Date(x.subsidy_applied_on + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})`).join(', ')} — check with the family`,
      tab: 'students',
      label: 'Students',
    });
  // Saved cards (online payments): today's automatic tuition, declined charges and cards expiring soon.
  if (d.autoRun?.results) {
    const ok = d.autoRun.results.charged || [];
    const bad = [...(d.autoRun.results.problems || []), ...(d.autoRun.results.error ? [{ customer: 'Run', error: d.autoRun.results.error }] : [])];
    if (ok.length || bad.length) {
      const sum = ok.reduce((n, x) => n + Number(x.amount || 0), 0);
      todayItems.push({
        tone: bad.length ? 'warn' : 'good',
        text: `Automatic tuition today: ${ok.length} charged${ok.length ? ` ($${sum.toFixed(2)})` : ''}${bad.length ? ` · ${bad.length} not charged — ${bad.map((x) => `${x.customer}${x.number ? ` #${x.number}` : ''}: ${x.declined || x.error}`).join(', ')}` : ''}`,
        tab: 'invoices',
        label: 'Invoices',
      });
    }
  }
  {
    const cards = Object.values(d.custById).filter((c) => c.card_profile_code && c.active !== false);
    const declined = cards.filter((c) => c.card_declined_at);
    const pendingRb = cards.filter((c) => c.card_legacy_rb_pending);
    if (pendingRb.length)
      todayItems.push({ tone: 'warn', text: `Card saved online — close the old TD Recurring Billing, then tick it on the family: ${pendingRb.map((c) => c.name).join(', ')}`, tab: 'customers', label: 'Families' });
    if (declined.length) {
      const toEmail = declined.filter((c) => !c.card_decline_emailed_at).length;
      const toRemind = declined.filter((c) => reminderDue(c, today)).length;
      const todo = [toEmail ? `${toEmail} to email` : '', toRemind ? `${toRemind} reminder${toRemind === 1 ? '' : 's'} due` : ''].filter(Boolean).join(', ');
      todayItems.push({
        tone: 'warn',
        text: `Saved card declined: ${declined.map((c) => `${c.name} (···${c.card_last4 || ''})`).join(', ')}${todo ? ` — ${todo}` : ''}`,
        onClick: () => setShowDeclined(true),
        label: 'Review',
      });
    }
    const now = new Date();
    const ym = (y, m) => y * 12 + m;
    const soon = cards.filter((c) => {
      const m = /^(\d{2})\/(\d{2})$/.exec(c.card_expiry || '');
      if (!m) return false;
      const exp = ym(2000 + Number(m[2]), Number(m[1]) - 1);
      const cur = ym(now.getFullYear(), now.getMonth());
      return exp >= cur && exp <= cur + 1;
    });
    if (soon.length)
      todayItems.push({ tone: 'info', text: `Saved card expires this or next month — send them a pay link to save a new card: ${soon.map((c) => `${c.name} (···${c.card_last4 || ''}, ${c.card_expiry})`).join(', ')}`, tab: 'customers', label: 'Families' });
  }
  // Closures leave someone below the guaranteed classes (8/12/16) this or next service period.
  if (shortfalls.length)
    todayItems.push({
      tone: 'warn',
      text: `${shortfalls.length} student${shortfalls.length === 1 ? ' is' : 's are'} short of guaranteed classes because of closures — book make-ups: ${shortfalls.slice(0, 6).map((x) => `${x.student.name} (${x.short} short)`).join(', ')}${shortfalls.length > 6 ? '…' : ''}`,
      onClick: () => setShowShort(true),
      label: 'Details',
    });
  const bdayToday = d.students.filter((x) => x.dob && String(x.dob).slice(5) === today.slice(5));
  if (bdayToday.length) todayItems.push({ tone: 'good', text: `Birthday today 🎉 ${bdayToday.map((x) => x.name).join(', ')}`, tab: 'students', label: 'Students' });
  notes.filter((n) => n.note_date === today && !n.done).forEach((n) => todayItems.push({ tone: 'info', text: `Note: ${n.body}` }));
  todayItems.sort((a, b) => (a.tone === 'warn' ? 0 : 1) - (b.tone === 'warn' ? 0 : 1));
  const generalNotes = notes.filter((n) => !n.note_date);
  const presentIn = (c) => new Set(d.att.filter((a) => a.class_name === c && a.status === 'present').map((a) => a.student_id)).size;

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{longDay(today)}</h1>
          <p style={styles.subtitle}>What needs your attention today</p>
        </div>
        <button className="dp-btn" onClick={load}>Refresh</button>
      </div>

      {/* Today: what to do / what's happening */}
      {showDeclined && <DeclinedModal cards={Object.values(d.custById).filter((c) => c.card_profile_code && c.card_declined_at)} today={today} onClose={() => setShowDeclined(false)} onChanged={load} />}
      {showShort && <ShortfallModal list={shortfalls} onClose={() => setShowShort(false)} onAttendance={() => setActiveTab('attendance')} />}
      <TodayPanel items={todayItems} classesLine={todayClasses.length ? `${todayClasses.filter((c) => !c.cancelled).length} classes · ${t12(todayClasses[0].start_time)} – ${t12(todayClasses[todayClasses.length - 1].end_time)}${todayClasses.some((c) => c.cancelled) ? ` · ${todayClasses.filter((c) => c.cancelled).length} cancelled` : ''}` : 'No classes today'} setActiveTab={setActiveTab} />

      {/* At a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Metric label="Billing today" value={billToday.length} sub={billToday.length ? money(billToday.reduce((t, s) => t + Number(s.tuition || 0), 0)) + ' tuition' : 'Nobody today'} onClick={() => setActiveTab('billing')} />
        <Metric label="Overdue" value={money(overdueTotal)} sub={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`} tone={overdue.length ? 'bad' : 'good'} onClick={() => document.getElementById('home-overdue')?.scrollIntoView({ behavior: 'smooth' })} />
        <Metric label="Active students" value={d.students.length} sub={`${d.students.filter(isBillable).length} billed monthly`} onClick={() => setActiveTab('students')} />
      </div>

      <div className="dp-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 1fr)', gap: 18, alignItems: 'start' }}>
        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card title="Today's classes" icon={Clock} action={<button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('attendance')}>Attendance</button>}>
            {todayClasses.length === 0 ? (
              <Empty>No classes on the schedule today.</Empty>
            ) : (
              <table className="dp-table">
                <tbody>
                  {todayClasses.map((c) => {
                    const roster = d.students.filter((s) => inClass(s, c.class_name)).length;
                    const here = presentIn(c.class_name);
                    const mk = d.makeups.filter((m) => m.reservation_date === today && m.reservation_class_name === c.class_name).length;
                    return (
                      <tr key={c.id} style={c.cancelled ? { opacity: 0.55 } : undefined}>
                        <td style={{ whiteSpace: 'nowrap', width: 150, fontSize: 13, color: '#5B5F56' }}>{t12(c.start_time)} – {t12(c.end_time)}</td>
                        <td style={{ fontWeight: 500 }}>
                          {c.class_name}
                          {c.cancelled && <Tag c={RED}>Cancelled</Tag>}
                          {mk > 0 && <Tag c={PURPLE}>{mk} makeup</Tag>}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {here > 0 ? <span style={{ color: '#2A5A30' }}>{here} / {roster} here</span> : <span style={{ color: '#8A8D84' }}>{roster} student{roster === 1 ? '' : 's'}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <BeltProgressCard students={d.students} schedule={d.schedule} settings={settings} today={today} setActiveTab={setActiveTab} onSaved={setSettings} />

          <Card title="Billing today" icon={Wallet} action={<button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('billing')}>Billing</button>}>
            {billToday.length === 0 ? (
              <Empty>Nobody's billing date is today.</Empty>
            ) : (
              <BillTable list={billToday} date={today} d={d} onOpen={setPreviewId} />
            )}
            {billSoon.length > 0 && (
              <div style={{ padding: '8px 14px 12px', fontSize: 12.5, color: '#5B5F56', borderTop: '1px solid #F1EFE7' }}>
                <b style={{ fontWeight: 500 }}>Next 7 days:</b>{' '}
                {billSoon.map(([date, list]) => (
                  <button key={date} className="dp-link" style={linkBtn} onClick={() => { setMonth(ym(date)); setDay(date); }}>
                    {shortDay(date)} ({list.length})
                  </button>
                ))}
              </div>
            )}
          </Card>

          <div id="home-overdue">
            <Card title={`Overdue${overdue.length ? ` — ${money(overdueTotal)}` : ''}`} icon={AlertTriangle} tone={overdue.length ? 'bad' : null} action={<button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('invoices')}>Invoices</button>}>
              {overdue.length === 0 ? (
                <Empty>Nothing overdue. 👍</Empty>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  <table className="dp-table">
                    <thead>
                      <tr><th>Family</th><th>Invoice</th><th>Due</th><th style={{ textAlign: 'right' }}>Balance</th><th></th></tr>
                    </thead>
                    <tbody>
                      {overdue.map((i) => {
                        const due = i.due_date || i.invoice_date;
                        const late = -daysUntil(due);
                        return (
                          <tr key={i.id} className="dp-row" style={{ cursor: 'pointer' }} onClick={() => setPreviewId(i.id)}>
                            <td style={{ fontWeight: 500 }}>{i.customer_name}{d.custById[i.customer_id] && !isManual(d.custById[i.customer_id]) && <Tag c={BLUE}>Card</Tag>}</td>
                            <td style={{ fontSize: 13 }}>#{i.invoice_number}</td>
                            <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(due)} <span style={{ color: late > 30 ? '#9A2B2B' : '#854F0B' }}>· {late}d late</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 500, color: '#9A2B2B' }}>{money(i.balance)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                              <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 11.5 }} title="Email the overdue notice (classes may be suspended — agreement 7.3)" onClick={() => setNotice(i)}>
                                <Mail size={12} /> {noticeAt[i.id] ? 'Again' : 'Notice'}
                              </button>
                              {noticeAt[i.id] && <div style={{ fontSize: 10.5, color: '#8A8D84', marginTop: 2 }}>Sent {shortDate(noticeAt[i.id])}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <MeetingsCard settings={settings} today={today} onSaved={setSettings} />
          {headsUp.length > 0 && (
            <Card title="Coming up" icon={CircleCheck}>
              <div style={{ padding: '4px 0' }}>
                {headsUp.map((h, i) => {
                  const Icon = h.icon;
                  const col = h.tone === 'warn' ? '#854F0B' : h.tone === 'good' ? '#2A5A30' : '#20241F';
                  return (
                    <button key={i} onClick={() => setActiveTab(h.tab)} style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: i < headsUp.length - 1 ? '1px solid #F1EFE7' : 'none', padding: '9px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Icon size={16} color={col} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: col }}>{h.title}</div>
                        {h.detail && <div style={{ fontSize: 12.5, color: '#5B5F56', marginTop: 1 }}>{h.detail}</div>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Calendar" icon={CalendarDays}>
            <Calendar month={month} setMonth={setMonth} day={day} setDay={setDay} today={today} dayItems={dayItems} classesOn={classesOn} />
            <div style={{ borderTop: '1px solid #EDEAE0', padding: '12px 14px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>{day === today ? 'Today' : longDay(day)}</div>
              {sel.test && <Line icon={Award} c="#9A2B2B">{sel.test.title || 'Belt testing'}</Line>}
              {sel.cancels.map((c) => <Line key={c.id} icon={AlertTriangle} c="#9A2B2B">{c.class_name || 'All classes'} cancelled{c.reason ? ` — ${c.reason}` : ''}</Line>)}
              {sel.trials.map((t) => <Line key={t.id} icon={CalendarDays} c="#1E4566">Trial: {t.student_name}{t.time ? ` · ${t.time.slice(0, 5)}` : ''}{t.class_name ? ` · ${t.class_name}` : ''}</Line>)}
              {sel.makeups.map((m) => <Line key={m.id} icon={CalendarDays} c="#4B3A86">Makeup: {studentById[m.student_id]?.name || '?'} · {m.reservation_class_name}</Line>)}
              {sel.billing.length > 0 && <Line icon={Wallet} c="#2A5A30">Billing: {sel.billing.map((s) => s.name).join(', ')}</Line>}
              {!sel.test && !sel.cancels.length && !sel.trials.length && !sel.makeups.length && !sel.billing.length && !sel.notes.length && (
                <div style={{ fontSize: 12.5, color: '#8A8D84', marginBottom: 6 }}>{classesOn(day).length ? `${classesOn(day).length} classes · nothing else` : 'No classes'}</div>
              )}
              <NoteList notes={sel.notes} onToggle={toggleNote} onDelete={deleteNote} />
              <NoteInput value={draft} onChange={setDraft} onAdd={() => addNote(day, draft, setDraft)} placeholder={`Add a note for ${day === today ? 'today' : shortDay(day)}…`} />
            </div>
          </Card>

          <Card title="Notes" icon={StickyNote}>
            <div style={{ padding: '10px 14px 12px' }}>
              {generalNotes.length === 0 && <div style={{ fontSize: 12.5, color: '#8A8D84', marginBottom: 6 }}>Things to remember that aren't tied to a day.</div>}
              <NoteList notes={generalNotes} onToggle={toggleNote} onDelete={deleteNote} />
              <NoteInput value={general} onChange={setGeneral} onAdd={() => addNote(null, general, setGeneral)} placeholder="Add a note…" />
            </div>
          </Card>
        </div>
      </div>

      {notice && (
        <PaymentNoticeModal
          inv={notice}
          cust={d.custById[notice.customer_id]}
          sentAt={noticeAt[notice.id]}
          today={today}
          onClose={() => setNotice(null)}
          onSent={(at) => { setNoticeAt((m) => ({ ...m, [notice.id]: at })); setNotice(null); }}
        />
      )}
      {previewId && <InvoicePreview invoiceId={previewId} settings={settings} onClose={() => setPreviewId(null)} onPay={() => setActiveTab('payments')} onChanged={load} />}
    </>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────
const md = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

// Declined saved card: a reminder is due 3 days after the first email if still unpaid.
const REMIND_AFTER_DAYS = 3;
function reminderDue(c, today) {
  if (!c.card_decline_emailed_at || c.card_decline_reminded_at) return false;
  const sent = new Date(c.card_decline_emailed_at).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
  return addDaysISO(sent, REMIND_AFTER_DAYS) <= today;
}
const shortDate = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Edmonton' }) : '');

function declineEmail(c, inv, reminder) {
  const amount = money(inv?.balance ?? 0);
  const num = inv?.invoice_number ? ` (invoice #${inv.invoice_number})` : '';
  const card = `the card ending in ${c.card_last4 || '····'}`;
  const sign = 'Thank you,\nMaster Daisy\nChampion Hankook Taekwondo';
  if (reminder)
    return {
      subject: 'Reminder: tuition payment still outstanding — Champion Hankook Taekwondo',
      message: `Hi ${c.name},\n\nJust a friendly reminder that your tuition payment of ${amount}${num} is still outstanding — ${card} was declined on ${shortDate(c.card_declined_at)}.\n\nYou can pay securely online with another card using the button below, and choose to use it for future tuition at the same time.\n\nIf you've already taken care of this, thank you — please disregard this email. Questions? Just reply here.\n\n${sign}`,
    };
  return {
    subject: "Tuition payment didn't go through — Champion Hankook Taekwondo",
    message: `Hi ${c.name},\n\nWe tried to process your tuition payment of ${amount}${num} on ${shortDate(c.card_declined_at)} using ${card}, but it was declined by the bank${c.card_decline_message ? ` ("${c.card_decline_message}")` : ''}.\n\nThis often happens when a card has expired, been replaced, or reached its limit.\n\nYou can pay securely online with another card using the button below. When you pay, you can also choose to use the new card for future tuition, so you won't need to do anything next month.\n\nIf you've already sorted this out, or would prefer to pay at the front desk, please just reply to this email. Payment is due within 7 days.\n\n${sign}`,
  };
}

// Declined saved cards: review and email the parent (first email, then one reminder).
function DeclinedModal({ cards, today, onClose, onChanged }) {
  const [invs, setInvs] = useState({});
  const [edit, setEdit] = useState(null); // { c, reminder, subject, message }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const ids = cards.map((c) => c.card_declined_invoice_id).filter(Boolean);
    if (!ids.length) return;
    supabase.from('invoice_summary').select('id, invoice_number, balance, customer_email').in('id', ids).then(({ data }) => setInvs(Object.fromEntries((data || []).map((x) => [x.id, x]))));
  }, []);
  function open(c, reminder) {
    setEdit({ c, reminder, extra: '', ...declineEmail(c, invs[c.card_declined_invoice_id], reminder) });
  }
  async function send() {
    const { c, reminder, subject, message } = edit;
    const inv = invs[c.card_declined_invoice_id];
    const list = joinEmails(c.email || inv?.customer_email || '', edit.extra || '');
    const bad = list.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!list.length) return setMsg(`No email address for ${c.name}.`);
    if (bad.length) return setMsg(`Check the email address: ${bad.join(', ')}`);
    const to = list.join(', ');
    setBusy(true);
    try {
      // Sent as the invoice email: the PDF is attached and the "Pay now" button is under the message.
      await queueEmail('invoice', to, { invoice_id: c.card_declined_invoice_id, subject, message });
      await supabase.from('customers').update(reminder ? { card_decline_reminded_at: new Date().toISOString() } : { card_decline_emailed_at: new Date().toISOString() }).eq('id', c.id);
      setMsg(`${reminder ? 'Reminder' : 'Email'} sent to ${c.name}.`);
      setEdit(null);
      onChanged();
    } catch (e) {
      setMsg('Could not send: ' + e.message);
    }
    setBusy(false);
  }
  async function dismiss(c) {
    await supabase.from('customers').update({ card_declined_at: null, card_decline_message: null, card_declined_invoice_id: null, card_decline_emailed_at: null, card_decline_reminded_at: null }).eq('id', c.id);
    onChanged();
  }
  if (edit)
    return (
      <Modal title={`${edit.reminder ? 'Reminder' : 'Email'} to ${edit.c.name}`} maxWidth={640} onClose={() => setEdit(null)} footer={<><button className="dp-btn" onClick={() => setEdit(null)}>Back</button><button className="dp-btn dp-btn-primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send email'}</button></>}>
        <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 8px' }}>To: {edit.c.email || invs[edit.c.card_declined_invoice_id]?.customer_email || '—'}</p>
        <label style={{ fontSize: 12, color: '#5B5F56' }}>Also send to <span style={{ color: '#8A8D84' }}>— this email only, not saved to the family</span></label>
        <input className="dp-input" style={{ width: '100%', marginBottom: 10 }} placeholder="e.g. dad@example.com (separate several with commas)" value={edit.extra} onChange={(e) => setEdit({ ...edit, extra: e.target.value })} />
        <label style={{ fontSize: 12, color: '#5B5F56' }}>Subject</label>
        <input className="dp-input" style={{ width: '100%', marginBottom: 10 }} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
        <label style={{ fontSize: 12, color: '#5B5F56' }}>Message</label>
        <textarea className="dp-input" style={{ width: '100%', minHeight: 300, fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5 }} value={edit.message} onChange={(e) => setEdit({ ...edit, message: e.target.value })} />
        <p style={{ fontSize: 12, color: '#8A8D84', margin: '8px 0 0' }}>The invoice PDF is attached and a "Pay now by credit card" button is added under the message.</p>
        {msg && <p style={{ fontSize: 12.5, color: '#9A2B2B' }}>{msg}</p>}
      </Modal>
    );
  return (
    <Modal title="Saved card declined" maxWidth={760} onClose={onClose} footer={<button className="dp-btn" onClick={onClose}>Close</button>}>
      <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 10px' }}>Review and email the parent. The email has a Pay now link where they can pay with another card and make it their card for future tuition. A reminder is suggested {REMIND_AFTER_DAYS} days after the first email if it's still unpaid. Dismiss once it's sorted out another way.</p>
      {msg && <p style={{ fontSize: 12.5, color: '#2A5A30' }}>{msg}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className="dp-table">
          <thead>
            <tr><th>Family</th><th>Declined</th><th>Invoice</th><th>Email</th><th></th></tr>
          </thead>
          <tbody>
            {cards.map((c) => {
              const inv = invs[c.card_declined_invoice_id];
              const unpaid = inv ? Number(inv.balance) > 0.004 : true;
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}<div style={{ fontSize: 11.5, color: '#8A8D84', fontWeight: 400 }}>···{c.card_last4} · {c.card_decline_message || 'declined'}</div></td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{shortDate(c.card_declined_at)}</td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{inv ? <>#{inv.invoice_number} · {unpaid ? money(inv.balance) : <span style={{ color: '#2A5A30' }}>paid</span>}</> : '—'}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {c.card_decline_emailed_at ? `Sent ${shortDate(c.card_decline_emailed_at)}` : <span style={{ color: '#854F0B' }}>Not sent</span>}
                    {c.card_decline_reminded_at && <div>Reminder {shortDate(c.card_decline_reminded_at)}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {c.card_declined_invoice_id && unpaid && !c.card_decline_emailed_at && <button className="dp-btn dp-btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => open(c, false)}>Email parent</button>}
                    {c.card_declined_invoice_id && unpaid && c.card_decline_emailed_at && !c.card_decline_reminded_at && (
                      <button className={`dp-btn${reminderDue(c, today) ? ' dp-btn-primary' : ''}`} style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => open(c, true)}>Send reminder</button>
                    )}{' '}
                    <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => dismiss(c)}>Dismiss</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function ShortfallModal({ list, onClose, onAttendance }) {
  return (
    <Modal title="Short of guaranteed classes" maxWidth={720} onClose={onClose} footer={<><button className="dp-btn" onClick={onClose}>Close</button><button className="dp-btn dp-btn-primary" onClick={() => { onClose(); onAttendance(); }}>Go to Attendance</button></>}>
      <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 10px' }}>
        The agreement guarantees 8 / 12 / 16 classes per monthly service period (2 / 3 / 4 a week). Closures (Day off) leave these students with fewer of their regular classes, so the Dojang owes make-ups. Only closures count — classes a student missed on their own don't. Make-ups already booked for a closed day count.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="dp-table">
          <thead>
            <tr><th>Student</th><th>Service period</th><th style={{ textAlign: 'right' }}>Guaranteed</th><th style={{ textAlign: 'right' }}>Classes left</th><th>Closed</th><th style={{ textAlign: 'right' }}>Booked</th><th style={{ textAlign: 'right' }}>Short</th></tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.student.id + x.start}>
                <td style={{ fontWeight: 500 }}>{x.student.name}<div style={{ fontSize: 11.5, color: '#8A8D84', fontWeight: 400 }}>{x.student.classes_per_week}x/week · {x.student.class_name}</div></td>
                <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{md(x.start)} – {md(x.end)}</td>
                <td style={{ textAlign: 'right' }}>{x.need}</td>
                <td style={{ textAlign: 'right' }}>{x.available}</td>
                <td style={{ fontSize: 12 }}>{x.lostDates.map(md).join(', ')}</td>
                <td style={{ textAlign: 'right' }}>{x.booked || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#9A2B2B' }}>{x.short}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function TodayPanel({ items, classesLine, setActiveTab }) {
  return (
    <div style={{ ...styles.card, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 14px', borderBottom: items.length ? '1px solid #EDEAE0' : 'none', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Today</span>
        <span style={{ fontSize: 12.5, color: '#8A8D84' }}>{classesLine}</span>
        {!items.length && <span style={{ fontSize: 13, color: '#2A5A30', marginLeft: 'auto' }}>Nothing extra today 👍</span>}
      </div>
      {items.map((it, i) => {
        const col = it.tone === 'warn' ? '#854F0B' : it.tone === 'good' ? '#2A5A30' : '#20241F';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < items.length - 1 ? '1px solid #F1EFE7' : 'none', flexWrap: 'wrap' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: it.tone === 'warn' ? '#D9962B' : it.tone === 'good' ? '#4F9A58' : '#B9B6AA', flexShrink: 0 }} />
            <span style={{ flex: '1 1 220px', fontSize: 13.5, color: col, fontWeight: it.tone === 'warn' ? 500 : 400 }}>{it.text}</span>
            {it.href ? (
              <a className="dp-btn" style={{ padding: '3px 10px', fontSize: 12, textDecoration: 'none', background: '#E8F5EC', borderColor: '#BFDCC3', color: '#1F6B3A' }} href={it.href} target="_blank" rel="noreferrer">{it.label}</a>
            ) : it.onClick ? (
              <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={it.onClick}>{it.label}</button>
            ) : it.tab ? (
              <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setActiveTab(it.tab)}>{it.label}</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value, sub, tone, onClick }) {
  const color = tone === 'bad' ? '#9A2B2B' : tone === 'good' ? '#2A5A30' : '#20241F';
  return (
    <button onClick={onClick} style={{ ...styles.metricCard, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={{ ...styles.metricValue, color }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#8A8D84', margin: '4px 0 0' }}>{sub}</p>}
    </button>
  );
}

function Line({ icon: Icon, c, children }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 13, marginBottom: 5, color: c }}>
      <Icon size={13} style={{ marginTop: 3, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}

function BillTable({ list, date, d, onOpen }) {
  return (
    <table className="dp-table">
      <tbody>
        {list.map((s) => {
          const fam = d.custById[s.customer_id];
          const inv = d.cycleInv[`${s.id}|${date}`];
          const card = fam && !isManual(fam);
          let state;
          if (!inv) state = <Tag c={AMBER}>Not invoiced yet</Tag>;
          else if (Number(inv.balance) <= 0) state = <Tag c={GREEN}>Paid</Tag>;
          else state = <Tag c={RED}>Unpaid {money(inv.balance)}</Tag>;
          return (
            <tr key={s.id} className={inv ? 'dp-row' : undefined} style={inv ? { cursor: 'pointer' } : undefined} onClick={() => inv && onOpen(inv.id)}>
              <td style={{ fontWeight: 500 }}>
                {s.name}
                {fam && fam.name !== s.name && <span style={{ fontWeight: 400, color: '#8A8D84', fontSize: 12.5 }}> · {fam.name}</span>}
              </td>
              <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{card ? <Tag c={BLUE}>Card (pre-auth)</Tag> : <Tag c={GREY}>Pays manually</Tag>}</td>
              <td style={{ fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(s.tuition)}{s.plan === '3 Months' ? ' / 3 mo' : ''}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{state}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Calendar({ month, setMonth, day, setDay, today, dayItems, classesOn }) {
  const first = monthStart(month);
  const last = monthEnd(month);
  const lead = weekdayOf(first);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let x = first; x <= last; x = addDaysISO(x, 1)) cells.push(x);
  const title = new Date(first + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  return (
    <div style={{ padding: '10px 12px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <button className="dp-btn" style={{ padding: 4 }} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15} /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 500 }}>{title}</div>
        {month !== ym(today) && <button className="dp-btn" style={{ ...smallBtn, marginRight: 6 }} onClick={() => { setMonth(ym(today)); setDay(today); }}>Today</button>}
        <button className="dp-btn" style={{ padding: 4 }} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={15} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ fontSize: 11, color: '#8A8D84', textAlign: 'center', padding: '2px 0' }}>{w}</div>)}
        {cells.map((x, i) => {
          if (!x) return <div key={'e' + i} />;
          const it = dayItems(x);
          const isSel = x === day, isToday = x === today;
          const noClass = classesOn(x).length === 0;
          const dots = [
            it.test && '#9A2B2B',
            it.cancels.length && '#9A2B2B',
            it.trials.length && '#1E4566',
            it.notes.length && '#C58A12',
          ].filter(Boolean);
          return (
            <button
              key={x}
              onClick={() => setDay(x)}
              title={[it.test && 'Belt test', it.billing.length && `${it.billing.length} billing`, it.trials.length && `${it.trials.length} trial`, it.notes.length && `${it.notes.length} note`, it.cancels.length && 'cancelled'].filter(Boolean).join(' · ')}
              style={{
                minHeight: 46,
                border: isSel ? '1.5px solid #20241F' : '1px solid #EDEAE0',
                borderRadius: 6,
                background: isToday ? '#20241F' : it.test ? '#FBEAEA' : noClass ? '#FAF9F5' : '#fff',
                color: isToday ? '#fff' : noClass ? '#A7AAA1' : '#20241F',
                cursor: 'pointer',
                padding: '3px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: isToday || isSel ? 600 : 400 }}>{Number(x.slice(8))}</span>
              {it.billing.length > 0 && <span style={{ fontSize: 9.5, color: isToday ? '#BFDCC3' : '#2A5A30', lineHeight: 1.2 }}>${it.billing.length}</span>}
              <span style={{ display: 'flex', gap: 2, marginTop: 'auto' }}>
                {dots.map((c, k) => <span key={k} style={{ width: 5, height: 5, borderRadius: 3, background: c }} />)}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 11, color: '#8A8D84' }}>
        <span><span style={{ color: '#2A5A30' }}>$3</span> = 3 billing</span>
        <Legend c="#9A2B2B">Test / cancelled</Legend>
        <Legend c="#1E4566">Trial</Legend>
        <Legend c="#C58A12">Note</Legend>
      </div>
    </div>
  );
}
const Legend = ({ c, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: c }} />{children}</span>
);

function NoteList({ notes, onToggle, onDelete }) {
  if (!notes.length) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      {notes.map((n) => (
        <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', borderBottom: '1px solid #F6F4EE' }}>
          <input type="checkbox" checked={n.done} onChange={() => onToggle(n)} style={{ marginTop: 3 }} />
          <span style={{ flex: 1, fontSize: 13, whiteSpace: 'pre-wrap', textDecoration: n.done ? 'line-through' : 'none', color: n.done ? '#A7AAA1' : '#20241F' }}>{n.body}</span>
          <button className="dp-btn" style={{ padding: 3, border: 'none' }} aria-label="Delete note" onClick={() => onDelete(n)}><Trash2 size={13} color="#8A8D84" /></button>
        </div>
      ))}
    </div>
  );
}

function NoteInput({ value, onChange, onAdd, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <input
        className="dp-input"
        style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdd()}
      />
      <button className="dp-btn" style={{ padding: '4px 8px' }} aria-label="Add note" disabled={!value.trim()} onClick={onAdd}><Plus size={14} /></button>
    </div>
  );
}
