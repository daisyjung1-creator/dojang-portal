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

// Public portal address, for the invoice "Pay now" link (/pay/<pay_token>).
const PORTAL_URL = 'https://dojang-portal.netlify.app';

// Shown first under "How to pay" for families on pre-authorized card payments.
export const PREAUTH_PAY_LINE = 'Pre-authorized card on file: reply to the invoice email to approve this charge, or pay online.';

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
export async function buildInvoicePdf(inv: Invoice, lines: Line[], payments: Payment[], s: Settings, refunds: Payment[] = []): Promise<Uint8Array> {
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
  const refunded = refunds.reduce((t, r) => t + Number(r.amount || 0), 0);

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
  if (refunded > 0) row('Refunded to you', money(refunded));
  // Black "Amount due" block: same width as the totals above, 12pt inner
  // padding on both sides, labels optically centred on the block's midline.
  const boxH = 34, pad = 12;
  const boxTop = y + 17 - 12;            // 12pt below the last totals baseline
  const mid = boxTop - boxH / 2;
  roundRect(tx, boxTop - boxH, W - M - tx, boxH, 5, ink);
  text('Amount due', tx + pad, mid - 10 * 0.36, { size: 10, f: bold, color: white });
  text(money(balance), W - M - pad, mid - 13 * 0.36, { size: 13, f: bold, color: white, right: true });
  y = boxTop - boxH - 34;

  // ── Payment, notes ─────────────────────────────────────────────────
  // [label, text, bold first part]
  const blocks: [string, string, string?][] = [];
  const preauth = (inv as any).customers?.payment_type === 'preauth' && balance > 0.004 && !(inv as any).voided;
  if (s.payment_instructions || preauth) blocks.push(['How to pay', s.payment_instructions || '', preauth ? PREAUTH_PAY_LINE : '']);
  if (inv.notes) blocks.push(['Notes', inv.notes]);
  if (s.invoice_footer) blocks.push(['', s.invoice_footer]);
  for (const [k, v, first] of blocks) {
    if (k) { label(k, M, y); y -= 13; }
    if (first) { for (const l of wrap(first, 330, 9, bold)) { text(l, M, y, { size: 9, f: bold }); y -= 12; } y -= 3; }
    for (const l of wrap(v, 330, 9)) { if (!l && !v) continue; text(l, M, y, { size: 9, color: k ? ink : mute }); y -= 12; }
    y -= 10;
  }

  // ── Footer ─────────────────────────────────────────────────────────
  const fy = 40;
  rule(fy + 12);
  text([s.business_name, s.gst_number ? 'GST ' + s.gst_number : ''].filter(Boolean).join('  ·  '), M, fy, { size: 7.5, color: faint });
  text([s.phone, s.email].filter(Boolean).join('  ·  '), W - M, fy, { size: 7.5, color: faint, right: true });
  return await pdf.save();
}

