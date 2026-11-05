// Payroll maths for the payslip (same results as the old payslip spreadsheet):
//   standard pay = hours × rate, vacation pay = 4% of wages,
//   CPP = (pensionable pay − basic exemption for the period) × 5.95%,
//   EI = insurable pay × EI rate — both stopping at the yearly maximum.
// Income tax is entered by hand (most part-time pay is below the tax threshold).

// CRA / ESDC figures by year (employee share).
export const PAYROLL_RATES = {
  2025: { cppRate: 5.95, cppExemption: 3500, cppMax: 4034.1, eiRate: 1.64, eiMax: 1077.48 },
  2026: { cppRate: 5.95, cppExemption: 3500, cppMax: 4230.45, eiRate: 1.63, eiMax: 1123.07 },
};

export const PAY_TYPES = { Monthly: 12, 'Semi-monthly': 24, 'Bi-weekly': 26, Weekly: 52 };

export function ratesFor(payDate) {
  const y = Number(String(payDate || '').slice(0, 4)) || new Date().getFullYear();
  const years = Object.keys(PAYROLL_RATES).map(Number).sort();
  return PAYROLL_RATES[y] || PAYROLL_RATES[years.filter((k) => k <= y).pop() || years[0]];
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// p: { hours, rate, overtime_hours, overtime_rate, vacation_pct, bonus, sick_pay,
//      expenses, tax, other_deductions, pay_type, pay_date }
// ytd: CPP and EI already taken this year before this payslip.
export function calcPayslip(p, ytd = { cpp: 0, ei: 0 }) {
  const rates = ratesFor(p.pay_date);
  const periods = PAY_TYPES[p.pay_type] || 12;
  const standard_pay = r2(Number(p.hours) * Number(p.rate));
  const overtime_pay = r2(Number(p.overtime_hours || 0) * Number(p.overtime_rate || 0));
  const vacation_pay = p.vacation_pay_override != null && p.vacation_pay_override !== '' ? r2(p.vacation_pay_override) : r2(((standard_pay + overtime_pay) * Number(p.vacation_pct ?? 4)) / 100);
  const bonus = r2(p.bonus), sick_pay = r2(p.sick_pay), expenses = r2(p.expenses);
  const gross = r2(standard_pay + overtime_pay + vacation_pay + bonus + sick_pay + expenses);
  // Expense repayments aren't pay, so no CPP / EI on them.
  const pensionable = gross - expenses;
  const cppRaw = r2(Math.max(pensionable - rates.cppExemption / periods, 0) * (rates.cppRate / 100));
  const cpp = p.cpp_override != null && p.cpp_override !== '' ? r2(p.cpp_override) : r2(Math.max(Math.min(cppRaw, rates.cppMax - Number(ytd.cpp || 0)), 0));
  const eiRaw = r2(Math.max(pensionable, 0) * (rates.eiRate / 100));
  const ei = p.ei_override != null && p.ei_override !== '' ? r2(p.ei_override) : r2(Math.max(Math.min(eiRaw, rates.eiMax - Number(ytd.ei || 0)), 0));
  const tax = r2(p.tax), other_deductions = r2(p.other_deductions);
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
