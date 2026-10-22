import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Upload, Users, Check, Download, FileText } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { money, formatDate, downloadCSV, localISO } from '../../lib/invoiceUtils';
import { loadCustomers, fetchAll } from './api';
import { StatusPill } from './InvoicesPage';

const IMPORT_FIELDS = [
  { key: 'name', label: 'Customer Name', required: true, aliases: ['customer name', 'name', 'company', 'customer'] },
  { key: 'contact_name', label: 'Contact Person', aliases: ['contact person', 'contact'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail'] },
  { key: 'phone', label: 'Phone (primary)', aliases: ['phone (primary)', 'primary phone', 'phone', 'tel', 'mobile', 'cell'] },
  { key: 'phone2', label: 'Phone (alternative)', aliases: ['alternative', 'phone 2', 'phone2', 'alt'] },
  { key: 'printed_info', label: 'Additional Printed Info', aliases: ['printed', 'additional'] },
  { key: 'address', label: 'Address', aliases: ['address', 'street'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'memo', 'comment'] },
  { key: 'balance', label: 'Balance owing (carried over)', aliases: ['balance'] },
];

function emptyForm() {
  return { name: '', contact_name: '', email: '', cc_email: '', phone: '', phone2: '', address: '', printed_info: '', notes: '', active: true };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [balances, setBalances] = useState({});
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [modal, setModal] = useState(null); // {form, id, studentIds}
  const [statementFor, setStatementFor] = useState(null);
  const [importState, setImportState] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [flash, setFlash] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [c, { data: b }, { data: s }] = await Promise.all([
      loadCustomers(),
      fetchAll(() => supabase.from('customer_balances').select('*')),
      supabase.from('students').select('id, name, guardian_name, guardian_email, guardian_phone, customer_id, status').order('name'),
    ]);
    setCustomers(c);
    setBalances(Object.fromEntries((b || []).map((r) => [r.customer_id, r])));
    setStudents(s || []);
  }

  const studentsByCustomer = useMemo(() => {
    const m = {};
    students.forEach((s) => s.customer_id && (m[s.customer_id] = [...(m[s.customer_id] || []), s]));
    return m;
  }, [students]);

  const filtered = useMemo(() => {
    const k = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (!showInactive && c.active === false) return false;
      if (onlyOwing && !(Number(balances[c.id]?.balance) > 0)) return false;
      if (!k) return true;
      const kids = (studentsByCustomer[c.id] || []).map((s) => s.name).join(' ');
      return [c.name, c.contact_name, c.email, c.phone, kids].some((v) => (v || '').toLowerCase().includes(k));
    });
  }, [customers, search, showInactive, onlyOwing, balances, studentsByCustomer]);

  const totalOwing = Object.values(balances).reduce((s, b) => s + Number(b.balance || 0), 0);

  function openAdd() {
    setModal({ id: null, form: emptyForm(), studentIds: [], error: '' });
  }
  function openEdit(c) {
    setModal({ id: c.id, form: { ...emptyForm(), ...c }, studentIds: (studentsByCustomer[c.id] || []).map((s) => s.id), error: '' });
  }

  async function saveModal() {
    const { form, id, studentIds } = modal;
    if (!form.name.trim()) return setModal({ ...modal, error: 'Name is required.' });
    const payload = { name: form.name.trim(), contact_name: form.contact_name || null, email: form.email?.trim() || null, cc_email: form.cc_email?.trim() || null, phone: form.phone || null, phone2: form.phone2 || null, address: form.address || null, printed_info: form.printed_info || null, notes: form.notes || null, active: form.active !== false };
    const res = id ? await supabase.from('customers').update(payload).eq('id', id).select().single() : await supabase.from('customers').insert(payload).select().single();
    if (res.error) return setModal({ ...modal, error: res.error.message });
    const cid = res.data.id;
    const before = (studentsByCustomer[cid] || []).map((s) => s.id);
    const removed = before.filter((x) => !studentIds.includes(x));
    const added = studentIds.filter((x) => !before.includes(x));
    if (removed.length) await supabase.from('students').update({ customer_id: null }).in('id', removed);
    if (added.length) await supabase.from('students').update({ customer_id: cid }).in('id', added);
    setModal(null);
    loadAll();
  }

  async function deleteCustomer(c) {
    const { error } = await supabase.from('customers').delete().eq('id', c.id);
    setConfirm(null);
    if (error) {
      await supabase.from('customers').update({ active: false }).eq('id', c.id);
      setFlash(`${c.name} has invoices, so they were marked inactive instead of deleted.`);
    }
    setModal(null);
    loadAll();
  }

  // One customer per guardian (siblings with the same guardian email share one).
  async function createFromStudents() {
    const unlinked = students.filter((s) => !s.customer_id && s.status !== 'withdrawn');
    if (!unlinked.length) return setFlash('Every active student is already linked to a customer.');
    const byEmail = Object.fromEntries(customers.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
    const groups = {};
    unlinked.forEach((s) => {
      const key = (s.guardian_email || '').toLowerCase() || 'name:' + (s.guardian_name || s.name).toLowerCase();
      (groups[key] = groups[key] || []).push(s);
    });
    let created = 0;
    let linked = 0;
    for (const [key, kids] of Object.entries(groups)) {
      let cust = !key.startsWith('name:') && byEmail[key];
      if (!cust) {
        const first = kids[0];
        const { data, error } = await supabase
          .from('customers')
          .insert({ name: first.guardian_name || first.name, email: first.guardian_email || null, phone: first.guardian_phone || null })
          .select()
          .single();
        if (error) continue;
        cust = data;
        created++;
      }
      await supabase.from('students').update({ customer_id: cust.id }).in('id', kids.map((k) => k.id));
      linked += kids.length;
    }
    setFlash(`Created ${created} customers and linked ${linked} students.`);
    loadAll();
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).filter((r) => r.some((v) => String(v).trim()));
      if (rows.length < 2) return setFlash('That file has no rows.');
      const headers = rows[0].map(String);
      const mapping = {};
      IMPORT_FIELDS.forEach((f) => {
        mapping[f.key] = headers.findIndex((h) => f.aliases.some((a) => h.trim().toLowerCase().includes(a)));
      });
      setImportState({ headers, rows: rows.slice(1), mapping });
    };
    reader.readAsArrayBuffer(file);
  }

  async function runImport() {
    const { rows, mapping } = importState;
    const existing = new Set(customers.map((c) => c.name.trim().toLowerCase()));
    const toInsert = [];
    rows.forEach((r) => {
      const rec = {};
      IMPORT_FIELDS.forEach((f) => {
        const idx = mapping[f.key];
        rec[f.key] = idx >= 0 ? String(r[idx] ?? '').trim() || null : null;
      });
      if (rec.name && !existing.has(rec.name.toLowerCase())) {
        existing.add(rec.name.toLowerCase());
        toInsert.push(rec);
      }
    });
    let carried = 0;
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { data, error } = await supabase.from('customers').insert(chunk.map(({ balance, ...c }) => c)).select();
      if (error) return setFlash('Import stopped: ' + error.message);
      // Balances owing in Express Invoice become an un-numbered "opening balance"
      // invoice (no GST, already included) so payments can be applied to it.
      const opening = (data || [])
        .map((c, k) => ({ c, bal: Number(String(chunk[k].balance || '').replace(/[^0-9.-]/g, '')) || 0 }))
        .filter((x) => x.bal > 0);
      for (const { c, bal } of opening) {
        const { data: inv, error: e2 } = await supabase
          .from('invoices')
          .insert({ is_opening_balance: true, customer_id: c.id, customer_name: c.name, customer_email: c.email, customer_address: c.address, invoice_date: localISO(), subtotal: bal, gst_rate: 0, gst_amount: 0, total: bal, notes: 'Balance carried over from Express Invoice' })
          .select()
          .single();
        if (e2) continue;
        await supabase.from('invoice_lines').insert({ invoice_id: inv.id, position: 0, item_name: 'Opening', description: 'Balance carried over from Express Invoice', quantity: 1, unit_price: bal, taxable: false, amount: bal });
        carried++;
      }
    }
    setImportState(null);
    setFlash(`Imported ${toInsert.length} customers (${rows.length - toInsert.length} skipped as duplicates/blank)${carried ? `, ${carried} with a carried-over balance` : ''}.`);
    loadAll();
  }

  function exportCSV() {
    downloadCSV('customers.csv', [
      ['Name', 'Contact', 'Email', 'Phone', 'Address', 'Students', 'Balance'],
      ...filtered.map((c) => [c.name, c.contact_name, c.email, c.phone, c.address, (studentsByCustomer[c.id] || []).map((s) => s.name).join('; '), balances[c.id]?.balance || 0]),
    ]);
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Customers</h1>
          <p style={styles.subtitle}>Families and payers you invoice · total owing {money(totalOwing)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="dp-btn" onClick={createFromStudents} title="Create a customer for each guardian of an unlinked student"><Users size={15} /> From Students</button>
          <button className="dp-btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Import</button>
          <button className="dp-btn" onClick={exportCSV}><Download size={15} /> Export</button>
          <button className="dp-btn dp-btn-primary" onClick={openAdd}><Plus size={15} /> Add Customer</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={onFile} />
        </div>
      </div>
      {flash && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}

      <div style={{ ...styles.filterBar, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={styles.searchBox}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Name, email, phone, student…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} /> Owing only</label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No customers yet. Add one, import your Express Invoice customer list, or click "From Students".</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th>Due Date</th>
                <th>Last Invoice</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Students</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const bal = Number(balances[c.id]?.balance || 0);
                return (
                  <tr key={c.id} className="dp-row" style={{ cursor: 'pointer', opacity: c.active === false ? 0.55 : 1 }} onClick={() => openEdit(c)}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ textAlign: 'right', color: bal > 0 ? '#9A2B2B' : '#8A8D84' }}>{money(bal)}</td>
                    <td>{bal > 0 ? balances[c.id]?.oldest_due_date : ''}</td>
                    <td>{balances[c.id]?.last_invoice_number || ''}</td>
                    <td>{c.phone}</td>
                    <td>{c.email}</td>
                    <td style={{ color: '#5B5F56' }}>{(studentsByCustomer[c.id] || []).map((s) => s.name).join(', ')}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setStatementFor(c)}><FileText size={13} /> Statement</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.id ? 'Edit Customer' : 'Add Customer'}
          onClose={() => setModal(null)}
          maxWidth={560}
          footer={
            <>
              {modal.id && <button className="dp-btn dp-btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirm(customers.find((c) => c.id === modal.id))}>Delete</button>}
              <button className="dp-btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" onClick={saveModal}><Check size={15} /> Save</button>
            </>
          }
        >
          {(() => {
            const f = modal.form;
            const set = (patch) => setModal({ ...modal, form: { ...f, ...patch } });
            return (
              <>
                <div style={styles.formRow}>
                  <Field label="Customer Name" required><input className="dp-input" style={{ width: '100%' }} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                  <Field label="Contact"><input className="dp-input" style={{ width: '100%' }} value={f.contact_name || ''} onChange={(e) => set({ contact_name: e.target.value })} /></Field>
                </div>
                <div style={styles.formRow}>
                  <Field label="Email (invoices go here)"><input className="dp-input" style={{ width: '100%' }} value={f.email || ''} onChange={(e) => set({ email: e.target.value })} /></Field>
                  <Field label="CC Email"><input className="dp-input" style={{ width: '100%' }} value={f.cc_email || ''} onChange={(e) => set({ cc_email: e.target.value })} /></Field>
                </div>
                <div style={styles.formRow}>
                  <Field label="Phone (primary)"><input className="dp-input" style={{ width: '100%' }} value={f.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
                  <Field label="Phone (alternative)"><input className="dp-input" style={{ width: '100%' }} value={f.phone2 || ''} onChange={(e) => set({ phone2: e.target.value })} /></Field>
                </div>
                <Field label="Address (printed on invoice)"><textarea className="dp-input" rows={2} style={{ width: '100%' }} value={f.address || ''} onChange={(e) => set({ address: e.target.value })} /></Field>
                <Field label="Additional Printed Info"><input className="dp-input" style={{ width: '100%' }} value={f.printed_info || ''} onChange={(e) => set({ printed_info: e.target.value })} /></Field>
                <Field label="Notes"><textarea className="dp-input" rows={2} style={{ width: '100%' }} value={f.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
                <Field label="Students paid for by this customer">
                  <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #EDEAE0', borderRadius: 6, padding: 6 }}>
                    {students.filter((s) => s.status !== 'withdrawn' || modal.studentIds.includes(s.id)).length === 0 && <span style={{ fontSize: 13, color: '#8A8D84' }}>No students yet.</span>}
                    {students
                      .filter((s) => s.status !== 'withdrawn' || modal.studentIds.includes(s.id))
                      .filter((s) => !s.customer_id || s.customer_id === modal.id || modal.studentIds.includes(s.id))
                      .map((s) => (
                        <label key={s.id} style={{ display: 'flex', gap: 6, fontSize: 13, padding: '2px 0' }}>
                          <input type="checkbox" checked={modal.studentIds.includes(s.id)} onChange={(e) => setModal({ ...modal, studentIds: e.target.checked ? [...modal.studentIds, s.id] : modal.studentIds.filter((x) => x !== s.id) })} />
                          {s.name} {s.guardian_name ? <span style={{ color: '#8A8D84' }}>· {s.guardian_name}</span> : null}
                        </label>
                      ))}
                  </div>
                </Field>
                <label style={{ fontSize: 13, display: 'flex', gap: 6 }}><input type="checkbox" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
                {modal.error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{modal.error}</p>}
              </>
            );
          })()}
        </Modal>
      )}

      {confirm && <ConfirmDialog message={`Delete ${confirm.name}? (If they have invoices they'll be marked inactive instead.)`} onCancel={() => setConfirm(null)} onConfirm={() => deleteCustomer(confirm)} />}

      {importState && (
        <Modal
          title={`Import Customers (${importState.rows.length} rows)`}
          onClose={() => setImportState(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setImportState(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" disabled={importState.mapping.name < 0} onClick={runImport}>Import</button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>Match the columns in your file. Names that already exist are skipped.</p>
          {IMPORT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} required={f.required}>
              <select className="dp-select" style={{ width: '100%' }} value={importState.mapping[f.key]} onChange={(e) => setImportState({ ...importState, mapping: { ...importState.mapping, [f.key]: Number(e.target.value) } })}>
                <option value={-1}>(skip)</option>
                {importState.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </Field>
          ))}
        </Modal>
      )}

      {statementFor && <Statement customer={statementFor} onClose={() => setStatementFor(null)} />}
    </>
  );
}

