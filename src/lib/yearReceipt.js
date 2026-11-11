// Year-end receipt (for taxes / benefits claims): what a family paid during a
// calendar year, split by child, with the GST included and the dojang's GST
// number. Payments on an invoice are shared between the children on it in
// proportion to their lines.
import { supabase } from '../supabaseClient';
import { money, formatDate, round2 } from './invoiceUtils';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// customers: [{ id, name, email }] → { [customer_id]: receipt }
export async function loadYearReceipts(customers, year, onlyStudentId = null) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const ids = customers.map((c) => c.id);
  if (!ids.length) return {};
  const chunk = (arr, n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  let pays = [];
  let refs = [];
  let guardians = {};
  for (const part of chunk(ids)) {
    const [{ data: g }, { data: p }, { data: r }] = await Promise.all([
      supabase.from('students').select('customer_id, guardian_name').in('customer_id', part),
      supabase.from('invoice_payments').select('id, invoice_id, customer_id, payment_date, method, amount, credit_amount, receipt_number').in('customer_id', part).gte('payment_date', from).lte('payment_date', to),
      supabase.from('invoice_refunds').select('id, invoice_id, customer_id, refund_date, amount, gst_amount').in('customer_id', part).gte('refund_date', from).lte('refund_date', to),
    ]);
    (g || []).forEach((x) => x.guardian_name && !guardians[x.customer_id] && (guardians[x.customer_id] = x.guardian_name));
    pays = pays.concat(p || []);
    refs = refs.concat(r || []);
  }
  const invIds = [...new Set([...pays, ...refs].map((x) => x.invoice_id).filter(Boolean))];
  let invs = [];
  let lines = [];
  for (const part of chunk(invIds)) {
    const [{ data: i }, { data: l }] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, total, gst_amount').in('id', part),
      supabase.from('invoice_lines').select('invoice_id, student_id, amount, taxable').in('invoice_id', part),
    ]);
    invs = invs.concat(i || []);
    lines = lines.concat(l || []);
  }
  const sids = [...new Set(lines.map((l) => l.student_id).filter(Boolean))];
  const { data: st } = sids.length ? await supabase.from('students').select('id, name, dob, enroll_date').in('id', sids) : { data: [] };
  const studentBy = Object.fromEntries((st || []).map((x) => [x.id, x]));
  const invBy = Object.fromEntries(invs.map((i) => [i.id, i]));
  const linesBy = {};
  lines.forEach((l) => (linesBy[l.invoice_id] ||= []).push(l));

  // Share of an invoice that belongs to each child (by line amounts).
  const shares = (invId) => {
    const ls = linesBy[invId] || [];
    const tot = ls.reduce((n, l) => n + Number(l.amount || 0), 0);
    const by = {};
    ls.forEach((l) => {
      const k = l.student_id || '_family';
      by[k] = (by[k] || 0) + Number(l.amount || 0);
    });
    return Object.entries(by).map(([k, v]) => [k, tot ? v / tot : 0]);
  };

  const out = {};
  for (const c of customers) {
    const kids = {};
    let paid = 0;
    let gst = 0;
    const add = (amount, invId, sign = 1) => {
      const inv = invBy[invId];
      const parts = invId ? shares(invId) : [['_family', 1]];
      parts.forEach(([k, f]) => {
        if (onlyStudentId && k !== onlyStudentId) return;
        kids[k] = round2((kids[k] || 0) + sign * amount * f);
      });
      const mine = onlyStudentId ? parts.filter(([k]) => k === onlyStudentId).reduce((n, [, f]) => n + f, 0) : 1;
      paid = round2(paid + sign * amount * mine);
      if (inv && Number(inv.total) > 0) gst = round2(gst + sign * amount * mine * (Number(inv.gst_amount) / Number(inv.total)));
    };
    const myPays = pays.filter((p) => p.customer_id === c.id);
    // Money that went to account credit (overpayment) isn't a fee paid yet.
    myPays.forEach((p) => add(Number(p.amount) - Number(p.credit_amount || 0), p.invoice_id));
    refs.filter((r) => r.customer_id === c.id).forEach((r) => add(Number(r.amount), r.invoice_id, -1));
    const children = Object.entries(kids)
      .filter(([, v]) => Math.abs(v) > 0.004)
      .map(([k, v]) => ({ id: k, name: k === '_family' ? 'Family items' : studentBy[k]?.name || 'Student', dob: studentBy[k]?.dob || null, amount: v }))
      .sort((a, b) => (a.id === '_family' ? 1 : b.id === '_family' ? -1 : a.name.localeCompare(b.name)));
    out[c.id] = {
      customer: c,
      guardian: guardians[c.id] || '',
      year,
      children,
      paid,
      gst,
      payments: myPays.sort((a, b) => (a.payment_date < b.payment_date ? -1 : 1)),
      first: myPays[0]?.payment_date || null,
      last: myPays[myPays.length - 1]?.payment_date || null,
    };
  }
  return out;
}

