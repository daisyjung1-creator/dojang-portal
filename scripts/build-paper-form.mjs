// Builds public/enrollment-form.pdf — the paper version of the /join
// registration (same agreement wording, src/lib/agreement.js) for families
// who register in person, plus the Pre-Authorized Credit Card form.
//
//   NODE_PATH=/path/to/node_modules node scripts/build-paper-form.mjs
//
// Re-run it whenever the agreement or the class timetable changes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as A from '../src/lib/agreement.js';

const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Regular timetable (Comp Team and HP are by invitation, not on the form).
const TIMETABLE = [
  { time: '4:30 – 5:20', days: { 1: 'Intermediate B', 2: 'Beginner', 3: 'Intermediate B', 4: 'Beginner' } },
  { time: '5:00 – 5:50', days: { 5: 'Inter/Advance' } },
  { time: '5:30 – 6:20', days: { 1: 'Beg/Inter', 2: 'Intermediate A', 3: 'Beg/Inter', 4: 'Intermediate A' } },
  { time: '6:30 – 7:30', days: { 1: 'Adv Poomsae', 2: 'Adv Sparring', 3: 'Adv Poomsae', 4: 'Adv Sparring', 5: 'Adv Poomsae' } },
];
const CLASS_GUIDE = [
  ['Beginner', 'All ages · White – Green'],
  ['Beginner/Intermediate', 'Age 12 & under · White – Blue'],
  ['Intermediate A', 'Age 8 to 12 · Yellow – Red'],
  ['Intermediate B', 'Age 11 & up · Yellow – Red'],
  ['Intermediate/Advance', 'Age 8 & up · Green – Red'],
  ['Advance Poomsae / Sparring', 'Black stripe & black belt'],
];

const safe = (s) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E -ÿ—•]/g, '');

const pdf = await PDFDocument.create();
pdf.setTitle('Student Registration & Membership Agreement — Champion Hankook Taekwondo');
const F = await pdf.embedFont(StandardFonts.Helvetica);
const B = await pdf.embedFont(StandardFonts.HelveticaBold);
const logo = await pdf.embedPng(fs.readFileSync(path.join(root, 'src/assets/logo.png')));

const W = 612, H = 792, M = 46;
const INK = rgb(0.07, 0.07, 0.07), MUTE = rgb(0.42, 0.42, 0.42), HAIR = rgb(0.78, 0.78, 0.78), RED = rgb(0.75, 0.11, 0.13), SOFT = rgb(0.965, 0.96, 0.945);
let page, y, pageNo = 0;
const pages = [];

function newPage() {
  page = pdf.addPage([W, H]);
  pages.push(page);
  pageNo++;
  y = H - M;
  if (pageNo > 1) {
    page.drawText(safe(`${A.SCHOOL.name} — Student Registration & Membership Agreement`), { x: M, y: H - 28, size: 7.5, font: F, color: MUTE });
    y = H - 50;
  }
}
const need = (h) => { if (y - h < 54) newPage(); };
const text = (t, x, yy, size = 9.5, f = F, color = INK) => page.drawText(safe(t), { x, y: yy, size, font: f, color });
const width = (t, size = 9.5, f = F) => f.widthOfTextAtSize(safe(t), size);

// Wrapped paragraph with **bold** pieces.
function para(t, { size = 9, x = M, w = W - 2 * M, lh = 1.38, color = INK, bullet = false } = {}) {
  const parts = A.boldParts(t);
  const words = [];
  parts.forEach((p) => safe(p.text).split(/(\s+)/).forEach((wd) => wd && words.push({ t: wd, b: p.bold })));
  const x0 = bullet ? x + 10 : x;
  const maxW = w - (x0 - x);
  let line = [], lw = 0;
  const lines = [];
  for (const wd of words) {
    const ww = (wd.b ? B : F).widthOfTextAtSize(wd.t, size);
    if (lw + ww > maxW && line.length && wd.t.trim()) { lines.push(line); line = []; lw = 0; }
    if (!line.length && !wd.t.trim()) continue;
    line.push(wd); lw += ww;
  }
  if (line.length) lines.push(line);
  lines.forEach((ln, i) => {
    need(size * lh);
    if (bullet && i === 0) text('•', x + 1, y - size, size, F, color);
    let cx = x0;
    ln.forEach((wd) => { page.drawText(wd.t, { x: cx, y: y - size, size, font: wd.b ? B : F, color }); cx += (wd.b ? B : F).widthOfTextAtSize(wd.t, size); });
    y -= size * lh;
  });
}

