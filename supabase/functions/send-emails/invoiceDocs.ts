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
  String(s ?? '').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
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

export async function buildInvoicePdf(inv: Invoice, lines: Line[], payments: Payment[], s: Settings): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boldIt = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const W = 612, H = 792, M = 46;
  let page = pdf.addPage([W, H]);
  const ink = rgb(0.07, 0.07, 0.07), blue = rgb(0.078, 0.47, 0.705), white = rgb(1, 1, 1);
  const text = (t: any, x: number, y: number, o: { size?: number; f?: any; color?: any; right?: boolean } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font;
    const str = pdfSafe(t);
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: o.right ? x - w : x, y, size, font: f, color: o.color ?? ink });
  };
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
  const rate = Number(inv.gst_rate) || 0;

  // Title bar
  let y = H - M;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 3, color: blue });
  const title = inv.voided ? 'VOID' : 'Invoice';
  const tw = boldIt.widthOfTextAtSize(title, 18);
  page.drawRectangle({ x: W / 2 - tw / 2 - 10, y: y - 8, width: tw + 20, height: 16, color: white });
  text(title, W / 2 - tw / 2, y - 6, { size: 18, f: boldIt });
  y -= 40;

  // Logo + company block
  let x0 = M;
  if (s.logo_data && String(s.logo_data).startsWith('data:image/')) {
    try {
      const b64 = String(s.logo_data).split(',')[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = String(s.logo_data).startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const sc = Math.min(80 / img.width, 58 / img.height);
      page.drawImage(img, { x: M, y: y - img.height * sc + 10, width: img.width * sc, height: img.height * sc });
      x0 = M + img.width * sc + 14;
    } catch (_e) { /* bad logo: skip it */ }
  }
  let yl = y;
  for (const l of wrap(s.business_name || '', 200, 12, bold)) { text(l, x0, yl, { size: 12, f: bold }); yl -= 14; }
  yl -= 2;
  for (const l of [...String(s.address || '').split('\n'), s.phone, s.website, s.gst_number ? 'GST No. ' + s.gst_number : ''].filter(Boolean)) { text(l, x0, yl, { size: 10 }); yl -= 12.5; }
  let yr = y;
  for (const [k, v] of [['Date:', fdate(inv.invoice_date)], ['Invoice No.:', String(inv.invoice_number)], ...(inv.due_date ? [['Due Date:', fdate(inv.due_date)]] : [])]) {
    text(k, W - M - 210, yr, { size: 10 }); text(v, W - M - 100, yr, { size: 10 }); yr -= 13;
  }
  y = Math.min(yl, yr) - 14;

  // Bill-to box
  const billLines = [inv.customer_name, ...String(inv.customer_address || '').split('\n')].filter(Boolean);
  const boxH = Math.max(52, billLines.length * 13 + 22);
  page.drawRectangle({ x: W / 2 + 10, y: y - boxH, width: W / 2 - 10 - M, height: boxH, borderColor: blue, borderWidth: 1.5 });
  billLines.forEach((l, i) => text(l, W / 2 + 20, y - 24 - i * 13, { size: 10 }));
  y -= boxH + 14;

  // Line table
  const cols = [
    { k: 'Qty', w: 34, r: true }, { k: 'Item', w: 92 }, { k: 'Description', w: 0 },
    { k: 'Unit Price', w: 74, r: true }, { k: 'GST', w: 56, r: true }, { k: 'Tax %', w: 44, r: true }, { k: 'Total', w: 74, r: true },
  ];
  const fixed = cols.reduce((t, c) => t + c.w, 0);
  cols[2].w = W - 2 * M - fixed;
  const xs: number[] = [];
  cols.reduce((x, c) => (xs.push(x), x + c.w), M);
  const tableTop = y;
  const drawHeader = () => {
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 16, color: blue });
    cols.forEach((c, i) => text(c.k, c.r ? xs[i] + c.w - 4 : xs[i] + 4, y - 11.5, { size: 8.5, f: bold, color: white, right: c.r }));
    y -= 28;
  };
  drawHeader();
  let pageTop = tableTop;
  const closeTable = (bottom: number) => {
    page.drawRectangle({ x: M, y: bottom, width: W - 2 * M, height: pageTop - bottom, borderColor: ink, borderWidth: 0.8 });
    xs.slice(1).forEach((x) => page.drawLine({ start: { x, y: pageTop - 16 }, end: { x, y: bottom }, thickness: 0.8, color: ink }));
  };
  for (const l of lines) {
    const desc = wrap(l.description, cols[2].w - 8, 8.5);
    const item = wrap(l.item_name || '', cols[1].w - 8, 8.5);
    const h = Math.max(desc.length, item.length) * 11 + 4;
    if (y - h < 190) { closeTable(y); page = pdf.addPage([W, H]); y = H - M; pageTop = y; drawHeader(); }
    const amt = Number(l.amount);
    text(String(Number(l.quantity)), xs[0] + cols[0].w - 4, y, { size: 8.5, right: true });
    item.forEach((d, i) => text(d, xs[1] + 4, y - i * 11, { size: 8.5 }));
    desc.forEach((d, i) => text(d, xs[2] + 4, y - i * 11, { size: 8.5 }));
    text(money(l.unit_price), xs[3] + cols[3].w - 4, y, { size: 8.5, right: true });
    text(l.taxable ? money(Math.round(amt * rate) / 100) : '-', xs[4] + cols[4].w - 4, y, { size: 8.5, right: true });
    text(l.taxable ? `${rate}%` : '0%', xs[5] + cols[5].w - 4, y, { size: 8.5, right: true });
    text(money(amt), xs[6] + cols[6].w - 4, y, { size: 8.5, right: true });
    y -= h;
  }
  const bottom = Math.min(y, pageTop - 260);
  closeTable(bottom);
  y = bottom - 16;

  // Totals
  const paid = payments.reduce((t, p) => t + Number(p.amount || 0), 0);
  const balance = Math.max(Number(inv.total) - paid, 0);
  const rows: [string, string, boolean][] = [
    ['Subtotal', money(inv.subtotal), false],
    ['GST', money(inv.gst_amount), false],
    ['Total', money(inv.total), true],
    ...(paid > 0 ? ([['Paid', '-' + money(paid), false]] as [string, string, boolean][]) : []),
    ['Balance Due', money(balance), true],
  ];
  for (const [k, v, b] of rows) {
    text(k, W - M - 64, y, { size: 9, f: b ? bold : font, right: true });
    text(v, W - M - 4, y, { size: 9, f: b ? bold : font, right: true });
    y -= 13;
  }

  // Notes / footer / payment option
  y -= 12;
  const blocks = [inv.notes, s.invoice_footer, s.payment_instructions ? 'Payment option:\n' + s.payment_instructions : ''].filter(Boolean) as string[];
  for (const b of blocks) {
    for (const l of wrap(b, W - 2 * M, 10, bold)) { text(l, M, y, { size: 10, f: bold }); y -= 13; }
    y -= 9;
  }
  page.drawLine({ start: { x: M, y: Math.max(y - 4, 30) }, end: { x: W - M, y: Math.max(y - 4, 30) }, thickness: 3, color: blue });
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