// Receipt PDF: same look as the invoice — what was paid, how, and what is
// left on the invoice afterwards.
export async function buildReceiptPdf(p: Payment, inv: Invoice | null, lines: Line[], earlier: number, customer: Record<string, any>, s: Settings): Promise<Uint8Array> {
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
    const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(d, { x, y: y + h, color });
  };

  // Header
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

  page.drawRectangle({ x: M, y: y + 30, width: 22, height: 3, color: red });
  text('Receipt', M, y, { size: 30, f: bold });
  text(`#${p.receipt_number ?? ''}`, M + bold.widthOfTextAtSize('Receipt', 30) + 10, y, { size: 30, color: faint });
  y -= 40;

  // Received from · date/method · amount paid
  const c2 = M + 230, c3 = W - M;
  label('Received from', M, y);
  label('Payment date', c2, y);
  label('Amount paid', c3, y, true);
  const yt = y - 15;
  const name = customer?.name || inv?.customer_name || '';
  const addr = [customer?.address || '', customer?.printed_info || ''].filter(Boolean).join('\n') || inv?.customer_address || '';
  text(name, M, yt, { size: 10.5, f: bold });
  let yc = yt - 13;
  for (const l of [...String(addr).split('\n'), customer?.email || inv?.customer_email].filter(Boolean)) { text(l, M, yc, { size: 9, color: mute }); yc -= 12; }
  text(fdate(p.payment_date), c2, yt, { size: 10 });
  label('Method', c2, yt - 22);
  text(p.method || '', c2, yt - 36, { size: 10 });
  let yr = yt - 36;
  if (p.reference) { yr -= 13; text(`Ref. ${p.reference}`, c2, yr, { size: 8.5, color: mute }); }
  text(money(p.amount), c3, yt - 8, { size: 22, f: bold, right: true });
  text('Thank you', c3, yt - 22, { size: 8, color: red, right: true });
  y = Math.min(yc, yr) - 30;

  const toCredit = Number(p.credit_amount || 0);
  const applied = Number(p.amount || 0) - toCredit;
  const creditNote = () => {
    if (toCredit <= 0.004) return;
    const bx = inv ? W - M - 200 : M, bw = 200, bh = 26;
    page.drawRectangle({ x: bx, y: y - bh + 8, width: bw, height: bh, color: rgb(0.95, 0.97, 0.95), borderColor: rgb(0.75, 0.86, 0.76), borderWidth: 0.8 });
    text('Saved as account credit', bx + 10, y - 9, { size: 9.5 });
    text(money(toCredit), bx + bw - 10, y - 9, { size: 9.5, f: bold, right: true });
    y -= bh + 20;
  };

  if (inv) {
    const xAmt = W - M;
    label(`For invoice #${inv.invoice_number}  ·  ${fdate(inv.invoice_date)}`, M, y);
    label('Amount', xAmt, y, true);
    y -= 9;
    rule(y, M, W - M, ink, 0.8);
    y -= 17;
    for (const l of lines) {
      const title = l.item_name && l.item_name !== l.description ? l.item_name : l.description;
      const sub = title === l.description ? [] : wrap(l.description, 360, 8.5);
      const h = 14 + sub.length * 11 + 8;
      if (y - h < 200) { page = pdf.addPage([W, H]); y = H - M; }
      text(Number(l.quantity) !== 1 ? `${title}  x${Number(l.quantity)}` : title, M, y, { size: 9.5, f: bold });
      sub.forEach((t, i) => text(t, M, y - 13 - i * 11, { size: 8.5, color: mute }));
      text(money(l.amount), xAmt, y, { right: true });
      y -= h;
      rule(y + 10);
    }
    y -= 10;
    const tx = W - M - 200;
    const row = (k: string, v: string, b = false) => {
      text(k, tx, y, { size: 9.5, color: b ? ink : mute, f: b ? bold : font });
      text(v, W - M, y, { size: 9.5, f: b ? bold : font, right: true });
      y -= 17;
    };
    const rate = Number(inv.gst_rate) || 0;
    row('Subtotal', money(inv.subtotal));
    row(`GST (${rate}%)`, money(inv.gst_amount));
    rule(y + 10, tx, W - M);
    row('Invoice total', money(inv.total), true);
    if (earlier > 0.005) row('Paid before', '-' + money(earlier));
    row('This payment', '-' + money(applied));
    const remaining = Math.max(Number(inv.total) - earlier - applied, 0);
    const boxH = 34, pad = 12;
    const boxTop = y + 17 - 12;
    const mid = boxTop - boxH / 2;
    roundRect(tx, boxTop - boxH, W - M - tx, boxH, 5, ink);
    text(remaining > 0.005 ? 'Balance remaining' : 'Paid in full', tx + pad, mid - 10 * 0.36, { size: 10, f: bold, color: white });
    text(money(remaining), W - M - pad, mid - 13 * 0.36, { size: 13, f: bold, color: white, right: true });
    y = boxTop - boxH - 20;
  }
  creditNote();
  y -= 14;

  if (p.notes && !String(p.notes).startsWith('Imported from Express')) {
    label('Notes', M, y); y -= 13;
    for (const l of wrap(p.notes, 330, 9)) { text(l, M, y, { size: 9 }); y -= 12; }
  }

  const fy = 40;
  rule(fy + 12);
  text([s.business_name, s.gst_number ? 'GST ' + s.gst_number : ''].filter(Boolean).join('  ·  '), M, fy, { size: 7.5, color: faint });
  text([s.phone, s.email].filter(Boolean).join('  ·  '), W - M, fy, { size: 7.5, color: faint, right: true });
  return await pdf.save();
}

// "Item — description" without repeating words the item name already has.
function lineLabel(l: Line) {
  const item = String(l.item_name || '').trim();
  const desc = String(l.description || '').trim();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!item) return esc(desc);
  if (!desc || norm(item).includes(norm(desc)) || norm(desc) === norm(item)) return '<b>' + esc(item) + '</b>';
  return '<b>' + esc(item) + '</b> ' + esc(desc);
}

// Splits a closing like "Kind regards,\nMaster Daisy" off the end of the message.
function splitSignoff(message: string) {
  const parts = message.trim().split(/\n\s*\n/);
  const last = parts[parts.length - 1] || '';
  if (parts.length > 1 && last.length < 120 && /regards|thank|sincerely|master|best/i.test(last)) return { body: parts.slice(0, -1).join('\n\n'), signoff: last };
  return { body: message, signoff: '' };
}