function section(n, title) {
  need(40);
  y -= 10;
  page.drawRectangle({ x: M, y: y - 17, width: W - 2 * M, height: 19, color: SOFT });
  text(`PART ${n}`, M + 8, y - 12.5, 7.5, B, RED);
  text(title, M + 8 + width(`PART ${n}`, 7.5, B) + 8, y - 12.5, 10, B);
  y -= 28;
}

// A labelled blank line to write on.
function blank(label, x, w, { h = 26 } = {}) {
  text(label, x, y - 8, 7.5, F, MUTE);
  page.drawLine({ start: { x, y: y - h + 2 }, end: { x: x + w, y: y - h + 2 }, thickness: 0.6, color: HAIR });
}
function row(fields, h = 28) {
  need(h + 4);
  const gap = 12;
  const total = W - 2 * M - gap * (fields.length - 1);
  const sum = fields.reduce((n, f) => n + (f[1] || 1), 0);
  let x = M;
  fields.forEach(([label, weight = 1]) => { const w = (total * weight) / sum; blank(label, x, w, { h }); x += w + gap; });
  y -= h + 4;
}
function box(x, yy, s = 8.5) { page.drawRectangle({ x, y: yy, width: s, height: s, borderColor: INK, borderWidth: 0.7 }); }
function checks(items, { cols = 1, size = 9, gapY = 15 } = {}) {
  const colW = (W - 2 * M) / cols;
  for (let i = 0; i < items.length; i += cols) {
    need(gapY);
    items.slice(i, i + cols).forEach((it, j) => {
      const x = M + j * colW;
      box(x, y - size - 0.5);
      const [main, note] = Array.isArray(it) ? it : [it, ''];
      text(main, x + 14, y - size, size, F);
      if (note) text(note, x + 14 + width(main, size) + 6, y - size, size - 1.5, F, MUTE);
    });
    y -= gapY;
  }
}
function initialsBox(label = 'Parent/guardian initials') {
  need(26);
  const bw = 62, bx = W - M - bw;
  text(label, bx - width(label, 7.5) - 8, y - 15, 7.5, F, MUTE);
  page.drawRectangle({ x: bx, y: y - 22, width: bw, height: 20, borderColor: INK, borderWidth: 0.8 });
  y -= 30;
}

// ───────────── Page 1: header ─────────────
newPage();
const lh = 54, lw = (logo.width / logo.height) * lh;
page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
text(A.SCHOOL.name, M + lw + 14, y - 16, 13, B);
text(A.SCHOOL.address, M + lw + 14, y - 30, 8.5, F, MUTE);
text(`${A.SCHOOL.email}  ·  780-450-0181`, M + lw + 14, y - 42, 8.5, F, MUTE);
// office-use box
const ox = W - M - 150;
page.drawRectangle({ x: ox, y: y - 58, width: 150, height: 58, borderColor: HAIR, borderWidth: 0.8 });
text('OFFICE USE', ox + 8, y - 11, 6.5, B, MUTE);
['Received by / date', 'Entered in portal', 'Student ID / notes'].forEach((l, i) => {
  text(l, ox + 8, y - 24 - i * 13, 6.5, F, MUTE);
  page.drawLine({ start: { x: ox + 74, y: y - 25 - i * 13 }, end: { x: ox + 142, y: y - 25 - i * 13 }, thickness: 0.5, color: HAIR });
});
y -= 74;
page.drawRectangle({ x: M, y, width: 26, height: 3, color: RED });
y -= 24;
text('Student Registration & Membership Agreement', M, y, 18, B);
y -= 14;
text(`Agreement version ${A.AGREEMENT_VERSION}  ·  Please print clearly. One form per family — up to two students on this form.`, M, y, 8, F, MUTE);
y -= 12;
A.INTRO.forEach((t) => para(t, { size: 8.5, color: MUTE }));

// ───────────── Part 1 ─────────────
section(1, 'Student information');
for (const n of [1, 2]) {
  need(150);
  text(n === 1 ? 'STUDENT 1' : 'STUDENT 2 (sibling, optional)', M, y - 8, 7.5, B, n === 1 ? INK : MUTE);
  y -= 12;
  row([['First name', 1.2], ['Last name', 1.2], ['Date of birth (YYYY-MM-DD)', 1], ['Belt (if any)', 0.8]]);
  need(16);
  text('Medical conditions, injuries, allergies or physical limitations that may affect safe participation?', M, y - 9, 8.5);
  y -= 13;
  checks([['No', ''], ['Yes — please explain below', '']], { cols: 2 });
  row([['Details / emergency instructions or activity restrictions', 1]]);
}