// Customer statement: every invoice and payment, with a running balance.
function Statement({ customer, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    (async () => {
      const [{ data: inv }, { data: pay }] = await Promise.all([
        supabase.from('invoice_summary').select('*').eq('customer_id', customer.id).eq('voided', false),
        supabase.from('invoice_payments').select('*, invoices(invoice_number)').eq('customer_id', customer.id),
      ]);
      const list = [
        ...(inv || []).map((i) => ({ date: i.invoice_date, kind: 'Invoice', ref: i.is_opening_balance ? 'Opening balance' : '#' + i.invoice_number, charge: Number(i.total), credit: 0, status: i.status, key: 'i' + i.id })),
        ...(pay || []).map((p) => ({ date: p.payment_date, kind: 'Payment', ref: `Receipt #${p.receipt_number}${p.invoices ? ' → #' + p.invoices.invoice_number : ''}`, method: p.method, charge: 0, credit: Number(p.amount), key: 'p' + p.id })),
      ].sort((a, b) => (a.date === b.date ? (a.kind === 'Invoice' ? -1 : 1) : a.date < b.date ? -1 : 1));
      let bal = 0;
      list.forEach((r) => (r.balance = bal = bal + r.charge - r.credit));
      setRows(list.reverse());
    })();
  }, [customer.id]);

  return (
    <Modal title={`Statement — ${customer.name}`} onClose={onClose} maxWidth={760}>
      {!rows ? (
        <p style={{ fontSize: 14, color: '#5B5F56' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 14, color: '#5B5F56' }}>No invoices or payments yet.</p>
      ) : (
        <table className="dp-table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Ref</th><th style={{ textAlign: 'right' }}>Charge</th><th style={{ textAlign: 'right' }}>Payment</th><th style={{ textAlign: 'right' }}>Balance</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{formatDate(r.date)}</td>
                <td>{r.kind === 'Invoice' ? <>Invoice <StatusPill status={r.status} /></> : <>Payment <span style={{ color: '#8A8D84' }}>· {r.method}</span></>}</td>
                <td>{r.ref}</td>
                <td style={{ textAlign: 'right' }}>{r.charge ? money(r.charge) : ''}</td>
                <td style={{ textAlign: 'right' }}>{r.credit ? money(r.credit) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 500 }}>{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
