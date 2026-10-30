import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { money, round2, localISO, formatDate } from '../../lib/invoiceUtils';
import { saveRefund, queueEmail, usePaymentMethods } from './api';

// Record money paid back to a customer. Usually against an invoice: the GST
// portion is worked out from that invoice (refund × invoice GST ÷ invoice
// total) and can be adjusted. Can't refund more than was paid.
export default function RefundModal({ customers, initial, onClose, onSaved }) {
  const PAYMENT_METHODS = usePaymentMethods();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    id: initial?.id,
    customer_id: initial?.customer_id || '',
    invoice_id: initial?.invoice_id || '',
    payment_id: initial?.payment_id || null,
    refund_date: initial?.refund_date || localISO(),
    method: initial?.method || 'Interac e-Transfer',
    amount: initial?.amount ?? '',
    gst_amount: initial?.gst_amount ?? '',
    reason: initial?.reason || '',
  });
  const [gstTouched, setGstTouched] = useState(isEdit);
  const [invoices, setInvoices] = useState([]);
  const [emailIt, setEmailIt] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.customer_id) return setInvoices([]);
    supabase
      .from('invoice_summary')
      .select('id, invoice_number, invoice_date, total, gst_amount, amount_paid, amount_refunded, voided, is_opening_balance')
      .eq('customer_id', form.customer_id)
      .order('invoice_date', { ascending: false })
      .then(({ data }) => {
        const list = (data || []).map((i) => ({ ...i, refundable: round2(Number(i.amount_paid) - Number(i.amount_refunded) + (isEdit && i.id === initial.invoice_id ? Number(initial.amount || 0) : 0)) }));
        const usable = list.filter((i) => i.refundable > 0 || i.id === form.invoice_id);
        setInvoices(usable);
        // Opened from an invoice: start with the full refundable amount.
        const pre = usable.find((i) => i.id === form.invoice_id);
        if (!isEdit && pre && form.amount === '') setForm((f) => ({ ...f, amount: pre.refundable }));
      });
  }, [form.customer_id]);

  const customer = customers.find((c) => c.id === form.customer_id);
  const invoice = invoices.find((i) => i.id === form.invoice_id);
  const gstRatio = invoice && Number(invoice.total) > 0 ? Number(invoice.gst_amount) / Number(invoice.total) : 0;
  const autoGst = useMemo(() => round2((Number(form.amount) || 0) * gstRatio), [form.amount, gstRatio]);
  const gst = gstTouched ? form.gst_amount : autoGst;

  function pickInvoice(id) {
    const inv = invoices.find((i) => i.id === id);
    setGstTouched(false);
    setForm((f) => ({ ...f, invoice_id: id, payment_id: null, amount: !isEdit && inv ? inv.refundable : f.amount }));
  }

  async function submit() {
    setError('');
    const amount = Number(form.amount);
    if (!form.customer_id) return setError('Please choose a customer.');
    if (!(amount > 0)) return setError('Enter the amount refunded.');
    if (invoice && amount > invoice.refundable + 0.005) return setError(`Only ${money(invoice.refundable)} can be refunded on this invoice.`);
    if (Number(gst) > amount) return setError('GST portion can’t be more than the refund.');
    setSaving(true);
    try {
      const r = await saveRefund({ ...form, amount, gst_amount: Number(gst) || 0 });
      if (emailIt && customer?.email) await queueEmail('refund', customer.email, { refund_id: r.id });
      onSaved(r);
    } catch (e) {
      setError('Could not save: ' + (e.message || e));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit Refund #${initial.refund_number}` : 'Refund'}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <button className="dp-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="dp-btn dp-btn-primary" onClick={submit} disabled={saving}><Check size={15} /> Save Refund</button>
        </>
      }
    >
      <Field label="Customer" required>
        <select className="dp-select" style={{ width: '100%' }} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value, invoice_id: '' })} disabled={isEdit}>
          <option value="">Select customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Invoice">
        <select className="dp-select" style={{ width: '100%' }} value={form.invoice_id} onChange={(e) => pickInvoice(e.target.value)} disabled={!form.customer_id || isEdit}>
          <option value="">{invoices.length ? 'Select invoice' : 'No paid invoices (refund on account)'}</option>
          {invoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.invoice_number ? '#' + i.invoice_number : 'Opening balance'} · {formatDate(i.invoice_date)} · paid {money(i.amount_paid)} · can refund {money(i.refundable)}
            </option>
          ))}
        </select>
      </Field>
      <div style={styles.formRow}>
        <Field label="Refund date" required>
          <input type="date" className="dp-input" style={{ width: '100%' }} value={form.refund_date} onChange={(e) => setForm({ ...form, refund_date: e.target.value })} />
        </Field>
        <Field label="Amount refunded ($, incl. GST)" required>
          <input type="number" step="0.01" className="dp-input" style={{ width: '100%' }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
      </div>
      <div style={styles.formRow}>
        <Field label="Refunded by">
          <select className="dp-select" style={{ width: '100%' }} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {PAYMENT_METHODS.filter((m) => !m.startsWith('Subsidy')).map((m) => <option key={m}>{m}</option>)}
            {!PAYMENT_METHODS.includes(form.method) && <option>{form.method}</option>}
          </select>
        </Field>
        <Field label={invoice ? `GST portion (auto ${money(autoGst)})` : 'GST portion ($)'}>
          <input
            type="number"
            step="0.01"
            className="dp-input"
            style={{ width: '100%' }}
            value={gst}
            onChange={(e) => {
              setGstTouched(true);
              setForm({ ...form, gst_amount: e.target.value });
            }}
          />
        </Field>
      </div>
      <Field label="Reason">
        <input className="dp-input" style={{ width: '100%' }} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Withdrew mid-month, overpaid, class cancelled…" />
      </Field>
      {invoice?.voided && <p style={{ fontSize: 12.5, color: '#854F0B', margin: '0 0 10px' }}>This invoice is voided, so the refund won’t change sales or GST — it only shows as money paid out.</p>}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: customer?.email ? '#20241F' : '#8A8D84' }}>
        <input type="checkbox" checked={emailIt} disabled={!customer?.email} onChange={(e) => setEmailIt(e.target.checked)} />
        Email a refund confirmation to {customer?.email || 'customer (no email on file)'}
      </label>
      {error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
    </Modal>
  );
}
