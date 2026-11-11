// Builds public/enrollment-form.pdf — the paper version of the /join
// registration (same agreement wording, src/lib/agreement.js) for families
// who register in person. Two pages = one sheet printed double-sided:
//   page 1 — the form to fill in (students, classes, parent, membership, photo consent)
//   page 2 — the full terms in three columns, initials, and the signature
//
//   NODE_PATH=/path/to/node_modules node scripts/build-paper-form.mjs
//
// Re-run it whenever the agreement or the class timetable changes. The terms
// text shrinks automatically until everything fits on two pages.
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
  { time: '6:00 – 7:30', days: { 5: 'Adv Poomsae' } },
  { time: '6:30 – 7:30', days: { 1: 'Adv Poomsae', 2: 'Adv Sparring', 3: 'Adv Poomsae', 4: 'Adv Sparring' } },
];
const CLASS_GUIDE = [
  ['Beginner', 'all ages, White–Green'],
  ['Beg/Inter', '12 & under, White–Blue'],
  ['Intermediate A', '8–12, Yellow–Red'],
  ['Intermediate B', '11 & up, Yellow–Red'],
  ['Inter/Advance', '8 & up, Green–Red'],
  ['Advance', 'black stripe & black belt'],
];

const safe = (s) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E -ÿ—•]/g, '');

const W = 612, H = 792, M = 36;
const INK = rgb(0.07, 0.07, 0.07), MUTE = rgb(0.42, 0.42, 0.42), HAIR = rgb(0.72, 0.72, 0.72), RED = rgb(0.75, 0.11, 0.13), SOFT = rgb(0.955, 0.95, 0.935);

