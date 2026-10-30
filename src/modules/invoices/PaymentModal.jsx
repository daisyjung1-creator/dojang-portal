import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { money, localISO, formatDate } from '../../lib/invoiceUtils';
import { savePayment, queueEmail, usePaymentMethods } from './api';

// "Apply Payment" — pick a customer, pick one of their open invoices, record
// how they paid. Each payment gets the next receipt number automatically.
export default function PaymentModal({ customers, initial, onClose, onSaved }) {
  const PAYMENT_METHODS = usePaymentMethods();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    id: initial?.id,
    customer_id: initial?.customer_id || '',
    invoice_id: initial?.invoice_id || '',
    payment_date: initial?.payment_date || localISO(),
    method: initial?.method || '',
    amount: initial?.amount ?? '',
    reference: initial?.reference || '',
    notes: initial?.notes || '',
  });
  const [openInvoices, setOpenInvoices] = useState([]);
  const [emailReceipt, setEmailReceipt] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.customer_id) return setOpenInvoices([]);
    supabase
      .from('invoice_summary')
      .select('id, invoice_number, invoice_date, total, balance, status, is_opening_balance')
      .eq('customer_id', form.customer_id)
      .eq('voided', false)
      .order('invoice_date', { ascending: false })
      .then(({ data }) => setOpenInvoices((data || []).filter((i) => Number(i.balance) > 0 || i.id === form.invoice_id)));
  }, [form.customer_id]);

  const customer = customers.find((c) => c.id === form.customer_id);

  function pickInvoice(id) {
    const inv = openInvoices.find((i) => i.id === id);
    setForm((f) => ({ ...f, invoice_id: id, amount: !isEdit && inv ? Number(inv.balance) : f.amount }));
  }

  async function submit() {
    setError('');
    if (!form.customer_id) return setError('Please choose a customer.');
    if (!(Number(form.amount) > 0)) return setError('Enter the amount received.');
    setSaving(true);
    try {
      const p = await savePayment({ ...form, method: form.method || PAYMENT_METHODS[0] });
      if (emailReceipt && customer?.email) await queueEmail('receipt', customer.email, { payment_id: p.id });
      onSaved(p);
    } catch (e) {
      setError('Could not save: ' + (e.message || e));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit Payment (Receipt #${initial.receipt_number})` : 'Apply Payment'}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <button className="dp-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="dp-btn dp-btn-primary" onClick={submit} disabled={saving}><Check size={15} /> Save Payment</button>
        </>
      }
    >
      <Field label="Customer" required>
        <select className="dp-select" style={{ width: '100%' }} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value, invoice_id: '' })}>
          <option value="">Select customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Invoice">
        <select className="dp-select" style={{ width: '100%' }} value={form.invoice_id} onChange={(e) => pickInvoice(e.target.value)} disabled={!form.customer_id}>
          <option value="">{openInvoices.length ? 'Select invoice' : 'No open invoices (payment on account)'}</option>
          {openInvoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.invoice_number ? '#' + i.invoice_number : 'Opening balance'} · {formatDate(i.invoice_date)} · total {money(i.total)} · owing {money(i.balance)}
            </option>
          ))}
        </select>
      </Field>
      <div style={styles.formRow}>
        <Field label="Date" required>
          <input type="date" className="dp-input" style={{ width: '100%' }} value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
        </Field>
        <Field label="Amount ($)" required>
          <input type="number" step="0.01" className="dp-input" style={{ width: '100%' }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
      </div>
      <div style={styles.formRow}>
        <Field label="Method">
          <select className="dp-select" style={{ width: '100%' }} value={form.method || PAYMENT_METHODS[0]} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            {form.method && !PAYMENT_METHODS.includes(form.method) && <option>{form.method}</option>}
          </select>
        </Field>
        <Field label="Payment Ref">
          <input className="dp-input" style={{ width: '100%' }} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e-Transfer ref, cheque #…" />
        </Field>
      </div>
      <Field label="Notes">
        <input className="dp-input" style={{ width: '100%' }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: customer?.email ? '#20241F' : '#8A8D84' }}>
        <input type="checkbox" checked={emailReceipt} disabled={!customer?.email} onChange={(e) => setEmailReceipt(e.target.checked)} />
        Email a receipt to {customer?.email || 'customer (no email on file)'}
      </label>
      {error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
    </Modal>
  );
}
