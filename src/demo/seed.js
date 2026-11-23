// Fake data for the /demo portal. Every person, email, phone number and
// amount here is made up; class times, belts, prices and the curriculum are
// the dojang's normal (public) setup so the demo behaves like the real thing.
import { tuitionLines } from '../lib/tuitionBilling';
import { calcTotals } from '../lib/invoiceUtils';
import { addDaysISO, currentCycleStart, nextDueDate } from '../lib/billingDates';

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16)));

// Same "random" data every time the demo opens.
let seedN = 20261123;
const rnd = () => ((seedN = (seedN * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());
const daysAgo = (n) => addDaysISO(TODAY, -n);
const ts = (dateISO, hh = 17) => new Date(`${dateISO}T${String(hh).padStart(2, '0')}:15:00`).toISOString();

const SCHEDULE = [
  ['Intermediate B', 1, '16:30', '17:20'], ['Beginner/Intermediate', 1, '17:30', '18:20'], ['Advance Poomsae', 1, '18:30', '19:30'],
  ['Beginner', 2, '16:30', '17:20'], ['Intermediate A', 2, '17:30', '18:20'], ['Advance Sparring', 2, '18:30', '19:30'], ['HP', 2, '19:30', '20:30'],
  ['Intermediate B', 3, '16:30', '17:20'], ['Beginner/Intermediate', 3, '17:30', '18:20'], ['Advance Poomsae', 3, '18:30', '19:30'],
  ['Beginner', 4, '16:30', '17:20'], ['Intermediate A', 4, '17:30', '18:20'], ['Advance Sparring', 4, '18:30', '19:30'], ['HP', 4, '19:30', '20:30'],
  ['Intermediate/Advance', 5, '17:00', '17:50'], ['Advance Poomsae', 5, '18:00', '19:30'], ['Comp Team', 6, '10:00', '13:30'],
];

const FEES = [
  ['Pre-Auth 2D', 150, 'Pre-Authorized Payment 2 days/week', false], ['Pre-Auth 3D', 170, 'Pre-Authorized Payment 3 days/week', false], ['Pre-Auth 4D', 200, 'Pre-Authorized Payment 4 days/week', false],
  ['Debit/Cash 2D', 150, '2 days/week Plan [Debit/Cash]', false], ['3 Month Plan - 2 D', 435, '3 Months Plan 2 Days a week', false], ['3 Month Plan - 3D', 495, '3 Months Plan 3 Days a week', false],
  ['Competition Team Plan', 200, 'Competition Team Plan', false], ['HP Team', 250, 'High Performance Plan', false],
  ['Test Fee (Beg)', 50, 'Beginner Level (White - Yellow)', false], ['Test Fee (Int)', 60, 'Intermediate Level (Green Stripe - Green)', false], ['Test Fee (Int/Adv)', 70, 'Intermediate/Advance Level (Blue Stripe - Blue)', false], ['Test Fee (Adv)', 80, 'Advance Level (Red Stripe - Red)', false],
  ['Uniform', 80, 'Uniform (Youth)', true], ['Belt', 50, 'Black Belt', true], ['Head Gear', 60, 'Head Gear', true], ['Chest Gear', 80, 'Chest Gear', true], ['Foot Guard', 34, 'Foot Guard', true], ['Glove', 34, 'Glove', true],
  ['Arm&Shin Guard', 80, 'Arm , Shin guard', true], ['Mouth Guard', 5, 'Mouth Guard', true], ['T Shirts', 30, 'T Shirts', true], ['Full Sparring Gear', 260, 'Full Sparring Gear', true],
  ['Private Lesson 5', 200, 'Private Lesson 5 Classes', false], ['Drop In', 30, 'Drop In Class', false], ['Summer Camp', 120, 'Summer Camp Day', false], ['Late Fee', 5, 'Re- registration Fee', false],
  ['KidSports', 300, 'Kidsports Grant', false], ['Re-print receipt', 5, 'Reprinting receipt', false],
];

const CURRICULUM = [
  ['White', '', 'Basic movements', 'Front stretch kick, Front kick, Roundhouse kick', 'Hammer fist'],
  ['Yellow Stripe', '1', 'Low blk + pnch\nMed blk + pnch\nHigh blk + pnch', 'Hopping roundhouse kick', 'Front Kick'],
  ['Yellow', '2', 'Low blk + pnch\nMed blk + pnch\nHigh blk + pnch\nHigh pnch', 'Kick Down Back – 25', 'Hand Knife\nRound House Kick'],
  ['Green Stripe', '3', 'Double pnch\nSingle hand knf\nHand blade strk', 'RHK ×3 + Backing up RHK ×3 – 7', 'Elbow strike\nJump Front Kick'],
  ['Green', '4', 'D hand knf\nSpear hand\nBack fist\nSide block', 'V-step RHK – 25', 'Step in Punch\nCross Step Side Kick'],
  ['Blue Stripe', '5', 'Hammer fist\nElbow strk\nSide hammer fist\nTarget elbow strk', 'Step in Back Kick – 15\nJumping Back Kick – 17', 'Running Jumping Round House\nRunning Jumping Side Kick'],
  ['Blue', '6', 'Twist hand knf\nOut blk\nPalm blk', 'RHK + Double RHK – 15', 'Jumping Axe Kick\nJumping Back Kick'],
  ['Red Stripe', '7', 'Assist open hand low blk\nScissor blk\nTwo fist pnch\nCross hand blk', 'RHK (Rebound) – 25\nTornado Kick – 15', 'Hand Chop\nTornado Kick'],
  ['Red', '8', 'Single mountain blk\nJaw break\nPalm blk\nAssist hand low blk', 'Skipping RHK (rebound) – 25\nReverse Kick – 15', 'Reverse Kick\nJumping Side Kick (over 2 people)'],
  ['Black Stripe', '', '', '', ''],
];

const FIRST = ['Liam', 'Olivia', 'Noah', 'Emma', 'Lucas', 'Ava', 'Ethan', 'Mia', 'Mason', 'Chloe', 'Aiden', 'Zoe', 'Leo', 'Nora', 'Owen', 'Ella', 'Caleb', 'Ivy', 'Jayden', 'Ruby', 'Ryan', 'Hazel', 'Eli', 'Layla', 'Isaac', 'Aria', 'Henry', 'Maya', 'Jack', 'Sofia', 'Ben', 'Leah', 'Sam', 'Grace', 'Theo', 'Luna'];
const LAST = ['Anderson', 'Bennett', 'Carter', 'Dawson', 'Ellis', 'Foster', 'Grant', 'Hughes', 'Irving', 'Jensen', 'Keller', 'Lawson', 'Mercer', 'Nolan', 'Ortiz', 'Patel', 'Quinn', 'Reyes', 'Sawyer', 'Tanaka', 'Underwood', 'Vance', 'Walsh', 'Young'];
const PARENT = ['Sarah', 'Michael', 'Jennifer', 'David', 'Amanda', 'Chris', 'Laura', 'Daniel', 'Megan', 'Kevin', 'Rachel', 'Jason', 'Nicole', 'Brian', 'Priya', 'Omar', 'Mei', 'Carlos', 'Fatima', 'Tom'];

// Classes → which ones, how many per week, belt range.
const TRACKS = [
  { classes: [[2, 'Beginner'], [4, 'Beginner']], per: 2, belts: ['White', 'Yellow Stripe', 'Yellow'], age: [5, 9] },
  { classes: [[1, 'Intermediate B'], [3, 'Intermediate B']], per: 2, belts: ['White', 'Yellow', 'Green Stripe', 'Green'], age: [11, 15] },
  { classes: [[1, 'Beginner/Intermediate'], [3, 'Beginner/Intermediate']], per: 2, belts: ['Yellow Stripe', 'Yellow', 'Green Stripe'], age: [7, 10] },
  { classes: [[2, 'Intermediate A'], [4, 'Intermediate A']], per: 2, belts: ['Green Stripe', 'Green', 'Blue Stripe', 'Blue'], age: [8, 11] },
  { classes: [[2, 'Intermediate A'], [5, 'Intermediate/Advance']], per: 2, belts: ['Blue Stripe', 'Blue', 'Red Stripe'], age: [9, 12] },
  { classes: [[1, 'Advance Poomsae'], [2, 'Advance Sparring'], [4, 'Advance Sparring']], per: 3, belts: ['Red', 'Black Stripe 1', 'Black Stripe 2', 'Black Belt 1st Dan'], age: [11, 16] },
];
const TUITION = { 2: [150, 435], 3: [170, 495], 4: [200, 585] };

function makeStudents() {
  const families = [];
  const students = [];
  let fi = 0;
  for (let f = 0; f < 24; f++) {
    const last = LAST[f % LAST.length];
    const parent = `${PARENT[f % PARENT.length]} ${last}`;
    const kids = f % 7 === 0 ? 3 : f % 3 === 0 ? 2 : 1;
    const email = `${PARENT[f % PARENT.length].toLowerCase()}.${last.toLowerCase()}@example.com`;
    const phone = `780-555-${String(1100 + f * 37).slice(-4)}`;
    const preauth = f % 4 !== 3;
    const fam = { id: uuid(), parent, email, phone, preauth, kids: [] };
    families.push(fam);
    for (let k = 0; k < kids; k++) {
      const track = TRACKS[(f + k * 2) % TRACKS.length];
      const three = !preauth ? true : chance(0.15);
      const tuition = TUITION[track.per][three ? 1 : 0];
      const age = track.age[0] + Math.floor(rnd() * (track.age[1] - track.age[0] + 1));
      const dob = `${new Date().getFullYear() - age}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`;
      const startDaysAgo = 40 + Math.floor(rnd() * 400);
      const enroll = daysAgo(startDaysAgo);
      students.push({
        id: uuid(),
        name: `${FIRST[fi++ % FIRST.length]} ${last}`,
        dob,
        guardian_name: parent,
        guardian_phone: phone,
        guardian_email: email,
        belt: pick(track.belts),
        class_name: [...new Set(track.classes.map((c) => c[1]))].join(', '),
        class_days: track.classes.map(([d, c]) => `${d}:${c}`),
        classes_per_week: track.per,
        tuition,
        plan: three ? '3 Months' : '1 Month',
        enroll_date: enroll,
        billing_start_date: enroll,
        status: 'active',
        customer_id: null,
        address: `${100 + f * 12} Demo Street NW, Edmonton, AB`,
        emergency_name: `${pick(PARENT)} ${last}`,
        emergency_phone: `780-555-${String(2200 + f * 41).slice(-4)}`,
        subsidy: false,
        family_discount: kids === 3 && k === kids - 1,
        billing_exempt: false,
        photo_consent: chance(0.8),
        medical: chance(0.1) ? 'Mild asthma — inhaler in bag' : null,
        last_test_date: daysAgo(17),
        created_at: ts(enroll),
        _fam: fam,
      });
    }
  }
  // A few families are due for billing today, and one cash family next week,
  // so Billing has something to do in the demo.
  const onDay = (monthsBack, dayShift = 0) => {
    const d = new Date();
    return iso(new Date(d.getFullYear(), d.getMonth() - monthsBack, d.getDate() + dayShift));
  };
  [0, 7, 15].forEach((i, k) => students[i] && students[i].plan === '1 Month' && Object.assign(students[i], { billing_start_date: onDay(4 + k), enroll_date: onDay(4 + k) }));
  const cash = students.find((s) => s.plan === '3 Months' && s._fam && !s._fam.preauth);
  if (cash) Object.assign(cash, { billing_start_date: onDay(6, 5), enroll_date: onDay(6, 5) });
  // Two students on a KidSport grant, one with a smaller local grant.
  const ks = students.filter((s) => s.plan === '1 Month').slice(3, 5);
  ks.forEach((s) => Object.assign(s, { subsidy: true, subsidy_name: 'KidSport', subsidy_status: 'approved', subsidy_amount: 25, subsidy_total: 300, subsidy_start_date: daysAgo(60), subsidy_end_date: addDaysISO(TODAY, 300), subsidy_applied_on: daysAgo(70) }));
  const local = students.filter((s) => s.plan === '1 Month')[8];
  Object.assign(local, { subsidy: true, subsidy_name: 'Community Sport Grant', subsidy_status: 'approved', subsidy_amount: 50, subsidy_total: 200, subsidy_start_date: daysAgo(45), subsidy_end_date: addDaysISO(TODAY, 40) });
  // One on hold, one withdrawn.
  Object.assign(students[6], { hold_from: daysAgo(10), hold_until: addDaysISO(TODAY, 20), hold_reason: 'Family trip' });
  Object.assign(students[12], { status: 'withdrawn', withdrawn_date: daysAgo(25), billing_end_date: daysAgo(25) });
  return { families, students };
}

export function buildSeed() {
  const db = {};
  db.profiles = [{ id: 'demo-admin', name: 'Demo Admin', role: 'admin', created_at: ts(daysAgo(400)) }];
  db.class_schedule = SCHEDULE.map(([class_name, weekday, s, e]) => ({ id: uuid(), class_name, weekday, start_time: `${s}:00`, end_time: `${e}:00`, active: true, created_at: ts(daysAgo(500)) }));
  db.fee_items = FEES.map(([name, amt, description, inv], i) => ({ id: uuid(), name, default_amount: amt, description, taxable: !/KidSports|Re-print/.test(name), active: true, sort_order: 100 + i, track_inventory: inv, inventory_since: inv ? ts(daysAgo(120)) : null, low_stock_at: inv ? 3 : null }));
  db.belt_curriculum = CURRICULUM.map(([belt, poomsae, basic_en, kicking, break_en], i) => ({ belt, sort: i + 1, poomsae, basic_ko: '', basic_en, kicking, break_ko: '', break_en, spot: i % 2 ? '#2' : '#1', material: '' }));
  db.invoice_settings = [
    {
      id: 1, business_name: 'Demo Taekwondo Academy', address: '123 Demo Street NW, Edmonton, AB', phone: '780-555-0100', email: 'demo@example.com', website: '', gst_number: '', gst_rate: 5,
      next_invoice_number: 1001, next_receipt_number: 5001, default_due_days: 0,
      invoice_footer: 'Please contact us for more information about payment options.',
      payment_instructions: 'Interac e-Transfer — please send your payment to demo@example.com',
      email_subject: 'Invoice #{number} — {business}', email_message: 'Dear {customer},\n\nThank you for training with us. Please find attached invoice #{number} for {balance}, due {due_date}.\n\nKind regards,\nMaster Kim\n{business}',
      reminder_subject: 'Reminder: tuition payment on {due_date}', reminder_message: 'Hi {customer},\n\nThis is a friendly reminder that your tuition payment of {balance} (invoice #{number}) will be charged to your credit card on file on {due_date}.\n\nBest Regards,\nMaster Kim',
      makeup_subject: 'Makeup class for {student}', makeup_message: 'Hello {guardian},\n\nWe missed {student} in class on {absence_date}. {student} can make up this class in any suitable class until {expiration_date}.\n\nBest Regards,\nMaster Kim',
      makeup_reserved_message: 'Hello {guardian},\n\nThis confirms {student}\'s makeup class on {reservation_date} ({reservation_class}).\n\nBest Regards,\nMaster Kim',
      absence_subject: 'We miss {student}!', absence_message: 'Hello {guardian},\n\nWe haven\'t seen {student} in class for a little while (last class: {last_attended}) and just wanted to check in.\n\nBest Regards,\nMaster Kim',
      tryout_subject: 'Trial class confirmed for {student}', tryout_message: 'Hello,\n\nThis confirms {student}\'s trial class at {business}:\n\nDate: {date}\nTime: {time}\nClass: {class}\nLocation: {address}\n\nBest Regards,\nMaster Kim',
      welcome_subject: 'Welcome to {business}, {student}!', welcome_message: 'Hello {guardian},\n\nWelcome to {business}! {student} is registered in: {classes}\nStart date: {start_date}\n\nTuition: {tuition}\n{subsidy_note}\n\nBest Regards,\nMaster Kim',
      subsidy_reminder_subject: 'Sports grant ending soon for {student}', subsidy_reminder_message: 'Hello,\n\nThis is a reminder that {student}\'s sports grant will end at the end of {end_month}.\n\nBest Regards,\nMaster Kim',
      refund_policy: 'New students may cancel by email before the third scheduled class. Membership cancellations need 14 days\' notice by email before the next payment date.',
      payment_methods: ['Pre-Authorized Credit Card', 'Interac e-Transfer', 'Debit', 'Cash', 'Visa', 'Mastercard', 'Cheque', 'Subsidy (KidSport etc.)', 'Other'],
      invoice_lead_days: 7, reminder_lead_days: 3, family_discount_pct: 20, default_tryout_time: '16:30:00', auto_absent_time: '23:30:00', trial_capacity: 3, trial_days_ahead: 21,
      test_cycle_weeks: 12, test_pacing: [{ label: 'Basics & new belt material', weeks: 3 }, { label: 'Poomsae', weeks: 3 }, { label: 'Kicking & sparring drills', weeks: 2 }, { label: 'Breaking', weeks: 2 }, { label: 'Review & mock test', weeks: 2 }],
      meetings: [{ key: 'leaders', name: 'Leaders Club meeting', time: '16:30', weeks: [2, 4], remind: [1, 0], weekday: 5, message: 'Reminder: Leaders Club meeting is {day} at {time}.' }],
      online_pay: false, online_pay_mode: 'test', preauth_note: null, logo_data: null, updated_at: ts(daysAgo(30)),
    },
  ];
  db.payroll_settings = [{ id: 1, company_name: 'Demo Taekwondo Academy Ltd.', address: '123 Demo Street NW, Edmonton, AB', phone: '780-555-0100', email: 'demo@example.com', contact_line: 'Demo Taekwondo Academy, 780-555-0100', vacation_pct: 4 }];

  // Families and students
  const { families, students } = makeStudents();
  db.customers = families.map((f, i) => ({
    id: f.id, name: f.parent, contact_name: f.parent, email: f.email, phone: f.phone, address: `${100 + i * 12} Demo Street NW, Edmonton, AB`, active: true, created_at: ts(daysAgo(420 - i)),
    payment_type: f.preauth ? 'preauth' : 'manual', separate_invoices: false,
    ...(f.preauth && i % 5 !== 1
      ? { card_profile_code: 'DEMO', card_profile_mode: 'test', card_last4: String(4242 + i * 7).slice(-4), card_expiry: '0829', card_type: i % 3 ? 'Visa' : 'Mastercard', card_saved_at: ts(daysAgo(60 - i)), card_consent: 'Demo consent' }
      : {}),
  }));
  // One saved card was declined this week.
  const declined = db.customers.find((c) => c.card_last4 && c.id !== families[0].id);
  students.forEach((s) => {
    s.customer_id = s._fam.id;
    delete s._fam;
  });
  db.students = students;

  // Invoices, lines and payments for each billing cycle up to today.
  db.invoices = [];
  db.invoice_lines = [];
  db.invoice_payments = [];
  db.invoice_refunds = [];
  db.credit_applications = [];
  const settings = db.invoice_settings[0];
  const custById = Object.fromEntries(db.customers.map((c) => [c.id, c]));
  const addInvoice = (cust, date, lines, { paid = true, method } = {}) => {
    const totals = calcTotals(lines.map((l) => ({ ...l, amount: l.quantity * l.unit_price })), 5);
    const inv = {
      id: uuid(), invoice_number: settings.next_invoice_number++, customer_id: cust.id, customer_name: cust.name, customer_email: cust.email, customer_address: cust.address,
      invoice_date: date, due_date: date, subtotal: totals.subtotal, gst_rate: 5, gst_amount: totals.gst, total: totals.total, notes: null, voided: false, is_opening_balance: false,
      emailed_at: ts(date, 9), created_at: ts(date, 9), updated_at: ts(date, 9), reminded_at: null, pay_token: uuid(), overdue_notice_at: null,
    };
    db.invoices.push(inv);
    lines.forEach((l, i) => db.invoice_lines.push({ id: uuid(), invoice_id: inv.id, position: i, fee_item_id: l.fee_item_id || null, student_id: l.student_id || null, item_name: l.item_name, description: l.description, quantity: l.quantity, unit_price: l.unit_price, taxable: l.taxable, amount: Math.round(l.quantity * l.unit_price * 100) / 100, cycle_start: l.cycle_start || null, line_kind: l.line_kind || null }));
    if (paid)
      db.invoice_payments.push({
        id: uuid(), receipt_number: settings.next_receipt_number++, invoice_id: inv.id, customer_id: cust.id, payment_date: date,
        method: method || (cust.payment_type === 'preauth' ? 'Pre-Authorized Credit Card' : pick(['Debit', 'Interac e-Transfer', 'Cash'])),
        amount: inv.total, credit_amount: 0, reference: null, notes: null, emailed_at: ts(date, 10), created_at: ts(date, 10), gateway_txn: null,
      });
    return inv;
  };
  const unpaidTargets = new Set([students[2].id, students[9].id]);
  students.forEach((s) => {
    const cust = custById[s.customer_id];
    let d = s.billing_start_date;
    const stopAt = s.billing_end_date || TODAY;
    // Only bill the last ~5 months to keep the demo light.
    const since = daysAgo(150);
    if (d < since) d = currentCycleStart(s, since);
    // Today's billing is left for the demo user to run.
    while (d <= stopAt && d < TODAY) {
      if (!(s.hold_from && d >= s.hold_from && d <= (s.hold_until || d))) {
        const latest = nextDueDate(s, d) > TODAY;
        const paid = !(latest && unpaidTargets.has(s.id)) && !(latest && declined && s.customer_id === declined.id);
        addInvoice(cust, d, tuitionLines(s, d, settings), { paid });
      }
      d = nextDueDate(s, d);
    }
  });
  if (declined) {
    const inv = db.invoices.filter((i) => i.customer_id === declined.id).sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1))[0];
    Object.assign(declined, { card_declined_at: ts(inv?.invoice_date || TODAY, 6), card_decline_message: 'DECLINED — insufficient funds', card_declined_invoice_id: inv?.id || null });
  }
  // Shop sales: uniforms and gear, plus belt test fees.
  const fee = (n) => db.fee_items.find((f) => f.name === n);
  for (let i = 0; i < 14; i++) {
    const s = students[(i * 5) % students.length];
    const item = fee(pick(['Uniform', 'Head Gear', 'Chest Gear', 'Glove', 'Foot Guard', 'T Shirts', 'Mouth Guard', 'Arm&Shin Guard']));
    const date = daysAgo(3 + Math.floor(rnd() * 100));
    addInvoice(custById[s.customer_id], date, [{ fee_item_id: item.id, student_id: s.id, item_name: item.name, description: `${item.description} — ${s.name.split(' ')[0]}`, quantity: 1, unit_price: item.default_amount, taxable: true }], { method: pick(['Debit', 'Visa', 'Cash']) });
  }
  // A refund on one shop sale.
  const shop = db.invoices[db.invoices.length - 2];
  const shopPay = db.invoice_payments.find((p) => p.invoice_id === shop.id);
  db.invoice_refunds.push({ id: uuid(), refund_number: 1, invoice_id: shop.id, payment_id: shopPay.id, customer_id: shop.customer_id, refund_date: addDaysISO(shop.invoice_date, 2), method: shopPay.method, amount: shop.total, gst_amount: shop.gst_amount, reason: 'Wrong size — returned unworn', emailed_at: null, created_at: ts(addDaysISO(shop.invoice_date, 2)) });

  db.inventory_movements = db.fee_items.filter((f) => f.track_inventory).map((f) => ({ id: uuid(), fee_item_id: f.id, movement_date: daysAgo(120), kind: 'count', quantity: 6 + Math.floor(rnd() * 10), note: 'Starting count', created_at: ts(daysAgo(120)) }));

  // Attendance for the last four weeks.
  db.attendance = [];
  for (let back = 28; back >= 1; back--) {
    const date = daysAgo(back);
    const wd = new Date(`${date}T12:00:00`).getDay();
    students.forEach((s) => {
      if (s.status === 'withdrawn' && date > s.withdrawn_date) return;
      if (s.hold_from && date >= s.hold_from) return;
      (s.class_days || []).forEach((cd) => {
        const [d, cls] = cd.split(':');
        if (Number(d) !== wd || date < s.enroll_date) return;
        const status = chance(0.86) ? 'present' : chance(0.5) ? 'absent' : 'excused';
        db.attendance.push({ id: uuid(), student_id: s.id, date, class_name: cls, status, created_at: ts(date, 18), is_makeup: false, makeup_record_id: null, minutes: null, auto: status === 'absent', note: null });
      });
    });
  }
  const absent = db.attendance.filter((a) => a.status === 'absent').slice(-3);
  db.makeup_records = absent.map((a, i) => ({
    id: uuid(), student_id: a.student_id, absence_date: a.date, class_name: a.class_name, next_billing_date: addDaysISO(a.date, 20), paid_period_end: addDaysISO(a.date, 19),
    tentative_expiration: addDaysISO(a.date, 30), expiration_date: addDaysISO(a.date, 30), conditional: false, reservation_date: i === 0 ? addDaysISO(TODAY, 2) : null,
    reservation_class_name: i === 0 ? a.class_name : null, status: i === 0 ? 'reserved' : 'pending', created_at: ts(a.date, 20), emailed_at: ts(a.date, 20),
  }));
  db.class_cancellations = [];

  // Leads and trial classes
  db.leads = [
    ['Hannah Brooks', 'Lisa Brooks', 7, 'New Inquiry', 'Phone', 1],
    ['Marcus Lee', 'James Lee', 12, 'Consultation Done', 'Walk-in', 6],
    ['Sophie Martin', 'Claire Martin', 6, 'New Inquiry', 'Website', 2],
    ['Arjun Shah', 'Neha Shah', 9, 'Enrolled', 'Referral', 30],
    ['Daniel Kowalski', 'Anna Kowalski', 14, 'Consultation Done', 'Phone', 10],
  ].map(([student_name, guardian_name, age, status, source, ago], i) => ({
    id: uuid(), student_name, guardian_name, student_age: age, status, source, phone: `780-555-${3300 + i * 11}`, email: `${guardian_name.split(' ')[0].toLowerCase()}@example.com`,
    inquiry_date: daysAgo(ago), consult_date: status === 'New Inquiry' ? null : daysAgo(ago - 1), notes: null, created_at: ts(daysAgo(ago)), linked_student_id: null, contacted_at: status === 'New Inquiry' ? null : ts(daysAgo(ago)), contacted_by: null, children: null,
  }));
  db.tryouts = [
    ['Hannah Brooks', 'Beginner', 2, 'Scheduled', 7],
    ['Sophie Martin', 'Beginner', 4, 'Scheduled', 6],
    ['Marcus Lee', 'Intermediate B', -5, 'Attended', 12],
    ['Daniel Kowalski', 'Intermediate B', -9, 'Attended', 14],
  ].map(([student_name, class_name, inDays, status, age], i) => ({
    id: uuid(), student_name, class_name, date: addDaysISO(TODAY, inDays), time: '16:30:00', status, guardian_name: db.leads.find((l) => l.student_name === student_name)?.guardian_name || null,
    guardian_phone: `780-555-${3300 + i * 11}`, guardian_email: `trial${i + 1}@example.com`, student_age: age, experience: 'None', notes: null, confirmation_sent: true, followup_sent_at: null, created_at: ts(daysAgo(10)),
  }));

  // Belt tests: one coming up, one done.
  const upcoming = { id: uuid(), test_date: addDaysISO(TODAY, 24), title: 'Winter Belt Testing', notes: null, created_at: ts(daysAgo(20)), bracket: null, examiner: null, leaders: null };
  const past = { id: uuid(), test_date: daysAgo(17), title: 'Fall Belt Testing', notes: null, created_at: ts(daysAgo(60)), bracket: null, examiner: 'Master Kim', leaders: null };
  db.belt_tests = [upcoming, past];
  const BELTS = ['White', 'Yellow Stripe', 'Yellow', 'Green Stripe', 'Green', 'Blue Stripe', 'Blue', 'Red Stripe', 'Red', 'Black Stripe 1'];
  const nextBelt = (b) => BELTS[Math.min(BELTS.indexOf(b) + 1, BELTS.length - 1)] || b;
  const prevBelt = (b) => BELTS[Math.max(BELTS.indexOf(b) - 1, 0)] || b;
  const feeFor = (b) => (/Green/.test(b) ? 60 : /Blue/.test(b) ? 70 : /Red/.test(b) ? 80 : 50);
  db.belt_test_entries = [];
  students.filter((s) => s.status === 'active' && BELTS.includes(s.belt)).slice(0, 12).forEach((s, i) => {
    db.belt_test_entries.push({ id: uuid(), test_id: past.id, student_id: s.id, current_belt: prevBelt(s.belt), target_belt: s.belt, fee_item: null, fee_amount: feeFor(s.belt), form_received: true, result: 'pass', promoted_at: ts(past.test_date, 19), notice_sent_at: ts(daysAgo(40)), notes: null, created_at: ts(daysAgo(40)), scores: null, plan: null, medal: i % 5 === 0, patch: i % 4 === 1 ? pick(['Courage', 'Effort', 'Courtesy', 'Friendship']) : null });
  });
  students.filter((s) => s.status === 'active' && BELTS.includes(s.belt)).slice(10, 22).forEach((s, i) => {
    db.belt_test_entries.push({ id: uuid(), test_id: upcoming.id, student_id: s.id, current_belt: s.belt, target_belt: nextBelt(s.belt), fee_item: null, fee_amount: feeFor(nextBelt(s.belt)), form_received: i % 3 !== 0, result: 'pending', promoted_at: null, notice_sent_at: ts(daysAgo(5)), notes: null, created_at: ts(daysAgo(6)), scores: null, plan: null, medal: false, patch: null });
  });

  // An online registration waiting to be enrolled.
  db.registrations = [
    {
      id: uuid(), created_at: ts(daysAgo(1), 20), status: 'new', frequency: '2', other_program: null, plan: 'Monthly Credit Card', start_date: addDaysISO(TODAY, 5), photo_consent: true,
      family: { guardian_name: 'Lisa Brooks', relationship: 'Mother', phone: '780-555-3300', email: 'lisa@example.com', address: '55 Sample Ave NW, Edmonton, AB', postal: 'T6K 0A1', emergency_name: 'Mark Brooks', emergency_phone: '780-555-3301', emergency_relationship: 'Father', heard: 'Search Engine' },
      kids: [{ first: 'Hannah', last: 'Brooks', dob: `${new Date().getFullYear() - 7}-04-12`, class_days: ['2:Beginner', '4:Beginner'], medical: false, medical_detail: '', instructions: '' }],
      signature_name: 'Lisa Brooks', signed_on: daysAgo(1), adult_student: false, agreement_version: 'demo', student_ids: null, handled_at: null, signature_image: null, initials: {}, emailed_at: ts(daysAgo(1), 20), email_error: null,
      card_token: uuid(), card_last4: '4242', card_type: 'Visa', card_saved_at: ts(daysAgo(1), 20),
    },
  ];
  db.cancellation_requests = [];
  db.payments = [];
  db.private_packages = [{ id: uuid(), student_id: students[5].id, purchased_date: daysAgo(30), total_minutes: 150, notes: '5 × 30 min', created_at: ts(daysAgo(30)) }];
  db.student_black_belt = [];
  db.other_income = [{ id: uuid(), received_on: daysAgo(9), source: 'KidSport', amount: 300, reference: '100234', note: students.filter((s) => s.subsidy_name === 'KidSport').map((s) => s.name).slice(0, 1).join(', '), created_at: ts(daysAgo(9)) }];
  db.dashboard_notes = [
    { id: uuid(), note_date: TODAY, body: 'Order more youth uniforms (sizes 2 and 3)', done: false, created_at: ts(TODAY, 9) },
    { id: uuid(), note_date: daysAgo(2), body: 'Call back the Lee family about the Intermediate B trial', done: true, created_at: ts(daysAgo(2), 9) },
  ];
  db.email_queue = [];
  db.email_broadcasts = [];
  db.auto_billing_runs = [];

  // Payroll
  db.payroll_employees = [
    ['Coach Alex Rivera', 18], ['Coach Jamie Chen', 17], ['Coach Taylor Brooks', 16],
  ].map(([name, rate], i) => ({ id: uuid(), name, attendance_employee_id: null, address: `${20 + i} Sample Road, Edmonton, AB`, phone: `780-555-${4400 + i}`, email: `coach${i + 1}@example.com`, sin_masked: '***-***-' + (123 + i), payroll_no: String(i + 1), pay_type: 'Monthly', payment_method: 'EFT', hourly_rate: rate, vacation_pct: 4, active: true, created_at: ts(daysAgo(300)) }));
  db.payslips = [];
  [45, 15].forEach((ago) => {
    db.payroll_employees.forEach((e, i) => {
      const hours = 30 + i * 6;
      const std = hours * e.hourly_rate;
      const vac = Math.round(std * 0.04 * 100) / 100;
      const gross = std + vac;
      const cpp = Math.round(gross * 0.0595 * 100) / 100;
      const ei = Math.round(gross * 0.0164 * 100) / 100;
      const tax = Math.round(gross * 0.08 * 100) / 100;
      const ded = Math.round((cpp + ei + tax) * 100) / 100;
      db.payslips.push({ id: uuid(), employee_id: e.id, pay_date: daysAgo(ago), period_start: daysAgo(ago + 30), period_end: daysAgo(ago), pay_type: 'Monthly', hours, rate: e.hourly_rate, standard_pay: std, overtime_hours: 0, overtime_rate: 0, overtime_pay: 0, vacation_pay: vac, bonus: 0, sick_pay: 0, expenses: 0, gross, tax, cpp, ei, other_deductions: 0, total_deductions: ded, net: Math.round((gross - ded) * 100) / 100, payment_method: 'EFT', notes: null, created_at: ts(daysAgo(ago)), emailed_at: null });
    });
  });
  return db;
}
