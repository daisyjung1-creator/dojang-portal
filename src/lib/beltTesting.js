import { BELTS } from './constants';
import { classCount } from './attendanceStats';
import { addDays } from './invoiceUtils';

export const MIN_CLASSES = 21;

// Which testing fee applies, by the belt the student holds now.
//   Beginner (White – Green Stripe) · Intermediate (Green – Blue Stripe)
//   Intermediate/Advance (Blue – Red Stripe) · Advance (Red → Black Stripe)
//   Mini test between black stripes · Black Belt tests
const FEE_BY_BELT = {
  White: 'Test Fee (Beg)',
  'Yellow Stripe': 'Test Fee (Beg)',
  Yellow: 'Test Fee (Beg)',
  'Green Stripe': 'Test Fee (Beg)',
  Green: 'Test Fee (Int)',
  'Blue Stripe': 'Test Fee (Int)',
  Blue: 'Test Fee (Int/Adv)',
  'Red Stripe': 'Test Fee (Int/Adv)',
  Red: 'Test Fee (Adv)',
  'Black Stripe': 'Test Fee (Mini)',
  'Black Stripe 1': 'Test Fee (Mini)',
  'Black Stripe 2': 'Test Fee (Mini)',
  'Black Stripe 3': 'Test Fee (Mini)',
  'Black Stripe 4': 'Black Belt Testing',
  'Black Belt 1st Dan': 'Black Belt Testing 2nd Degree',
};

export const TEST_FEE_ITEMS = ['Test Fee (Beg)', 'Test Fee (Int)', 'Test Fee (Int/Adv)', 'Test Fee (Adv)', 'Test Fee (Mini)', 'Black Belt Testing', 'Black Belt Testing 2nd Degree'];

export function feeItemFor(belt) {
  return FEE_BY_BELT[belt] || 'Test Fee (Beg)';
}

export function nextBelt(belt) {
  const i = BELTS.findIndex((b) => b.value === belt);
  if (i < 0) return BELTS[1].value;
  return BELTS[Math.min(i + 1, BELTS.length - 1)].value;
}

export function beltMeta(belt) {
  return BELTS.find((b) => b.value === belt) || BELTS[0];
}

export function beltIndex(belt) {
  const i = BELTS.findIndex((b) => b.value === belt);
  return i < 0 ? 0 : i;
}

// Classes count from the day after the student's last test (or enrollment).
export function countStart(student) {
  return student.last_test_date || student.enroll_date || '2000-01-01';
}

export function classesSince(student, records) {
  const from = countStart(student);
  return classCount(records.filter((r) => r.date > from));
}

// Match test-fee invoice lines to the students on a test list.
// lines: [{ id, invoice_id, student_id, item_name, description }]
// invoices: { [id]: { invoice_number, invoice_date, customer_id, voided, balance } }
// Lines made from the testing page carry the student; for lines typed by hand
// the family is used, preferring a line that mentions the student's name.
export function matchFees(entries, students, lines, invoices, testDate) {
  const from = addDays(testDate, -100);
  const to = addDays(testDate, 60);
  const usable = lines.filter((l) => {
    const inv = invoices[l.invoice_id];
    return inv && !inv.voided && inv.invoice_date >= from && inv.invoice_date <= to;
  });
  const taken = new Set();
  const out = {};
  const sById = Object.fromEntries(students.map((s) => [s.id, s]));
  const pick = (entry, line) => {
    taken.add(line.id);
    out[entry.id] = { line, invoice: invoices[line.invoice_id] };
  };
  // 1. lines tagged with the student
  entries.forEach((e) => {
    const l = usable.find((x) => !taken.has(x.id) && x.student_id === e.student_id);
    if (l) pick(e, l);
  });
  // 2. family lines that mention the student's first name
  entries.forEach((e) => {
    if (out[e.id]) return;
    const s = sById[e.student_id];
    if (!s?.customer_id) return;
    const first = s.name.split(' ')[0].toLowerCase();
    const l = usable.find((x) => !taken.has(x.id) && !x.student_id && invoices[x.invoice_id].customer_id === s.customer_id && (x.description || '').toLowerCase().includes(first));
    if (l) pick(e, l);
  });
  // 3. any remaining family line
  entries.forEach((e) => {
    if (out[e.id]) return;
    const s = sById[e.student_id];
    if (!s?.customer_id) return;
    const l = usable.find((x) => !taken.has(x.id) && !x.student_id && invoices[x.invoice_id].customer_id === s.customer_id);
    if (l) pick(e, l);
  });
  return out;
}

export const NOTICE_SUBJECT = 'Belt Testing on {date}';
export const NOTICE_MESSAGE = `Hello {guardian},

Great news! {students} will be taking part in our belt testing on {date}.

Testing fee: {fee}

Please fill in the testing form and hand it in at the front desk before the test day.

Keep up the great work!

Master Daisy`;
