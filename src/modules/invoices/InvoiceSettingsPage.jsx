import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Check, Plus, Trash2, Upload } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import { money } from '../../lib/invoiceUtils';
import { loadSettings, clearPaymentMethodsCache } from './api';
import { WELCOME_PLACEHOLDERS } from '../../lib/welcomeEmail';
import { PAYMENT_METHODS } from '../../lib/invoiceUtils';
import { TEMPLATE_HELP } from '../../lib/emailTemplates';

const TEXT_FIELDS = [
  ['business_name', 'Business Name'],
  ['phone', 'Phone'],
  ['email', 'Email (shown on invoices; replies go here)'],
  ['website', 'Website'],
  ['gst_number', 'GST Number'],
];

export default function InvoiceSettingsPage() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState('');
  const [items, setItems] = useState([]);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [methodsText, setMethodsText] = useState(null); // null = untouched
  const itemFileRef = useRef(null);
  const logoRef = useRef(null);

  function onLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 300 * 1024) return setSaved('Logo is too large — please use an image under 300 KB.');
    const reader = new FileReader();
    reader.onload = (ev) => setS((prev) => ({ ...prev, logo_data: ev.target.result }));
    reader.readAsDataURL(file);
  }

  // Import an item list exported from Express Invoice (Item, Description, Tax, Value).
  function onItemsFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const hi = rows.findIndex((r) => r.some((v) => /^item/i.test(String(v).trim())));
      if (hi < 0) return setSaved('Could not find an "Item" column in that file.');
      const h = rows[hi].map((v) => String(v).trim().toLowerCase());
      const col = (...names) => h.findIndex((x) => names.some((n) => x.startsWith(n)));
      const ci = col('item'), cd = col('description'), ct = col('tax'), cv = col('value', 'unit price', 'price');
      const existing = new Set(items.map((it) => it.name.trim().toLowerCase()));
      const added = [];
      rows.slice(hi + 1).forEach((r) => {
        const name = String(r[ci] ?? '').trim();
        if (!name || existing.has(name.toLowerCase())) return;
        existing.add(name.toLowerCase());
        const tax = ct >= 0 ? String(r[ct]).trim().toLowerCase() : '';
        const price = cv >= 0 ? Number(String(r[cv]).replace(/[^0-9.-]/g, '')) || 0 : 0;
        added.push({ name, description: cd >= 0 ? String(r[cd]).trim() : '', default_amount: price, taxable: tax !== 'none', active: true, sort_order: 100 });
      });
      setItems((prev) => [...prev, ...added]);
      setItemsDirty(true);
      setSaved(`${added.length} items read from the file — review them below, then click Save Items.`);
    };
    reader.readAsArrayBuffer(file);
  }

  useEffect(() => {
    loadSettings().then(setS);
    loadItemList();
  }, []);

  async function loadItemList() {
    const { data } = await supabase.from('fee_items').select('*').order('sort_order').order('name');
    setItems(data || []);
    setItemsDirty(false);
  }

  async function saveSettings() {
    const { id, updated_at, ...rest } = s;
    rest.gst_rate = Number(rest.gst_rate) || 0;
    rest.next_invoice_number = Number(rest.next_invoice_number) || 1;
    rest.next_receipt_number = Number(rest.next_receipt_number) || 1;
    rest.default_due_days = Number(rest.default_due_days) || 0;
    rest.invoice_lead_days = Math.max(0, Number(rest.invoice_lead_days) || 0);
    rest.reminder_lead_days = Math.max(0, Number(rest.reminder_lead_days) || 0);
    rest.family_discount_pct = Number(rest.family_discount_pct) || 0;
    rest.default_tryout_time = rest.default_tryout_time || '16:30';
    if (methodsText !== null) {
      const list = methodsText.split('\n').map((m) => m.trim()).filter(Boolean);
      if (!list.length) return setSaved('Add at least one payment method.');
      rest.payment_methods = list;
      clearPaymentMethodsCache();
    }
    const { error } = await supabase.from('invoice_settings').upsert({ id: 1, ...rest, updated_at: new Date().toISOString() });
    setSaved(error ? 'Could not save: ' + error.message : 'Settings saved.');
  }

  function setItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    setItemsDirty(true);
  }
  async function saveItems() {
    for (const it of items) {
      const row = { name: it.name, description: it.description || null, default_amount: Number(it.default_amount) || 0, taxable: !!it.taxable, active: it.active !== false, sort_order: Number(it.sort_order) || 100 };
      if (!row.name.trim()) continue;
      if (it.id) await supabase.from('fee_items').update(row).eq('id', it.id);
      else await supabase.from('fee_items').insert(row);
    }
    setSaved('Items saved.');
    loadItemList();
  }
  async function deleteItem(it, i) {
    if (it.id) await supabase.from('fee_items').delete().eq('id', it.id);
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  if (!s) return <p style={{ color: '#5B5F56' }}>Loading…</p>;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Invoice Settings</h1>
          <p style={styles.subtitle}>Company details, numbering, GST, email wording and invoice items</p>
        </div>
        <button className="dp-btn dp-btn-primary" onClick={saveSettings}><Check size={15} /> Save Settings</button>
      </div>
      {saved && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{saved}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 12 }}>Company profile</p>
          {TEXT_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}><input className="dp-input" style={{ width: '100%' }} value={s[k] || ''} onChange={set(k)} /></Field>
          ))}
          <Field label="Address"><textarea className="dp-input" rows={3} style={{ width: '100%' }} value={s.address || ''} onChange={set('address')} /></Field>
          <Field label="Logo (printed on invoices)">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {s.logo_data ? <img src={s.logo_data} alt="Logo" style={{ maxHeight: 60, maxWidth: 120, border: '1px solid #EDEAE0', borderRadius: 4 }} /> : <span style={{ fontSize: 13, color: '#8A8D84' }}>No logo</span>}
              <button className="dp-btn" onClick={() => logoRef.current?.click()}><Upload size={14} /> Upload</button>
              {s.logo_data && <button className="dp-btn dp-btn-danger" onClick={() => setS({ ...s, logo_data: null })}>Remove</button>}
              <input ref={logoRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={onLogo} />
            </div>
          </Field>
        </div>

        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 12 }}>Numbering, tax and terms</p>
          <div style={styles.formRow}>
            <Field label="Next invoice #"><input type="number" className="dp-input" style={{ width: '100%' }} value={s.next_invoice_number} onChange={set('next_invoice_number')} /></Field>
            <Field label="Next receipt #"><input type="number" className="dp-input" style={{ width: '100%' }} value={s.next_receipt_number} onChange={set('next_receipt_number')} /></Field>
          </div>
          <div style={styles.formRow}>
            <Field label="GST rate (%)"><input type="number" className="dp-input" style={{ width: '100%' }} value={s.gst_rate} onChange={set('gst_rate')} /></Field>
            <Field label="Due in (days after invoice)"><input type="number" className="dp-input" style={{ width: '100%' }} value={s.default_due_days} onChange={set('default_due_days')} /></Field>
          </div>
          <Field label="How to pay (printed on invoice)"><textarea className="dp-input" rows={2} style={{ width: '100%' }} value={s.payment_instructions || ''} onChange={set('payment_instructions')} placeholder="e.g. Interac e-Transfer to ..." /></Field>
          <Field label="Invoice footer"><input className="dp-input" style={{ width: '100%' }} value={s.invoice_footer || ''} onChange={set('invoice_footer')} /></Field>
          <p style={{ ...styles.metricLabel, margin: '16px 0 8px' }}>Invoice email</p>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={s.email_subject || ''} onChange={set('email_subject')} /></Field>
          <Field label="Message"><textarea className="dp-input" rows={5} style={{ width: '100%' }} value={s.email_message || ''} onChange={set('email_message')} /></Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>You can use {'{customer}'}, {'{number}'}, {'{total}'}, {'{balance}'}, {'{due_date}'}, {'{business}'}.</p>
          <p style={{ ...styles.metricLabel, margin: '16px 0 8px' }}>Sports grant (subsidy) reminder email</p>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={s.subsidy_reminder_subject || ''} onChange={set('subsidy_reminder_subject')} /></Field>
          <Field label="Message"><textarea className="dp-input" rows={9} style={{ width: '100%' }} value={s.subsidy_reminder_message || ''} onChange={set('subsidy_reminder_message')} /></Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>You can use {'{student}'} (first name), {'{student_full}'}, {'{guardian}'}, {'{subsidy}'}, {'{end_month}'} (e.g. October 2026), {'{end_date}'}, {'{business}'}. Sent from the yellow alert on the Students page.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start', marginTop: 18 }}>
        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 12 }}>Payment methods</p>
          <Field label="One per line — the first one is the default when recording a payment">
            <textarea
              className="dp-input"
              rows={9}
              style={{ width: '100%', fontSize: 13 }}
              value={methodsText ?? (s.payment_methods?.length ? s.payment_methods : PAYMENT_METHODS).join('\n')}
              onChange={(e) => setMethodsText(e.target.value)}
            />
          </Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>Payments already recorded keep the name they were saved with. Click Save Settings at the top after changing.</p>
          <p style={{ ...styles.metricLabel, margin: '18px 0 8px' }}>Refund policy</p>
          <Field label="Inserted into the welcome email as {refund_policy}">
            <textarea className="dp-input" rows={7} style={{ width: '100%', fontSize: 13 }} value={s.refund_policy || ''} onChange={set('refund_policy')} />
          </Field>
        </div>
        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 12 }}>Welcome email (sent when a student enrolls)</p>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={s.welcome_subject || ''} onChange={set('welcome_subject')} /></Field>
          <Field label="Message"><textarea className="dp-input" rows={18} style={{ width: '100%', fontSize: 13 }} value={s.welcome_message || ''} onChange={set('welcome_message')} /></Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>Filled in from the student's details: {WELCOME_PLACEHOLDERS}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start', marginTop: 18 }}>
        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 12 }}>Tuition billing</p>
          <div style={styles.formRow}>
            <Field label="Create invoices (days before billing date)"><input type="number" className="dp-input" style={{ width: '100%' }} value={s.invoice_lead_days ?? 7} onChange={set('invoice_lead_days')} /></Field>
            <Field label="Send reminder (days before billing date)"><input type="number" className="dp-input" style={{ width: '100%' }} value={s.reminder_lead_days ?? 3} onChange={set('reminder_lead_days')} /></Field>
          </div>
          <div style={styles.formRow}>
            <Field label="Big family discount (%)"><input type="number" className="dp-input" style={{ width: '100%' }} value={s.family_discount_pct ?? 20} onChange={set('family_discount_pct')} /></Field>
            <Field label="Usual trial class time"><input type="time" className="dp-input" style={{ width: '100%' }} value={(s.default_tryout_time || '16:30').slice(0, 5)} onChange={set('default_tryout_time')} /></Field>
          </div>
          <p style={{ ...styles.metricLabel, margin: '16px 0 8px' }}>Tuition reminder email (re-sends the invoice)</p>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={s.reminder_subject || ''} onChange={set('reminder_subject')} /></Field>
          <Field label="Message"><textarea className="dp-input" rows={7} style={{ width: '100%', fontSize: 13 }} value={s.reminder_message || ''} onChange={set('reminder_message')} /></Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>{TEMPLATE_HELP.reminder}</p>
          <p style={{ ...styles.metricLabel, margin: '16px 0 8px' }}>Trial booking confirmation</p>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={s.tryout_subject || ''} onChange={set('tryout_subject')} /></Field>
          <Field label="Message"><textarea className="dp-input" rows={10} style={{ width: '100%', fontSize: 13 }} value={s.tryout_message || ''} onChange={set('tryout_message')} /></Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>{TEMPLATE_HELP.tryout}</p>
        </div>
        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 12 }}>Makeup class email</p>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={s.makeup_subject || ''} onChange={set('makeup_subject')} /></Field>
          <Field label="Message — not booked yet (gives the expiry date)"><textarea className="dp-input" rows={7} style={{ width: '100%', fontSize: 13 }} value={s.makeup_message || ''} onChange={set('makeup_message')} /></Field>
          <Field label="Message — booked (confirms the makeup date)"><textarea className="dp-input" rows={6} style={{ width: '100%', fontSize: 13 }} value={s.makeup_reserved_message || ''} onChange={set('makeup_reserved_message')} /></Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>{TEMPLATE_HELP.makeup}</p>
          <p style={{ ...styles.metricLabel, margin: '16px 0 8px' }}>Absence check email (no class for a week)</p>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={s.absence_subject || ''} onChange={set('absence_subject')} /></Field>
          <Field label="Message"><textarea className="dp-input" rows={9} style={{ width: '100%', fontSize: 13 }} value={s.absence_message || ''} onChange={set('absence_message')} /></Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: 0 }}>{TEMPLATE_HELP.absence}</p>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 12px 0' }}>
          <p style={{ ...styles.metricLabel, margin: 0 }}>Items (pick these when writing an invoice)</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="dp-input" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="Find item…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
            <button className="dp-btn" onClick={() => itemFileRef.current?.click()}><Upload size={14} /> Import</button>
            <input ref={itemFileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={onItemsFile} />
            <button className="dp-btn" onClick={() => { setItems((p) => [...p, { name: '', default_amount: 0, taxable: true, active: true, sort_order: 100 }]); setItemsDirty(true); }}><Plus size={14} /> Add Item</button>
            <button className="dp-btn dp-btn-primary" disabled={!itemsDirty} onClick={saveItems}><Check size={14} /> Save Items</button>
          </div>
        </div>
        <table className="dp-table">
          <thead><tr><th style={{ width: 200 }}>Item</th><th>Description</th><th style={{ width: 110 }}>Value</th><th style={{ width: 90 }}>Tax</th><th style={{ width: 70 }}>Active</th><th style={{ width: 84 }}>Order</th><th style={{ width: 40 }}></th></tr></thead>
          <tbody>
            {items.map((it, i) => (!itemSearch || (it.name + ' ' + (it.description || '')).toLowerCase().includes(itemSearch.toLowerCase())) && (
              <tr key={it.id || 'new' + i}>
                <td><input className="dp-input" style={{ width: '100%', padding: 6, fontSize: 13 }} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /></td>
                <td><input className="dp-input" style={{ width: '100%', padding: 6, fontSize: 13 }} value={it.description || ''} placeholder="(same as name)" onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="dp-input" style={{ width: '100%', padding: 6, fontSize: 13 }} value={it.default_amount ?? ''} onChange={(e) => setItem(i, { default_amount: e.target.value })} title={money(it.default_amount)} /></td>
                <td>
                  <select className="dp-select" style={{ padding: 6, fontSize: 13 }} value={it.taxable ? 'GST' : 'None'} onChange={(e) => setItem(i, { taxable: e.target.value === 'GST' })}>
                    <option>GST</option>
                    <option>None</option>
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={it.active !== false} onChange={(e) => setItem(i, { active: e.target.checked })} /></td>
                <td><input type="number" className="dp-input" style={{ width: '100%', padding: 6, fontSize: 13 }} value={it.sort_order ?? 100} onChange={(e) => setItem(i, { sort_order: e.target.value })} /></td>
                <td><button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Delete item" onClick={() => deleteItem(it, i)}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
