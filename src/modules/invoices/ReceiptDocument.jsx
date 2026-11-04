import React from 'react';
import { money, formatDate, lineAmount } from '../../lib/invoiceUtils';

// Printable receipt — same look as InvoiceDocument and the emailed receipt PDF
// (supabase/functions/send-emails/invoiceDocs.ts → buildReceiptPdf).
const INK = '#111111';
const MUTE = '#737373';
const FAINT = '#999999';
const HAIR = '#E0E0E0';
const RED = '#BF1C21';
const labelStyle = { fontSize: 9, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em' };

export default function ReceiptDocument({ payment: p, invoice, lines = [], earlier = 0, customer, settings }) {
  const s = settings || {};
  const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const td = { padding: '11px 0', borderBottom: `1px solid ${HAIR}`, fontSize: 12.5, verticalAlign: 'top' };
  const contact = [s.phone, s.email].filter(Boolean).join('  ·  ');
  const name = customer?.name || invoice?.customer_name || '';
  const addr = [customer?.address, customer?.printed_info].filter(Boolean).join('\n') || invoice?.customer_address || '';
  const email = customer?.email || invoice?.customer_email || '';
  const remaining = invoice ? Math.max(Number(invoice.total) - earlier - Number(p.amount), 0) : 0;
  const rate = Number(invoice?.gst_rate) || 0;
  const showNotes = p.notes && !String(p.notes).startsWith('Imported from Express');

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
          Receipt <span style={{ fontWeight: 400, color: FAINT }}>#{p.receipt_number}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 24, marginTop: 34 }}>
        <div>
          <div style={labelStyle}>Received from</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{name}</div>
          <div style={{ fontSize: 12, color: MUTE, whiteSpace: 'pre-line', lineHeight: 1.5, marginTop: 2 }}>{[addr, email].filter(Boolean).join('\n')}</div>
        </div>
        <div style={{ fontSize: 13 }}>
          <div style={labelStyle}>Payment date</div>
          <div style={{ marginTop: 6 }}>{formatDate(p.payment_date)}</div>
          <div style={{ ...labelStyle, marginTop: 14 }}>Method</div>
          <div style={{ marginTop: 6 }}>{p.method}</div>
          {p.reference && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>Ref. {p.reference}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={labelStyle}>Amount paid</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4, ...num }}>{money(p.amount)}</div>
          <div style={{ fontSize: 11, color: RED, marginTop: 2 }}>Thank you</div>
        </div>
      </div>

      {invoice && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 36 }}>
            <thead>
              <tr>
                <th style={{ ...labelStyle, padding: '0 0 8px', borderBottom: `1px solid ${INK}`, textAlign: 'left' }}>
                  For invoice #{invoice.invoice_number} · {formatDate(invoice.invoice_date)}
                </th>
                <th style={{ ...labelStyle, padding: '0 0 8px', borderBottom: `1px solid ${INK}`, ...num, width: 110 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const title = l.item_name && l.item_name !== l.description ? l.item_name : l.description;
                const sub = title === l.description ? '' : l.description;
                return (
                  <tr key={l.id || i}>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{title}{Number(l.quantity) !== 1 ? `  ×${Number(l.quantity)}` : ''}</div>
                      {sub && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>{sub}</div>}
                    </td>
                    <td style={{ ...td, ...num }}>{money(lineAmount(l))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginLeft: 'auto', width: 280, marginTop: 16, fontSize: 12.5 }}>
            <Row k="Subtotal" v={money(invoice.subtotal)} />
            <Row k={`GST (${rate}%)`} v={money(invoice.gst_amount)} />
            <div style={{ borderTop: `1px solid ${HAIR}`, margin: '4px 0' }} />
            <Row k="Invoice total" v={money(invoice.total)} bold />
            {earlier > 0.005 && <Row k="Paid before" v={`-${money(earlier)}`} />}
            <Row k="This payment" v={`-${money(p.amount)}`} />
            <div style={{ background: INK, color: '#fff', borderRadius: 6, height: 46, padding: '0 16px', marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{remaining > 0.005 ? 'Balance remaining' : 'Paid in full'}</span>
              <span style={{ fontWeight: 700, fontSize: 17, ...num }}>{money(remaining)}</span>
            </div>
          </div>
        </>
      )}

      {showNotes && (
        <div style={{ maxWidth: 440, marginTop: 30, fontSize: 12, lineHeight: 1.5 }}>
          <div style={labelStyle}>Notes</div>
          <div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{p.notes}</div>
        </div>
      )}

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
