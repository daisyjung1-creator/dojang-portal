// Membership cancellation (agreement Part 6): requests come by email and must
// arrive at least 14 calendar days before the next scheduled payment date.
//  · 14+ days' notice → the upcoming renewal is cancelled; the membership ends
//    the day before that payment date.
//  · fewer than 14 days → the upcoming renewal goes ahead; the membership ends
//    at the end of that renewed period.
// A later cancellation date the family asks for keeps the membership (and
// billing) going until the end of the period that date falls in.
import { billingAnchor, nextDueDate, addDaysISO } from './billingDates';

export const NOTICE_DAYS = 14;
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

export function computeCancellation(student, receivedOn, requestedDate) {
  if (!billingAnchor(student) || !receivedOn) return null;
  const next = nextDueDate(student, receivedOn);
  const days = dayDiff(receivedOn, next);
  const renewalCancelled = days >= NOTICE_DAYS;
  let end = renewalCancelled ? addDaysISO(next, -1) : addDaysISO(nextDueDate(student, next), -1);
  // Asked to stop later than that: keep going to the end of that period.
  if (requestedDate && requestedDate > end) end = addDaysISO(nextDueDate(student, requestedDate), -1);
  return { next, days, renewalCancelled, end, renewalAfter: renewalCancelled ? null : next };
}
