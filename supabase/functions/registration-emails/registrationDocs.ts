// Signed online registration (from the public /join form) as a PDF, plus the
// emails: a copy for the family and a heads-up for the dojang.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { SCHOOL, INTRO, TERMS, EMERGENCY_AUTH, ACKNOWLEDGMENTS, PHOTO_YES, PHOTO_NO, FREQUENCIES, boldParts } from './agreement.ts';

const pdfSafe = (s: any) =>
  String(s ?? '').replace(/[–−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x20-\x7E -ÿ—]/g, '');
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fdate = (iso?: string) =>
  iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '-';
export const kidName = (k: any) => `${k?.first || ''} ${k?.last || ''}`.trim();
const kidsText = (r: any) => (r.kids || []).map(kidName).filter(Boolean).join(', ');
const daysText = (k: any) => (k.class_days || []).map((s: string) => { const [d, c] = s.split(':'); return `${DAYS[Number(d)]} ${c}`; }).join(', ');
const freqLabel = (r: any) => (r.frequency === 'other' ? `Other program: ${r.other_program || ''}` : FREQUENCIES.find((f: any) => f.value === r.frequency)?.label || '-');

export async function buildRegistrationPdf(r: Record<string, any>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const W = 612, H = 792, M = 50;
  const ink = rgb(0.12, 0.14, 0.12), mute = rgb(0.4, 0.42, 0.38), hair = rgb(0.85, 0.83, 0.78), red = rgb(0.75, 0.11, 0.13);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < M) newPage(); };

  // Draws text that may contain **bold** parts, wrapped to the width.
  const para = (text: string, o: { size?: number; x?: number; w?: number; f?: any; color?: any; gap?: number } = {}) => {
    const size = o.size ?? 8.6, x0 = o.x ?? M, w = o.w ?? W - M - x0, lh = size * 1.32;
    const words: { t: string; f: any }[] = [];
    for (const p of boldParts(text)) for (const t of pdfSafe(p.text).split(/(\s+)/)) if (t) words.push({ t, f: p.bold ? bold : o.f ?? font });
    let line: { t: string; f: any }[] = [];
    let lw = 0;
    const flush = () => {
      need(lh);
      let x = x0;
      while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
      for (const s of line) { page.drawText(s.t, { x, y: y - size, size, font: s.f, color: o.color ?? ink }); x += s.f.widthOfTextAtSize(s.t, size); }
      y -= lh; line = []; lw = 0;
    };
    for (const wd of words) {
      const ww = wd.f.widthOfTextAtSize(wd.t, size);
      if (/^\s+$/.test(wd.t)) { if (line.length) { line.push({ t: ' ', f: wd.f }); lw += wd.f.widthOfTextAtSize(' ', size); } continue; }
      if (lw + ww > w && line.length) flush();
      line.push(wd); lw += ww;
    }
    if (line.length) flush();
    y -= o.gap ?? 3;
  };
  const heading = (t: string) => {
    need(30); y -= 8;
    page.drawText(pdfSafe(t).toUpperCase(), { x: M, y: y - 10, size: 9.5, font: bold, color: ink });
    y -= 14; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ink }); y -= 7;
  };
  const row = (k: string, v: string) => {
    const size = 9; need(13);
    page.drawText(pdfSafe(k), { x: M, y: y - size, size, font, color: mute });
    const before = y; para(v, { x: M + 130, size, gap: 0 }); if (y === before) y -= 12;
  };

  // Title
  page.drawRectangle({ x: M, y: y - 3, width: 26, height: 3, color: red });
  y -= 22;
  page.drawText(pdfSafe(SCHOOL.name), { x: M, y, size: 17, font: bold, color: ink }); y -= 16;
  page.drawText('Student Registration & Membership Agreement', { x: M, y, size: 11, font, color: ink }); y -= 13;
  page.drawText(pdfSafe(`${SCHOOL.address} · ${SCHOOL.email}`), { x: M, y, size: 8.5, font, color: mute }); y -= 8;
  for (const p of INTRO) para(p, { f: ital, color: mute, size: 8.4 });

  const f = r.family || {};
  heading('Part 1 — Student information');
  for (const k of r.kids || []) {
    row('Student', `**${kidName(k)}**  ·  born ${fdate(k.dob)}`);
    if (daysText(k)) row('Requested classes', daysText(k));
    row('Medical', k.medical ? `**Yes** — ${k.medical_detail || ''}` : 'No');
    if (k.instructions) row('Emergency instructions', k.instructions);
    y -= 4;
  }
  row('Registration date', fdate(r.signed_on || r.created_at));

  heading(r.adult_student ? 'Part 2 — Adult student contact' : 'Part 2 — Parent / guardian information');
  row('Name', `${f.guardian_name || ''}${f.relationship && !r.adult_student ? ` (${f.relationship})` : ''}`);
  row('Phone', f.phone || '');
  row('Email', f.email || '');
  row('Home address', `${f.address || ''} ${f.postal || ''}`.trim());
  row('Emergency contact', `${f.emergency_name || ''} · ${f.emergency_phone || ''}${f.emergency_relationship ? ` (${f.emergency_relationship})` : ''}`);
  if (f.heard) row('Heard about us', f.heard === 'Other' ? `Other: ${f.heard_other || ''}` : f.heard);

  heading('Part 3 — Emergency authorization');
  for (const p of EMERGENCY_AUTH) para(p);

  heading('Membership selection');
  row('Training frequency', freqLabel(r));
  row('Membership & payment', r.plan || '-');
  row('Preferred start date', fdate(r.start_date));
  para('Tuition, taxes and payment dates are confirmed by the Dojang. Pre-authorized credit card payments start after a separate Credit Card Authorization is completed.', { color: mute, size: 8.2 });

  for (const t of TERMS) {
    heading(t.title);
    for (const b of t.body) {
      if (typeof b === 'string') para(b);
      else for (const li of b.list) { need(12); page.drawText('•', { x: M + 4, y: y - 8.6, size: 8.6, font, color: ink }); para(li, { x: M + 14 }); }
    }
    if (t.initial) {
      need(18);
      const v = pdfSafe(r.initials?.[t.key] || '');
      const bx = W - M - 46;
      page.drawText(`I have read ${t.title.split(' — ')[0]}.  Initials:`, { x: bx - 150, y: y - 12, size: 8.6, font: bold, color: ink });
      page.drawRectangle({ x: bx, y: y - 16, width: 46, height: 17, borderColor: ink, borderWidth: 0.8 });
      page.drawText(v, { x: bx + 23 - bold.widthOfTextAtSize(v, 10) / 2, y: y - 12, size: 10, font: bold, color: ink });
      y -= 22;
    }
  }

  heading('Part 13 — Photo & video consent');
  para(`[X] ${r.photo_consent ? PHOTO_YES : PHOTO_NO}`, { f: bold });

  heading('Part 14 — Acknowledgment & signature');
  para('By signing below, I confirm that:');
  for (const a of ACKNOWLEDGMENTS) { need(12); page.drawText('•', { x: M + 4, y: y - 8.6, size: 8.6, font, color: ink }); para(a, { x: M + 14 }); }
  y -= 6;
  row('Student name(s)', kidsText(r));
  row(r.adult_student ? 'Adult student' : 'Parent/guardian name', r.signature_name || '');
  need(80);
  page.drawText(r.adult_student ? 'Adult student signature' : 'Parent/guardian signature', { x: M, y: y - 9, size: 9, font, color: mute });
  const img = String(r.signature_image || '');
  if (img.startsWith('data:image/png;base64,')) {
    try {
      const png = await pdf.embedPng(img.slice('data:image/png;base64,'.length));
      const h = 52, w = Math.min(220, (png.width / png.height) * h);
      page.drawImage(png, { x: M + 130, y: y - h, width: w, height: h });
    } catch (_e) { /* unreadable image: name below still stands */ }
  }
  y -= 56;
  page.drawLine({ start: { x: M + 130, y }, end: { x: M + 360, y }, thickness: 0.6, color: hair });
  y -= 6;
  row('Date', `${fdate(r.signed_on)} — signed online (agreement version ${r.agreement_version || ''})`);
  y -= 14; need(30);
  page.drawText('Dojang representative: ______________________   Signature: ______________________   Date: ____________', { x: M, y: y - 9, size: 8.6, font, color: ink });

  // Page numbers
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`${pdfSafe(SCHOOL.name)} · Registration · ${i + 1} / ${pages.length}`, { x: M, y: 26, size: 7.5, font, color: mute }));
  return await pdf.save();
}

