// Shared helpers for the invoicing module (money, dates, totals, periods).

// Default list; the dojang's own list is edited in Invoice Settings
// (invoice_settings.payment_methods) and loaded with usePaymentMethods().
export const PAYMENT_METHODS = [
  'Pre-Authorized Credit Card',
  'Interac e-Transfer',
  'Debit',
  'Cash',
  'Visa',
  'Mastercard',
  'Cheque',
  'Subsidy (KidSport etc.)',
  'Other',
];

export const INVOICE_STATUS_STYLES = {
  Paid: { bg: '#E8F1E9', text: '#2A5A30', border: '#BFDCC3' },
  'Partially Paid': { bg: '#FAEEDA', text: '#854F0B', border: '#F0D9A8' },
  'Not Paid': { bg: '#FBEAEA', text: '#9A2B2B', border: '#E4B8B8' },
  Void: { bg: '#F1EFE7', text: '#8A8D84', border: '#DEDACC' },
  Refunded: { bg: '#EEEAF6', text: '#4B3A86', border: '#D2C9EA' },
  'Partially Refunded': { bg: '#EEEAF6', text: '#4B3A86', border: '#D2C9EA' },
};

const moneyFmt = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

export function money(n) {
  const num = Number(n) || 0;
  return moneyFmt.format(num).replace('CA$', '$');
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
}

// Today's date in the browser's local time zone (Edmonton), as YYYY-MM-DD.
// (toISOString() would roll over to tomorrow after 6 pm MDT.)
export function localISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localISO(d);
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function lineAmount(line) {
  return round2((Number(line.quantity) || 0) * (Number(line.unit_price) || 0));
}

export function calcTotals(lines, gstRate) {
  const subtotal = round2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const taxableBase = round2(lines.filter((l) => l.taxable).reduce((s, l) => s + lineAmount(l), 0));
  const gst = round2((taxableBase * (Number(gstRate) || 0)) / 100);
  return { subtotal, gst, total: round2(subtotal + gst) };
}

// Period presets like Express Invoice's "Period" dropdown.
export const PERIODS = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_year', label: 'Last Year' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];

export function periodRange(id, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const q = Math.floor(m / 3);
  const mk = (yy, mm, dd) => localISO(new Date(yy, mm, dd));
  switch (id) {
    case 'this_month':
      return { start: mk(y, m, 1), end: mk(y, m + 1, 0) };
    case 'last_month':
      return { start: mk(y, m - 1, 1), end: mk(y, m, 0) };
    case 'this_quarter':
      return { start: mk(y, q * 3, 1), end: mk(y, q * 3 + 3, 0) };
    case 'last_quarter':
      return { start: mk(y, q * 3 - 3, 1), end: mk(y, q * 3, 0) };
    case 'this_year':
      return { start: mk(y, 0, 1), end: mk(y, 11, 31) };
    case 'last_year':
      return { start: mk(y - 1, 0, 1), end: mk(y - 1, 11, 31) };
    default:
      return { start: '2000-01-01', end: '2099-12-31' };
  }
}

export function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
