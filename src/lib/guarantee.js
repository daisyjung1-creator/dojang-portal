// Guaranteed classes (agreement Part 8.2): 2x/week = 8, 3x/week = 12,
// 4x/week = 16 classes per monthly service period. Closures (Day off /
// cancelled classes) can leave a student with fewer scheduled classes than
// that in a period; the dojang then owes make-up classes.
//
// Service periods follow the student's billing date, one month at a time
// (a 3-month plan counts each month on its own).

import { addDaysISO, billingAnchor, currentCycleStart, nextDueDate } from './billingDates';
import { weeklyPlan } from './classes';
import { onHold } from './tuitionBilling';

export const GUARANTEED = { 2: 8, 3: 12, 4: 16 };
// Separate programs, not part of the weekly membership.
const EXTRA_PROGRAMS = ['HP', 'Comp Team'];

const monthly = (s) => ({ ...s, plan: '1 Month' });

// Monthly service period containing `date`: { start, end }.
export function servicePeriod(s, date) {
  const m = monthly(s);
  const start = currentCycleStart(m, date);
  return { start, end: addDaysISO(nextDueDate(m, start), -1) };
}

function isCancelled(cancels, date, className) {
  return cancels.some((c) => c.date === date && (!c.class_name || c.class_name === className));
}

// Scheduled classes for the student in [start, end], and how many of them a
// closure took away.
export function classesInPeriod(s, schedule, cancels, start, end) {
  const plan = weeklyPlan(s, schedule).filter((c) => !EXTRA_PROGRAMS.includes(c.class_name));
  let scheduled = 0;
  let lost = 0;
  const lostDates = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    if (s.enroll_date && d < s.enroll_date) continue;
    if (s.billing_end_date && d > s.billing_end_date) continue;
    if (onHold(s, d)) continue;
    const wd = new Date(d + 'T00:00:00').getDay();
    plan
      .filter((c) => c.weekday === wd)
      .forEach((c) => {
        scheduled++;
        if (isCancelled(cancels, d, c.class_name)) {
          lost++;
          lostDates.push(d);
        }
      });
  }
  return { scheduled, lost, available: scheduled - lost, lostDates: [...new Set(lostDates)] };
}

// Students whose current or upcoming service period (starting within
// `aheadDays`) has fewer classes than guaranteed because of closures.
// makeups: makeup_records rows (reserved/completed) — ones booked inside the
// period count towards it.
export function guaranteeShortfalls({ students, schedule, cancels, makeups = [], today, aheadDays = 21 }) {
  const out = [];
  for (const s of students) {
    const need = GUARANTEED[Number(s.classes_per_week)];
    if (!need || !billingAnchor(s) || (s.status || 'active') === 'withdrawn') continue;
    const periods = [servicePeriod(s, today)];
    const next = addDaysISO(periods[0].end, 1);
    if (next <= addDaysISO(today, aheadDays)) periods.push(servicePeriod(s, next));
    for (const p of periods) {
      // A period that is only partly covered (joined, leaving or on hold) isn't a full paid period.
      if ((s.enroll_date && s.enroll_date > p.start) || (s.billing_end_date && s.billing_end_date < p.end) || onHold(s, p.start) || onHold(s, p.end)) continue;
      const c = classesInPeriod(s, schedule, cancels, p.start, p.end);
      if (!c.lost || c.available >= need) continue;
      const booked = makeups.filter((m) => m.student_id === s.id && m.status !== 'pending' && m.reservation_date && m.reservation_date >= p.start && m.reservation_date <= p.end).length;
      const short = need - c.available - booked;
      if (short > 0) out.push({ student: s, ...p, need, ...c, booked, short });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.student.name.localeCompare(b.student.name));
}
