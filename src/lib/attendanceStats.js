// Attendance counting.
//   present = 1 class, double = 2 classes (two classes the same day),
//   private = a private lesson (counted separately, in minutes),
//   vacation / absent = 0.
import { billingAnchor, currentCycleStart, nextDueDate, addDaysISO, todayISO } from './billingDates';

export const ATTENDANCE_KINDS = {
  present: { label: 'Present', short: 'P', color: '#2A5A30', bg: '#E8F1E9', border: '#BFDCC3', classes: 1 },
  double: { label: 'Double', short: 'D', color: '#1E4566', bg: '#E6F0F6', border: '#B9D3E4', classes: 2 },
  private: { label: 'Private', short: 'Pr', color: '#4B3A86', bg: '#EEEAF6', border: '#D2C9EA', classes: 0 },
  vacation: { label: 'Vacation', short: 'V', color: '#854F0B', bg: '#FAEEDA', border: '#F0D9A8', classes: 0 },
  absent: { label: 'Absent', short: 'A', color: '#9A2B2B', bg: '#FBEAEA', border: '#E4B8B8', classes: 0 },
};

export function classCount(records) {
  return records.reduce((n, r) => n + (ATTENDANCE_KINDS[r.status]?.classes || 0), 0);
}

function inRange(r, from, to) {
  return r.date >= from && r.date <= to;
}

export function monthRange(today = todayISO()) {
  const [y, m] = today.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

export function cycleRange(student, today = todayISO()) {
  if (!billingAnchor(student)) return null;
  const from = currentCycleStart(student, today);
  return { from, to: addDaysISO(nextDueDate(student, today), -1) };
}

function weeksBetween(from, to) {
  return (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / (7 * 86400000) + 1 / 7;
}

// Summary for one student. `records` = that student's attendance rows.
export function studentSummary(student, records, packages = [], today = todayISO()) {
  const sum = (from, to) => {
    const rs = records.filter((r) => inRange(r, from, to));
    return {
      from,
      to,
      classes: classCount(rs),
      absent: rs.filter((r) => r.status === 'absent').length,
      vacation: rs.filter((r) => r.status === 'vacation').length,
      privateMinutes: rs.filter((r) => r.status === 'private').reduce((n, r) => n + (Number(r.minutes) || 30), 0),
      expected: student.classes_per_week ? Math.round(student.classes_per_week * weeksBetween(from, to)) : null,
    };
  };
  const m = monthRange(today);
  const c = cycleRange(student, today);
  const bought = packages.reduce((n, p) => n + (Number(p.total_minutes) || 0), 0);
  const used = records.filter((r) => r.status === 'private').reduce((n, r) => n + (Number(r.minutes) || 30), 0);
  return {
    month: sum(m.from, m.to),
    cycle: c ? sum(c.from, c.to) : null,
    privateBought: bought,
    privateUsed: used,
    privateLeft: bought - used,
    lastAttended: lastAttended(records),
  };
}

export function lastAttended(records) {
  return records.filter((r) => ['present', 'double', 'private'].includes(r.status)).reduce((d, r) => (!d || r.date > d ? r.date : d), null);
}

// Classes this week (Mon–Sun) — for the "1/2 this week" hint on check-in.
export function weekCount(records, today = todayISO()) {
  const d = new Date(today + 'T00:00:00');
  const mon = addDaysISO(today, -((d.getDay() + 6) % 7));
  return classCount(records.filter((r) => inRange(r, mon, addDaysISO(mon, 6))));
}

export function minutesLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}
