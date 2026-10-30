// Billing-cycle date helpers.
//
// Each student has a billing anchor date: `billing_start_date` if set,
// otherwise their enrollment date (they're the same by default). Cycles repeat
// from that anchor every 1 month ("1 Month" plan) or every 3 months
// ("3 Months" plan). A billing day past the end of a short month falls on that
// month's last day (e.g. anchored on the 31st → bills Feb 28).
//
// Dates are local YYYY-MM-DD strings throughout.

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(s) {
  return new Date(s + 'T00:00:00');
}

export function todayISO() {
  return iso(new Date());
}

export function addDaysISO(dateStr, n) {
  const d = parse(dateStr);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// anchor + k months, keeping the anchor's day-of-month where possible.
function addMonthsClamped(anchorStr, k) {
  const a = parse(anchorStr);
  const day = a.getDate();
  const target = new Date(a.getFullYear(), a.getMonth() + k, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return iso(target);
}

export const PLANS = [
  { value: '1 Month', months: 1 },
  { value: '3 Months', months: 3 },
];

export function planMonths(student) {
  return student && student.plan === '3 Months' ? 3 : 1;
}

export function billingAnchor(student) {
  return (student && (student.billing_start_date || student.enroll_date)) || null;
}

export function getBillingDay(student) {
  const a = billingAnchor(student);
  if (a) {
    const d = parse(a);
    if (!isNaN(d.getTime())) return d.getDate();
  }
  return 1;
}

// Index of the cycle containing `onDateStr` (can be negative before the anchor).
function cycleIndexOn(student, onDateStr) {
  const anchor = billingAnchor(student);
  const step = planMonths(student);
  const on = parse(onDateStr);
  const a = parse(anchor);
  let k = Math.floor(((on.getFullYear() - a.getFullYear()) * 12 + (on.getMonth() - a.getMonth())) / step) + 1;
  while (addMonthsClamped(anchor, k * step) > onDateStr) k--;
  return k;
}

// Start of the billing cycle the student is in on `onDateStr`.
export function currentCycleStart(student, onDateStr) {
  const anchor = billingAnchor(student);
  if (!anchor) return onDateStr;
  return addMonthsClamped(anchor, cycleIndexOn(student, onDateStr) * planMonths(student));
}

// First billing date strictly after `fromDateStr` for this student.
export function nextDueDate(student, fromDateStr) {
  const anchor = billingAnchor(student);
  if (!anchor) return addDaysISO(fromDateStr, 30);
  return addMonthsClamped(anchor, (cycleIndexOn(student, fromDateStr) + 1) * planMonths(student));
}

// Kept for older callers: next date after `fromDateStr` on the given day of month.
export function nextBillingDateAfter(fromDateStr, billingDay) {
  const d = parse(fromDateStr);
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 62; i++) {
    if (d.getDate() === billingDay) return iso(d);
    d.setDate(d.getDate() + 1);
  }
  return addDaysISO(fromDateStr, 30);
}

export function cycleEndBefore(nextBillingDateStr) {
  return addDaysISO(nextBillingDateStr, -1);
}

// Tentative makeup-class expiration = absence date + 30 days, on the
// assumption the student continues into the next billing cycle. Collapses to
// the paid period's last day if that next cycle turns out unpaid.
export function computeMakeupWindow(student, absenceDate) {
  const nextBillingDate = nextDueDate(student, absenceDate);
  const paidPeriodEnd = cycleEndBefore(nextBillingDate);
  const tentativeExpiration = addDaysISO(absenceDate, 30);
  return { nextBillingDate, paidPeriodEnd, tentativeExpiration };
}

// Days from today until `dateStr` (negative if past).
export function daysUntil(dateStr) {
  return Math.round((parse(dateStr) - parse(todayISO())) / 86400000);
}