need(170);
text('CLASSES — tick each class the student(s) will come to (write 1 or 2 for each student if they differ)', M, y - 8, 7.5, B);
y -= 14;
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const tx = M + 66, cw = (W - 2 * M - 66) / 5, rh = 22;
days.forEach((d, i) => text(d, tx + i * cw + 6, y - 9, 8, B, MUTE));
y -= 14;
TIMETABLE.forEach((r) => {
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: HAIR });
  text(r.time, M, y - 14, 8, F, MUTE);
  days.forEach((_d, i) => {
    const c = r.days[i + 1];
    if (!c) return;
    box(tx + i * cw + 6, y - 15.5);
    text(c, tx + i * cw + 19, y - 14, 7.6);
  });
  y -= rh;
});
page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: HAIR });
y -= 10;
para('Class guide (age groups are a guide — the Dojang may suggest a better fit): ' + CLASS_GUIDE.map(([a, b]) => `**${a}** ${b}`).join(';  ') + '. Comp Team and HP are by invitation.', { size: 7.6, color: MUTE });

// ───────────── Part 2 ─────────────
section(2, 'Parent / guardian information');
row([['Parent/guardian full name', 1.4], ['Relationship to student', 1]]);
row([['Phone number', 1], ['Email address (invoices and receipts are emailed)', 1.6]]);
row([['Home address', 2], ['Postal code', 0.6]]);
row([['Emergency contact name', 1.2], ['Emergency contact phone', 1], ['Relationship to student', 0.9]]);
need(30);
text('How did you hear about us?', M, y - 9, 8.5);
y -= 14;
checks(A.HEARD_FROM.map((h) => [h === 'Other' ? 'Other: ______________' : h, '']), { cols: 5 });

// ───────────── Part 3 ─────────────
section(3, 'Emergency authorization');
A.EMERGENCY_AUTH.forEach((t) => para(t, { size: 8.5, bullet: true }));

// ───────────── Part 4: choices ─────────────
section(4, 'Membership — please choose');
text('Training frequency', M, y - 9, 8.5, B);
y -= 15;
checks(
  A.FREQUENCIES.filter((f) => f.value !== 'other').map((f) => {
    const t = A.TUITION[f.value];
    return [f.label, `$${t.month}/month  or  $${t.three} for three months  ·  ${f.note}`];
  }).concat([['Other program: ____________________________', '']])
);
y -= 2;
text('Membership & payment', M, y - 9, 8.5, B);
y -= 15;
checks(A.PLAN_CHOICES.map((p) => [p.label, p.note]));
para(`${A.GST_NOTE} Pre-authorized credit card payments need the Credit Card Authorization (last page).`, { size: 8, color: MUTE });
y -= 2;
row([['Preferred start date', 1], ['', 2]]);

// ───────────── Parts 4–12: terms ─────────────
need(60);
section('4-12', 'Membership terms — please read; initial where marked');
for (const t of A.TERMS) {
  need(34);
  y -= 4;
  text(t.title, M, y - 10, 9.5, B);
  y -= 15;
  for (const b of t.body) {
    if (typeof b === 'string') para(b, { size: 8.4 });
    else b.list.forEach((li) => para(li, { size: 8.4, bullet: true }));
    y -= 2;
  }
  if (t.initial) initialsBox(`I have read and understand ${t.title.split(' — ')[0]}`);
}

// ───────────── Part 13 ─────────────
section(13, 'Photo & video consent');
para(A.PHOTO_NOTE[0], { size: 8.4, color: MUTE });
y -= 2;
[A.PHOTO_YES, A.PHOTO_NO].forEach((t) => {
  need(26);
  box(M, y - 9.5);
  para(t, { size: 8.6, x: M + 14, w: W - 2 * M - 14 });
  y -= 3;
});
para(`${A.PHOTO_NOTE[1]} ${A.PHOTO_NOTE[2]}`, { size: 7.6, color: MUTE });

