// Payroll maths for the payslip (same results as the old payslip spreadsheet):
//   standard pay = hours × rate, vacation pay = 4% of wages,
//   CPP = (pensionable pay − basic exemption for the period) × 5.95%,
//   EI = insurable pay × EI rate — both stopping at the yearly maximum.
// Income tax (federal + Alberta) follows CRA's payroll formulas (T4127) with
// the basic TD1 / TD1AB claim amounts; it can still be typed in by hand.

// CRA / ESDC figures by year (employee share).
export const PAYROLL_RATES = {
  2025: { cppRate: 5.95, cppExemption: 3500, cppMax: 4034.1, eiRate: 1.64, eiMax: 1077.48 },
  2026: {
    cppRate: 5.95, cppExemption: 3500, cppMax: 4230.45, eiRate: 1.63, eiMax: 1123.07,
    // T4127 (122nd ed., Jan 2026): CPP base-contribution max for the credit,
    // federal and Alberta brackets / claim amounts.
    cppBaseMax: 3519.45,
    fed: { brackets: [[0, 0.14], [58523, 0.205], [117045, 0.26], [181440, 0.29], [258482, 0.33]], bpa: 16452, bpaMin: 14829, bpaFrom: 181440, bpaTo: 258482, cea: 1501, low: 0.14 },
    ab: { brackets: [[0, 0.08], [61200, 0.1], [154259, 0.12], [185111, 0.13], [246813, 0.14], [370220, 0.15]], bpa: 22769, low: 0.08, k5Base: 4896 },
  },
};

export const PAY_TYPES = { Monthly: 12, 'Semi-monthly': 24, 'Bi-weekly': 26, Weekly: 52 };

export function ratesFor(payDate) {
  const y = Number(String(payDate || '').slice(0, 4)) || new Date().getFullYear();
  const years = Object.keys(PAYROLL_RATES).map(Number).sort();
  return PAYROLL_RATES[y] || PAYROLL_RATES[years.filter((k) => k <= y).pop() || years[0]];
}

// Round to cents, half up, without floating-point slips (620.925 → 620.93).
const r2 = (n) => Math.round(Number(((Number(n) || 0) * 100).toFixed(6))) / 100;

// Hours typed as a number (36.52) or as hours:minutes (36:31 or 36:31.5).
export function parseHours(v) {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const m = s.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  return Number(s) || 0;
}

function bracketTax(income, brackets) {
  let t = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [from, rate] = brackets[i];
    const to = brackets[i + 1] ? brackets[i + 1][0] : Infinity;
    if (income > from) t += (Math.min(income, to) - from) * rate;
  }
  return t;
}

// Income tax for one pay (federal + Alberta), CRA T4127 "option 1" with the
// basic claim amounts. pay = taxable pay this period, cpp / ei = this period's.
export function incomeTax({ pay, cpp, ei, periods = 12, payDate }) {
  const r = ratesFor(payDate);
  if (!r.fed || !r.ab) return 0;
  const P = periods;
  const f5a = cpp * (0.01 / (r.cppRate / 100)); // enhanced CPP is a deduction
  const A = Math.max(P * (pay - f5a), 0);
  if (A <= 0) return 0;
  const cppCredit = Math.min(P * cpp * (0.0495 / (r.cppRate / 100)), r.cppBaseMax);
  const eiCredit = Math.min(P * ei, r.eiMax);
  // Federal
  const f = r.fed;
  const bpa = A <= f.bpaFrom ? f.bpa : A >= f.bpaTo ? f.bpaMin : f.bpa - ((A - f.bpaFrom) * (f.bpa - f.bpaMin)) / (f.bpaTo - f.bpaFrom);
  const t3 = bracketTax(A, f.brackets) - f.low * bpa - f.low * (cppCredit + eiCredit) - Math.min(f.low * P * pay, f.low * f.cea);
  const t1 = Math.max(t3, 0);
  // Alberta
  const a = r.ab;
  const k1p = a.low * a.bpa;
  const k2p = a.low * (cppCredit + eiCredit);
  const t4 = Math.max(bracketTax(A, a.brackets) - k1p - k2p, 0);
  const k5p = Math.max((k1p + k2p - a.k5Base) * 0.25, 0);
  const t2 = Math.max(t4 - k5p, 0);
  return r2((t1 + t2) / P);
}

// p: { hours, rate, overtime_hours, overtime_rate, vacation_pct, bonus, sick_pay,
//      expenses, tax, other_deductions, pay_type, pay_date }
// ytd: CPP and EI already taken this year before this payslip.
export function calcPayslip(p, ytd = { cpp: 0, ei: 0 }) {
  const rates = ratesFor(p.pay_date);
  const periods = PAY_TYPES[p.pay_type] || 12;
  const standard_pay = r2(parseHours(p.hours) * Number(p.rate));
  const overtime_pay = r2(parseHours(p.overtime_hours) * Number(p.overtime_rate || 0));
  const vacation_pay = p.vacation_pay_override != null && p.vacation_pay_override !== '' ? r2(p.vacation_pay_override) : r2(((standard_pay + overtime_pay) * Number(p.vacation_pct ?? 4)) / 100);
  const bonus = r2(p.bonus), sick_pay = r2(p.sick_pay), expenses = r2(p.expenses);
  const gross = r2(standard_pay + overtime_pay + vacation_pay + bonus + sick_pay + expenses);
  // Expense repayments aren't pay, so no CPP / EI on them.
  const pensionable = gross - expenses;
  const cppRaw = r2(Math.max(pensionable - rates.cppExemption / periods, 0) * (rates.cppRate / 100));
  const cpp = p.cpp_override != null && p.cpp_override !== '' ? r2(p.cpp_override) : r2(Math.max(Math.min(cppRaw, rates.cppMax - Number(ytd.cpp || 0)), 0));
  const eiRaw = r2(Math.max(pensionable, 0) * (rates.eiRate / 100));
  const ei = p.ei_override != null && p.ei_override !== '' ? r2(p.ei_override) : r2(Math.max(Math.min(eiRaw, rates.eiMax - Number(ytd.ei || 0)), 0));
  // Tax left blank = worked out automatically.
  const tax = p.tax == null || p.tax === '' ? incomeTax({ pay: pensionable, cpp, ei, periods, payDate: p.pay_date }) : r2(p.tax);
  const other_deductions = r2(p.other_deductions);
  const total_deductions = r2(tax + cpp + ei + other_deductions);
  return { standard_pay, overtime_pay, vacation_pay, bonus, sick_pay, expenses, gross, cpp, ei, tax, other_deductions, total_deductions, net: r2(gross - total_deductions) };
}

// Year-to-date totals for one employee up to and including a pay date.
export const YTD_FIELDS = ['hours', 'standard_pay', 'overtime_hours', 'overtime_pay', 'vacation_pay', 'bonus', 'sick_pay', 'expenses', 'gross', 'tax', 'cpp', 'ei', 'other_deductions', 'total_deductions', 'net'];
export function ytdTotals(slips, employeeId, payDate, { inclusive = true } = {}) {
  const year = String(payDate).slice(0, 4);
  const out = Object.fromEntries(YTD_FIELDS.map((f) => [f, 0]));
  slips
    .filter((s) => s.employee_id === employeeId && String(s.pay_date).slice(0, 4) === year && (inclusive ? s.pay_date <= payDate : s.pay_date < payDate))
    .forEach((s) => YTD_FIELDS.forEach((f) => (out[f] = r2(out[f] + Number(s[f] || 0)))));
  return out;
}
