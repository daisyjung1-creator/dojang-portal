// Payslip PDF (same layout as the portal's PayslipDocument) and its email.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { money, fdate } from './invoiceDocs.ts';

const pdfSafe = (s: any) =>
  String(s ?? '').replace(/–/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x20-\x7E -ÿ—]/g, '');
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function buildPayslipPdf(slip: Record<string, any>, e: Record<string, any>, ytd: Record<string, number>, s: Record<string, any>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  const page = pdf.addPage([W, H]);
  const ink = rgb(0.067, 0.067, 0.067), mute = rgb(0.45, 0.45, 0.45), faint = rgb(0.6, 0.6, 0.6), hair = rgb(0.88, 0.88, 0.88), red = rgb(0.75, 0.11, 0.13), white = rgb(1, 1, 1);
  const text = (t: any, x: number, y: number, o: { size?: number; f?: any; color?: any; right?: boolean } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font;
    const str = pdfSafe(t);
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: o.right ? x - w : x, y, size, font: f, color: o.color ?? ink });
  };
  const label = (t: string, x: number, y: number, right = false) => text(t.toUpperCase(), x, y, { size: 7, f: bold, color: faint, right });
  const rule = (y: number, x1 = M, x2 = W - M, color = hair, th = 0.6) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: th, color });
  const n = (v: any) => Number(v || 0);

  // Header
  let y = H - M;
  text(s.company_name || '', M, y, { size: 10, f: bold });
  let yb = y - 13;
  for (const l of [s.address, [s.phone, s.email].filter(Boolean).join('  ·  ')].filter(Boolean)) { text(l, M, yb, { size: 8.5, color: mute }); yb -= 11.5; }
  page.drawRectangle({ x: W - M - 22, y: y + 6, width: 22, height: 3, color: red });
  text('PAYSLIP', W - M, y - 22, { size: 26, f: bold, right: true });
  y = Math.min(yb, y - 30) - 30;

  // Employee · pay date / period · pay type / SIN / method
  const c2 = M + 220, c3 = M + 370;
  label('Employee', M, y); label('Pay date', c2, y); label('Pay type', c3, y);
  const yt = y - 15;
  text(e.name || '', M, yt, { size: 10.5, f: bold });
  let yc = yt - 13;
  for (const l of [e.address, e.phone && `Phone: ${e.phone}`, e.email && `Email: ${e.email}`].filter(Boolean)) { text(l, M, yc, { size: 9, color: mute }); yc -= 12; }
  text(fdate(slip.pay_date), c2, yt, { size: 10 });
  label('Period', c2, yt - 22);
  text(slip.period_start && slip.period_end ? `${fdate(slip.period_start)} - ${fdate(slip.period_end)}` : slip.pay_type || e.pay_type || '', c2, yt - 36, { size: 10 });
  text(slip.pay_type || e.pay_type || '', c3, yt, { size: 10 });
  let y3 = yt - 22;
  if (e.payroll_no) { label('Payroll #', c3, y3); text(e.payroll_no, c3, y3 - 14, { size: 10 }); y3 -= 36; }
  if (e.sin_masked) { label('SIN', c3, y3); text(e.sin_masked, c3, y3 - 14, { size: 10 }); y3 -= 36; }
  label('Payment method', c3, y3); text(slip.payment_method || e.payment_method || '', c3, y3 - 14, { size: 10 });
  y = Math.min(yc, y3 - 14, yt - 40) - 30;

  // Earnings
  const xH = W - M - 300, xR = W - M - 220, xC = W - M - 110, xY = W - M;
  label('Earnings', M, y); label('Hours', xH, y, true); label('Rate', xR, y, true); label('Current', xC, y, true); label('YTD', xY, y, true);
  y -= 9; rule(y, M, W - M, ink, 0.8); y -= 17;
  const earn = [
    ['Standard Pay', slip.hours, slip.rate, slip.standard_pay, ytd.standard_pay, true],
    ['Overtime Pay', slip.overtime_hours, slip.overtime_rate, slip.overtime_pay, ytd.overtime_pay, false],
    ['Vacation Pay', null, null, slip.vacation_pay, ytd.vacation_pay, true],
    ['Commission and Bonus', null, null, slip.bonus, ytd.bonus, false],
    ['Sick Pay', null, null, slip.sick_pay, ytd.sick_pay, false],
    ['Expenses', null, null, slip.expenses, ytd.expenses, false],
  ].filter((r) => r[5] || n(r[3]) || n(r[4]));
  for (const [k, h, r, c, yv] of earn) {
    text(k, M, y, { f: bold });
    if (n(h)) text(n(h).toFixed(2), xH, y, { right: true });
    if (n(r)) text(money(r), xR, y, { right: true });
    text(money(c), xC, y, { right: true });
    text(money(yv), xY, y, { right: true, color: mute });
    y -= 12; rule(y + 3); y -= 14;
  }
  text('Gross pay', xR, y, { f: bold, right: true }); text(money(slip.gross), xC, y, { f: bold, right: true }); text(money(ytd.gross), xY, y, { f: bold, right: true });
  y -= 34;

  // Deductions
  label('Deductions', M, y); label('Current', xC, y, true); label('YTD', xY, y, true);
  y -= 9; rule(y, M, W - M, ink, 0.8); y -= 17;
  const ded = [
    ['Income Tax', slip.tax, ytd.tax, true],
    ['CPP', slip.cpp, ytd.cpp, true],
    ['EI', slip.ei, ytd.ei, true],
    ['Other', slip.other_deductions, ytd.other_deductions, false],
  ].filter((r) => r[3] || n(r[1]) || n(r[2]));
  for (const [k, c, yv] of ded) {
    text(k, M, y, { f: bold });
    text(money(c), xC, y, { right: true });
    text(money(yv), xY, y, { right: true, color: mute });
    y -= 12; rule(y + 3); y -= 14;
  }
  text('Total deductions', xR, y, { f: bold, right: true }); text(money(slip.total_deductions), xC, y, { f: bold, right: true }); text(money(ytd.total_deductions), xY, y, { f: bold, right: true });
  y -= 24;

  // Net pay block
  const bw = 250, bh = 36, bx = W - M - bw, by = y - bh + 10;
  page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: ink });
  text('Net pay', bx + 12, by + bh / 2 - 3.5, { size: 10, f: bold, color: white });
  text(`YTD ${money(ytd.net)}`, W - M - 100, by + bh / 2 - 3, { size: 8, color: rgb(0.75, 0.75, 0.75), right: true });
  text(money(slip.net), W - M - 12, by + bh / 2 - 4.5, { size: 13, f: bold, color: white, right: true });
  y = by - 30;

  if (slip.notes && slip.notes !== 'From payslip spreadsheet') { label('Notes', M, y); text(slip.notes, M, y - 13, { size: 9 }); }

  const fy = 40;
  if (s.contact_line) text(`If you have any questions about this payslip, please contact: ${s.contact_line}`, M, fy + 24, { size: 8.5, color: mute });
  rule(fy + 12);
  text(s.company_name || '', M, fy, { size: 7.5, color: faint });
  text([s.phone, s.email].filter(Boolean).join('  ·  '), W - M, fy, { size: 7.5, color: faint, right: true });
  return await pdf.save();
}

