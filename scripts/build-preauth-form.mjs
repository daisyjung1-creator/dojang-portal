// Builds public/preauth-form.pdf — the paper Credit Card Pre-Authorized
// Payment Authorization (Part 7.1 of the membership agreement). One page.
//
//   NODE_PATH=/path/to/node_modules node scripts/build-preauth-form.mjs
//
// Wording follows src/lib/agreement.js (tuition, cancellation, notice periods);
// re-run it whenever those change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as A from '../src/lib/agreement.js';

const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const safe = (s) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E -ÿ—•]/g, '');
const money = (n) => '$' + Number(n).toFixed(2);
const withGst = (n) => Math.round(n * 1.05 * 100) / 100;

const W = 612, H = 792, M = 38;
const INK = rgb(0.07, 0.07, 0.07), MUTE = rgb(0.42, 0.42, 0.42), HAIR = rgb(0.72, 0.72, 0.72), RED = rgb(0.75, 0.11, 0.13), SOFT = rgb(0.955, 0.95, 0.935);

const pdf = await PDFDocument.create();
pdf.setTitle('Credit Card Pre-Authorized Payment Authorization — Champion Hankook Taekwondo');
const F = await pdf.embedFont(StandardFonts.Helvetica);
const B = await pdf.embedFont(StandardFonts.HelveticaBold);
const logo = await pdf.embedPng(fs.readFileSync(path.join(root, 'src/assets/logo.png')));
const page = pdf.addPage([W, H]);
let y = H - M;

const text = (t, x, yy, size = 9, f = F, color = INK) => page.drawText(safe(t), { x, y: yy, size, font: f, color });
const width = (t, size = 9, f = F) => f.widthOfTextAtSize(safe(t), size);
const box = (x, yy, s = 8) => page.drawRectangle({ x, y: yy, width: s, height: s, borderColor: INK, borderWidth: 0.7 });
const line = (x1, x2, yy) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: HAIR });

function para(t, { x = M, w = W - 2 * M, size = 7.6, lh = 1.28, color = INK, bullet = '' } = {}) {
  const words = [];
  A.boldParts(t).forEach((p) => safe(p.text).split(/(\s+)/).forEach((wd) => wd && words.push({ t: wd, b: p.bold })));
  const bw = bullet ? width(bullet + ' ', size, B) + 2 : 0;
  let ln = [], lw = 0;
  const lines = [];
  for (const wd of words) {
    const ww = (wd.b ? B : F).widthOfTextAtSize(wd.t, size);
    if (lw + ww > w - bw && ln.length && wd.t.trim()) { lines.push(ln); ln = []; lw = 0; }
    if (!ln.length && !wd.t.trim()) continue;
    ln.push(wd); lw += ww;
  }
  if (ln.length) lines.push(ln);
  lines.forEach((l, i) => {
    if (bullet && i === 0) text(bullet, x, y - size, size, B);
    let cx = x + bw;
    l.forEach((wd) => { page.drawText(wd.t, { x: cx, y: y - size, size, font: wd.b ? B : F, color }); cx += (wd.b ? B : F).widthOfTextAtSize(wd.t, size); });
    y -= size * lh;
  });
}
function section(n, title) {
  y -= 4;
  page.drawRectangle({ x: M, y: y - 15, width: W - 2 * M, height: 16, color: SOFT });
  text(n, M + 6, y - 11, 7, B, RED);
  text(title, M + 6 + width(n, 7, B) + 7, y - 11, 9.5, B);
  y -= 21;
}
function row(fields, h = 22) {
  const gap = 10, total = W - 2 * M - gap * (fields.length - 1);
  const sum = fields.reduce((n, f) => n + (f[1] || 1), 0);
  let x = M;
  fields.forEach(([label, wt = 1]) => {
    const w = (total * wt) / sum;
    text(label, x, y - 7, 6.8, F, MUTE);
    line(x, x + w, y - h + 1);
    x += w + gap;
  });
  y -= h + 2;
}
// Row of small write-in boxes (one digit each).
function digits(x, yy, groups, s = 13, gap = 7) {
  let cx = x;
  groups.forEach((n, gi) => {
    for (let i = 0; i < n; i++) page.drawRectangle({ x: cx + i * s, y: yy, width: s, height: s + 2, borderColor: INK, borderWidth: 0.6 });
    cx += n * s + (gi < groups.length - 1 ? gap : 0);
  });
  return cx;
}

