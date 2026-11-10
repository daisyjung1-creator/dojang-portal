// Supabase Edge Function: proof-of-enrollment
//
// Builds a one-page "Proof of Enrollment" letter (for KidSport and other
// funding applications): club name, child's name, program dates and the total
// registration cost. Called from the portal by a signed-in admin with
//   { student_id, start, end, amount, program?, note?, action: 'pdf' | 'email', to? }
// 'pdf' returns { pdf (base64), filename }; 'email' also sends it to the
// guardian (copy to the dojang) and returns the same.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_ADDRESS = Deno.env.get('RESEND_FROM_ADDRESS') || 'onboarding@resend.dev';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const pdfSafe = (s: any) =>
  String(s ?? '').replace(/[–−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x20-\x7E -ÿ—]/g, '');
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fdate = (iso?: string) =>
  iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '-';
const money = (n: number) => '$' + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const splitEmails = (v: unknown) => String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
const todayEdm = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function buildPoePdf(o: { s: Record<string, any>; student: Record<string, any>; start: string; end: string; amount: number; program: string; note?: string; classes?: string }) {
  const { s, student } = o;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 64;
  const ink = rgb(0.12, 0.14, 0.12), mute = rgb(0.4, 0.42, 0.38), hair = rgb(0.85, 0.83, 0.78), red = rgb(0.75, 0.11, 0.13);
  const page = pdf.addPage([W, H]);
  let y = H - M;

  // Letterhead: logo (if set) + club details
  let x0 = M;
  const logo = String(s.logo_data || '');
  const m = logo.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (m) {
    try {
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const img = m[1] === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const h = 58, w = (img.width / img.height) * h;
      page.drawImage(img, { x: M, y: y - h, width: w, height: h });
      x0 = M + w + 14;
    } catch (_e) { /* no logo */ }
  }
  const club = pdfSafe(s.business_name || 'Edmonton Champion Hankook Taekwondo');
  page.drawText(club, { x: x0, y: y - 18, size: 15, font: bold, color: ink });
  const addr = s.address && !/edmonton/i.test(s.address) ? `${s.address}, Edmonton, AB` : s.address;
  const contact = [addr, s.phone, s.email].filter(Boolean).map(pdfSafe);
  contact.forEach((t, i) => page.drawText(t, { x: x0, y: y - 34 - i * 12, size: 9, font, color: mute }));
  y -= 84;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: hair });
  y -= 40;

  page.drawRectangle({ x: M, y: y + 28, width: 26, height: 3, color: red });
  page.drawText('Proof of Enrollment', { x: M, y, size: 22, font: bold, color: ink });
  y -= 22;
  page.drawText(`Date issued: ${fdate(todayEdm())}`, { x: M, y, size: 10, font, color: mute });
  y -= 34;

  const child = pdfSafe(student.name);
  const wrap = (text: string, size = 11, f = font, color = ink, lh = 1.45) => {
    const words = pdfSafe(text).split(/\s+/);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > W - 2 * M && line) {
        page.drawText(line, { x: M, y, size, font: f, color });
        y -= size * lh;
        line = w;
      } else line = t;
    }
    if (line) { page.drawText(line, { x: M, y, size, font: f, color }); y -= size * lh; }
  };
  wrap(`To whom it may concern,`);
  y -= 6;
  wrap(`This letter confirms that ${child} is enrolled in the ${o.program} program at ${club} for the dates below.`);
  y -= 16;

  const rows: [string, string][] = [
    ["Club name", club],
    ["Child's name", child],
  ];
  if (student.dob) rows.push(['Date of birth', fdate(student.dob)]);
  rows.push(['Program', pdfSafe(o.program)]);
  if (o.classes) rows.push(['Classes', pdfSafe(o.classes)]);
  rows.push(['Program dates', `${fdate(o.start)} - ${fdate(o.end)}`]);
  rows.push(['Total registration cost', `${money(o.amount)} CAD (GST included)`]);
  if (student.guardian_name) rows.push(['Parent / guardian', pdfSafe(student.guardian_name)]);

  const rowH = 26;
  page.drawRectangle({ x: M, y: y - rows.length * rowH + 6, width: W - 2 * M, height: rows.length * rowH + 4, borderColor: hair, borderWidth: 1 });
  rows.forEach(([k, v], i) => {
    const yy = y - i * rowH - 12;
    const isCost = k.startsWith('Total');
    page.drawText(k, { x: M + 14, y: yy, size: 10, font, color: mute });
    page.drawText(v, { x: M + 180, y: yy, size: isCost ? 12 : 11, font: isCost || k === "Child's name" ? bold : font, color: ink });
    if (i < rows.length - 1) page.drawLine({ start: { x: M + 10, y: yy - 9 }, end: { x: W - M - 10, y: yy - 9 }, thickness: 0.5, color: hair });
  });
  y -= rows.length * rowH + 30;

  if (o.note) { wrap(o.note, 10.5, font, ink); y -= 8; }
  wrap('If you need any further information, please contact us at the phone number or email above.', 10.5, font, ink);
  y -= 30;
  page.drawText('Sincerely,', { x: M, y, size: 11, font, color: ink });
  y -= 34;
  page.drawText('Master Daisy', { x: M, y, size: 13, font: bold, color: ink });
  y -= 15;
  page.drawText(club, { x: M, y, size: 10, font, color: mute });

  page.drawText(pdfSafe([club, s.phone, s.email].filter(Boolean).join('  ·  ')), { x: M, y: 36, size: 8, font, color: mute });
  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Only a signed-in admin may use this.
    const auth = req.headers.get('Authorization') || '';
    const user = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin } = await user.rpc('is_admin');
    if (isAdmin !== true) return json({ error: 'Admins only' }, 403);

    const b = await req.json();
    if (!b?.student_id || !b?.start || !b?.end) return json({ error: 'student_id, start and end are required' }, 400);
    const [{ data: student }, { data: settings }] = await Promise.all([
      admin.from('students').select('*').eq('id', b.student_id).maybeSingle(),
      admin.from('invoice_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (!student) return json({ error: 'Student not found' }, 404);
    const s = settings || {};
    const program = String(b.program || 'Taekwondo');
    const bytes = await buildPoePdf({ s, student, start: b.start, end: b.end, amount: Number(b.amount) || 0, program, note: b.note ? String(b.note) : '', classes: b.classes ? String(b.classes) : '' });
    const pdf = toBase64(bytes);
    const filename = `Proof of Enrollment - ${student.name}.pdf`.replace(/[\\/:*?"<>|]/g, '');

    if (b.action === 'email') {
      if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY secret is not set' }, 500);
      const to = splitEmails(b.to || student.guardian_email);
      if (!to.length) return json({ error: 'No guardian email on file' }, 400);
      const first = String(student.name).split(' ')[0];
      const message = String(
        b.message ||
          `Hello ${student.guardian_name || ''},\n\nAttached is ${first}'s Proof of Enrollment for your KidSport application (${fdate(b.start)} – ${fdate(b.end)}, total ${money(Number(b.amount) || 0)}).\n\nPlease let us know if KidSport needs anything else.\n\nMaster Daisy`
      );
      const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#111;max-width:560px;font-size:14px;line-height:1.55"><div style="white-space:pre-line">${esc(message)}</div><p style="font-size:12px;color:#999;margin-top:24px">${esc([s.business_name, s.phone, s.email].filter(Boolean).join(' · '))}</p></div>`;
      const extra: Record<string, unknown> = {};
      if (s.email) { extra.reply_to = s.email; if (!to.includes(String(s.email).toLowerCase())) extra.bcc = [s.email]; }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_ADDRESS, to, subject: `Proof of Enrollment — ${student.name}`, html, attachments: [{ filename, content: pdf }], ...extra }),
      });
      if (!res.ok) return json({ error: `Email failed: ${res.status} ${await res.text()}` }, 502);
      return json({ pdf, filename, emailed: to });
    }
    return json({ pdf, filename });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
