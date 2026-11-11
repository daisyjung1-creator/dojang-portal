import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, Mail, UserPlus } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { money, localISO, addDays, calcTotals, lineAmount, round2 } from '../../lib/invoiceUtils';
import { saveInvoice, savePayment, queueEmail, usePaymentMethods, loadCredit, applyCredit } from './api';
import CustomerPicker from './CustomerPicker';
import SearchSelect from '../../components/SearchSelect';
import { confirmSend } from '../../components/ConfirmSend';

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
  const PAYMENT_METHODS = usePaymentMethods();
  const [payMethodChoice, setPayMethod] = useState('');
  const payMethod = payMethodChoice || PAYMENT_METHODS[0];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [quickAdd, setQuickAdd] = useState(null);
  const [stock, setStock] = useState({});

  // Stock on hand for tracked items, to warn before overselling.
  useEffect(() => {
    supabase
      .from('inventory_levels')
      .select('fee_item_id, on_hand')
      .then(({ data }) => setStock(Object.fromEntries((data || []).filter((r) => r.on_hand !== null).map((r) => [r.fee_item_id, Number(r.on_hand)]))));
  }, []);

  const [adj, setAdj] = useState(null); // { kind: 'discount' | 'credit', type: '$' | '%', value, label }
  const [famCredit, setFamCredit] = useState(0);
  const [useFamCredit, setUseFamCredit] = useState(false);

  useEffect(() => {
    if (!form.customer_id) return setFamCredit(0);
    loadCredit(form.customer_id).then(setFamCredit);
  }, [form.customer_id]);

  // A % discount follows the other lines: it's worked out from them each time.
  const effLines = useMemo(() => {
    const base = round2(lines.filter((l) => !l.pct && !['discount', 'credit', 'subsidy'].includes(l.line_kind) && lineAmount(l) > 0).reduce((n, l) => n + lineAmount(l), 0));
    return lines.map((l) => (l.pct ? { ...l, quantity: 1, unit_price: -round2((base * Number(l.pct)) / 100) } : l));
  }, [lines]);
  const totals = useMemo(() => calcTotals(effLines, form.gst_rate), [effLines, form.gst_rate]);

  function addAdjustment() {
    const v = Number(adj.value);
    if (!(v > 0)) return;
    const label = adj.label.trim();
    const line =
      adj.kind === 'credit'
        ? { ...blankLine(), line_kind: 'credit', item_name: 'Credit', description: label || 'Credit', quantity: 1, unit_price: -round2(v), taxable: false }
        : adj.type === '%'
        ? { ...blankLine(), line_kind: 'discount', item_name: 'Discount', description: `${label || 'Discount'} ${v}%`, quantity: 1, unit_price: 0, pct: v, taxable: true }
        : { ...blankLine(), line_kind: 'discount', item_name: 'Discount', description: label || 'Discount', quantity: 1, unit_price: -round2(v), taxable: true };
    setLines((prev) => [...prev.filter((l) => (l.description || '').trim() || Number(l.unit_price) || l.pct), line]);
    setAdj(null);
  }
  const itemOptions = useMemo(
    () => items.map((it) => ({ value: it.id, label: it.name, hint: it.description && it.description !== it.name ? it.description : '', keywords: it.description || '' })),
    [items]
  );
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
    if (totals.total < 0) return setError('The total is below $0 — make the discount or credit smaller.');
    if (action === 'email' && !form.customer_email) return setError('This customer has no email address.');
    if (action === 'email' && !(await confirmSend({ what: `Invoice (PDF) — ${form.customer_name || ''}`, to: form.customer_email, note: 'The invoice is saved and emailed.' }))) return;
    setSaving(true);
    try {
      const invoice = await saveInvoice(form, effLines, isEdit ? editing.invoice.id : null);
      const usedCredit = useFamCredit && famCredit > 0.004 ? await applyCredit(invoice.id) : 0;
      if (payNow && !isEdit && invoice.total - usedCredit > 0.004) {
        await savePayment({ invoice_id: invoice.id, customer_id: invoice.customer_id, payment_date: invoice.invoice_date, method: payMethod, amount: round2(invoice.total - usedCredit) });
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
      <div className="dp-stats" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
        <Field label="Customer" required>
          <div style={{ display: 'flex', gap: 6 }}>
            <CustomerPicker customers={customers} value={form.customer_id} onChange={pickCustomer} includeInactive={false} />
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
                  <SearchSelect options={itemOptions} value={l.fee_item_id || ''} onChange={(v) => pickItem(i, v)} placeholder="Custom" inputStyle={{ fontSize: 13, padding: '6px', paddingRight: 40 }} />
                </td>
                <td style={td}><input className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></td>
                <td style={td}>
                  <input type="number" className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                  {l.fee_item_id && stock[l.fee_item_id] !== undefined && (() => {
                    // When editing, this invoice's own original qty is already taken out of stock.
                    const orig = isEdit ? Number(editing.lines.find((x) => x.id === l.id && x.fee_item_id === l.fee_item_id)?.quantity || 0) : 0;
                    const left = stock[l.fee_item_id] + orig;
                    const short = Number(l.quantity) > left;
                    return <div style={{ fontSize: 10.5, color: short ? '#9A2B2B' : '#8A8D84', marginTop: 2, whiteSpace: 'nowrap' }}>{short ? `only ${left} in stock` : `${left} in stock`}</div>;
                  })()}
                </td>
                <td style={td}>
                  {l.pct ? (
                    <span style={{ fontSize: 12.5, color: '#2A5A30', whiteSpace: 'nowrap' }}>−{l.pct}%</span>
                  ) : (
                    <input type="number" step="0.01" className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} />
                  )}
                </td>
                <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!l.taxable} onChange={(e) => updateLine(i, { taxable: e.target.checked })} /></td>
                <td style={{ ...td, textAlign: 'right', fontSize: 13, color: lineAmount(effLines[i]) < 0 ? '#2A5A30' : undefined }}>{money(lineAmount(effLines[i]))}</td>
                <td style={td}>
                  <button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Remove line" onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [blankLine()]))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '6px 4px' }}>
          <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setLines((p) => [...p, blankLine()])}>
            <Plus size={13} /> Add Line
          </button>
          <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setAdj({ kind: 'discount', type: '%', value: '', label: '' })}>
            <Plus size={13} /> Discount
          </button>
          <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setAdj({ kind: 'credit', type: '$', value: '', label: '' })}>
            <Plus size={13} /> Credit
          </button>
          {adj && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#FAF8F2', border: '1px solid #EDEAE0', borderRadius: 8, padding: '4px 8px', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 12.5 }}>{adj.kind === 'credit' ? 'Credit' : 'Discount'}</b>
              {adj.kind === 'discount' && (
                <span style={{ display: 'inline-flex', border: '1px solid #DEDACC', borderRadius: 6, overflow: 'hidden' }}>
                  {['%', '$'].map((t) => (
                    <button key={t} type="button" onClick={() => setAdj({ ...adj, type: t })} style={{ border: 'none', padding: '3px 10px', fontSize: 12.5, cursor: 'pointer', background: adj.type === t ? '#20241F' : '#fff', color: adj.type === t ? '#fff' : '#20241F' }}>{t}</button>
                  ))}
                </span>
              )}
              <input type="number" step="0.01" autoFocus className="dp-input" style={{ width: 80, padding: '4px 6px', fontSize: 13 }} placeholder={adj.type === '%' ? '10' : '20.00'} value={adj.value} onChange={(e) => setAdj({ ...adj, value: e.target.value })} />
              <input className="dp-input" style={{ width: 170, padding: '4px 6px', fontSize: 13 }} placeholder={adj.kind === 'credit' ? 'Reason (e.g. Missed class credit)' : 'Label (e.g. Sibling discount)'} value={adj.label} onChange={(e) => setAdj({ ...adj, label: e.target.value })} />
              <button className="dp-btn dp-btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={addAdjustment}>Add</button>
              <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setAdj(null)}>×</button>
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: '#8A8D84', margin: '0 4px 6px' }}>Discount comes off before GST. Credit comes off the total (no GST).</div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Notes (shown on invoice)">
            <textarea className="dp-input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {famCredit > 0.004 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 6, color: '#2A5A30' }}>
              <input type="checkbox" checked={useFamCredit} onChange={(e) => setUseFamCredit(e.target.checked)} />
              Use the family's account credit ({money(famCredit)} available) on this invoice
            </label>
          )}
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
