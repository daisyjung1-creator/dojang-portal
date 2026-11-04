import React, { useEffect, useState } from 'react';
import { Printer, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import ReceiptDocument from './ReceiptDocument';
import { PrintPortal } from './InvoicePreview';
import { loadSettings, queueEmail } from './api';

// Receipt on screen, with Print / Save as PDF and Email (the email carries the
// same receipt as a PDF attachment).
export default function ReceiptPreview({ paymentId, onClose }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('invoice_payments').select('*').eq('id', paymentId).single();
      if (!p) return;
      const [settings, cust, inv, lines, others, used] = await Promise.all([
        loadSettings(),
        p.customer_id ? supabase.from('customers').select('name, email, address, printed_info').eq('id', p.customer_id).single() : { data: null },
        p.invoice_id ? supabase.from('invoice_summary').select('*').eq('id', p.invoice_id).single() : { data: null },
        p.invoice_id ? supabase.from('invoice_lines').select('*').eq('invoice_id', p.invoice_id).order('position') : { data: [] },
        p.invoice_id ? supabase.from('invoice_payments').select('id, amount, credit_amount, payment_date, receipt_number').eq('invoice_id', p.invoice_id) : { data: [] },
        p.invoice_id ? supabase.from('credit_applications').select('amount, applied_date, created_at').eq('invoice_id', p.invoice_id) : { data: [] },
      ]);
      const earlier = (others.data || [])
        .filter((o) => o.id !== p.id && (o.payment_date < p.payment_date || (o.payment_date === p.payment_date && Number(o.receipt_number) < Number(p.receipt_number))))
        .reduce((t, o) => t + Number(o.amount || 0) - Number(o.credit_amount || 0), 0)
        + (used.data || []).filter((c) => c.applied_date <= p.payment_date).reduce((t, c) => t + Number(c.amount || 0), 0);
      setData({ p, settings, customer: cust.data, invoice: inv.data, lines: lines.data || [], earlier });
    })();
  }, [paymentId]);

  if (!data) return null;
  const { p, settings, customer, invoice, lines, earlier } = data;
  const to = customer?.email || invoice?.customer_email;

  async function email() {
    if (!to) return setMsg('No email on file for this customer.');
    try {
      await queueEmail('receipt', to, { payment_id: p.id });
      setMsg(`Receipt #${p.receipt_number} (PDF) queued to ${to}.`);
    } catch (e) {
      setMsg('Could not send: ' + (e.message || e));
    }
  }

  const doc = <ReceiptDocument payment={p} invoice={invoice} lines={lines} earlier={earlier} customer={customer} settings={settings} />;
  return (
    <>
      <Modal
        title={`Receipt #${p.receipt_number}`}
        onClose={onClose}
        maxWidth={860}
        footer={
          <>
            <button className="dp-btn" onClick={onClose}>Close</button>
            <button className="dp-btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            <button className="dp-btn dp-btn-primary" onClick={email}><Mail size={14} /> Email</button>
          </>
        }
      >
        {msg && <p style={{ background: '#E6F0F6', color: '#1E4566', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{msg}</p>}
        <div style={{ border: '1px solid #EDEAE0', borderRadius: 8 }}>{doc}</div>
      </Modal>
      <PrintPortal>{doc}</PrintPortal>
    </>
  );
}
