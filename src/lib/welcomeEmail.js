// Fills the welcome-email template (Invoice Settings → Welcome email) for one student.
import { splitClasses } from './classes';
import { billingAnchor, getBillingDay, nextDueDate, todayISO } from './billingDates';

const longDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const money = (n) => '$' + (Number(n) || 0).toFixed(2);
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
  const classes = splitClasses(s.class_name);
  const methods = (settings.payment_methods || []).filter((m) => !/^subsidy|^other$/i.test(m)).join(', ');

  let text = String(tpl || '');
  // A line holding only {subsidy_note} disappears when there's no subsidy.
  if (!subsidyNote) text = text.replace(/^[ \t]*\{subsidy_note\}[ \t]*\r?\n/m, '');
  return text
    .replaceAll('{student_full}', s.name || '')
    .replaceAll('{student}', (s.name || '').split(' ')[0])
    .replaceAll('{guardian}', s.guardian_name || 'Parent/Guardian')
    .replaceAll('{classes}', classes.length ? classes.join(', ') : '(to be confirmed)')
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
