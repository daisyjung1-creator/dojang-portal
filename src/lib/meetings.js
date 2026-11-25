import { addDaysISO } from './billingDates';

// Recurring staff meetings (invoice_settings.meetings), e.g. Leaders Club on
// the 2nd and 4th Friday at 4:30 pm. The database emails a reminder with a
// WhatsApp link (migration 047); Home shows the next ones.

export const DEFAULT_MEETINGS = [
  { key: 'leaders', name: 'Leaders Club meeting', weekday: 5, weeks: [2, 4], time: '16:30', remind: [1, 0], message: '📣 Reminder: Leaders Club meeting is {day} at {time} at the dojang. Please be on time! — Master Daisy' },
  { key: 'instructor', name: 'Instructor meeting', weekday: 1, weeks: [1, 3], time: '20:00', remind: [1, 0], message: '📣 Reminder: Instructor meeting is {day} at {time}. See you there! — Master Daisy' },
];

const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const weekOfMonth = (iso) => Math.floor((Number(iso.slice(8, 10)) - 1) / 7) + 1;
const dow = (iso) => new Date(iso + 'T00:00:00').getDay();

export function isMeetingDay(m, iso) {
  return dow(iso) === Number(m.weekday) && (m.weeks || []).map(Number).includes(weekOfMonth(iso));
}

// Next n dates (from `from`, inclusive) this meeting happens.
export function nextMeetingDates(m, from, n = 2) {
  const out = [];
  for (let d = from, i = 0; i < 120 && out.length < n; i++, d = addDaysISO(d, 1)) if (isMeetingDay(m, d)) out.push(d);
  return out;
}

export function time12(t) {
  const [h, mi] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${((h + 11) % 12) + 1}:${String(mi || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

export function scheduleText(m) {
  const w = (m.weeks || []).map((x) => ORD[x - 1]).join(' & ');
  return `${w} ${DAYS[m.weekday]} · ${time12(m.time)}`;
}

// The group message for one date, from today's point of view.
export function meetingMessage(m, date, today) {
  const long = new Date(date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  const rel = date === today ? `today (${long})` : date === addDaysISO(today, 1) ? `tomorrow (${long})` : long;
  return String(m.message || m.name).replaceAll('{day}', rel).replaceAll('{time}', time12(m.time));
}

export const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