// ── Shared email design: a white card on a soft background, small red accent,
// the business name, roomy paragraphs and centred buttons. ──────────────────
const FONT = 'font-family:Helvetica,Arial,sans-serif';
const P = `margin:0 0 20px;${FONT};font-size:16px;line-height:1.6;color:#20241F`;
const SMALL = `margin:0 0 22px;${FONT};font-size:13px;line-height:1.5;color:#8A8D84`;

export function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 18px"><tr><td style="background:#1b1b1b;border-radius:8px"><a href="${esc(href)}" style="display:inline-block;padding:13px 28px;${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a></td></tr></table>`;
}

// Soft inset box for figures (invoice lines, receipt details).
function inset(html: string) {
  return `<div style="background:#f7f6f2;border:1px solid #ebe8df;border-radius:10px;padding:16px 18px;margin:4px 0 24px">${html}</div>`;
}

// key/value rows inside an inset box
function rows(pairs: [string, string, boolean?][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${FONT};font-size:14px;color:#20241F">${pairs
    .map(([k, v, b]) => `<tr><td style="padding:4px 0;color:#6B6F66">${k}</td><td style="padding:4px 0;text-align:right">${b ? `<b>${v}</b>` : v}</td></tr>`)
    .join('')}</table>`;
}

export function emailShell(inner: string, name: string, footerBits: (string | undefined)[]) {
  const footer = esc(footerBits.filter(Boolean).join(' · '));
  return `<div style="background:#f3f2ee;padding:28px 12px;${FONT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e6e3da">
    <tr><td style="padding:30px 30px 10px">
      <div style="width:28px;height:3px;background:#BE1C21;margin:0 0 12px"></div>
      <div style="${FONT};font-size:13px;font-weight:bold;letter-spacing:0.04em;color:#20241F;text-transform:uppercase;margin:0 0 24px">${esc(name || '')}</div>
      ${inner}
    </td></tr>
  </table>
  <p style="max-width:580px;margin:14px auto 0;text-align:center;${FONT};font-size:12px;color:#8A8D84">${footer}</p>
</div>`;
}
const shell = (inner: string, s: Settings) => emailShell(inner, s.business_name, [s.business_name, s.phone, s.email]);

// A link on a line of its own becomes a button with a friendly label.
const LINK_BUTTONS: [RegExp, string][] = [
  [/\/trial(\b|$)/, 'Book a trial class'],
  [/\/join(\b|$)/, 'Register online'],
  [/\/card\//, 'Save your card'],
  [/\/pay\//, 'Pay now'],
  [/kidsport/i, 'Create a KidSport account'],
];
function linkButton(url: string) {
  const label = LINK_BUTTONS.find(([re]) => re.test(url))?.[1];
  return label ? button(url, label).replace('margin:6px auto 18px', 'margin:6px auto 26px') : '';
}
const linkify = (t: string) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1b1b1b;text-decoration:underline">$1</a>');

// Plain text → paragraphs (blank line = new paragraph), links on their own line → buttons.
export function textBlocks(message: string) {
  return String(message || '')
    .replace(/\r/g, '')
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const out: string[] = [];
      let text: string[] = [];
      for (const line of block.split('\n')) {
        const m = line.trim().match(/^(https?:\/\/\S+)$/);
        const btn = m ? linkButton(m[1]) : '';
        if (btn) {
          if (text.length) out.push(`<p style="${P.replace('0 0 20px', '0 0 14px')}">${text.map(linkify).join('<br>')}</p>`);
          text = [];
          out.push(btn);
        } else text.push(line);
      }
      if (text.length) out.push(`<p style="${P}">${text.map(linkify).join('<br>')}</p>`);
      return out.join('');
    })
    .join('');
}

// Plain-text message (as typed in the portal) → the card-style email.
export function plainTextEmailHtml(message: string, s: Settings) {
  return shell(textBlocks(message), s);
}

// kind: 'new' (first invoice, no card saved yet), 'preauth' (card on file) or 'manual'.
export function invoiceEmailHtml(inv: Invoice, lines: Line[], s: Settings, message: string, balance: number, kind = 'manual') {
  const lineRows = lines
    .map((l) => `<tr><td style="padding:7px 0;border-bottom:1px solid #e6e3da">${lineLabel(l)}</td><td style="padding:7px 0 7px 10px;border-bottom:1px solid #e6e3da;text-align:right;color:#6B6F66;white-space:nowrap">${Number(l.quantity) !== 1 ? '×' + Number(l.quantity) : ''}</td><td style="padding:7px 0 7px 10px;border-bottom:1px solid #e6e3da;text-align:right;white-space:nowrap">${money(l.amount)}</td></tr>`)
    .join('');
  const live = s.online_pay && s.online_pay_mode === 'live' && balance > 0.004 && inv.pay_token && !inv.voided;
  const box = inset(`
    <div style="${FONT};font-size:15px;font-weight:bold;color:#20241F">Invoice #${inv.invoice_number}</div>
    <div style="${FONT};font-size:13px;color:#6B6F66;margin:2px 0 10px">${fdate(inv.invoice_date)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${FONT};font-size:14px;color:#20241F">${lineRows}</table>
    <div style="height:8px"></div>
    ${rows([
      ['Subtotal', money(inv.subtotal)],
      [`GST (${Number(inv.gst_rate)}%)`, money(inv.gst_amount)],
      ['Total', money(inv.total), true],
      ['<span style="color:#9A2B2B"><b>Balance due</b></span>', `<span style="color:#9A2B2B"><b>${money(balance)}</b></span>`],
    ])}
    ${!live && (inv as any).customers?.payment_type === 'preauth' && balance > 0.004 ? `<p style="${FONT};font-size:13px;margin:12px 0 0"><b>${esc(PREAUTH_PAY_LINE)}</b></p>` : ''}
    ${!live && s.payment_instructions ? `<p style="${FONT};font-size:13px;margin:10px 0 0;white-space:pre-line"><b>How to pay:</b> ${esc(s.payment_instructions)}</p>` : ''}`);
  const { body, signoff } = splitSignoff(message);
  let inner = textBlocks(body);
  if (live) {
    // One clear action; other ways to pay in a single quiet line.
    const other =
      kind === 'new'
        ? 'Secure credit card payment through TD Online Mart. At checkout you can save your card for automatic tuition payments.'
        : kind === 'preauth'
        ? `Secure payment through TD Online Mart. Prefer to use your card on file? Just reply to this email${s.email ? ` — or pay by e-Transfer to ${s.email}` : ''}.`
        : `Secure payment through TD Online Mart. You can also pay by e-Transfer${s.email ? ` to ${s.email}` : ''} or at the front desk.`;
    inner += button(`${PORTAL_URL}/pay/${inv.pay_token}`, `Pay ${money(balance)} now`) + `<p style="${SMALL};text-align:center">${esc(other)}</p>`;
  }
  inner += box + (signoff ? textBlocks(signoff) : '');
  return shell(inner, s);
}

export function receiptEmail(p: Payment, inv: Invoice | null, customerName: string, s: Settings) {
  const inner =
    textBlocks(`Hi ${customerName},\n\nThank you — we've received your payment. Your receipt is attached as a PDF.`) +
    inset(
      rows([
        ['Receipt #', String(p.receipt_number ?? ''), true],
        ['Date', fdate(p.payment_date)],
        ['Amount', money(p.amount), true],
        ['Method', esc(p.method)],
        ...(inv ? ([['For invoice', `#${inv.invoice_number}`]] as [string, string][]) : []),
      ])
    ) +
    textBlocks('Kind regards,\nMaster Daisy') +
    (s.gst_number ? `<p style="${SMALL}">GST No. ${esc(s.gst_number)}</p>` : '');
  return { subject: `Payment receipt #${p.receipt_number} — ${s.business_name}`, html: shell(inner, s) };
}

export function refundEmail(r: Payment, inv: Invoice | null, customerName: string, s: Settings) {
  const inner =
    textBlocks(`Hi ${customerName},\n\nThis confirms we've sent you a refund.`) +
    inset(
      rows([
        ['Refund #', String(r.refund_number ?? ''), true],
        ['Date', fdate(r.refund_date)],
        ['Amount', `${money(r.amount)}${Number(r.gst_amount) ? ` <span style="color:#6B6F66">(incl. GST ${money(r.gst_amount)})</span>` : ''}`, true],
        ['Refunded by', esc(r.method)],
        ...(inv ? ([['For invoice', `#${inv.invoice_number}`]] as [string, string][]) : []),
        ...(r.reason ? ([['Reason', esc(r.reason)]] as [string, string][]) : []),
      ])
    ) +
    textBlocks('Kind regards,\nMaster Daisy') +
    (s.gst_number ? `<p style="${SMALL}">GST No. ${esc(s.gst_number)}</p>` : '');
  return { subject: `Refund #${r.refund_number} — ${s.business_name}`, html: shell(inner, s) };
}

// Payslip email body in the same design (company settings come from payroll).
export function payslipEmailHtml(intro: string, pairs: [string, string, boolean?][], note: string, company: string, footerBits: (string | undefined)[]) {
  return emailShell(textBlocks(intro) + inset(rows(pairs)) + (note ? textBlocks(note) : ''), company, footerBits);
}
