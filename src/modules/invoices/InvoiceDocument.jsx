import React from 'react';
import { money, formatDate, lineAmount, round2 } from '../../lib/invoiceUtils';

// The printable invoice, laid out like the Express Invoice template the dojang
// already uses: logo + company block, date/number top right, bill-to box, a
// Qty / Item / Description / Unit Price / GST / Total table, totals, then the
// payment notes. Used for on-screen preview and for "Print / Save as PDF".
export default function InvoiceDocument({ invoice, lines, payments = [], settings }) {
  const s = settings || {};
  const blue = '#1478B4';
  const paid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balance = Math.max(Number(invoice.total || 0) - paid, 0);
  const rate = Number(invoice.gst_rate) || 0;
  const th = { background: blue, color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 6px', textAlign: 'left', borderRight: '1px solid #fff' };
  const td = { fontSize: 11.5, padding: '6px', verticalAlign: 'top', borderRight: '1px solid #20241F' };
  const right = { textAlign: 'right' };

  return (
    <div className="invoice-doc" style={{ background: '#fff', color: '#111', padding: '28px 40px 36px', fontFamily: 'Helvetica, Arial, sans-serif', maxWidth: 780, margin: '0 auto' }}>
      <div style={{ borderTop: `4px solid ${blue}`, textAlign: 'center', marginBottom: 18 }}>
        <div style={{ display: 'inline-block', background: '#fff', padding: '0 14px', marginTop: -14, fontSize: 22, fontWeight: 700, fontStyle: 'italic' }}>{invoice.voided ? 'VOID' : 'Invoice'}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {s.logo_data && <img src={s.logo_data} alt="" style={{ maxWidth: 110, maxHeight: 80, objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, maxWidth: 260 }}>{s.business_name}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-line' }}>{[s.address, s.phone, s.website].filter(Boolean).join('\n')}</div>
            {s.gst_number && <div style={{ fontSize: 12, marginTop: 2 }}>GST No. {s.gst_number}</div>}
          </div>
        </div>
        <table style={{ fontSize: 12.5, borderCollapse: 'collapse', alignSelf: 'flex-start' }}>
          <tbody>
            <tr><td style={{ paddingRight: 40 }}>Date:</td><td>{formatDate(invoice.invoice_date)}</td></tr>
            <tr><td style={{ paddingRight: 40 }}>Invoice No.:</td><td>{invoice.invoice_number ?? '(new)'}</td></tr>
            {invoice.due_date && <tr><td style={{ paddingRight: 40 }}>Due Date:</td><td>{formatDate(invoice.due_date)}</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <div style={{ border: `2px solid ${blue}`, borderRadius: 2, width: '50%', minHeight: 56, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'pre-line' }}>
          {[invoice.customer_name, invoice.customer_address].filter(Boolean).join('\n')}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, border: '1px solid #20241F' }}>
        <thead>
          <tr>
            <th style={{ ...th, ...right, width: 40 }}>Qty</th>
            <th style={{ ...th, width: 110 }}>Item</th>
            <th style={th}>Description</th>
            <th style={{ ...th, ...right, width: 90 }}>Unit Price</th>
            <th style={{ ...th, ...right, width: 70 }}>GST</th>
            <th style={{ ...th, ...right, width: 54 }}>Tax %</th>
            <th style={{ ...th, ...right, width: 90, borderRight: 'none' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const amt = lineAmount(l);
            return (
              <tr key={l.id || i}>
                <td style={{ ...td, ...right }}>{Number(l.quantity)}</td>
                <td style={td}>{l.item_name || ''}</td>
                <td style={td}>{l.description}</td>
                <td style={{ ...td, ...right }}>{money(l.unit_price)}</td>
                <td style={{ ...td, ...right }}>{l.taxable ? money(round2((amt * rate) / 100)) : '-'}</td>
                <td style={{ ...td, ...right }}>{l.taxable ? `${rate}%` : '0%'}</td>
                <td style={{ ...td, ...right, borderRight: 'none' }}>{money(amt)}</td>
              </tr>
            );
          })}
          <tr>
            {[0, 1, 2, 3, 4, 5, 6].map((k) => <td key={k} style={{ ...td, height: Math.max(60, 260 - lines.length * 28), borderRight: k === 6 ? 'none' : td.borderRight }} />)}
          </tr>
        </tbody>
      </table>

      <table style={{ marginLeft: 'auto', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
        <tbody>
          <tr><td style={{ padding: '3px 12px', ...right }}>Subtotal</td><td style={{ padding: '3px 6px', ...right, minWidth: 70 }}>{money(invoice.subtotal)}</td></tr>
          <tr><td style={{ padding: '3px 12px', ...right }}>GST</td><td style={{ padding: '3px 6px', ...right }}>{money(invoice.gst_amount)}</td></tr>
          <tr><td style={{ padding: '3px 12px', ...right, fontWeight: 700 }}>Total</td><td style={{ padding: '3px 6px', ...right, fontWeight: 700 }}>{money(invoice.total)}</td></tr>
          {paid > 0 && <tr><td style={{ padding: '3px 12px', ...right }}>Paid</td><td style={{ padding: '3px 6px', ...right }}>-{money(paid)}</td></tr>}
          <tr><td style={{ padding: '3px 12px', ...right, fontWeight: 700 }}>Balance Due</td><td style={{ padding: '3px 6px', ...right, fontWeight: 700 }}>{money(balance)}</td></tr>
        </tbody>
      </table>

      <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.5, marginTop: 18 }}>
        {invoice.notes && <p style={{ whiteSpace: 'pre-line', margin: '0 0 12px' }}>{invoice.notes}</p>}
        {s.invoice_footer && <p style={{ whiteSpace: 'pre-line', margin: '0 0 12px' }}>{s.invoice_footer}</p>}
        {s.payment_instructions && (
          <p style={{ whiteSpace: 'pre-line', margin: 0 }}>
            Payment option:
            <br />
            {s.payment_instructions}
          </p>
        )}
      </div>
      <div style={{ borderTop: `4px solid ${blue}`, marginTop: 22 }} />
    </div>
  );
}
