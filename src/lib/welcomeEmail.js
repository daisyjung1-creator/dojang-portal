// Fills the welcome-email template (Invoice Settings → Welcome email) for one student.
import { splitClasses } from './classes';
import { billingAnchor, getBillingDay, nextDueDate, todayISO } from './billingDates';

const longDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const money = (n) => '$' + (Number(n) || 0).toFixed(2);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clock = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')}`;
};
const ampm = (t) => (Number(String(t).split(':')[0]) >= 12 ? 'pm' : 'am');
const timeRange = (a, b) => `${clock(a)}–${clock(b)} ${ampm(b)}`;
const joinDays = (d) => (d.length > 1 ? d.slice(0, -1).join(', ') + ' & ' + d[d.length - 1] : d[0] || '');

// "Beginner — Tue & Thu, 4:30–5:20 pm" for each class, using the student's own
// class days (class_days like "2:Beginner"; none set = every day of the class).
export function classTimes(student, schedule) {
  const names = splitClasses(student.class_name);
  if (!schedule || !schedule.length) return names;
  const days = Array.isArray(student.class_days) && student.class_days.length ? student.class_days : null;
  return names.map((name) => {
    const rows = schedule.filter((r) => r.class_name === name && (!days || days.includes(`${r.weekday}:${name}`)));
    if (!rows.length) return name;
    // Group days that share the same time.
    const byTime = {};
    rows.forEach((r) => {
      const k = timeRange(r.start_time, r.end_time);
      (byTime[k] = byTime[k] || []).push(DAY[r.weekday]);
    });
    return `${name} — ${Object.entries(byTime).map(([t, d]) => `${joinDays(d)}, ${t}`).join('; ')}`;
  });
}

const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

export function fillWelcomeTemplate(tpl, student, settings = {}) {
  const s = student;
  const rate = Number(settings.gst_rate ?? 5);
  const per = s.plan === '3 Months' ? 'every 3 months' : 'per month';
  const tuition = Number(s.tuition)
    ? `${money(s.tuition)} + GST (${rate}%) = ${money(Number(s.tuition) * (1 + rate / 100))} ${per}`
    : '(to be confirmed)';
  const day = billingAnchor(s) ? ordinal(getBillingDay(s)) : '';
  const schedule = !day ? '' : s.plan === '3 Months' ? `every 3 months on the ${day}` : `on the ${day} of every month`;
  const next = billingAnchor(s) ? longDate(nextDueDate(s, todayISO() < billingAnchor(s) ? addDay(billingAnchor(s), -1) : todayISO())) : '(to be confirmed)';
  const subsidyNote =
    s.subsidy && (s.subsidy_amount || s.subsidy_end_date)
      ? `${s.subsidy_name || 'Sports grant'}: ${s.subsidy_amount ? money(s.subsidy_amount) + ' per month' : 'applied'}${s.subsidy_end_date ? ' until ' + longDate(s.subsidy_end_date) : ''}.`
      : '';
  const classes = classTimes(s, settings.schedule);
  const methods = (settings.payment_methods || []).filter((m) => !/^subsidy|^other$/i.test(m)).join(', ');

  let text = String(tpl || '');
  // A line holding only {subsidy_note} disappears when there's no subsidy.
  if (!subsidyNote) text = text.replace(/^[ \t]*\{subsidy_note\}[ \t]*\r?\n/m, '');
  return text
    .replaceAll('{student_full}', s.name || '')
    .replaceAll('{student}', (s.name || '').split(' ')[0])
    .replaceAll('{guardian}', s.guardian_name || 'Parent/Guardian')
    .replaceAll('{classes}', !classes.length ? '(to be confirmed)' : classes.length === 1 ? classes[0] : '\n' + classes.map((c) => `- ${c}`).join('\n'))
    .replaceAll('{start_date}', longDate(s.billing_start_date || s.enroll_date) || '(to be confirmed)')
    .replaceAll('{plan}', s.plan || '1 Month')
    .replaceAll('{tuition}', tuition)
    .replaceAll('{billing_schedule}', schedule)
    .replaceAll('{next_billing}', next)
    .replaceAll('{subsidy_note}', subsidyNote)
    .replaceAll('{payment_methods}', methods)
    .replaceAll('{refund_policy}', settings.refund_policy || '')
    .replaceAll('{business}', settings.business_name || '')
    .replaceAll('{address}', settings.address || '')
    .replaceAll('{phone}', settings.phone || '')
    .replaceAll('{email}', settings.email || '');
}

function addDay(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const WELCOME_PLACEHOLDERS = '{guardian} {student} {student_full} {classes} {start_date} {plan} {tuition} {billing_schedule} {next_billing} {subsidy_note} {payment_methods} {refund_policy} {business} {address} {phone} {email}';

// One welcome email for siblings registered together. With one child this is
// the normal template; with several, the per-child parts become short lists.
export function fillFamilyWelcome(tpl, students, settings = {}) {
  const kids = (students || []).filter(Boolean);
  if (kids.length <= 1) return fillWelcomeTemplate(tpl, kids[0] || {}, settings);
  const first = (s) => (s.name || '').split(' ')[0];
  const join = (arr) => (arr.length > 1 ? arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1] : arr[0] || '');
  // Value of one placeholder for each child, filled the normal way.
  const each = (ph) => kids.map((s) => fillWelcomeTemplate(ph, s, settings));
  const same = (vals) => vals.every((v) => v === vals[0]);
  const perChild = (ph) => {
    const vals = each(ph);
    return same(vals) ? vals[0] : '\n' + kids.map((s, i) => `- ${first(s)}: ${vals[i]}`).join('\n');
  };
  let text = String(tpl || '');
  const subsidy = kids
    .map((s) => fillWelcomeTemplate('{subsidy_note}', s, settings))
    .map((v, i) => (v ? `${first(kids[i])} — ${v}` : ''))
    .filter(Boolean)
    .join('\n');
  if (!subsidy) text = text.replace(/^[ \t]*\{subsidy_note\}[ \t]*\r?\n/m, '');
  text = text
    .replace(/\{student\} is /g, '{student} are ')
    .replaceAll('{classes}', '\n' + kids.map((s) => `- ${first(s)}: ${fillWelcomeTemplate('{classes}', s, settings)}`).join('\n'))
    .replaceAll('{tuition}', '\n' + kids.map((s) => `- ${first(s)}: ${fillWelcomeTemplate('{tuition}', s, settings)}`).join('\n'))
    .replaceAll('{plan}', perChild('{plan}'))
    .replaceAll('{start_date}', perChild('{start_date}'))
    .replaceAll('{billing_schedule}', perChild('{billing_schedule}'))
    .replaceAll('{next_billing}', perChild('{next_billing}'))
    .replaceAll('{subsidy_note}', subsidy)
    .replaceAll('{student_full}', join(kids.map((s) => s.name || '')))
    .replaceAll('{student}', join(kids.map(first)));
  // Everything else (guardian, business, policies…) is the same for the family.
  return fillWelcomeTemplate(text, kids[0], settings);
}
