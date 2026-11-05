import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Mail, Pencil, Wallet, Ban, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import InvoiceDocument from './InvoiceDocument';
import ReceiptPreview from './ReceiptPreview';
import { loadInvoiceFull, queueEmail, loadCredit, applyCredit } from './api';
import { money, formatDate, INVOICE_STATUS_STYLES } from '../../lib/invoiceUtils';
import { confirmSend } from '../../components/ConfirmSend';

export function PrintPortal({ children }) {
  const [el] = useState(() => {
    let node = document.getElementById('print-root');
    if (!node) {
      node = document.createElement('div');
      node.id = 'print-root';
      document.body.appendChild(node);
    }
    return node;
  });
  return createPortal(children, el);
}

export default function InvoicePreview({ invoiceId, settings, onClose, onEdit, onPay, onRefund, onChanged }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [receiptId, setReceiptId] = useState(null);

  const [credit, setCredit] = useState(0);
  async function reload() {
    const d = await loadInvoiceFull(invoiceId);
    setData(d);
    setCredit(d.invoice?.customer_id ? await loadCredit(d.invoice.customer_id) : 0);
  }

  async function useCredit() {
    try {
      const used = await applyCredit(invoiceId);
      setMsg(used ? `Used ${money(used)} of the family's credit on this invoice.` : 'No credit could be used.');
      await reload();
      onChanged && onChanged();
    } catch (e) {
      setMsg('Could not use credit: ' + (e.message || e));
    }
  }
  useEffect(() => {
    reload();
  }, [invoiceId]);

  if (!data || !data.invoice) return null;
  const { invoice, lines, payments, refunds, credits = [] } = data;
  const refundable = Number(invoice.amount_paid) - Number(invoice.credit_used || 0) - Number(invoice.amount_refunded);
  const st = INVOICE_STATUS_STYLES[invoice.status] || INVOICE_STATUS_STYLES['Not Paid'];

  async function sendEmail() {
    if (!invoice.customer_email) return setMsg('This customer has no email address. Add one in Customers, then edit the invoice to pick it up.');
    if (!(await confirmSend({ what: `Invoice #${invoice.invoice_number} (PDF) — ${invoice.customer_name || ''}`, to: invoice.customer_email }))) return;
    try {
      await queueEmail('invoice', invoice.customer_email, { invoice_id: invoice.id });
      setMsg(`Invoice queued to send to ${invoice.customer_email}.`);
    } catch (e) {
      setMsg('Could not queue email: ' + e.message);
    }
  }
  async function toggleVoid() {
    await supabase.from('invoices').update({ voided: !invoice.voided }).eq('id', invoice.id);
    setConfirm(null);
    await reload();
    onChanged();
  }
  async function del() {
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id);
    setConfirm(null);
    if (error) return setMsg('Could not delete: ' + error.message);
    onChanged();
    onClose();
  }

  return (
    <>
      <Modal
        title={invoice.is_opening_balance ? `Opening balance — ${invoice.customer_name}` : `Invoice #${invoice.invoice_number}`}
        onClose={onClose}
        maxWidth={860}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap' }}>
            <button className="dp-btn dp-btn-danger" onClick={() => setConfirm(payments.length || refunds.length ? 'cantDelete' : 'delete')}><Trash2 size={14} /> Delete</button>
            <button className="dp-btn" onClick={() => setConfirm('void')}><Ban size={14} /> {invoice.voided ? 'Un-void' : 'Void'}</button>
            <div style={{ flex: 1 }} />
            <button className="dp-btn" onClick={() => onEdit(data)}><Pencil size={14} /> Edit</button>
            <button className="dp-btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            <button className="dp-btn" onClick={sendEmail}><Mail size={14} /> Email</button>
            {refundable > 0.005 && onRefund && (
              <button className="dp-btn" onClick={() => onRefund(invoice, refundable)}><RotateCcw size={14} /> Refund</button>
            )}
            {!invoice.voided && Number(invoice.balance) > 0 && credit > 0.004 && (
              <button className="dp-btn" onClick={useCredit} title="Family account credit from overpayments">Use credit ({money(Math.min(credit, Number(invoice.balance)))})</button>
            )}
            {!invoice.voided && Number(invoice.balance) > 0 && (
              <button className="dp-btn dp-btn-primary" onClick={() => onPay(invoice)}><Wallet size={14} /> Apply Payment</button>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: 999, padding: '2px 10px', fontSize: 12.5 }}>{invoice.status}</span>
          <span style={{ color: '#5B5F56' }}>Balance {money(invoice.balance)}</span>
          {Number(invoice.amount_refunded) > 0 && <span style={{ color: '#4B3A86' }}>· Refunded {money(invoice.amount_refunded)}</span>}
          {invoice.emailed_at && <span style={{ color: '#5B5F56' }}>· Emailed {new Date(invoice.emailed_at).toLocaleString('en-CA')}</span>}
        </div>
        {msg && <p style={{ background: '#E6F0F6', color: '#1E4566', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{msg}</p>}
        <div style={{ border: '1px solid #EDEAE0', borderRadius: 8 }}>
          <InvoiceDocument invoice={invoice} lines={lines} payments={payments} refunds={refunds} settings={settings} />
        </div>
        {payments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 6px' }}>Payments</p>
            <table className="dp-table">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.payment_date)}</td>
                    <td>Receipt #{p.receipt_number}</td>
                    <td>{p.method}</td>
                    <td>{p.reference}</td>
                    <td style={{ textAlign: 'right' }}>
                      {money(p.amount)}
                      {Number(p.credit_amount) > 0.004 && <div style={{ fontSize: 11.5, color: '#2A5A30' }}>{money(p.credit_amount)} to family credit</div>}
                    </td>
                    <td style={{ width: 90 }}>
                      <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setReceiptId(p.id)}><Printer size={12} /> Receipt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {credits.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 6px' }}>Account credit used</p>
            <table className="dp-table">
              <tbody>
                {credits.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.applied_date)}</td>
                    <td>Family credit</td>
                    <td style={{ textAlign: 'right' }}>{money(c.amount)}</td>
                    <td style={{ width: 90 }}>
                      <button
                        className="dp-btn"
                        style={{ padding: '3px 8px', fontSize: 12 }}
                        title="Put this back on the family's credit"
                        onClick={async () => {
                          await supabase.from('credit_applications').delete().eq('id', c.id);
                          setMsg('Credit returned to the family.');
                          await reload();
                          onChanged && onChanged();
                        }}
                      >
                        Undo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {refunds.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 6px' }}>Refunds</p>
            <table className="dp-table">
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.refund_date)}</td>
                    <td>Refund #{r.refund_number}</td>
                    <td>{r.method}</td>
                    <td style={{ color: '#5B5F56' }}>{r.reason}</td>
                    <td style={{ textAlign: 'right', color: '#5B5F56' }}>GST {money(r.gst_amount)}</td>
                    <td style={{ textAlign: 'right' }}>-{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {receiptId ? (
        <ReceiptPreview paymentId={receiptId} onClose={() => setReceiptId(null)} />
      ) : (
        <PrintPortal>
          <InvoiceDocument invoice={invoice} lines={lines} payments={payments} refunds={refunds} settings={settings} />
        </PrintPortal>
      )}

      {confirm === 'delete' && <ConfirmDialog message={`Delete invoice #${invoice.invoice_number}? This can't be undone.`} onCancel={() => setConfirm(null)} onConfirm={del} />}
      {confirm === 'cantDelete' && (
        <ConfirmDialog message="This invoice has payments recorded, so it can't be deleted. Void it instead?" confirmLabel="Void" onCancel={() => setConfirm(null)} onConfirm={toggleVoid} />
      )}
      {confirm === 'void' && (
        <ConfirmDialog
          message={invoice.voided ? 'Restore this invoice?' : 'Void this invoice? It stays on record but is excluded from sales and GST totals.'}
          confirmLabel={invoice.voided ? 'Restore' : 'Void'}
          onCancel={() => setConfirm(null)}
          onConfirm={toggleVoid}
        />
      )}
    </>
  );
}
