import React from 'react';
import { money, formatDate } from '../../lib/invoiceUtils';

// Printable payslip — same content as the old payslip spreadsheet, in the
// portal's invoice/receipt style.
const INK = '#111111';
const MUTE = '#737373';
const FAINT = '#999999';
const HAIR = '#E0E0E0';
const RED = '#BF1C21';
const label = { fontSize: 9, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const hrs = (n) => (Number(n) ? Number(n).toFixed(2) : '');

export default function PayslipDocument({ slip, employee, ytd, settings }) {
  const s = settings || {};
  const e = employee || {};
  const period = slip.period_start && slip.period_end ? `${formatDate(slip.period_start)} – ${formatDate(slip.period_end)}` : slip.pay_type || e.pay_type || '';
  const earnings = [
    { k: 'Standard Pay', h: slip.hours, r: slip.rate, c: slip.standard_pay, y: ytd.standard_pay, always: true },
    { k: 'Overtime Pay', h: slip.overtime_hours, r: slip.overtime_rate, c: slip.overtime_pay, y: ytd.overtime_pay },
    { k: 'Vacation Pay', c: slip.vacation_pay, y: ytd.vacation_pay, always: true },
    { k: 'Commission and Bonus', c: slip.bonus, y: ytd.bonus },
    { k: 'Sick Pay', c: slip.sick_pay, y: ytd.sick_pay },
    { k: 'Expenses', c: slip.expenses, y: ytd.expenses },
  ].filter((r) => r.always || Number(r.c) || Number(r.y));
  const deductions = [
    { k: 'Income Tax', c: slip.tax, y: ytd.tax, always: true },
    { k: 'CPP', c: slip.cpp, y: ytd.cpp, always: true },
    { k: 'EI', c: slip.ei, y: ytd.ei, always: true },
    { k: 'Other', c: slip.other_deductions, y: ytd.other_deductions },
  ].filter((r) => r.always || Number(r.c) || Number(r.y));
  const td = { padding: '9px 0', borderBottom: `1px solid ${HAIR}`, fontSize: 12.5 };
  const th = { ...label, padding: '0 0 8px', borderBottom: `1px solid ${INK}` };

  return (
    <div className="invoice-doc" style={{ background: '#fff', color: INK, padding: '44px 52px 28px', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: MUTE }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{s.company_name}</div>
          <div style={{ whiteSpace: 'pre-line' }}>{[s.address, [s.phone, s.email].filter(Boolean).join('  ·  ')].filter(Boolean).join('\n')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ width: 28, height: 4, background: RED, marginLeft: 'auto', marginBottom: 10 }} />
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1 }}>PAYSLIP</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 24, marginTop: 38 }}>
        <div>
          <div style={label}>Employee</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{e.name}</div>
          <div style={{ fontSize: 12, color: MUTE, whiteSpace: 'pre-line', lineHeight: 1.5, marginTop: 2 }}>
            {[e.address, e.phone && `Phone: ${e.phone}`, e.email && `Email: ${e.email}`].filter(Boolean).join('\n')}
          </div>
        </div>
        <div style={{ fontSize: 13 }}>
          <div style={label}>Pay date</div>
          <div style={{ marginTop: 6 }}>{formatDate(slip.pay_date)}</div>
          <div style={{ ...label, marginTop: 14 }}>Period</div>
          <div style={{ marginTop: 6 }}>{period}</div>
        </div>
        <div style={{ fontSize: 13 }}>
          <div style={label}>Pay type</div>
          <div style={{ marginTop: 6 }}>{slip.pay_type || e.pay_type}</div>
          {(e.payroll_no || e.sin_masked) && (
            <>
              <div style={{ ...label, marginTop: 14 }}>{e.payroll_no ? 'Payroll #' : 'SIN'}</div>
              <div style={{ marginTop: 6 }}>{e.payroll_no || e.sin_masked}</div>
              {e.payroll_no && e.sin_masked && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>SIN {e.sin_masked}</div>}
            </>
          )}
          <div style={{ ...label, marginTop: 14 }}>Payment method</div>
          <div style={{ marginTop: 6 }}>{slip.payment_method || e.payment_method}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 34 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Earnings</th>
            <th style={{ ...th, ...num, width: 80 }}>Hours</th>
            <th style={{ ...th, ...num, width: 80 }}>Rate</th>
            <th style={{ ...th, ...num, width: 110 }}>Current</th>
            <th style={{ ...th, ...num, width: 110 }}>YTD</th>
          </tr>
        </thead>
        <tbody>
          {earnings.map((r) => (
            <tr key={r.k}>
              <td style={{ ...td, fontWeight: 700 }}>{r.k}</td>
              <td style={{ ...td, ...num }}>{hrs(r.h)}</td>
              <td style={{ ...td, ...num }}>{r.r ? money(r.r) : ''}</td>
              <td style={{ ...td, ...num }}>{money(r.c)}</td>
              <td style={{ ...td, ...num, color: MUTE }}>{money(r.y)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={{ ...td, ...num, fontWeight: 700, borderBottom: 'none' }}>Gross pay</td>
            <td style={{ ...td, ...num, fontWeight: 700, borderBottom: 'none' }}>{money(slip.gross)}</td>
            <td style={{ ...td, ...num, fontWeight: 700, borderBottom: 'none' }}>{money(ytd.gross)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Deductions</th>
            <th style={{ ...th, ...num, width: 110 }}>Current</th>
            <th style={{ ...th, ...num, width: 110 }}>YTD</th>
          </tr>
        </thead>
        <tbody>
          {deductions.map((r) => (
            <tr key={r.k}>
              <td style={{ ...td, fontWeight: 700 }}>{r.k}</td>
              <td style={{ ...td, ...num }}>{money(r.c)}</td>
              <td style={{ ...td, ...num, color: MUTE }}>{money(r.y)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, ...num, fontWeight: 700, borderBottom: 'none' }}>Total deductions</td>
            <td style={{ ...td, ...num, fontWeight: 700, borderBottom: 'none' }}>{money(slip.total_deductions)}</td>
            <td style={{ ...td, ...num, fontWeight: 700, borderBottom: 'none' }}>{money(ytd.total_deductions)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginLeft: 'auto', width: 330, marginTop: 18, background: INK, color: '#fff', borderRadius: 6, height: 50, padding: '0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Net pay</span>
        <span style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: '#BBBBBB' }}>YTD {money(ytd.net)}</span>
          <span style={{ fontWeight: 700, fontSize: 18, ...num }}>{money(slip.net)}</span>
        </span>
      </div>

      {slip.notes && (
        <div style={{ maxWidth: 440, marginTop: 26, fontSize: 12, lineHeight: 1.5 }}>
          <div style={label}>Notes</div>
          <div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{slip.notes}</div>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 40 }}>
        {s.contact_line && <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 10 }}>If you have any questions about this payslip, please contact: {s.contact_line}</div>}
        <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: FAINT }}>
          <span>{s.company_name}</span>
          <span>{[s.phone, s.email].filter(Boolean).join('  ·  ')}</span>
        </div>
      </div>
    </div>
  );
}