async function build(TS) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Student Registration & Membership Agreement — Champion Hankook Taekwondo');
  const F = await pdf.embedFont(StandardFonts.Helvetica);
  const B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(fs.readFileSync(path.join(root, 'src/assets/logo.png')));
  let page, y;
  const pages = [];
  let overflow = false;
  // Flow frame: full width on page 1, three columns on page 2.
  let frame = { x: M, w: W - 2 * M, top: H - M, bottom: 30, col: 0, cols: 1, gap: 0 };

  function newPage() {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - M;
  }
  const need = (h) => {
    if (y - h >= frame.bottom) return;
    if (frame.col < frame.cols - 1) {
      frame.col++;
      frame.x += frame.w + frame.gap;
      y = frame.top;
    } else {
      overflow = true;
      globalThis.__over = (globalThis.__over || 0) + 1;
      y = frame.top; // keep drawing (off-limits); the caller retries smaller
    }
  };
  const text = (t, x, yy, size = 9, f = F, color = INK) => page.drawText(safe(t), { x, y: yy, size, font: f, color });
  const width = (t, size = 9, f = F) => f.widthOfTextAtSize(safe(t), size);

  // Wrapped paragraph with **bold** pieces, in the current frame.
  function para(t, { size = TS, lh = 1.17, color = INK, bullet = false, indent = 0, f = F } = {}) {
    const words = [];
    A.boldParts(t).forEach((p) => safe(p.text).split(/(\s+)/).forEach((wd) => wd && words.push({ t: wd, b: p.bold })));
    const bw = bullet ? size * 1.1 : 0;
    const maxW = () => frame.w - indent - bw;
    let line = [], lw = 0;
    const lines = [];
    for (const wd of words) {
      const ww = (wd.b ? B : f).widthOfTextAtSize(wd.t, size);
      if (lw + ww > maxW() && line.length && wd.t.trim()) { lines.push(line); line = []; lw = 0; }
      if (!line.length && !wd.t.trim()) continue;
      line.push(wd); lw += ww;
    }
    if (line.length) lines.push(line);
    lines.forEach((ln, i) => {
      need(size * lh);
      const x = frame.x + indent;
      if (bullet && i === 0) text('•', x, y - size, size, F, color);
      let cx = x + bw;
      ln.forEach((wd) => { page.drawText(wd.t, { x: cx, y: y - size, size, font: wd.b ? B : f, color }); cx += (wd.b ? B : f).widthOfTextAtSize(wd.t, size); });
      y -= size * lh;
    });
  }

  function section(n, title, { size = 9.5 } = {}) {
    need(26);
    y -= 3;
    page.drawRectangle({ x: frame.x, y: y - 15, width: frame.w, height: 16, color: SOFT });
    const label = n === '' ? '' : `PART ${n}`;
    if (label) text(label, frame.x + 6, y - 11, 7, B, RED);
    text(title, frame.x + 6 + (label ? width(label, 7, B) + 7 : 0), y - 11, size, B);
    y -= 19;
  }

  // Labelled blank lines to write on.
  function row(fields, h = 21) {
    need(h + 2);
    const gap = 10;
    const total = frame.w - gap * (fields.length - 1);
    const sum = fields.reduce((n, f) => n + (f[1] || 1), 0);
    let x = frame.x;
    fields.forEach(([label, weight = 1]) => {
      const w = (total * weight) / sum;
      text(label, x, y - 7, 6.8, F, MUTE);
      page.drawLine({ start: { x, y: y - h + 1 }, end: { x: x + w, y: y - h + 1 }, thickness: 0.6, color: HAIR });
      x += w + gap;
    });
    y -= h + 2;
  }
  const box = (x, yy, s = 8) => page.drawRectangle({ x, y: yy, width: s, height: s, borderColor: INK, borderWidth: 0.7 });
  // Tick boxes laid out left to right, wrapping to a new line when full.
  function checks(items, { size = 8.4, gapY = 13, x0 = frame.x } = {}) {
    need(gapY);
    let x = x0;
    for (const it of items) {
      const [main, note] = Array.isArray(it) ? it : [it, ''];
      const w = 12 + width(main, size) + (note ? 4 + width(note, size - 1.4) : 0) + 14;
      if (x + w > frame.x + frame.w && x > x0) { y -= gapY; need(gapY); x = x0; }
      box(x, y - size);
      text(main, x + 12, y - size + 0.5, size);
      if (note) text(note, x + 12 + width(main, size) + 4, y - size + 0.5, size - 1.4, F, MUTE);
      x += w;
    }
    y -= gapY;
  }
  function initialsBox(label) {
    need(TS * 2.6);
    const bw = 46, bh = TS * 2.1, bx = frame.x + frame.w - bw;
    const s = Math.max(TS - 0.4, 5.6);
    text(label, bx - width(label, s, B) - 5, y - bh + 3.5, s, B);
    page.drawRectangle({ x: bx, y: y - bh, width: bw, height: bh, borderColor: INK, borderWidth: 0.7 });
    y -= bh + 4;
  }

  // ═════════════ Page 1 — the form ═════════════
  newPage();
  const lh = 44, lw = (logo.width / logo.height) * lh;
  page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
  text(A.SCHOOL.name, M + lw + 12, y - 13, 12.5, B);
  text(A.SCHOOL.address, M + lw + 12, y - 26, 8, F, MUTE);
  text(`${A.SCHOOL.email}  ·  780-450-0181`, M + lw + 12, y - 37, 8, F, MUTE);
  const ox = W - M - 140;
  page.drawRectangle({ x: ox, y: y - 46, width: 140, height: 46, borderColor: HAIR, borderWidth: 0.8 });
  text('OFFICE USE', ox + 7, y - 10, 6, B, MUTE);
  ['Received by / date', 'Entered in portal'].forEach((l, i) => {
    text(l, ox + 7, y - 23 - i * 13, 6.3, F, MUTE);
    page.drawLine({ start: { x: ox + 68, y: y - 24 - i * 13 }, end: { x: ox + 133, y: y - 24 - i * 13 }, thickness: 0.5, color: HAIR });
  });
  y -= 56;
  page.drawRectangle({ x: M, y, width: 24, height: 3, color: RED });
  y -= 18;
  text('Student Registration & Membership Agreement', M, y, 15, B);
  y -= 11;
  text(`Version ${A.AGREEMENT_VERSION}  ·  Please print clearly. One form per family (up to two students). The terms are on the back — please read, initial and sign.`, M, y, 7.2, F, MUTE);
  y -= 6;

  section(1, 'Student information');
  for (const n of [1, 2]) {
    text(n === 1 ? 'STUDENT 1' : 'STUDENT 2 (sibling, optional)', M, y - 7, 6.8, B, n === 1 ? INK : MUTE);
    y -= 9;
    row([['First name', 1.2], ['Last name', 1.2], ['Date of birth (YYYY-MM-DD)', 1], ['Belt (if any)', 0.7]]);
    need(14);
    const q = 'Medical conditions, injuries, allergies or limitations?';
    text(q, M, y - 8, 7.8);
    checks(['No', 'Yes — details:'], { x0: M + width(q, 7.8) + 10, size: 7.8, gapY: 4 });
    page.drawLine({ start: { x: M + 380, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.6, color: HAIR });
    y -= 14;
  }

  y -= 2;
  text('CLASSES — tick each class the student(s) will come to (write 1 or 2 in the box if siblings differ)', M, y - 7, 6.8, B);
  y -= 11;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const tx = M + 58, cw = (W - 2 * M - 58) / 5, rh = 16;
  days.forEach((d, i) => text(d, tx + i * cw + 4, y - 8, 7.5, B, MUTE));
  y -= 11;
  TIMETABLE.forEach((r) => {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: HAIR });
    text(r.time, M, y - 11, 7.5, F, MUTE);
    days.forEach((_d, i) => {
      const c = r.days[i + 1];
      if (!c) return;
      box(tx + i * cw + 4, y - 12);
      text(c, tx + i * cw + 16, y - 11, 7.4);
    });
    y -= rh;
  });
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: HAIR });
  y -= 3;
  para('Guide: ' + CLASS_GUIDE.map(([a, b]) => `**${a}** ${b}`).join(' · ') + '. Age groups are a guide; the Dojang may suggest a better fit.', { size: 6.6, color: MUTE });

  section(2, 'Parent / guardian information');
  row([['Parent/guardian full name', 1.4], ['Relationship to student', 0.8], ['Phone number', 1]]);
  row([['Email address (invoices and receipts are emailed)', 1.5], ['Home address', 1.6], ['Postal code', 0.5]]);
  row([['Emergency contact name', 1.3], ['Emergency contact phone', 1], ['Relationship to student', 0.8]]);
  need(14);
  text('How did you hear about us?', M, y - 8, 7.8);
  checks(A.HEARD_FROM.map((h) => (h === 'Other' ? 'Other: ____________' : h)), { x0: M + width('How did you hear about us?', 7.8) + 10, size: 7.8 });

  section(4, 'Membership — please choose (full terms on the back)');
  text('Classes per week', M, y - 8, 7.8, B);
  y -= 12;
  checks(
    A.FREQUENCIES.filter((f) => f.value !== 'other')
      .map((f) => {
        const t = A.TUITION[f.value];
        return [f.label.replace(' classes per week', ' / week'), `$${t.month}/month or $${t.three}/3 months`];
      })
      .concat(['Other program: ______________'])
  );
  text('Membership & payment', M, y - 8, 7.8, B);
  y -= 12;
  A.PLAN_CHOICES.forEach((p) => checks([[p.label, p.note]]));
  para(`${A.GST_NOTE} New students may cancel before their third class (Part 5). Cancellations must be emailed at least 14 days before the next payment (Part 6).`, { size: 6.8, color: MUTE });
  y -= 2;
  row([['Preferred start date', 1], ['Dojang confirms start and payment dates by email', 2]]);

  section(13, 'Photo & video consent — tick one');
  checks([['YES', '— the Dojang may use the student’s identifiable photos/videos on its website, social media and promotional materials.']], { size: 8 });
  checks([['NO', '— do not use the student’s identifiable photos or videos for promotion.']], { size: 8 });
  para(`${A.PHOTO_NOTE[0]} ${A.PHOTO_NOTE[1]} ${A.PHOTO_NOTE[2]}`, { size: 6.4, color: MUTE, lh: 1.2 });

  section(3, 'Emergency authorization');
  para(A.EMERGENCY_AUTH.join(' '), { size: 6.9, lh: 1.22 });
  const page1Bottom = y;

  // ═════════════ Page 2 — terms + signature ═════════════
  newPage();
  text(safe(`${A.SCHOOL.name} — Membership terms (please read; initial where marked)`), M, H - 26, 8, B);
  const sigH = 92;
  const cols = 3, gap = 11, M2 = 28;
  frame = { x: M2, w: (W - 2 * M2 - gap * (cols - 1)) / cols, top: H - 34, bottom: 34 + sigH, col: 0, cols, gap };
  y = frame.top;
  const sub = (t) => { need(TS * 3); y -= 2; para(t, { size: TS + 0.5, f: B, lh: 1.2 }); y -= 0.5; };

  for (const t of A.TERMS) {
    sub(t.title);
    for (const b of t.body) {
      // Part 4's price list is on the front, next to the boxes.
      if (t.key === 'p4' && (b === '**Tuition:**' || b === A.GST_NOTE || (typeof b !== 'string' && /per month/.test(b.list[0])))) {
        if (b === '**Tuition:**') para('**Tuition:** as listed on the front (Part 4). All tuition is subject to 5% GST.');
        continue;
      }
      if (typeof b === 'string') para(b);
      else b.list.forEach((li) => para(li, { bullet: true }));
    }
    if (t.initial) initialsBox(`Initials (${t.title.split(' — ')[0]})`);
  }
  sub('Part 14 — By signing, I confirm that:');
  A.ACKNOWLEDGMENTS.filter((a) => !/electronic signature/i.test(a)).forEach((a) => para(a, { bullet: true }));

  // Signature block across the bottom.
  frame = { x: M, w: W - 2 * M, top: 34 + sigH, bottom: 34, col: 0, cols: 1, gap: 0 };
  y = frame.top - 4;
  page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 1, color: INK });
  y -= 4;
  text('SIGNATURE', M, y - 8, 8, B, RED);
  text('I have read and agree to this agreement (both sides), subject to my rights under applicable law.', M + 58, y - 8, 7.8);
  y -= 13;
  row([['Parent/guardian name (or adult student)', 1.2], ['Signature', 1.3], ['Date', 0.6]], 30);
  y -= 2;
  page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: SOFT });
  text('FOR THE DOJANG', M + 8, y - 13, 6.5, B, MUTE);
  const half = (W - 2 * M - 90) / 2;
  const fx = M + 80;
  text('Received by / date', fx, y - 13, 7, F, MUTE);
  page.drawLine({ start: { x: fx + 70, y: y - 14 }, end: { x: fx + half, y: y - 14 }, thickness: 0.5, color: HAIR });
  const ax = fx + half + 12;
  text('Accepted by Master Daisy / date', ax, y - 13, 7, F, MUTE);
  page.drawLine({ start: { x: ax + 116, y: y - 14 }, end: { x: W - M - 8, y: y - 14 }, thickness: 0.5, color: HAIR });

  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: W - M - F.widthOfTextAtSize(t, 7), y: 20, size: 7, font: F, color: MUTE });
    p.drawText(safe(`${A.SCHOOL.name}  ·  ${A.SCHOOL.email}`), { x: M, y: 20, size: 7, font: F, color: MUTE });
  });
  return { pdf, overflow, page1Bottom };
}

let result;
for (let ts = 7; ts >= 5.4; ts = Math.round((ts - 0.1) * 10) / 10) {
  globalThis.__over = 0;
  result = await build(ts);
  if (process.env.DEBUG) console.log(ts, 'overflow col-restarts', globalThis.__over, 'p1 left', Math.round(result.page1Bottom - 34));
  if (!result.overflow) { console.log('terms font', ts); break; }
}
if (result.overflow && !process.env.DEBUG) throw new Error('Terms do not fit on page 2 even at the smallest size');
if (result.page1Bottom < 30) throw new Error('Page 1 overflows: ' + result.page1Bottom);
const out = path.join(root, 'public/enrollment-form.pdf');
fs.writeFileSync(out, await result.pdf.save());
console.log('wrote', out, result.pdf.getPageCount(), 'pages · page 1 space left', Math.round(result.page1Bottom - 34));
