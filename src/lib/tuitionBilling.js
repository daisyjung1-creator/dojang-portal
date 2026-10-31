// Turns students' billing cycles into tuition invoices.
//
// Each student bills on their own cycle (see billingDates.js). Cycles that
// start within `leadDays` (default 7) and haven't been invoiced yet are offered
// on the Billing page. Siblings (same family = same customer) with the same
// billing date share one invoice, unless the family is set to "separate
// invoices". Big-family discount and subsidy lines are added automatically.

import { billingAnchor, currentCycleStart, nextDueDate, addDaysISO } from './billingDates';
import { round2, calcTotals, formatDate } from './invoiceUtils';
import { splitClasses } from './classes';

// Students who get tuition invoices.
export function isBillable(s) {
  return s && (s.status || 'active') !== 'withdrawn' && !s.billing_exempt && Number(s.tuition) > 0 && !!billingAnchor(s);
}

// Billing dates (cycle starts) between today − graceDays and today + leadDays.
export function cyclesInWindow(student, today, leadDays = 7, graceDays = 7) {
  if (!billingAnchor(student)) return [];
  const from = addDaysISO(today, -graceDays);
  const to = addDaysISO(today, leadDays);
  const out = [];
  let d = currentCycleStart(student, from);
  if (d < from) d = nextDueDate(student, from);
  for (let i = 0; i < 6 && d <= to; i++) {
    if (d >= from) out.push(d);
    d = nextDueDate(student, d);
  }
  return out;
}

export function cycleEnd(student, cycleStart) {
  return addDaysISO(nextDueDate(student, cycleStart), -1);
}

const firstName = (n) => String(n || '').split(' ')[0];

// Invoice lines for one student's cycle: tuition, then discount / subsidy.
export function tuitionLines(student, cycleStart, settings = {}) {
  const tuition = round2(student.tuition);
  const three = student.plan === '3 Months';
  const perWeek = student.classes_per_week ? `${student.classes_per_week}x/week ` : '';
  const lines = [
    {
      student_id: student.id,
      cycle_start: cycleStart,
      line_kind: 'tuition',
      item_name: 'Tuition',
      description: `${student.name} — ${perWeek}${three ? '3-month' : 'monthly'} tuition (${formatDate(cycleStart)} – ${formatDate(cycleEnd(student, cycleStart))})`,
      quantity: 1,
      unit_price: tuition,
      taxable: true,
    },
  ];
  if (student.family_discount) {
    const pct = Number(settings.family_discount_pct ?? 20);
    lines.push({
      student_id: student.id,
      cycle_start: cycleStart,
      line_kind: 'discount',
      item_name: 'Discount',
      description: `Big family discount ${pct}% — ${firstName(student.name)}`,
      quantity: 1,
      unit_price: -round2((tuition * pct) / 100),
      taxable: true,
    });
  }
  if (student.subsidy && Number(student.subsidy_amount) > 0 && (!student.subsidy_end_date || cycleStart <= student.subsidy_end_date)) {
    const months = three ? 3 : 1;
    lines.push({
      student_id: student.id,
      cycle_start: cycleStart,
      line_kind: 'subsidy',
      item_name: student.subsidy_name || 'Subsidy',
      description: `${student.subsidy_name || 'Subsidy'} — ${firstName(student.name)}${months > 1 ? ` (${months} months)` : ''}`,
      quantity: 1,
      unit_price: -round2(Number(student.subsidy_amount) * months),
      taxable: false,
    });
  }
  return lines;
}

// invoicedCycles: Set of `${student_id}|${cycle_start}` already on a live invoice.
// Returns proposed invoices: [{ key, customer, students, due_date, lines, totals, past }]
export function proposeInvoices({ students, customers, invoicedCycles, today, settings = {} }) {
  const lead = Number(settings.invoice_lead_days ?? 7);
  const custById = Object.fromEntries((customers || []).map((c) => [c.id, c]));
  const groups = {};
  for (const s of students) {
    if (!isBillable(s)) continue;
    for (const d of cyclesInWindow(s, today, lead)) {
      if (invoicedCycles.has(`${s.id}|${d}`)) continue;
      const cust = custById[s.customer_id] || null;
      const key = (cust && !cust.separate_invoices ? 'c:' + cust.id : 's:' + s.id) + '|' + d;
      (groups[key] = groups[key] || { key, customer: cust, students: [], due_date: d, lines: [] }).students.push(s);
    }
  }
  return Object.values(groups)
    .map((g) => {
      g.students.sort((a, b) => a.name.localeCompare(b.name));
      g.lines = g.students.flatMap((s) => tuitionLines(s, g.due_date, settings));
      g.totals = calcTotals(g.lines, settings.gst_rate ?? 5);
      g.past = g.due_date < today;
      return g;
    })
    .sort((a, b) => (a.due_date === b.due_date ? familyName(a).localeCompare(familyName(b)) : a.due_date < b.due_date ? -1 : 1));
}

export function familyName(g) {
  return (g.customer && g.customer.name) || g.students.map((s) => s.name).join(' & ');
}

// Header for saveInvoice().
export function invoiceHeader(g, settings, today) {
  const c = g.customer || {};
  const first = g.students[0] || {};
  return {
    customer_id: c.id || null,
    customer_name: c.name || g.students.map((s) => s.name).join(' & '),
    customer_email: c.email || first.guardian_email || '',
    customer_address: c.address || first.address || '',
    invoice_date: today,
    due_date: g.due_date < today ? today : g.due_date,
    gst_rate: settings.gst_rate ?? 5,
    notes: '',
  };
}

export function classesLabel(s) {
  return splitClasses(s.class_name).join(', ');
}