export function registrationFamilyEmail(r: Record<string, any>) {
  const f = r.family || {};
  const first = String(f.guardian_name || '').trim().split(/\s+/)[0] || 'there';
  const kids = (r.kids || []).map((k: any) => k.first).filter(Boolean);
  const names = kids.length > 1 ? `${kids.slice(0, -1).join(', ')} and ${kids[kids.length - 1]}` : kids[0] || 'your child';
  const subject = `Registration received — ${kidsText(r)}`;
  const message = `Hi ${first},

Thank you for registering ${r.adult_student ? 'with us' : names} at ${SCHOOL.name}!

A copy of your signed Student Registration & Membership Agreement is attached for your records.

We'll confirm the class schedule, tuition and payment details with you shortly.${String(r.plan || '').includes('Credit Card') ? ' A separate Credit Card Authorization will be completed at the Dojang before automatic payments begin.' : ''}

If you have any questions, just reply to this email.

Master Daisy
${SCHOOL.name}`;
  return { subject, message };
}

export function registrationSchoolEmail(r: Record<string, any>) {
  const f = r.family || {};
  const kidLines = (r.kids || [])
    .map((k: any) => `• ${kidName(k)} (born ${fdate(k.dob)}) — ${daysText(k) || 'no classes picked'}${k.medical ? ` — MEDICAL: ${k.medical_detail}` : ''}`)
    .join('\n');
  const subject = `[New registration] ${kidsText(r)}`;
  const message = `A new online registration came in.

${kidLines}

${r.adult_student ? 'Adult student' : 'Parent/guardian'}: ${f.guardian_name || ''}${f.relationship && !r.adult_student ? ` (${f.relationship})` : ''}
Phone: ${f.phone || ''}
Email: ${f.email || ''}
Plan: ${freqLabel(r)} · ${r.plan || ''}${r.start_date ? ` · start ${fdate(r.start_date)}` : ''}
Photo/video consent: ${r.photo_consent ? 'Yes' : 'NO'}

Review and enroll in the portal: Enrollment → Online registrations.
The signed agreement is attached.`;
  return { subject, message };
}

export const registrationPdfName = (r: Record<string, any>) =>
  `Registration-${kidsText(r).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Student'}.pdf`;
