import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Mail, Pencil, Wallet, Ban, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import InvoiceDocument from './InvoiceDocument';
import { loadInvoiceFull, queueEmail } from './api';
import { money, formatDate, INVOICE_STATUS_STYLES } from '../../lib/invoiceUtils';

function PrintPortal({ children }) {
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

export default function InvoicePreview({ invoiceId, settings, onClose, onEdit, onPay, onChanged }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(null);

  async function reload() {
    setData(await loadInvoiceFull(invoiceId));
  }
  useEffect(() => {
    reload();
  }, [invoiceId]);

  if (!data || !data.invoice) return null;
  const { invoice, lines, payments } = data;
  const st = INVOICE_STATUS_STYLES[invoice.status] || INVOICE_STATUS_STYLES['Not Paid'];

  async function sendEmail() {
    if (!invoice.customer_email) return setMsg('This customer has no email address. Add one in Customers, then edit the invoice to pick it up.');
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
            <button className="dp-btn dp-btn-danger" onClick={() => setConfirm(payments.length ? 'cantDelete' : 'delete')}><Trash2 size={14} /> Delete</button>
            <button className="dp-btn" onClick={() => setConfirm('void')}><Ban size={14} /> {invoice.voided ? 'Un-void' : 'Void'}</button>
            <div style={{ flex: 1 }} />
            <button className="dp-btn" onClick={() => onEdit(data)}><Pencil size={14} /> Edit</button>
            <button className="dp-btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            <button className="dp-btn" onClick={sendEmail}><Mail size={14} /> Email</button>
            {!invoice.voided && Number(invoice.balance) > 0 && (
              <button className="dp-btn dp-btn-primary" onClick={() => onPay(invoice)}><Wallet size={14} /> Apply Payment</button>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: 999, padding: '2px 10px', fontSize: 12.5 }}>{invoice.status}</span>
          <span style={{ color: '#5B5F56' }}>Balance {money(invoice.balance)}</span>
          {invoice.emailed_at && <span style={{ color: '#5B5F56' }}>· Emailed {new Date(invoice.emailed_at).toLocaleString('en-CA')}</span>}
        </div>
        {msg && <p style={{ background: '#E6F0F6', color: '#1E4566', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{msg}</p>}
        <div style={{ border: '1px solid #EDEAE0', borderRadius: 8 }}>
          <InvoiceDocument invoice={invoice} lines={lines} payments={payments} settings={settings} />
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
                    <td style={{ textAlign: 'right' }}>{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <PrintPortal>
        <InvoiceDocument invoice={invoice} lines={lines} payments={payments} settings={settings} />
      </PrintPortal>

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