export function yearReceiptHtml(r, s = {}, { pageBreak = false } = {}) {
  const kids = r.children
    .map((k) => `<tr><td>${esc(k.name)}${k.dob ? `<div class="d">Born ${esc(formatDate(k.dob))}</div>` : ''}</td><td class="n">${esc(money(k.amount))}</td></tr>`)
    .join('');
  const pays = r.payments.map((p) => `${esc(formatDate(p.payment_date))} · ${esc(p.method)} · ${esc(money(Number(p.amount) - Number(p.credit_amount || 0)))} (receipt #${esc(p.receipt_number)})`).join('<br>');
  return `<section style="${pageBreak ? 'page-break-after:always;' : ''}padding:8px 0 30px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div class="m"><b style="color:#111;font-size:13px">${esc(s.business_name || '')}</b><br>${esc([s.address, s.phone, s.email].filter(Boolean).join(' · '))}${s.gst_number ? `<br>GST # ${esc(s.gst_number)}` : ''}</div>${s.logo_data ? `<img src="${s.logo_data}" style="max-height:56px">` : ''}</div>
    <div class="bar"></div><h1>${esc(r.year)} Receipt of Fees Paid</h1>
    <div class="m">Issued ${esc(formatDate(new Date().toISOString().slice(0, 10)))} to <b style="color:#111">${esc(r.customer.name)}</b></div>
    <p style="margin:18px 0 0">This confirms that the following taekwondo program fees were paid to ${esc(s.business_name || 'the Dojang')} between January 1 and December 31, ${esc(r.year)}.</p>
    <table><thead><tr><th>Student</th><th class="n">Fees paid</th></tr></thead><tbody>${kids || '<tr><td colspan="2">No fees paid in this year.</td></tr>'}
      <tr class="t"><td>Total paid in ${esc(r.year)}</td><td class="n">${esc(money(r.paid))}</td></tr>
      <tr><td class="d" colspan="2">Includes GST of ${esc(money(r.gst))}${s.gst_number ? ` (GST # ${esc(s.gst_number)})` : ''}. Program: taekwondo classes for children (physical activity program).</td></tr></tbody></table>
    ${pays ? `<div class="d" style="margin-top:14px"><b>Payments</b><br>${pays}</div>` : ''}
    <div style="margin-top:40px">Master Daisy<div class="d">${esc(s.business_name || '')}</div></div>
  </section>`;
}

export function receiptsDocument(sections, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:40px;font-size:13px}
    h1{font-size:24px;margin:24px 0 4px} .m{color:#737373;font-size:12px;line-height:1.5}
    table{width:100%;border-collapse:collapse;margin-top:16px} th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;border-bottom:1px solid #111;padding:6px 4px}
    td{padding:8px 4px;border-bottom:1px solid #e0e0e0;vertical-align:top} .n{text-align:right;white-space:nowrap} .d{color:#737373;font-size:11.5px;margin-top:2px}
    .t td{font-weight:700;border-bottom:none} .bar{width:28px;height:4px;background:#BF1C21;margin-top:22px}
  </style></head><body>${sections.join('')}</body></html>`;
}

export function yearReceiptText(r, s = {}) {
  const greet = r.guardian || 'Parent/Guardian';
  return [
    `Hello ${greet},`,
    '',
    `Here is your ${r.year} receipt of taekwondo fees paid to ${s.business_name || 'the Dojang'}, for your taxes or benefits claim.`,
    '',
    ...r.children.map((k) => `${k.name}: ${money(k.amount)}`),
    '',
    `Total paid in ${r.year}: ${money(r.paid)} (includes GST of ${money(r.gst)}${s.gst_number ? `, GST # ${s.gst_number}` : ''})`,
    '',
    'If you need a printed or PDF copy, just reply to this email.',
    '',
    'Best Regards,',
    'Master Daisy',
    [s.business_name, s.address, s.phone].filter(Boolean).join(' · '),
  ].join('\n');
}

export function printHtml(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
  return true;
}