// ───────────── Part 14 ─────────────
// Keep the whole signature part together on one page.
need(330);
section(14, 'Acknowledgment & signature');
para('By signing below, I confirm that:', { size: 8.6 });
A.ACKNOWLEDGMENTS.filter((a) => !/electronic signature/i.test(a)).forEach((a) => para(a, { size: 8.4, bullet: true }));
y -= 6;
row([['Student name(s)', 1]]);
row([['Parent/guardian name (or adult student)', 1.3], ['Date', 0.6]]);
row([['Signature', 1.3], ['', 0.6]], 36);
y -= 4;
need(60);
page.drawRectangle({ x: M, y: y - 52, width: W - 2 * M, height: 52, color: SOFT });
text('FOR THE DOJANG', M + 10, y - 13, 7, B, MUTE);
const half = (W - 2 * M - 30) / 2;
text('Received by', M + 10, y - 28, 7.5, F, MUTE);
page.drawLine({ start: { x: M + 60, y: y - 30 }, end: { x: M + 10 + half, y: y - 30 }, thickness: 0.5, color: HAIR });
text('Date', M + 10, y - 44, 7.5, F, MUTE);
page.drawLine({ start: { x: M + 60, y: y - 46 }, end: { x: M + 10 + half, y: y - 46 }, thickness: 0.5, color: HAIR });
const ax = M + 20 + half;
text('Accepted by  Master Daisy', ax, y - 28, 7.5, F, MUTE);
page.drawLine({ start: { x: ax + 100, y: y - 30 }, end: { x: W - M - 10, y: y - 30 }, thickness: 0.5, color: HAIR });
text('Date', ax, y - 44, 7.5, F, MUTE);
page.drawLine({ start: { x: ax + 100, y: y - 46 }, end: { x: W - M - 10, y: y - 46 }, thickness: 0.5, color: HAIR });
y -= 62;

// ───────────── Credit card authorization ─────────────
newPage();
y -= 4;
page.drawRectangle({ x: M, y, width: 26, height: 3, color: RED });
y -= 24;
text('Pre-Authorized Credit Card Authorization', M, y, 17, B);
y -= 14;
text('Only for Monthly or Three-Month Pre-Authorized Credit Card memberships (Part 7.1).', M, y, 8.5, F, MUTE);
y -= 18;
row([['Student name(s)', 1]]);
row([['Cardholder name (as shown on the card)', 1.4], ['Phone', 0.8]]);
need(30);
text('Card type', M, y - 9, 8.5);
y -= 14;
checks([['Visa', ''], ['Mastercard', ''], ['Other: __________', '']], { cols: 3 });
// card number boxes
need(46);
text('Card number', M, y - 8, 7.5, F, MUTE);
y -= 12;
for (let i = 0; i < 16; i++) {
  const gx = M + i * 22 + Math.floor(i / 4) * 10;
  page.drawRectangle({ x: gx, y: y - 22, width: 19, height: 20, borderColor: INK, borderWidth: 0.6 });
}
y -= 32;
row([['Expiry (MM/YY)', 0.7], ['Billing address & postal code of the card', 2]]);
need(34);
text('Charge', M, y - 9, 8.5);
y -= 14;
checks([['Monthly', ''], ['Every three months', '']], { cols: 2 });
row([['Amount each time (before 5% GST)', 1], ['First charge date', 1]]);
y -= 4;
[
  'I authorize Champion Hankook Taekwondo to charge the credit card above for the tuition shown, plus GST, on each payment date until I cancel my membership as set out in Part 6 of the agreement.',
  'I understand that cancelling the membership and cancelling this credit card authorization are separate: to stop the charges I will tell the Dojang by email at hankooktkd@gmail.com. Changes to the tuition amount will be emailed at least 30 days before they apply (Part 7.6).',
  'For your security, do not write the card’s 3-digit security code (CVV) on this form — the Dojang will ask for it in person or by phone when setting up the payment, and does not keep it.',
].forEach((t) => { para(t, { size: 8.6 }); y -= 3; });
y -= 6;
row([['Cardholder signature', 1.4], ['Date', 0.6]], 36);
need(60);
y -= 6;
page.drawRectangle({ x: M, y: y - 40, width: W - 2 * M, height: 40, color: SOFT });
text('FOR THE DOJANG', M + 10, y - 13, 7, B, MUTE);
text('Set up in card terminal by ____________________   Date ____________   Last 4 digits ________   (shred card number section after setup)', M + 10, y - 28, 7.5, F, MUTE);

// Page numbers
pages.forEach((p, i) => {
  const t = `Page ${i + 1} of ${pages.length}`;
  p.drawText(t, { x: W - M - F.widthOfTextAtSize(t, 7.5), y: 26, size: 7.5, font: F, color: MUTE });
  p.drawText(safe(`${A.SCHOOL.name}  ·  ${A.SCHOOL.email}`), { x: M, y: 26, size: 7.5, font: F, color: MUTE });
});

const out = path.join(root, 'public/enrollment-form.pdf');
fs.writeFileSync(out, await pdf.save());
console.log('wrote', out, pages.length, 'pages');
