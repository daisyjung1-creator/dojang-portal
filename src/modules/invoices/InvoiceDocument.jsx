import React from 'react';
import { money, formatDate, lineAmount, round2 } from '../../lib/invoiceUtils';

// The printable invoice (on-screen preview and "Print / Save as PDF"). Same
// modern layout as the emailed PDF in supabase/functions/send-emails/invoiceDocs.ts:
// black and white with one small red accent, hairline rules, and the amount
// due called out in a black block.
const INK = '#111111';
const MUTE = '#737373';
const FAINT = '#999999';
const HAIR = '#E0E0E0';
const RED = '#BF1C21';

const labelStyle = { fontSize: 9, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em' };

export default function InvoiceDocument({ invoice, lines, payments = [], refunds = [], settings }) {
  const s = settings || {};
  const paid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balance = Math.max(Number(invoice.total || 0) - paid, 0);
  const refunded = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const rate = Number(invoice.gst_rate) || 0;
  const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const th = { ...labelStyle, padding: '0 0 8px', borderBottom: `1px solid ${INK}`, textAlign: 'left' };
  const td = { padding: '11px 0', borderBottom: `1px solid ${HAIR}`, fontSize: 12.5, verticalAlign: 'top' };
  const title = invoice.voided ? 'Void' : 'Invoice';
  const contact = [s.phone, s.email].filter(Boolean).join('  ·  ');

  return (
    <div className="invoice-doc" style={{ background: '#fff', color: INK, padding: '44px 52px 28px', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: MUTE }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{s.business_name}</div>
          <div style={{ whiteSpace: 'pre-line' }}>{[s.address, contact, s.website].filter(Boolean).join('\n')}</div>
        </div>
        {s.logo_data && <img src={s.logo_data} alt="" style={{ maxWidth: 140, maxHeight: 60, objectFit: 'contain' }} />}
      </div>

      <div style={{ marginTop: 44 }}>
        <div style={{ width: 28, height: 4, background: RED, marginBottom: 10 }} />
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {title} <span style={{ fontWeight: 400, color: FAINT }}>#{invoice.invoice_number ?? 'new'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 24, marginTop: 34 }}>
        <div>
          <div style={labelStyle}>Billed to</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{invoice.customer_name}</div>
          <div style={{ fontSize: 12, color: MUTE, whiteSpace: 'pre-line', lineHeight: 1.5, marginTop: 2 }}>{[invoice.customer_address, invoice.customer_email].filter(Boolean).join('\n')}</div>
        </div>
        <div style={{ fontSize: 13 }}>
          <div style={labelStyle}>Issued</div>
          <div style={{ marginTop: 6 }}>{formatDate(invoice.invoice_date)}</div>
          {invoice.due_date && (
            <>
              <div style={{ ...labelStyle, marginTop: 14 }}>Due</div>
              <div style={{ marginTop: 6 }}>{formatDate(invoice.due_date)}</div>
            </>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={labelStyle}>Amount due</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4, ...num }}>{money(balance)}</div>
          <div style={{ fontSize: 11, color: balance > 0 ? FAINT : RED, marginTop: 2 }}>{balance > 0 ? 'CAD' : 'Paid in full'}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 36 }}>
        <thead>
          <tr>
            <th style={th}>Description</th>
            <th style={{ ...th, ...num, width: 50 }}>Qty</th>
            <th style={{ ...th, ...num, width: 90 }}>Price</th>
            <th style={{ ...th, ...num, width: 90 }}>GST {rate}%</th>
            <th style={{ ...th, ...num, width: 100 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const amt = lineAmount(l);
            const name = l.item_name && l.item_name !== l.description ? l.item_name : l.description;
            const sub = name === l.description ? '' : l.description;
            return (
              <tr key={l.id || i}>
                <td style={td}>
                  <div style={{ fontWeight: 700 }}>{name}</div>
                  {sub && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>{sub}</div>}
                </td>
                <td style={{ ...td, ...num }}>{Number(l.quantity)}</td>
                <td style={{ ...td, ...num }}>{money(l.unit_price)}</td>
                <td style={{ ...td, ...num, color: l.taxable ? INK : FAINT }}>{l.taxable ? money(round2((amt * rate) / 100)) : '—'}</td>
                <td style={{ ...td, ...num, fontWeight: 700 }}>{money(amt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginLeft: 'auto', width: 280, marginTop: 16, fontSize: 12.5 }}>
        <Row k="Subtotal" v={money(invoice.subtotal)} />
        <Row k={`GST (${rate}%)`} v={money(invoice.gst_amount)} />
        <div style={{ borderTop: `1px solid ${HAIR}`, margin: '4px 0' }} />
        <Row k="Total" v={money(invoice.total)} bold />
        {paid > 0 && <Row k="Paid" v={`-${money(paid)}`} />}
        {refunded > 0 && <Row k="Refunded to you" v={money(refunded)} />}
        <div style={{ background: INK, color: '#fff', borderRadius: 6, height: 46, padding: '0 16px', marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Amount due</span>
          <span style={{ fontWeight: 700, fontSize: 17, ...num }}>{money(balance)}</span>
        </div>
      </div>

      <div style={{ maxWidth: 440, marginTop: 30, fontSize: 12, lineHeight: 1.5 }}>
        {s.payment_instructions && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>How to pay</div>
            <div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{s.payment_instructions}</div>
          </div>
        )}
        {invoice.notes && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Notes</div>
            <div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{invoice.notes}</div>
          </div>
        )}
        {s.invoice_footer && <div style={{ whiteSpace: 'pre-line', color: MUTE }}>{s.invoice_footer}</div>}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 40 }}>
        <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: FAINT }}>
          <span>{[s.business_name, s.gst_number ? `GST ${s.gst_number}` : ''].filter(Boolean).join('  ·  ')}</span>
          <span>{contact}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: bold ? 700 : 400, color: bold ? INK : MUTE }}>
      <span>{k}</span>
      <span style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
}