// ── Header ──
const lh = 40, lw = (logo.width / logo.height) * lh;
page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
text(A.SCHOOL.name, M + lw + 12, y - 12, 12, B);
text(A.SCHOOL.address, M + lw + 12, y - 25, 8, F, MUTE);
text(`${A.SCHOOL.email}  ·  780-450-0181`, M + lw + 12, y - 36, 8, F, MUTE);
const ox = W - M - 140;
page.drawRectangle({ x: ox, y: y - 42, width: 140, height: 42, borderColor: HAIR, borderWidth: 0.8 });
text('OFFICE USE', ox + 7, y - 10, 6, B, MUTE);
['Entered by / date', 'Card ending (last 4)'].forEach((l, i) => {
  text(l, ox + 7, y - 22 - i * 12, 6.3, F, MUTE);
  line(ox + 72, ox + 133, y - 23 - i * 12);
});
y -= 52;
page.drawRectangle({ x: M, y, width: 24, height: 3, color: RED });
y -= 18;
text('Credit Card Pre-Authorized Payment Authorization', M, y, 15, B);
y -= 12;
para(`This authorization goes with the **Student Registration & Membership Agreement** (Part 7.1). It lets ${A.SCHOOL.name} ("the Dojang") charge tuition to the credit card below automatically. Please print clearly.`, { size: 7.4, color: MUTE });

// ── 1. Account ──
section('1', 'Member / family');
row([['Parent/guardian (or adult student) full name', 1.4], ['Phone', 0.8]]);
row([['Student name(s)', 1.4], ['Email (receipts and notices are emailed)', 1.2]]);
row([['Billing address (as on the card statement)', 1.7], ['Postal code', 0.5]]);

// ── 2. Card ──
section('2', 'Credit card');
y -= 2;
text('Card type', M, y - 8, 7.8);
let cx = M + 46;
['Visa', 'Mastercard', 'American Express'].forEach((c) => { box(cx, y - 9); text(c, cx + 12, y - 8, 7.8); cx += 22 + width(c, 7.8); });
y -= 18;
text('Card number', M, y - 11, 7.8);
const end = digits(M + 62, y - 14, [4, 4, 4, 4]);
text('Expiry (MM/YY)', end + 16, y - 11, 7.8);
digits(end + 16 + width('Expiry (MM/YY)', 7.8) + 6, y - 14, [2, 2], 13, 9);
const slashX = end + 16 + width('Expiry (MM/YY)', 7.8) + 6 + 26;
text('/', slashX + 1.5, y - 11, 9);
y -= 26;
row([['Cardholder name (as shown on the card)', 1.3], ['Relationship to student (if not the parent above)', 1]]);
para('**Credit cards only** - debit cards (including Visa Debit and Debit Mastercard) cannot be used. For your security, we do not ask for the 3-digit security code (CVC) on paper. Card details are kept in a locked file at the Dojang, used only for the charges you authorize here, and never emailed.', { size: 6.8, color: MUTE });

