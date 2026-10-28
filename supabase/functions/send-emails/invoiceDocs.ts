// Builds the invoice PDF attachment and the invoice / receipt email bodies.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

export type Settings = Record<string, any>;
export type Invoice = Record<string, any>;
export type Line = { item_name?: string; description: string; quantity: number; unit_price: number; taxable: boolean; amount: number };
export type Payment = Record<string, any>;

const fmt = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
export const money = (n: any) => fmt.format(Number(n) || 0).replace('CA$', '$');
export const fdate = (iso?: string) =>
  iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
// Standard PDF fonts only cover Latin-1; swap common typographic characters.
const pdfSafe = (s: any) =>
  String(s ?? '').replace(/\u2013/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/[^\x20-\x7E\u00A0-\u00FF\u2014]/g, '');
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function fillTemplate(tpl: string, inv: Invoice, s: Settings, balance: number) {
  return (tpl || '')
    .replaceAll('{customer}', inv.customer_name || '')
    .replaceAll('{number}', String(inv.invoice_number))
    .replaceAll('{total}', money(inv.total))
    .replaceAll('{balance}', money(balance))
    .replaceAll('{due_date}', fdate(inv.due_date || inv.invoice_date))
    .replaceAll('{business}', s.business_name || '');
}

// Modern layout: mostly black and white with a single small red accent,
// lots of white space, hairline rules instead of boxes, and the amount due
// called out in a solid black block.
export async function buildInvoicePdf(inv: Invoice, lines: Line[], payments: Payment[], s: Settings): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page = pdf.addPage([W, H]);
  const ink = rgb(0.067, 0.067, 0.067);
  const mute = rgb(0.45, 0.45, 0.45);
  const faint = rgb(0.6, 0.6, 0.6);
  const hair = rgb(0.88, 0.88, 0.88);
  const red = rgb(0.75, 0.11, 0.13);
  const white = rgb(1, 1, 1);

  const text = (t: any, x: number, y: number, o: { size?: number; f?: any; color?: any; right?: boolean } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font;
    const str = pdfSafe(t);
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: o.right ? x - w : x, y, size, font: f, color: o.color ?? ink });
    return w;
  };
  const label = (t: string, x: number, y: number, right = false) => text(t.toUpperCase(), x, y, { size: 7, f: bold, color: faint, right });
  const rule = (y: number, x1 = M, x2 = W - M, color = hair, th = 0.6) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: th, color });
  const wrap = (t: string, maxW: number, size = 9.5, f = font) => {
    const out: string[] = [];
    for (const para of String(t || '').split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) {
        const next = cur ? cur + ' ' + word : word;
        if (f.widthOfTextAtSize(pdfSafe(next), size) > maxW && cur) { out.push(cur); cur = word; } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  const roundRect = (x: number, y: number, w: number, h: number, r: number, color: any) => {
    const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(p, { x, y: y + h, color });
  };

  const rate = Number(inv.gst_rate) || 0;
  const paid = payments.reduce((t, p) => t + Number(p.amount || 0), 0);
  const balance = Math.max(Number(inv.total) - paid, 0);

  // ── Header: business on the left, logo on the right ────────────────
  let y = H - M;
  let logoH = 0;
  if (s.logo_data && String(s.logo_data).startsWith('data:image/')) {
    try {
      const b64 = String(s.logo_data).split(',')[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = String(s.logo_data).startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const sc = Math.min(110 / img.width, 48 / img.height);
      logoH = img.height * sc;
      page.drawImage(img, { x: W - M - img.width * sc, y: y - logoH + 8, width: img.width * sc, height: logoH });
    } catch (_e) { /* bad logo: skip it */ }
  }
  text(s.business_name || '', M, y, { size: 10, f: bold });
  let yb = y - 13;
  for (const l of [...String(s.address || '').split('\n'), [s.phone, s.email].filter(Boolean).join('  ·  '), s.website].filter(Boolean)) {
    text(l, M, yb, { size: 8.5, color: mute }); yb -= 11.5;
  }
  y = Math.min(yb, y - logoH) - 34;

  // ── Title with a small red accent ──────────────────────────────────
  page.drawRectangle({ x: M, y: y + 30, width: 22, height: 3, color: red });
  text(inv.voided ? 'Void' : 'Invoice', M, y, { size: 30, f: bold });
  text(`#${inv.invoice_number}`, M + bold.widthOfTextAtSize(inv.voided ? 'Void' : 'Invoice', 30) + 10, y, { size: 30, color: faint });
  y -= 40;

  // ── Billed to · dates · amount due ─────────────────────────────────
  const c2 = M + 230, c3 = W - M;
  label('Billed to', M, y);
  label('Issued', c2, y);
  label('Amount due', c3, y, true);
  let yt = y - 15;
  text(inv.customer_name || '', M, yt, { size: 10.5, f: bold });
  let yc = yt - 13;
  for (const l of [...String(inv.customer_address || '').split('\n'), inv.customer_email].filter(Boolean)) { text(l, M, yc, { size: 9, color: mute }); yc -= 12; }
  text(fdate(inv.invoice_date), c2, yt, { size: 10 });
  if (inv.due_date) { label('Due', c2, yt - 22); text(fdate(inv.due_date), c2, yt - 36, { size: 10 }); }
  text(money(balance), c3, yt - 8, { size: 22, f: bold, right: true });
  text(balance > 0 ? 'CAD' : 'Paid in full', c3, yt - 22, { size: 8, color: balance > 0 ? faint : red, right: true });
  y = Math.min(yc, yt - 40) - 26;

  // ── Line items ─────────────────────────────────────────────────────
  const xQty = W - M - 230, xPrice = W - M - 160, xGst = W - M - 85, xAmt = W - M;
  const header = () => {
    label('Description', M, y);
    label('Qty', xQty, y, true);
    label('Price', xPrice, y, true);
    label(`GST ${rate}%`, xGst, y, true);
    label('Amount', xAmt, y, true);
    y -= 9;
    rule(y, M, W - M, ink, 0.8);
    y -= 17;
  };
  header();
  for (const l of lines) {
    const title = l.item_name && l.item_name !== l.description ? l.item_name : l.description;
    const sub = title === l.description ? [] : wrap(l.description, xQty - M - 70, 8.5);
    const h = 14 + sub.length * 11 + 8;
    if (y - h < 200) { page = pdf.addPage([W, H]); y = H - M; header(); }
    const amt = Number(l.amount);
    wrap(title, xQty - M - 70, 9.5, bold).slice(0, 2).forEach((t, i) => text(t, M, y - i * 12, { size: 9.5, f: bold }));
    sub.forEach((t, i) => text(t, M, y - 13 - i * 11, { size: 8.5, color: mute }));
    text(String(Number(l.quantity)), xQty, y, { right: true });
    text(money(l.unit_price), xPrice, y, { right: true });
    text(l.taxable ? money(Math.round(amt * rate) / 100) : '—', xGst, y, { right: true, color: l.taxable ? ink : faint });
    text(money(amt), xAmt, y, { right: true, f: bold });
    y -= h;
    rule(y + 10);
  }

  // ── Totals ─────────────────────────────────────────────────────────
  y -= 10;
  const tx = W - M - 200;
  const row = (k: string, v: string, b = false, color = ink) => {
    text(k, tx, y, { size: 9.5, color: b ? ink : mute, f: b ? bold : font });
    text(v, W - M, y, { size: 9.5, f: b ? bold : font, right: true, color });
    y -= 17;
  };
  row('Subtotal', money(inv.subtotal));
  row(`GST (${rate}%)`, money(inv.gst_amount));
  rule(y + 10, tx, W - M);
  row('Total', money(inv.total), true);
  if (paid > 0) row('Paid', '-' + money(paid));
  y -= 4;
  roundRect(tx - 12, y - 14, W - M - tx + 12, 32, 5, ink);
  text('Amount due', tx, y - 2, { size: 10, f: bold, color: white });
  text(money(balance), W - M - 12, y - 2, { size: 13, f: bold, color: white, right: true });
  y -= 52;

  // ── Payment, notes ─────────────────────────────────────────────────
  const blocks: [string, string][] = [];
  if (s.payment_instructions) blocks.push(['How to pay', s.payment_instructions]);
  if (inv.notes) blocks.push(['Notes', inv.notes]);
  if (s.invoice_footer) blocks.push(['', s.invoice_footer]);
  for (const [k, v] of blocks) {
    if (k) { label(k, M, y); y -= 13; }
    for (const l of wrap(v, 330, 9)) { text(l, M, y, { size: 9, color: k ? ink : mute }); y -= 12; }
    y -= 10;
  }

  // ── Footer ─────────────────────────────────────────────────────────
  const fy = 40;
  rule(fy + 12);
  text([s.business_name, s.gst_number ? 'GST ' + s.gst_number : ''].filter(Boolean).join('  ·  '), M, fy, { size: 7.5, color: faint });
  text([s.phone, s.email].filter(Boolean).join('  ·  '), W - M, fy, { size: 7.5, color: faint, right: true });
  return await pdf.save();
}

export function invoiceEmailHtml(inv: Invoice, lines: Line[], s: Settings, message: string, balance: number) {
  const rows = lines
    .map((l) => `<tr><td style="padding:6px 4px;border-bottom:1px solid #eee">${l.item_name ? '<b>' + esc(l.item_name) + '</b> ' : ''}${esc(l.description)}</td><td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${Number(l.quantity)}</td><td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${money(l.amount)}</td></tr>`)
    .join('');
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#20241F;max-width:560px">
  <p style="white-space:pre-line">${esc(message)}</p>
  <div style="border:1px solid #e5e2d8;border-radius:8px;padding:16px;margin-top:16px">
    <div style="font-weight:bold;font-size:15px">${esc(s.business_name)} — Invoice #${inv.invoice_number}</div>
    <div style="color:#5B5F56;font-size:13px;margin:4px 0 12px">${fdate(inv.invoice_date)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
    <table style="width:100%;font-size:13px;margin-top:8px">
      <tr><td style="color:#5B5F56">Subtotal</td><td style="text-align:right">${money(inv.subtotal)}</td></tr>
      <tr><td style="color:#5B5F56">GST (${Number(inv.gst_rate)}%)</td><td style="text-align:right">${money(inv.gst_amount)}</td></tr>
      <tr><td><b>Total</b></td><td style="text-align:right"><b>${money(inv.total)}</b></td></tr>
      <tr><td style="color:#9A2B2B"><b>Balance due</b></td><td style="text-align:right;color:#9A2B2B"><b>${money(balance)}</b></td></tr>
    </table>
    ${s.payment_instructions ? `<p style="font-size:13px;white-space:pre-line;margin-top:12px"><b>How to pay:</b> ${esc(s.payment_instructions)}</p>` : ''}
  </div>
  <p style="font-size:12px;color:#8A8D84;margin-top:16px">${esc([s.business_name, s.phone, s.email].filter(Boolean).join(' · '))}</p>
</div>`;
}

export function receiptEmail(p: Payment, inv: Invoice | null, customerName: string, s: Settings) {
  return {
    subject: `Payment receipt #${p.receipt_number} — ${s.business_name}`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#20241F;max-width:520px">
  <p>Hi ${esc(customerName)},</p>
  <p>Thank you — we've received your payment.</p>
  <table style="font-size:14px;border-collapse:collapse;margin:12px 0">
    <tr><td style="color:#5B5F56;padding:3px 16px 3px 0">Receipt #</td><td><b>${p.receipt_number}</b></td></tr>
    <tr><td style="color:#5B5F56;padding:3px 16px 3px 0">Date</td><td>${fdate(p.payment_date)}</td></tr>
    <tr><td style="color:#5B5F56;padding:3px 16px 3px 0">Amount</td><td><b>${money(p.amount)}</b></td></tr>
    <tr><td style="color:#5B5F56;padding:3px 16px 3px 0">Method</td><td>${esc(p.method)}</td></tr>
    ${inv ? `<tr><td style="color:#5B5F56;padding:3px 16px 3px 0">For invoice</td><td>#${inv.invoice_number}</td></tr>` : ''}
  </table>
  <p style="font-size:12px;color:#8A8D84">${esc([s.business_name, s.gst_number ? 'GST No. ' + s.gst_number : '', s.phone, s.email].filter(Boolean).join(' · '))}</p>
</div>`,
  };
}
