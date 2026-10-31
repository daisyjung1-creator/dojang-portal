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
