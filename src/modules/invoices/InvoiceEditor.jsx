import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Check, Mail, UserPlus } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { money, localISO, addDays, calcTotals, lineAmount, PAYMENT_METHODS } from '../../lib/invoiceUtils';
import { saveInvoice, savePayment, queueEmail } from './api';

function blankLine() {
  return { fee_item_id: '', description: '', quantity: 1, unit_price: '', taxable: true };
}

export default function InvoiceEditor({ settings, customers, items, students, editing, onClose, onSaved, onCustomersChanged }) {
  const isEdit = !!editing?.invoice;
  const today = localISO();
  const [form, setForm] = useState(() =>
    isEdit
      ? { ...editing.invoice }
      : {
          customer_id: '',
          customer_name: '',
          customer_email: '',
          customer_address: '',
          invoice_number: '',
          invoice_date: today,
          due_date: settings.default_due_days ? addDays(today, settings.default_due_days) : today,
          gst_rate: settings.gst_rate ?? 5,
          notes: '',
        }
  );
  const [lines, setLines] = useState(() => (isEdit && editing.lines.length ? editing.lines.map((l) => ({ ...l })) : [blankLine()]));
  const [payNow, setPayNow] = useState(false);
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [quickAdd, setQuickAdd] = useState(null);

  const totals = useMemo(() => calcTotals(lines, form.gst_rate), [lines, form.gst_rate]);
  const linkedStudents = useMemo(() => students.filter((s) => form.customer_id && s.customer_id === form.customer_id && s.status !== 'withdrawn'), [students, form.customer_id]);

  function pickCustomer(id) {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({ ...f, customer_id: id, customer_name: c?.name || '', customer_email: c?.email || '', customer_address: [c?.address, c?.printed_info].filter(Boolean).join('\n') }));
  }

  function updateLine(i, patch) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function pickItem(i, itemId) {
    const it = items.find((x) => x.id === itemId);
    if (!it) return updateLine(i, { fee_item_id: '', item_name: '' });
    updateLine(i, { fee_item_id: itemId, item_name: it.name, description: it.description || it.name, unit_price: it.default_amount ?? '', taxable: it.taxable !== false });
  }
  function addLinkedTuition() {
    const newLines = linkedStudents
      .filter((s) => Number(s.tuition))
      .map((s) => ({ ...blankLine(), student_id: s.id, item_name: 'Tuition', description: `Tuition - ${s.name}${s.class_name ? ' (' + s.class_name + ')' : ''}`, unit_price: Number(s.tuition) }));
    if (!newLines.length) return;
    setLines((prev) => [...prev.filter((l) => (l.description || '').trim() || Number(l.unit_price)), ...newLines]);
  }

  async function createQuickCustomer() {
    if (!quickAdd.name.trim()) return;
    const { data, error: e } = await supabase.from('customers').insert({ name: quickAdd.name.trim(), email: quickAdd.email || null, phone: quickAdd.phone || null }).select().single();
    if (e) return setError('Could not add customer: ' + e.message);
    await onCustomersChanged();
    setForm((f) => ({ ...f, customer_id: data.id, customer_name: data.name, customer_email: data.email || '', customer_address: '' }));
    setQuickAdd(null);
  }

  async function submit(action) {
    setError('');
    if (!form.customer_name.trim()) return setError('Please choose a customer.');
    if (!form.invoice_date) return setError('Please set the invoice date.');
    if (!lines.some((l) => (l.description || '').trim() || Number(l.unit_price))) return setError('Add at least one line.');
    if (action === 'email' && !form.customer_email) return setError('This customer has no email address.');
    setSaving(true);
    try {
      const invoice = await saveInvoice(form, lines, isEdit ? editing.invoice.id : null);
      if (payNow && !isEdit && invoice.total > 0) {
        await savePayment({ invoice_id: invoice.id, customer_id: invoice.customer_id, payment_date: invoice.invoice_date, method: payMethod, amount: invoice.total });
      }
      if (action === 'email') await queueEmail('invoice', form.customer_email, { invoice_id: invoice.id });
      onSaved(invoice, action);
    } catch (e) {
      setError('Could not save: ' + (e.message || e));
      setSaving(false);
    }
  }

  const th = { fontSize: 12, color: '#5B5F56', fontWeight: 500, textAlign: 'left', padding: '6px 4px' };
  const td = { padding: '4px' };

  return (
    <Modal
      title={isEdit ? `Edit Invoice #${editing.invoice.invoice_number}` : 'New Invoice'}
      onClose={onClose}
      maxWidth={900}
      footer={
        <>
          <button className="dp-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="dp-btn" onClick={() => submit('save')} disabled={saving}><Check size={15} /> Save</button>
          <button className="dp-btn dp-btn-primary" onClick={() => submit('email')} disabled={saving || !form.customer_email} title={form.customer_email ? '' : 'Customer has no email'}>
            <Mail size={15} /> Save & Email
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
        <Field label="Customer" required>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="dp-select" style={{ flex: 1, minWidth: 0 }} value={form.customer_id || ''} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">Select customer</option>
              {customers.filter((c) => c.active !== false || c.id === form.customer_id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="dp-btn" style={{ padding: '6px 8px' }} title="New customer" onClick={() => setQuickAdd({ name: '', email: '', phone: '' })}>
              <UserPlus size={15} />
            </button>
          </div>
        </Field>
        <Field label="Invoice #">
          <input className="dp-input" style={{ width: '100%' }} placeholder={isEdit ? '' : `Auto (${settings.next_invoice_number ?? ''})`} value={form.invoice_number ?? ''} disabled={isEdit} onChange={(e) => setForm({ ...form, invoice_number: e.target.value.replace(/\D/g, '') })} />
        </Field>
        <Field label="Date" required>
          <input type="date" className="dp-input" style={{ width: '100%' }} value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
        </Field>
        <Field label="Due Date">
          <input type="date" className="dp-input" style={{ width: '100%' }} value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </Field>
      </div>

      {quickAdd && (
        <div style={{ background: '#FAF8F2', border: '1px solid #EDEAE0', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Field label="New customer name" required><input className="dp-input" autoFocus value={quickAdd.name} onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })} /></Field>
          <Field label="Email"><input className="dp-input" value={quickAdd.email} onChange={(e) => setQuickAdd({ ...quickAdd, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="dp-input" value={quickAdd.phone} onChange={(e) => setQuickAdd({ ...quickAdd, phone: e.target.value })} /></Field>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button className="dp-btn" onClick={() => setQuickAdd(null)}>Cancel</button>
            <button className="dp-btn dp-btn-primary" onClick={createQuickCustomer}>Add</button>
          </div>
        </div>
      )}

      {form.customer_id && (
        <div style={{ fontSize: 12.5, color: '#5B5F56', margin: '-4px 0 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Email: {form.customer_email || <em>none</em>}</span>
          {linkedStudents.length > 0 && (
            <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={addLinkedTuition}>
              <Plus size={13} /> Add tuition for {linkedStudents.map((s) => s.name.split(' ')[0]).join(', ')}
            </button>
          )}
        </div>
      )}

      <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, padding: '4px 8px', marginBottom: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 210 }}>Item</th>
              <th style={th}>Description</th>
              <th style={{ ...th, width: 64 }}>Qty</th>
              <th style={{ ...th, width: 100 }}>Price</th>
              <th style={{ ...th, width: 48, textAlign: 'center' }}>GST</th>
              <th style={{ ...th, width: 96, textAlign: 'right' }}>Amount</th>
              <th style={{ width: 34 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={td}>
                  <select className="dp-select" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.fee_item_id || ''} onChange={(e) => pickItem(i, e.target.value)}>
                    <option value="">Custom</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.description && it.description !== it.name ? ' — ' + it.description : ''}</option>)}
                  </select>
                </td>
                <td style={td}><input className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></td>
                <td style={td}><input type="number" className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} /></td>
                <td style={td}><input type="number" step="0.01" className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} /></td>
                <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!l.taxable} onChange={(e) => updateLine(i, { taxable: e.target.checked })} /></td>
                <td style={{ ...td, textAlign: 'right', fontSize: 13 }}>{money(lineAmount(l))}</td>
                <td style={td}>
                  <button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Remove line" onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [blankLine()]))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="dp-btn" style={{ margin: '6px 4px', padding: '4px 10px', fontSize: 12.5 }} onClick={() => setLines((p) => [...p, blankLine()])}>
          <Plus size={13} /> Add Line
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Notes (shown on invoice)">
            <textarea className="dp-input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {!isEdit && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
              Paid now — record payment of {money(totals.total)} by
              <select className="dp-select" style={{ fontSize: 13, padding: '4px 6px' }} value={payMethod} onChange={(e) => setPayMethod(e.target.value)} disabled={!payNow}>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          )}
        </div>
        <table style={{ fontSize: 13.5, minWidth: 240, borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={{ padding: '4px 8px', color: '#5B5F56' }}>Subtotal</td><td style={{ padding: '4px 8px', textAlign: 'right' }}>{money(totals.subtotal)}</td></tr>
            <tr>
              <td style={{ padding: '4px 8px', color: '#5B5F56' }}>
                GST <input type="number" className="dp-input" style={{ width: 52, padding: '2px 4px', fontSize: 12.5 }} value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} /> %
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{money(totals.gst)}</td>
            </tr>
            <tr style={{ borderTop: '1px solid #20241F' }}><td style={{ padding: '6px 8px', fontWeight: 600 }}>Total</td><td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, fontSize: 16 }}>{money(totals.total)}</td></tr>
          </tbody>
        </table>
      </div>
      {error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
    </Modal>
  );
}