export function payslipEmail(slip: Record<string, any>, e: Record<string, any>, s: Record<string, any>) {
  const first = String(e.name || '').trim().split(' ')[0];
  const period = slip.period_start && slip.period_end ? `${fdate(slip.period_start)} – ${fdate(slip.period_end)}` : '';
  return {
    subject: `Payslip — ${fdate(slip.pay_date)} — ${s.company_name || ''}`.trim(),
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#111;max-width:520px;font-size:14px;line-height:1.55">
  <p>Hi ${esc(first)},</p>
  <p>Your payslip for the pay date ${esc(fdate(slip.pay_date))}${period ? ` (work period ${esc(period)})` : ''} is attached as a PDF.</p>
  <table style="font-size:14px;border-collapse:collapse;margin:12px 0">
    <tr><td style="color:#737373;padding:3px 16px 3px 0">Hours</td><td>${Number(slip.hours || 0).toFixed(2)}</td></tr>
    <tr><td style="color:#737373;padding:3px 16px 3px 0">Gross pay</td><td>${money(slip.gross)}</td></tr>
    <tr><td style="color:#737373;padding:3px 16px 3px 0">Deductions</td><td>${money(slip.total_deductions)}</td></tr>
    <tr><td style="color:#737373;padding:3px 16px 3px 0">Net pay</td><td><b>${money(slip.net)}</b></td></tr>
  </table>
  ${s.contact_line ? `<p style="font-size:13px;color:#555">Questions? Please contact ${esc(s.contact_line)}.</p>` : ''}
  <p style="font-size:12px;color:#999;margin-top:20px">${esc([s.company_name, s.phone, s.email].filter(Boolean).join(' · '))}</p>
</div>`,
  };
}
