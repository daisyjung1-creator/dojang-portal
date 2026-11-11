// Fill-in for the editable email templates (Invoice Settings → Email templates).
import { formatDate } from './invoiceUtils';

export function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

const first = (n) => String(n || '').split(' ')[0];
const nice = (iso) => (iso ? formatDate(iso) : '');

export function studentVars(s, settings = {}) {
  return {
    student: first(s.name),
    student_full: s.name || '',
    guardian: s.guardian_name || 'Parent/Guardian',
    business: settings.business_name || '',
    phone: settings.phone || '',
    address: settings.address || '',
  };
}

export function makeupVars(m, s, settings) {
  return {
    ...studentVars(s, settings),
    absence_date: nice(m.absence_date),
    class: m.class_name || '',
    expiration_date: nice(m.expiration_date),
    reservation_date: nice(m.reservation_date),
    reservation_class: m.reservation_class_name || m.class_name || '',
  };
}

export function timeLabel(t) {
  if (!t) return '';
  const [h, mi] = String(t).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(mi || 0).padStart(2, '0')} ${ap}`;
}

export function tryoutVars(t, settings) {
  return {
    student: first(t.student_name),
    student_full: t.student_name || '',
    date: t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'To be confirmed',
    time: timeLabel(t.time) || 'To be confirmed',
    class: t.class_name || 'To be confirmed',
    business: settings.business_name || '',
    phone: settings.phone || '',
    address: settings.address || '',
  };
}

export const TEMPLATE_HELP = {
  makeup: '{student} {student_full} {guardian} {absence_date} {class} {expiration_date} {reservation_date} {reservation_class} {business}',
  absence: '{student} {student_full} {guardian} {last_attended} {business}',
  tryout: '{student} {student_full} {date} {time} {class} {address} {phone} {business}',
  reminder: '{customer} {number} {total} {balance} {due_date} {business}',
};

// One email for several open makeups of the same family (siblings too).
export function combinedMakeupEmail(list, studentsById, settings = {}) {
  const kids = [...new Set(list.map((m) => studentsById[m.student_id]).filter(Boolean))];
  const guardian = kids[0]?.guardian_name || 'Parent/Guardian';
  const names = kids.map((s) => first(s.name));
  const who = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] || '';
  const day = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
  const rows = list
    .slice()
    .sort((a, b) => (a.absence_date < b.absence_date ? -1 : 1))
    .map((m) => {
      const s = studentsById[m.student_id];
      const lead = kids.length > 1 ? `${first(s?.name)}: ` : '';
      const booked = m.status === 'reserved' && m.reservation_date;
      return `• ${lead}missed ${day(m.absence_date)} (${m.class_name}) — ${booked ? `booked for ${day(m.reservation_date)} (${m.reservation_class_name || m.class_name})` : `use by ${day(m.expiration_date)}`}`;
    });
  const open = list.some((m) => !(m.status === 'reserved' && m.reservation_date));
  return {
    subject: `Makeup classes for ${who}`,
    message: [
      `Hello ${guardian},`,
      '',
      `Here are ${who}'s makeup classes:`,
      '',
      ...rows,
      '',
      open ? 'A makeup can be taken in any suitable class before its "use by" date. Please let us know which days work for you and we\'ll book them in.' : 'See you on the mat!',
      '',
      'Best Regards,',
      'Master Daisy',
    ].join('\n'),
  };
}