// ── 3. Payment schedule ──
section('3', 'Payment schedule — tick one');
const colX = [M, M + 150, M + 340];
text('Classes per week', colX[0], y - 7, 6.8, B, MUTE);
text('Monthly (charged every month)', colX[1], y - 7, 6.8, B, MUTE);
text('Every 3 months (save $15)', colX[2], y - 7, 6.8, B, MUTE);
y -= 12;
for (const [k, t] of Object.entries(A.TUITION)) {
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: HAIR });
  text(`${k} classes per week`, colX[0], y - 11, 8.2);
  box(colX[1], y - 12);
  text(`${money(t.month)} + GST = `, colX[1] + 12, y - 11, 8.2, F, MUTE);
  text(money(withGst(t.month)), colX[1] + 12 + width(`${money(t.month)} + GST = `, 8.2), y - 11, 8.2, B);
  if (t.three) {
    box(colX[2], y - 12);
    text(`${money(t.three)} + GST = `, colX[2] + 12, y - 11, 8.2, F, MUTE);
    text(money(withGst(t.three)), colX[2] + 12 + width(`${money(t.three)} + GST = `, 8.2), y - 11, 8.2, B);
  }
  y -= 16;
}
page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: HAIR });
y -= 3;
box(M, y - 11);
text('Other amount: $____________ + GST, charged every ____________ (e.g. sibling or program rate agreed with the Dojang)', M + 12, y - 10, 7.8);
y -= 17;
row([['First charge date', 1], ['Then on this day each period (e.g. the 5th)', 1.1], ['Amount per charge incl. GST', 1]]);

// ── 4. Terms ──
section('4', 'Terms of this authorization');
const T = [
  `**Authorization.** I authorize ${A.SCHOOL.name} to charge the credit card above for the tuition and schedule in Section 3, on each payment date, until I cancel this authorization or the membership ends. A receipt is emailed after each charge.`,
  '**Other purchases.** Belt testing, tournaments, uniforms, equipment and events are **not** charged automatically. The Dojang emails an invoice first and charges this card **only if I reply to approve**; otherwise I can pay another way.',
  '**Tuition changes.** The Dojang will give **at least 30 days’ written notice by email** before the amount charged changes. The new amount applies from the first payment date after the notice period.',
  '**Cancelling the membership.** Membership cancellation must be **sent by email to hankooktkd@gmail.com at least 14 calendar days before the next payment date**. A request received later may not stop the upcoming charge. The Dojang confirms by email within 2 business days (Agreement, Part 6).',
  '**Cancelling this card authorization.** I may cancel this authorization at any time by email. **Cancelling the card authorization does not cancel the membership** or any amount already owed; the membership must be cancelled separately (above).',
  '**New students.** New students may cancel before the start of their third scheduled class for a refund, less a $20 cancellation administration fee and $20 per class attended (Agreement, Part 5). Refunds go back to this card within 14 days.',
  '**Declined or expired card.** I will tell the Dojang when the card expires, is replaced or the details change. If a charge is declined, the Dojang will let me know by email and I agree to pay the amount due within 7 days.',
  'This authorization does not limit my rights under applicable law or my card issuer’s rules.',
];
T.forEach((t, i) => para(t, { bullet: `${i + 1}.`, size: 7.9, lh: 1.28 }));

// ── Signature ──
y -= 6;
const ib = 46, ibh = 18;
text('I have read and agree to the terms above.  Initials:', W - M - ib - 6 - width('I have read and agree to the terms above.  Initials:', 8, B), y - 13, 8, B);
page.drawRectangle({ x: W - M - ib, y: y - ibh, width: ib, height: ibh, borderColor: INK, borderWidth: 0.8 });
y -= ibh + 6;
row([['Cardholder name', 1.2], ['Signature', 1.3], ['Date', 0.6]], 26);

text(safe(`${A.SCHOOL.name}  ·  ${A.SCHOOL.email}  ·  780-450-0181`), M, 20, 7, F, MUTE);
const v = `Version ${A.AGREEMENT_VERSION}`;
text(v, W - M - width(v, 7), 20, 7, F, MUTE);
if (y < 30) throw new Error('Page overflows: ' + y);

const out = path.join(root, 'public/preauth-form.pdf');
fs.writeFileSync(out, await pdf.save());
console.log('wrote', out, '· space left', Math.round(y - 30));
