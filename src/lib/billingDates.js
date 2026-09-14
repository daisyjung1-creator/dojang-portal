export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// A student's monthly billing day is derived from the day-of-month of their
// enrollment date (payment days are set per student, not academy-wide).
export function getBillingDay(student) {
  if (student && student.enroll_date) {
    const d = new Date(student.enroll_date + 'T00:00:00');
    if (!isNaN(d.getTime())) return d.getDate();
  }
  return 1;
}

// Next date strictly after `fromDateStr` whose day-of-month equals billingDay.
export function nextBillingDateAfter(fromDateStr, billingDay) {
  const d = new Date(fromDateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 62; i++) {
    if (d.getDate() === billingDay) return d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 1);
  }
  return addDaysISO(fromDateStr, 30);
}

export function cycleEndBefore(nextBillingDateStr) {
  return addDaysISO(nextBillingDateStr, -1);
}

// The most recent billing-day date on/before `onDateStr` — the cycle the
// student is currently in and should already have paid for.
export function currentCycleStart(student, onDateStr) {
  const billingDay = getBillingDay(student);
  const d = new Date(onDateStr + 'T00:00:00');
  for (let i = 0; i < 32; i++) {
    if (d.getDate() === billingDay) return d.toISOString().slice(0, 10);
    d.setDate(d.getDate() - 1);
  }
  return onDateStr;
}

// Tentative makeup-class expiration = absence date + 30 days, on the
// assumption the student continues into the next billing cycle. Collapses to
// the paid period's last day if that next cycle turns out unpaid.
export function computeMakeupWindow(student, absenceDate) {
  const billingDay = getBillingDay(student);
  const nextBillingDate = nextBillingDateAfter(absenceDate, billingDay);
  const paidPeriodEnd = cycleEndBefore(nextBillingDate);
  const tentativeExpiration = addDaysISO(absenceDate, 30);
  return { nextBillingDate, paidPeriodEnd, tentativeExpiration };
}
