import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, Mail, UserPlus, ShoppingBag, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { money, localISO, addDays, calcTotals, lineAmount, round2 } from '../../lib/invoiceUtils';
import { saveInvoice, savePayment, queueEmail, usePaymentMethods, loadCredit, applyCredit } from './api';
import CustomerPicker from './CustomerPicker';
import SearchSelect from '../../components/SearchSelect';
import { confirmSend } from '../../components/ConfirmSend';

let keySeq = 0;
const newKey = () => `k${++keySeq}`;
function blankLine() {
  return { _k: newKey(), fee_item_id: '', description: '', quantity: 1, unit_price: '', taxable: true };
}
const isAdjust = (l) => ['discount', 'credit', 'subsidy'].includes(l.line_kind);
const isEmptyLine = (l) => !(l.description || '').trim() && !Number(l.unit_price) && !l.pct && !l.fee_item_id;

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
  const [lines, setLines] = useState(() => (isEdit && editing.lines.length ? editing.lines.map((l) => ({ ...l, _k: newKey() })) : [blankLine()]));
  const [shopOpen, setShopOpen] = useState(false);
  const [shopQ, setShopQ] = useState('');
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
      .select('fee_item_id, size, on_hand')
      .then(({ data }) => setStock(Object.fromEntries((data || []).filter((r) => r.on_hand !== null).map((r) => [`${r.fee_item_id}|${r.size || ''}`, Number(r.on_hand)]))));
  }, []);

  const [adj, setAdj] = useState(null); // { kind: 'discount' | 'credit', type: '$' | '%', value, label, target: line _k or '' (whole invoice) }
  const [famCredit, setFamCredit] = useState(0);
  const [useFamCredit, setUseFamCredit] = useState(false);

  useEffect(() => {
    if (!form.customer_id) return setFamCredit(0);
    loadCredit(form.customer_id).then(setFamCredit);
  }, [form.customer_id]);

  // A % discount follows the lines it's on: worked out from them each time —
  // one line (target) or every item line (whole invoice).
  const effLines = useMemo(() => {
    const base = round2(lines.filter((l) => !l.pct && !isAdjust(l) && lineAmount(l) > 0).reduce((n, l) => n + lineAmount(l), 0));
    return lines.map((l) => {
      if (!l.pct) return l;
      const t = l.target ? lines.find((x) => x._k === l.target) : null;
      const b = t ? lineAmount(t) : base;
      return { ...l, quantity: 1, unit_price: -round2((b * Number(l.pct)) / 100) };
    });
  }, [lines]);
  const totals = useMemo(() => calcTotals(effLines, form.gst_rate), [effLines, form.gst_rate]);

  function addAdjustment() {
    const v = Number(adj.value);
    if (!(v > 0)) return;
    const label = adj.label.trim();
    const t = adj.kind === 'discount' && adj.target ? lines.find((l) => l._k === adj.target) : null;
    const on = t ? ` — ${t.item_name || t.description || 'item'}` : '';
    const line =
      adj.kind === 'credit'
        ? { ...blankLine(), line_kind: 'credit', item_name: 'Credit', description: label || 'Credit', quantity: 1, unit_price: -round2(v), taxable: false }
        : adj.type === '%'
        ? { ...blankLine(), line_kind: 'discount', item_name: 'Discount', description: `${label || 'Discount'} ${v}%${on}`, quantity: 1, unit_price: 0, pct: v, target: t?._k || null, taxable: t ? !!t.taxable : true }
        : { ...blankLine(), line_kind: 'discount', item_name: 'Discount', description: `${label || 'Discount'}${on}`, quantity: 1, unit_price: -round2(Math.min(v, t ? lineAmount(t) : v)), target: t?._k || null, taxable: t ? !!t.taxable : true };
    setLines((prev) => {
      const kept = prev.filter((l) => !isEmptyLine(l));
      if (!t) return [...kept, line];
      // Put a line's discount right under that line.
      const at = kept.findIndex((l) => l._k === t._k);
      let end = at + 1;
      while (end < kept.length && kept[end].target === t._k) end++;
      return [...kept.slice(0, end), line, ...kept.slice(end)];
    });
    setAdj(null);
  }
  const itemLines = lines.filter((l) => !isAdjust(l) && !isEmptyLine(l) && lineAmount(l) > 0);
  function removeLine(i) {
    setLines((prev) => {
      const gone = prev[i];
      const next = prev.filter((l, idx) => idx !== i && !(gone._k && l.target === gone._k));
      return next.length ? next : [blankLine()];
    });
  }
  const itemOptions = useMemo(
    () => items.map((it) => ({ value: it.id, label: it.name, hint: [it.category, it.description && it.description !== it.name ? it.description : ''].filter(Boolean).join(' · '), keywords: `${it.description || ''} ${it.category || ''}` })),
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
  const itemById = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);
  const partsOf = (it) => (Array.isArray(it?.components) ? it.components.filter((c) => itemById[c.fee_item_id]) : []);
  function itemPatch(it) {
    const parts = partsOf(it);
    return {
      fee_item_id: it.id, item_name: it.name, description: it.description || it.name, unit_price: it.default_amount ?? '', taxable: it.taxable !== false, size: null,
      // A part can be one of a few items (e.g. groin guard male / female): options.
      components: parts.length ? parts.map((c) => {
        const opts = (c.options || []).filter((id) => itemById[id]);
        return { fee_item_id: c.fee_item_id, item_name: itemById[c.fee_item_id].name, size: null, quantity: Number(c.quantity) || 1, ...(opts.length > 1 ? { options: opts } : {}) };
      }) : null,
    };
  }
  function pickItem(i, itemId) {
    const it = items.find((x) => x.id === itemId);
    if (!it) return updateLine(i, { fee_item_id: '', item_name: '', size: null, components: null });
    updateLine(i, itemPatch(it));
  }
  // Shop picker: tap an item to add it as a line (or +1 if it's already there with no size yet).
  function addFromShop(it) {
    setLines((prev) => {
      const kept = prev.filter((l) => !isEmptyLine(l));
      return [...kept, { ...blankLine(), ...itemPatch(it) }];
    });
  }
  // Set: pick the size of one part (or which item, for a part with options);
  // the description lists the parts and sizes.
  function pickPartOption(i, pi, id) {
    setPart(i, pi, { fee_item_id: id, item_name: itemById[id]?.name || '', size: null });
  }
  function pickPartSize(i, pi, size) {
    setPart(i, pi, { size: size || null });
  }
  function setPart(i, pi, patch) {
    const l = lines[i];
    const comps = l.components.map((c, j) => (j === pi ? { ...c, ...patch } : c));
    const it = itemById[l.fee_item_id];
    const base = String(it?.description || it?.name || l.item_name || '').trim();
    const sizes = comps.filter((c) => c.size).map((c) => `${c.item_name} ${c.size}`);
    updateLine(i, { components: comps, description: sizes.length ? `${base} (${sizes.join(', ')})` : base });
  }
  // Sized gear: the size is kept on the line (stock is per size) and shown in the description.
  function pickSize(i, size) {
    const l = lines[i];
    const it = items.find((x) => x.id === l.fee_item_id);
    const base = String(l.description || it?.description || it?.name || '').replace(/ \(Size [^)]*\)$/, '');
    updateLine(i, { size: size || null, description: size ? `${base} (Size ${size})` : base });
  }
  const sizesOf = (l) => (l.components?.length ? [] : items.find((x) => x.id === l.fee_item_id)?.sizes || []);
  const stockOf = (id, size) => stock[`${id}|${size || ''}`];
  const shopItems = useMemo(() => {
    const q = shopQ.trim().toLowerCase();
    return items
      .filter((it) => it.active !== false && (it.track_inventory || partsOf(it).length))
      .filter((it) => !q || (it.name + ' ' + (it.description || '')).toLowerCase().includes(q))
      .sort((a, b) => (Number(a.sort_order) || 100) - (Number(b.sort_order) || 100) || a.name.localeCompare(b.name));
  }, [items, shopQ, itemById]);
  const totalStock = (it) => {
    const keys = Object.keys(stock).filter((k) => k.startsWith(it.id + '|'));
    return keys.length ? keys.reduce((t, k) => t + stock[k], 0) : undefined;
  };
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

  // A description typed on a line becomes the item's description next time
  // (without the size / set parts, which are added per sale).
  async function rememberDescriptions() {
    const latest = {};
    effLines.forEach((l) => {
      const it = l.fee_item_id && itemById[l.fee_item_id];
      if (!it) return;
      let d = String(l.description || '').trim();
      if (l.size) d = d.replace(/ \(Size [^)]*\)$/, '');
      if (l.components?.length) d = d.replace(/ \([^)]*\)$/, '');
      if (d && d !== (it.description || it.name)) latest[it.id] = d;
    });
    for (const [id, description] of Object.entries(latest)) {
      await supabase.from('fee_items').update({ description }).eq('id', id);
    }
  }

  async function submit(action) {
    setError('');
    if (!form.customer_name.trim()) return setError('Please choose a customer.');
    if (!form.invoice_date) return setError('Please set the invoice date.');
    if (!lines.some((l) => (l.description || '').trim() || Number(l.unit_price))) return setError('Add at least one line.');
    if (totals.total < 0) return setError('The total is below $0 — make the discount or credit smaller.');
    const noSize = lines.find((l) => !l.id && l.fee_item_id && sizesOf(l).length && !l.size);
    if (noSize) return setError(`Pick a size for ${noSize.item_name || 'the item'} (stock is kept by size).`);
    for (const l of lines) {
      const miss = (l.components || []).find((c) => (itemById[c.fee_item_id]?.sizes || []).length && !c.size);
      if (miss) return setError(`${l.item_name}: pick a size for ${miss.item_name}.`);
    }
    let sendTo = null;
    if (action === 'email') {
      sendTo = await confirmSend({ what: `Invoice (PDF) — ${form.customer_name || ''}`, to: form.customer_email, note: 'The invoice is saved and emailed.', extra: true });
      if (!sendTo) return;
    }
    setSaving(true);
    try {
      const invoice = await saveInvoice(form, effLines, isEdit ? editing.invoice.id : null);
      await rememberDescriptions();
      const usedCredit = useFamCredit && famCredit > 0.004 ? await applyCredit(invoice.id) : 0;
      if (payNow && !isEdit && invoice.total - usedCredit > 0.004) {
        await savePayment({ invoice_id: invoice.id, customer_id: invoice.customer_id, payment_date: invoice.invoice_date, method: payMethod, amount: round2(invoice.total - usedCredit) });
      }
      if (action === 'email') await queueEmail('invoice', sendTo, { invoice_id: invoice.id });
      onSaved(invoice, action);
    } catch (e) {
      setError('Could not save: ' + (e.message || e));
      setSaving(false);
    }
  }

  const th = { fontSize: 12, color: 'var(--dp-ink-soft)', fontWeight: 500, textAlign: 'left', padding: '6px 4px' };
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
        <div style={{ background: 'var(--dp-canvas)', border: '1px solid #EDEAE0', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
        <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '-4px 0 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
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
                  {sizesOf(l).length > 0 && (
                    <SizeChips sizes={sizesOf(l)} value={l.size} stockFor={(z) => stockOf(l.fee_item_id, z)} onPick={(z) => pickSize(i, z)} />
                  )}
                  {l.components?.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {l.components.map((c, pi) => {
                        const sz = itemById[c.fee_item_id]?.sizes || [];
                        return (
                          <div key={pi} style={{ fontSize: 12 }}>
                            {c.options?.length > 1 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {c.options.map((id) => (
                                  <button key={id} type="button" onClick={() => pickPartOption(i, pi, id)} style={{
                                    padding: '2px 7px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                                    border: `1px solid ${c.fee_item_id === id ? 'var(--dp-ink)' : 'var(--dp-line)'}`,
                                    background: c.fee_item_id === id ? 'var(--dp-canvas)' : '#fff', fontWeight: c.fee_item_id === id ? 600 : 400, color: 'var(--dp-ink)',
                                  }}>{itemById[id]?.name}</button>
                                ))}
                              </div>
                            ) : (
                              <div style={{ color: 'var(--dp-ink-soft)' }}>{c.quantity > 1 ? `${c.quantity}× ` : ''}{c.item_name}{!sz.length && stockOf(c.fee_item_id) !== undefined ? ` · ${stockOf(c.fee_item_id)} in stock` : ''}</div>
                            )}
                            {sz.length > 0 && <SizeChips sizes={sz} value={c.size} stockFor={(z) => stockOf(c.fee_item_id, z)} onPick={(z) => pickPartSize(i, pi, z)} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td style={td}><input className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></td>
                <td style={td}>
                  <input type="number" className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                  {l.fee_item_id && stock[`${l.fee_item_id}|${l.size || ''}`] !== undefined && (() => {
                    // When editing, this invoice's own original qty is already taken out of stock.
                    const orig = isEdit ? Number(editing.lines.find((x) => x.id === l.id && x.fee_item_id === l.fee_item_id && (x.size || '') === (l.size || ''))?.quantity || 0) : 0;
                    const left = stock[`${l.fee_item_id}|${l.size || ''}`] + orig;
                    const short = Number(l.quantity) > left;
                    return <div style={{ fontSize: 12.5, color: short ? 'var(--dp-danger)' : 'var(--dp-ink-faint)', marginTop: 2, whiteSpace: 'nowrap' }}>{short ? `only ${left} in stock` : `${left} in stock`}</div>;
                  })()}
                </td>
                <td style={td}>
                  {l.pct ? (
                    <span style={{ fontSize: 12.5, color: 'var(--dp-success)', whiteSpace: 'nowrap' }}>−{l.pct}%</span>
                  ) : (
                    <input type="number" step="0.01" className="dp-input" style={{ width: '100%', fontSize: 13, padding: '6px' }} value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} />
                  )}
                </td>
                <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!l.taxable} onChange={(e) => updateLine(i, { taxable: e.target.checked })} /></td>
                <td style={{ ...td, textAlign: 'right', fontSize: 13, color: lineAmount(effLines[i]) < 0 ? 'var(--dp-success)' : undefined }}>{money(lineAmount(effLines[i]))}</td>
                <td style={td}>
                  <button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Remove line" onClick={() => removeLine(i)}>
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
          <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => { setShopQ(''); setShopOpen((o) => !o); }}>
            <ShoppingBag size={13} /> Gear / Shop
          </button>
          <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setAdj({ kind: 'discount', type: '%', value: '', label: '', target: '' })}>
            <Plus size={13} /> Discount
          </button>
          <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setAdj({ kind: 'credit', type: '$', value: '', label: '' })}>
            <Plus size={13} /> Credit
          </button>
          {adj && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: 'var(--dp-canvas)', border: '1px solid #EDEAE0', borderRadius: 8, padding: '4px 8px', flexWrap: 'wrap' }}>
              <b style={{ fontWeight: 500, fontSize: 12.5 }}>{adj.kind === 'credit' ? 'Credit' : 'Discount'}</b>
              {adj.kind === 'discount' && (
                <span style={{ display: 'inline-flex', border: '1px solid var(--dp-line)', borderRadius: 6, overflow: 'hidden' }}>
                  {['%', '$'].map((t) => (
                    <button key={t} type="button" onClick={() => setAdj({ ...adj, type: t })} style={{ border: 'none', padding: '3px 10px', fontSize: 12.5, cursor: 'pointer', background: adj.type === t ? 'var(--dp-ink)' : '#fff', color: adj.type === t ? '#fff' : 'var(--dp-ink)' }}>{t}</button>
                  ))}
                </span>
              )}
              {adj.kind === 'discount' && (
                <select className="dp-select" aria-label="Discount on" style={{ fontSize: 12.5, padding: '3px 6px', maxWidth: 220 }} value={adj.target || ''} onChange={(e) => setAdj({ ...adj, target: e.target.value })}>
                  <option value="">On the whole invoice</option>
                  {itemLines.map((l) => <option key={l._k} value={l._k}>On: {(l.item_name || l.description || 'Item').slice(0, 40)}{l.size ? ` (${l.size})` : ''} — {money(lineAmount(l))}</option>)}
                </select>
              )}
              <input type="number" step="0.01" autoFocus className="dp-input" style={{ width: 80, padding: '4px 6px', fontSize: 13 }} placeholder={adj.type === '%' ? '10' : '20.00'} value={adj.value} onChange={(e) => setAdj({ ...adj, value: e.target.value })} />
              <input className="dp-input" style={{ width: 170, padding: '4px 6px', fontSize: 13 }} placeholder={adj.kind === 'credit' ? 'Reason (e.g. Missed class credit)' : 'Label (e.g. Sibling discount)'} value={adj.label} onChange={(e) => setAdj({ ...adj, label: e.target.value })} />
              <button className="dp-btn dp-btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={addAdjustment}>Add</button>
              <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setAdj(null)}>×</button>
            </span>
          )}
        </div>
        {shopOpen && (
          <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, padding: 8, margin: '4px 4px 8px', background: 'var(--dp-canvas)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input className="dp-input" autoFocus style={{ flex: 1, fontSize: 13, padding: '5px 8px' }} placeholder="Find gear, uniform, belt…" value={shopQ} onChange={(e) => setShopQ(e.target.value)} />
              <button className="dp-btn" style={{ padding: 5 }} aria-label="Close" onClick={() => setShopOpen(false)}><X size={14} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {shopItems.map((it, idx) => {
                const parts = partsOf(it);
                const st = parts.length ? undefined : totalStock(it);
                const head = idx === 0 || shopItems[idx - 1].category !== it.category;
                return (
                  <React.Fragment key={it.id}>
                  {head && <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600, color: 'var(--dp-ink-soft)', margin: idx ? '6px 0 0' : 0 }}>{it.category || 'Other'}</div>}
                  <button onClick={() => addFromShop(it)} style={{ textAlign: 'left', background: '#fff', border: '1px solid var(--dp-line)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dp-ink)' }}>{it.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--dp-ink-soft)' }}>
                      {money(it.default_amount || 0)}
                      {parts.length ? ` · set of ${parts.length}` : it.sizes?.length ? ` · ${it.sizes.length} sizes` : ''}
                      {st !== undefined && <span style={{ color: st > 0 ? 'var(--dp-ink-faint)' : 'var(--dp-danger)' }}> · {st} left</span>}
                    </div>
                  </button>
                  </React.Fragment>
                );
              })}
              {shopItems.length === 0 && <div style={{ fontSize: 13, color: 'var(--dp-ink-faint)', padding: 6 }}>No matching items.</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--dp-ink-faint)', marginTop: 6 }}>Tap to add. Then tap the size on the line.</div>
          </div>
        )}
        <div style={{ fontSize: 12.5, color: 'var(--dp-ink-faint)', margin: '0 4px 6px' }}>Discount comes off before GST — on one line or the whole invoice. Credit comes off the total (no GST).</div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Notes (shown on invoice)">
            <textarea className="dp-input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {famCredit > 0.004 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 6, color: 'var(--dp-success)' }}>
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
            <tr><td style={{ padding: '4px 8px', color: 'var(--dp-ink-soft)' }}>Subtotal</td><td style={{ padding: '4px 8px', textAlign: 'right' }}>{money(totals.subtotal)}</td></tr>
            <tr>
              <td style={{ padding: '4px 8px', color: 'var(--dp-ink-soft)' }}>
                GST <input type="number" className="dp-input" style={{ width: 52, padding: '2px 4px', fontSize: 12.5 }} value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} /> %
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{money(totals.gst)}</td>
            </tr>
            <tr style={{ borderTop: '1px solid var(--dp-ink)' }}><td style={{ padding: '6px 8px', fontWeight: 500 }}>Total</td><td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, fontSize: 16 }}>{money(totals.total)}</td></tr>
          </tbody>
        </table>
      </div>
      {error && <p style={{ color: 'var(--dp-danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
    </Modal>
  );
}

// Size buttons with stock left under each; out-of-stock sizes are red but still pickable.
function SizeChips({ sizes, value, stockFor, onPick }) {
  // Sizes like "Green 1 … Green 4" (colour + size) show as one row per colour.
  const split = sizes.map((z) => z.match(/^(.*\S)\s+(\S+)$/));
  if (sizes.length > 8 && split.every(Boolean)) {
    const rows = [];
    split.forEach((m, i) => {
      const last = rows[rows.length - 1];
      if (last && last.label === m[1]) last.items.push([sizes[i], m[2]]);
      else rows.push({ label: m[1], items: [[sizes[i], m[2]]] });
    });
    return (
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 11.5, width: 82, color: 'var(--dp-ink-soft)' }}>{r.label}</span>
            {r.items.map(([full, short]) => {
              const on = value === full;
              const st = stockFor(full);
              const out = st !== undefined && st <= 0;
              return (
                <button key={full} type="button" onClick={() => onPick(on ? '' : full)} title={st !== undefined ? `${st} in stock` : ''} style={{
                  minWidth: 28, padding: '1px 5px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, lineHeight: 1.2,
                  border: `1px solid ${on ? 'var(--dp-ink)' : out ? 'var(--dp-danger-tint)' : 'var(--dp-line)'}`,
                  background: on ? 'var(--dp-ink)' : '#fff', color: on ? '#fff' : out ? 'var(--dp-danger)' : 'var(--dp-ink)',
                }}>{short}{st !== undefined && <span style={{ fontSize: 9.5, opacity: 0.7 }}> {st}</span>}</button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
      {sizes.map((z) => {
        const on = value === z;
        const st = stockFor(z);
        const out = st !== undefined && st <= 0;
        return (
          <button key={z} type="button" onClick={() => onPick(on ? '' : z)} title={st !== undefined ? `${st} in stock` : ''} style={{
            minWidth: 34, padding: '3px 6px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.15,
            border: `1px solid ${on ? 'var(--dp-ink)' : out ? 'var(--dp-danger-tint)' : 'var(--dp-line)'}`,
            background: on ? 'var(--dp-ink)' : '#fff', color: on ? '#fff' : out ? 'var(--dp-danger)' : 'var(--dp-ink)',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{z}</div>
            {st !== undefined && <div style={{ fontSize: 10, opacity: 0.75 }}>{st}</div>}
          </button>
        );
      })}
    </div>
  );
}
