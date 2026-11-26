import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Upload, Users, Check, Download, FileText } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import StatementModal from './StatementModal';
import YearReceiptsModal from './YearReceiptsModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { money, formatDate, downloadCSV, localISO } from '../../lib/invoiceUtils';
import { loadCustomers, loadSettings, fetchAll } from './api';
import { isBillable, onHold, tuitionLines } from '../../lib/tuitionBilling';
import { nextDueDate, todayISO } from '../../lib/billingDates';
import { calcTotals } from '../../lib/invoiceUtils';
import { CardLinkButton } from './CardLink';
import CardWallet from '../../components/CardWallet';
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
  return { name: '', contact_name: '', email: '', cc_email: '', phone: '', phone2: '', address: '', printed_info: '', notes: '', active: true, separate_invoices: false, payment_type: 'preauth' };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [credits, setCredits] = useState({});
  const [lastPaid, setLastPaid] = useState({}); // customer_id → { date, amount }
  const [settings, setSettings] = useState({});
  const [balances, setBalances] = useState({});
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [payFilter, setPayFilter] = useState(''); // '', 'manual', 'card', 'nocard'
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [modal, setModal] = useState(null); // {form, id, studentIds}
  const [statementFor, setStatementFor] = useState(null);
  const [yearFor, setYearFor] = useState(null);
  const [importState, setImportState] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [flash, setFlash] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const [c, { data: b }, { data: s }, { data: cr }, st, { data: pays }] = await Promise.all([
      loadCustomers(),
      fetchAll(() => supabase.from('customer_balances').select('*')),
      supabase.from('students').select('*').order('name'),
      supabase.from('customer_credit').select('customer_id, credit').neq('credit', 0),
      loadSettings(),
      fetchAll(() => supabase.from('invoice_payments').select('customer_id, payment_date, amount').gte('payment_date', since).order('payment_date', { ascending: false })),
    ]);
    // Most recent payment per family.
    const lp = {};
    (pays || []).forEach((p) => {
      if (!p.customer_id || Number(p.amount) <= 0) return;
      const cur = lp[p.customer_id];
      if (!cur) lp[p.customer_id] = { date: p.payment_date, amount: Number(p.amount) };
      else if (cur.date === p.payment_date) cur.amount += Number(p.amount);
    });
    setLastPaid(lp);
    setSettings(st || {});
    setCredits(Object.fromEntries((cr || []).map((r) => [r.customer_id, Number(r.credit)])));
    setCustomers(c);
    setBalances(Object.fromEntries((b || []).map((r) => [r.customer_id, r])));
    setStudents(s || []);
  }

  // #customers/<id> (e.g. "Payment settings" on a student page) opens that family.
  const [openFromLink, setOpenFromLink] = useState(() => (/^#customers\/([0-9a-f-]{8,})/i.exec(window.location.hash) || [])[1] || null);
  useEffect(() => {
    if (!openFromLink || !customers.length) return;
    const c = customers.find((x) => x.id === openFromLink);
    setOpenFromLink(null);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#customers`);
    if (c) openEdit(c);
  }, [openFromLink, customers, students]);

  const studentsByCustomer = useMemo(() => {
    const m = {};
    students.forEach((s) => s.customer_id && (m[s.customer_id] = [...(m[s.customer_id] || []), s]));
    return m;
  }, [students]);

  // Next tuition billing per family: the earliest upcoming billing date of its
  // students, and the estimated total (with GST) of everyone billed that day.
  const nextBill = useMemo(() => {
    const today = todayISO();
    const out = {};
    Object.entries(studentsByCustomer).forEach(([cid, kids]) => {
      const dated = kids.filter(isBillable).map((k) => {
        let d = nextDueDate(k, today);
        for (let n = 0; n < 6 && d && onHold(k, d); n++) d = nextDueDate(k, d);
        if (!d || (k.billing_end_date && d > k.billing_end_date)) return null;
        return { k, d };
      }).filter(Boolean);
      if (!dated.length) return;
      const first = dated.reduce((a, x) => (x.d < a ? x.d : a), dated[0].d);
      const lines = dated.filter((x) => x.d === first).flatMap((x) => tuitionLines(x.k, first, settings));
      out[cid] = { date: first, total: calcTotals(lines, settings.gst_rate ?? 5).total };
    });
    return out;
  }, [studentsByCustomer, settings]);

  const filtered = useMemo(() => {
    const k = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (!showInactive && c.active === false) return false;
      if (onlyOwing && !(Number(balances[c.id]?.balance) > 0)) return false;
      if (payFilter && payKind(c).key !== payFilter && !(payFilter === 'card' && payKind(c).key === 'declined')) return false;
      if (!k) return true;
      const kids = (studentsByCustomer[c.id] || []).map((s) => s.name).join(' ');
      return [c.name, c.contact_name, c.email, c.phone, kids].some((v) => (v || '').toLowerCase().includes(k));
    });
  }, [customers, search, showInactive, onlyOwing, payFilter, balances, studentsByCustomer]);
  const payCounts = useMemo(() => {
    const n = { manual: 0, card: 0, nocard: 0 };
    customers.forEach((c) => {
      if (c.active === false) return;
      const k = payKind(c).key;
      n[k === 'declined' ? 'card' : k] += 1;
    });
    return n;
  }, [customers]);

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
    const payload = { name: form.name.trim(), contact_name: form.contact_name || null, email: form.email?.trim() || null, cc_email: form.cc_email?.trim() || null, phone: form.phone || null, phone2: form.phone2 || null, address: form.address || null, printed_info: form.printed_info || null, notes: form.notes || null, active: form.active !== false, separate_invoices: !!form.separate_invoices, payment_type: form.payment_type || 'preauth' };
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
    // Match on the first guardian email (several can be stored, comma-separated).
    const firstEmail = (v) => (String(v || '').split(/[,;\s]+/).find(Boolean) || '').toLowerCase();
    const byEmail = {};
    customers.forEach((c) => String(c.email || '').split(/[,;\s]+/).filter(Boolean).forEach((e) => (byEmail[e.toLowerCase()] = c)));
    const groups = {};
    unlinked.forEach((s) => {
      const key = firstEmail(s.guardian_email) || 'name:' + (s.guardian_name || s.name).toLowerCase();
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
          .insert({ name: first.guardian_name || first.name, email: first.guardian_email || null, phone: first.guardian_phone || null, address: first.address || null })
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
          <button className="dp-btn" onClick={() => setYearFor(customers)} title="Receipts of fees paid in a year, for taxes — print or email all families"><FileText size={15} /> Year-end receipts</button>
          <button className="dp-btn" onClick={createFromStudents} title="Create a customer for each guardian of an unlinked student"><Users size={15} /> From Students</button>
          <button className="dp-btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Import</button>
          <button className="dp-btn" onClick={exportCSV}><Download size={15} /> Export</button>
          <button className="dp-btn dp-btn-primary" onClick={openAdd}><Plus size={15} /> Add Customer</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={onFile} />
        </div>
      </div>
      {flash && <p style={{ background: 'var(--dp-success-tint)', color: 'var(--dp-success)', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}

      <div style={{ ...styles.filterBar, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={styles.searchBox}>
          <Search size={15} color="var(--dp-ink-faint)" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Name, email, phone, student…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="dp-select" aria-label="How they pay" value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
          <option value="">All payment types</option>
          <option value="card">Card saved ({payCounts.card})</option>
          <option value="nocard">Card — not saved yet ({payCounts.nocard})</option>
          <option value="manual">Manual ({payCounts.manual})</option>
        </select>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} /> Owing only</label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--dp-ink-soft)', fontSize: 14 }}>No customers yet. Add one, import your Express Invoice customer list, or click "From Students".</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table className="dp-table">
            <thead>
              <tr>
                <th>Family</th>
                <th>Payment</th>
                <th>Next billing</th>
                <th>Last payment</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const bal = Number(balances[c.id]?.balance || 0);
                return (
                  <tr key={c.id} className="dp-row" style={{ cursor: 'pointer', opacity: c.active === false ? 0.55 : 1 }} onClick={() => openEdit(c)}>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 'var(--dp-text-caption)', color: 'var(--dp-ink-soft)', marginTop: 2 }}>{(studentsByCustomer[c.id] || []).filter((x) => (x.status || 'active') !== 'withdrawn').map((x) => x.name).join(', ') || 'No active students'}</div>
                    </td>
                    <td><PayChip c={c} /></td>
                    <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {nextBill[c.id] ? (
                        <>
                          <div>{formatDate(nextBill[c.id].date)}</div>
                          <div style={{ fontSize: 'var(--dp-text-caption)', color: 'var(--dp-ink-soft)' }} title="Estimated tuition with GST">≈ {money(nextBill[c.id].total)}</div>
                        </>
                      ) : <span style={{ color: 'var(--dp-ink-faint)' }}>—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {lastPaid[c.id] ? (
                        <>
                          <div>{formatDate(lastPaid[c.id].date)}</div>
                          <div style={{ fontSize: 'var(--dp-text-caption)', color: 'var(--dp-ink-soft)' }}>{money(lastPaid[c.id].amount)}</div>
                        </>
                      ) : <span style={{ color: 'var(--dp-ink-faint)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ color: bal > 0 ? 'var(--dp-danger)' : 'var(--dp-ink-faint)', fontWeight: bal > 0 ? 600 : 400 }}>{money(bal)}</div>
                      {bal > 0 && balances[c.id]?.oldest_due_date && <div style={{ fontSize: 'var(--dp-text-caption)', color: 'var(--dp-ink-soft)' }}>since {formatDate(balances[c.id].oldest_due_date)}</div>}
                      {credits[c.id] > 0.004 && <div style={{ fontSize: 'var(--dp-text-caption)', color: 'var(--dp-success)' }} title="Account credit from overpayments">Credit {money(credits[c.id])}</div>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setStatementFor(c)}><FileText size={13} /> Statement</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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
                  <Field label="Email(s) — separate with commas; invoices go to all"><input className="dp-input" style={{ width: '100%' }} value={f.email || ''} onChange={(e) => set({ email: e.target.value })} /></Field>
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
                    {students.filter((s) => s.status !== 'withdrawn' || modal.studentIds.includes(s.id)).length === 0 && <span style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>No students yet.</span>}
                    {students
                      .filter((s) => s.status !== 'withdrawn' || modal.studentIds.includes(s.id))
                      .slice()
                      .sort((a, b) => (modal.studentIds.includes(b.id) ? 1 : 0) - (modal.studentIds.includes(a.id) ? 1 : 0) || a.name.localeCompare(b.name))
                      .map((s) => {
                        const other = s.customer_id && s.customer_id !== modal.id ? customers.find((c) => c.id === s.customer_id) : null;
                        return (
                          <label key={s.id} style={{ display: 'flex', gap: 6, fontSize: 13, padding: '2px 0' }}>
                            <input type="checkbox" checked={modal.studentIds.includes(s.id)} onChange={(e) => setModal({ ...modal, studentIds: e.target.checked ? [...modal.studentIds, s.id] : modal.studentIds.filter((x) => x !== s.id) })} />
                            {s.name} {other ? <span style={{ color: 'var(--dp-ink-faint)' }}>· now in {other.name}</span> : null}
                          </label>
                        );
                      })}
                  </div>
                </Field>
                <Field label="How they pay tuition">
                  <select className="dp-select" style={{ width: '100%' }} value={f.payment_type || 'preauth'} onChange={(e) => set({ payment_type: e.target.value })}>
                    <option value="preauth">Pre-authorized credit card (charged on the billing date, no advance emails)</option>
                    <option value="manual">Pays manually — debit / cash (invoice 7 days before + reminder 3 days before)</option>
                  </select>
                  {(f.payment_type || 'preauth') === 'preauth' && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                      <a href="/preauth-form.pdf" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--dp-info)' }}>Print the card pre-authorization form (PDF)</a>
                      {f.id && !f.card_profile_code && <CardLinkButton customer={f} onSent={(at) => set({ card_link_sent_at: at })} />}
                    </div>
                  )}
                  {f.rb_account_id && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid #CFE3D0', background: 'var(--dp-success-tint)', fontSize: 12.5 }}>
                      <b style={{ fontWeight: 500 }}>Automatic tuition (TD Recurring Billing):</b> account #{f.rb_account_id}
                      {f.rb_amount ? ` · $${Number(f.rb_amount).toFixed(2)} ${Number(f.rb_months) === 3 ? 'every 3 months' : 'every month'}` : ''}
                      {f.rb_first_billing ? ` · from ${f.rb_first_billing}` : ''}
                      {f.rb_card_last4 ? ` · card ···${f.rb_card_last4}` : ''}
                      {f.rb_mode === 'test' ? ' · TEST account' : ''}
                      <div style={{ color: 'var(--dp-ink-soft)', marginTop: 2 }}>Set up online by the family. Change the amount or cancel it in TD Online Mart → Recurring billing.</div>
                    </div>
                  )}
                  {f.card_profile_code && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${f.card_declined_at ? '#E7B7B7' : '#CFE3D0'}`, background: f.card_declined_at ? '#FBEDEC' : 'var(--dp-success-tint)', fontSize: 12.5 }}>
                      <b style={{ fontWeight: 500 }}>Saved cards</b> (the <i>tuition</i> one is charged automatically)
                      <div style={{ margin: '4px 0 2px' }}><CardWallet customerId={f.id} /></div>
                      {f.card_declined_at && <div style={{ color: 'var(--dp-danger)', marginTop: 2 }}>Last charge declined {String(f.card_declined_at).slice(0, 10)}: {f.card_decline_message}</div>}
                      {f.card_legacy_rb_pending && (
                        <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--dp-warning-tint)', border: '1px solid var(--dp-warning-tint)', color: 'var(--dp-warning)' }}>
                          Saved through the card link. <b style={{ fontWeight: 500 }}>Close this family's old Recurring Billing account in TD Online Mart</b> before their next billing date so they aren't charged twice — automatic charges from the portal start only after you tick this:
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, color: 'var(--dp-ink)', fontWeight: 500 }}>
                            <input
                              type="checkbox"
                              onChange={async (e) => {
                                if (!e.target.checked) return;
                                await supabase.from('customers').update({ card_legacy_rb_pending: false }).eq('id', f.id);
                                set({ card_legacy_rb_pending: false });
                              }}
                            />
                            Old TD Recurring Billing is closed — start automatic tuition
                          </label>
                        </div>
                      )}
                      
                      <CardLinkButton customer={f} style={{ marginLeft: 6 }} onSent={(at) => set({ card_link_sent_at: at })} />
                    </div>
                  )}
                </Field>
                <label style={{ fontSize: 13, display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input type="checkbox" checked={!!f.separate_invoices} onChange={(e) => set({ separate_invoices: e.target.checked })} />
                  Separate invoice for each student (otherwise siblings with the same billing date share one invoice)
                </label>
                <label style={{ fontSize: 13, display: 'flex', gap: 6 }}><input type="checkbox" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
                <p style={{ fontSize: 12, color: 'var(--dp-ink-faint)', margin: '8px 0 0' }}>Email, address and contact name are shared with the students in this family — changing them here updates the students, and the other way round.</p>
                {modal.error && <p style={{ color: 'var(--dp-danger)', fontSize: 13 }}>{modal.error}</p>}
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
          <p style={{ fontSize: 13, color: 'var(--dp-ink-soft)', marginTop: 0 }}>Match the columns in your file. Names that already exist are skipped.</p>
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

      {statementFor && <StatementModal customer={statementFor} onClose={() => setStatementFor(null)} />}
      {yearFor && <YearReceiptsModal customers={yearFor} onClose={() => setYearFor(null)} />}
    </>
  );
}

// How a family pays, at a glance: manual (debit/cash), a saved card that's
// charged automatically, or pre-authorized card with no card saved yet.
function payKind(c) {
  if (c.payment_type === 'manual') return { key: 'manual', label: 'Manual' };
  const last4 = c.card_last4 || c.rb_card_last4;
  if (c.card_profile_code && c.card_declined_at) return { key: 'declined', label: `Declined${last4 ? ' ··' + last4 : ''}` };
  if (c.card_profile_code) return { key: 'card', label: `Card${last4 ? ' ··' + last4 : ''}` };
  if (c.rb_account_id) return { key: 'card', label: `TD RB${last4 ? ' ··' + last4 : ''}`, title: 'Card on TD Recurring Billing (old system)' };
  return { key: 'nocard', label: 'Card · not saved' };
}

const PAY_CHIP = {
  manual: { background: 'var(--dp-canvas)', color: 'var(--dp-ink-soft)', border: '1px solid var(--dp-line)' },
  card: { background: 'var(--dp-success-tint)', color: 'var(--dp-success)', border: '1px solid transparent' },
  declined: { background: '#FBEDEC', color: 'var(--dp-danger)', border: '1px solid transparent' },
  nocard: { background: '#FBF3E2', color: 'var(--dp-warning)', border: '1px solid transparent' },
};

function PayChip({ c }) {
  const k = payKind(c);
  return (
    <span title={k.title || (k.key === 'nocard' ? 'Pre-authorized card family, but no card is saved in the portal yet — send the card link' : undefined)} style={{ ...PAY_CHIP[k.key], display: 'inline-block', borderRadius: 999, padding: '2px 9px', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {k.label}
    </span>
  );
}
