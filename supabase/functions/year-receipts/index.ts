// Supabase Edge Function: year-receipts
//
// Emails year-end "Receipt of Fees Paid" letters with a PDF attached. The
// portal works out the amounts (src/lib/yearReceipt.js) and calls this as a
// signed-in admin with { receipts: [{ to, subject, message, receipt }] }.
// Each email is logged in email_queue (already marked sent) so it shows in
// Email → Sent emails.

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
  String(s ?? '').replace(/[–−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x20-\x7E -ÿ—]/g, '');
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fdate = (iso?: string) =>
  iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
const money = (n: number) => '$' + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const splitEmails = (v: unknown) => String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
const todayEdm = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function buildYearReceiptPdf(r: any, s: Record<string, any>) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 64;
  const ink = rgb(0.07, 0.07, 0.07), mute = rgb(0.45, 0.45, 0.45), hair = rgb(0.88, 0.88, 0.88), red = rgb(0.75, 0.11, 0.13);
  const page = pdf.addPage([W, H]);
  let y = H - M;
  const club = pdfSafe(s.business_name || 'Edmonton Champion Hankook Taekwondo');

  // Letterhead
  const contact = [s.address, [s.phone, s.email].filter(Boolean).join('  ·  '), s.gst_number ? `GST # ${s.gst_number}` : ''].filter(Boolean).map(pdfSafe);
  page.drawText(club, { x: M, y: y - 4, size: 12, font: bold, color: ink });
  contact.forEach((t, i) => page.drawText(t, { x: M, y: y - 19 - i * 12, size: 9, font, color: mute }));
  const m = String(s.logo_data || '').match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (m) {
    try {
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const img = m[1] === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const h = 52, w = (img.width / img.height) * h;
      page.drawImage(img, { x: W - M - w, y: y - h + 6, width: w, height: h });
    } catch (_e) { /* no logo */ }
  }
  y -= 86;
  page.drawRectangle({ x: M, y, width: 26, height: 3, color: red });
  y -= 30;
  page.drawText(pdfSafe(`${r.year} Receipt of Fees Paid`), { x: M, y, size: 24, font: bold, color: ink });
  y -= 20;
  page.drawText(pdfSafe(`Issued ${fdate(todayEdm())} to ${r.customer?.name || ''}`), { x: M, y, size: 10, font, color: mute });
  y -= 30;

  const wrap = (text: string, size = 11, f = font, color = ink) => {
    let line = '';
    for (const w of pdfSafe(text).split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > W - 2 * M && line) {
        page.drawText(line, { x: M, y, size, font: f, color });
        y -= size * 1.45;
        line = w;
      } else line = t;
    }
    if (line) { page.drawText(line, { x: M, y, size, font: f, color }); y -= size * 1.45; }
  };
  wrap(`This confirms that the following taekwondo program fees were paid to ${club} between January 1 and December 31, ${r.year}.`);
  y -= 14;

  // Table
  const right = (t: string, yy: number, size = 11, f = font, color = ink) => page.drawText(t, { x: W - M - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  page.drawText('STUDENT', { x: M, y, size: 8, font: bold, color: mute });
  right('FEES PAID', y, 8, bold, mute);
  y -= 7;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: ink });
  y -= 18;
  for (const k of r.children || []) {
    page.drawText(pdfSafe(k.name), { x: M, y, size: 11, font, color: ink });
    right(money(k.amount), y);
    if (k.dob) { y -= 12; page.drawText(pdfSafe(`Born ${fdate(k.dob)}`), { x: M, y, size: 8.5, font, color: mute }); }
    y -= 10;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: hair });
    y -= 16;
  }
  page.drawText(pdfSafe(`Total paid in ${r.year}`), { x: M, y, size: 12, font: bold, color: ink });
  right(money(r.paid), y, 12, bold);
  y -= 18;
  wrap(`Includes GST of ${money(r.gst)}${s.gst_number ? ` (GST # ${s.gst_number})` : ''}. Program: taekwondo classes for children (physical activity program).`, 9.5, font, mute);
  y -= 12;

  if ((r.payments || []).length) {
    page.drawText('PAYMENTS', { x: M, y, size: 8, font: bold, color: mute });
    y -= 14;
    for (const p of r.payments) {
      if (y < 130) break;
      page.drawText(pdfSafe(`${fdate(p.payment_date)}  ·  ${p.method}  ·  ${money(Number(p.amount) - Number(p.credit_amount || 0))}  (receipt #${p.receipt_number})`), { x: M, y, size: 9, font, color: ink });
      y -= 13;
    }
  }

  // Signature
  page.drawText('Master Daisy', { x: M, y: 110, size: 13, font: bold, color: ink });
  page.drawText(club, { x: M, y: 96, size: 9.5, font, color: mute });
  page.drawText(pdfSafe([club, s.phone, s.email].filter(Boolean).join('  ·  ')), { x: M, y: 36, size: 8, font, color: mute });
  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    const caller = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin } = await caller.rpc('is_admin');
    if (isAdmin !== true) return json({ error: 'Admins only' }, 403);
    if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY secret is not set' }, 500);

    const b = await req.json();
    const list: any[] = Array.isArray(b?.receipts) ? b.receipts.slice(0, 300) : [];
    if (!list.length) return json({ error: 'Nothing to send' }, 400);
    const { data: settings } = await admin.from('invoice_settings').select('*').eq('id', 1).maybeSingle();
    const s = settings || {};
    const footer = esc([s.business_name, s.phone, s.email].filter(Boolean).join(' · '));

    const sent: string[] = [];
    const failed: string[] = [];
    for (const item of list) {
      const to = splitEmails(item.to);
      if (!to.length) { failed.push(`${item.receipt?.customer?.name || '?'}: no email`); continue; }
      try {
        const bytes = await buildYearReceiptPdf(item.receipt, s);
        const filename = `${item.receipt.year} Receipt - ${String(item.receipt.customer?.name || 'Family').replace(/[\\/:*?"<>|]/g, '')}.pdf`;
        const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#111;max-width:560px;font-size:14px;line-height:1.55"><div style="white-space:pre-line">${esc(item.message)}</div><p style="font-size:12px;color:#999;margin-top:24px">${footer}</p></div>`;
        for (let attempt = 0; ; attempt++) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM_ADDRESS, to, subject: item.subject, html, attachments: [{ filename, content: toBase64(bytes) }], ...(s.email ? { reply_to: s.email } : {}) }),
          });
          if (res.ok) break;
          const text = await res.text();
          if ((res.status === 429 || res.status >= 500) && attempt < 5) { await new Promise((r) => setTimeout(r, 800 + Math.random() * 1500 * (attempt + 1))); continue; }
          throw new Error(`${res.status} ${text}`);
        }
        await admin.from('email_queue').insert({ type: 'broadcast', recipient_email: to.join(', '), student_id: item.student_id || null, sent: true, payload: { subject: item.subject, message: item.message, attachment: filename } });
        sent.push(to.join(', '));
      } catch (e) {
        failed.push(`${item.receipt?.customer?.name || to.join(', ')}: ${String(e).slice(0, 200)}`);
      }
    }
    return json({ sent: sent.length, failed });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
