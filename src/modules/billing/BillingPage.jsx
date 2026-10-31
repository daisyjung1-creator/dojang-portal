import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Mail, Wallet, Bell, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { todayISO, currentCycleStart, nextDueDate, billingAnchor, addDaysISO } from '../../lib/billingDates';
import { money, formatDate, calcTotals } from '../../lib/invoiceUtils';
import { proposeInvoices, invoiceHeader, familyName, isBillable, tuitionLines } from '../../lib/tuitionBilling';
import { loadSettings, loadCustomers, saveInvoice, queueEmail, fetchAll, payInvoicesInFull, usePaymentMethods } from '../invoices/api';
import { StatusPill } from '../invoices/InvoicesPage';
import InvoicePreview from '../invoices/InvoicePreview';
import ConfirmDialog from '../../components/ConfirmDialog';

const tag = (text, c) => (
  <span style={{ marginLeft: 6, fontSize: 10.5, color: c[0], border: `1px solid ${c[2]}`, background: c[1], borderRadius: 999, padding: '1px 6px', whiteSpace: 'nowrap' }}>{text}</span>
);
const GREEN = ['#2A5A30', '#E8F1E9', '#BFDCC3'];
const BLUE = ['#1E4566', '#E6F0F6', '#B9D3E4'];
const GREY = ['#5B5F56', '#F1EFE7', '#DEDACC'];
const PURPLE = ['#4B3A86', '#EEEAF6', '#D2C9EA'];

export default function BillingPage() {
  const today = todayISO();
  const methods = usePaymentMethods();
  const [settings, setSettings] = useState(null);
  const [students, setStudents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cycleInvoices, setCycleInvoices] = useState({}); // "studentId|cycle" → invoice summary
  const [tuitionInvoices, setTuitionInvoices] = useState([]); // open tuition invoices
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('date');
  const [selected, setSelected] = useState({}); // proposal key → bool
  const [emailNow, setEmailNow] = useState(true);
  const [paySel, setPaySel] = useState({});
  const [payMethod, setPayMethod] = useState('');
  const [emailReceipts, setEmailReceipts] = useState(false);
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const since = addDaysISO(today, -400);
    const [s, c, { data: st }, { data: lines }] = await Promise.all([
      loadSettings(),
      loadCustomers(),
      supabase.from('students').select('*').order('name'),
      fetchAll(() => supabase.from('invoice_lines').select('invoice_id, student_id, cycle_start, line_kind').not('cycle_start', 'is', null).gte('cycle_start', since)),
    ]);
    const ids = Array.from(new Set((lines || []).map((l) => l.invoice_id)));
    let invs = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await supabase.from('invoice_summary').select('*').in('id', ids.slice(i, i + 150));
      invs = invs.concat(data || []);
    }
    const byId = Object.fromEntries(invs.map((i) => [i.id, i]));
    const map = {};
    (lines || []).forEach((l) => {
      const inv = byId[l.invoice_id];
      if (inv && !inv.voided && l.line_kind === 'tuition') map[`${l.student_id}|${l.cycle_start}`] = inv;
    });
    setSettings(s);
    setCustomers(c);
    setStudents(st || []);
    setCycleInvoices(map);
    setTuitionInvoices(invs.filter((i) => !i.voided));
    setLoading(false);
  }

  const invoicedCycles = useMemo(() => new Set(Object.keys(cycleInvoices)), [cycleInvoices]);
  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);

  const proposals = useMemo(
    () => (settings ? proposeInvoices({ students, customers, invoicedCycles, today, settings }) : []),
    [students, customers, invoicedCycles, settings]
  );
  // Billing dates already passed are left unticked (they may have been billed in Express Invoice).
  useEffect(() => {
    setSelected(Object.fromEntries(proposals.map((p) => [p.key, !p.past])));
  }, [proposals]);

  const reminderLead = Number(settings?.reminder_lead_days ?? 3);
  const reminders = tuitionInvoices.filter(
    (i) => Number(i.balance) > 0 && !i.reminded_at && i.customer_email && i.due_date && i.due_date > today && i.due_date <= addDaysISO(today, reminderLead)
  );
  const dueUnpaid = tuitionInvoices.filter((i) => Number(i.balance) > 0 && (i.due_date || i.invoice_date) <= today).sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  useEffect(() => {
    setPaySel(Object.fromEntries(dueUnpaid.map((i) => [i.id, true])));
  }, [tuitionInvoices]);
  useEffect(() => {
    if (!payMethod && methods.length) setPayMethod(methods[0]);
  }, [methods]);

  const rows = useMemo(() => {
    const list = students
      .filter((s) => (s.status || 'active') !== 'withdrawn')
      .map((s) => {
        const anchor = billingAnchor(s);
        const cycle = anchor ? currentCycleStart(s, today) : null;
        const next = anchor ? nextDueDate(s, today) : null;
        const cycleInv = cycle && cycleInvoices[`${s.id}|${cycle}`];
        const nextInv = next && cycleInvoices[`${s.id}|${next}`];
        // Older cycles were billed in Express Invoice, so only offer the current
        // cycle if it started in the last week; otherwise the next one.
        const recent = cycle && cycle >= addDaysISO(today, -7);
        const toInvoice = recent && !cycleInv ? cycle : !nextInv ? next : null;
        return { s, family: custById[s.customer_id], cycle, next, cycleInv, nextInv, recent, toInvoice };
      });
    const fam = (r) => (r.family?.name || r.s.name).toLowerCase();
    return list.sort((a, b) => {
      if (sortBy === 'name') return a.s.name.localeCompare(b.s.name);
      if (sortBy === 'family') return fam(a) === fam(b) ? a.s.name.localeCompare(b.s.name) : fam(a) < fam(b) ? -1 : 1;
      // Billing date: day of month of the next billing, then name. Staff / no date last.
      const ka = a.s.billing_exempt || !a.next ? '9' : a.next;
      const kb = b.s.billing_exempt || !b.next ? '9' : b.next;
      return ka === kb ? a.s.name.localeCompare(b.s.name) : ka < kb ? -1 : 1;
    });
  }, [students, custById, cycleInvoices, sortBy]);

  const stats = useMemo(() => {
    const billable = students.filter(isBillable);
    const monthly = billable.reduce((n, s) => n + Number(s.tuition) / (s.plan === '3 Months' ? 3 : 1), 0);
    const unpaid = tuitionInvoices.filter((i) => Number(i.balance) > 0);
    return { billable: billable.length, monthly, unpaidCount: unpaid.length, unpaidAmount: unpaid.reduce((n, i) => n + Number(i.balance), 0) };
  }, [students, tuitionInvoices]);

  async function createInvoices(list) {
    setBusy('create');
    let made = 0;
    let mailed = 0;
    try {
      for (const p of list) {
        const header = invoiceHeader(p, settings, today);
        const inv = await saveInvoice(header, p.lines, null);
        made++;
        if (emailNow && header.customer_email) {
          await queueEmail('invoice', header.customer_email, { invoice_id: inv.id });
          mailed++;
        }
      }
      setFlash(`Created ${made} invoice${made === 1 ? '' : 's'}${emailNow ? `, ${mailed} emailed` : ''}.`);
    } catch (e) {
      setFlash(`Stopped after ${made} invoices: ${e.message}`);
    }
    setBusy('');
    loadAll();
  }

  async function sendReminders() {
    setBusy('remind');
    let n = 0;
    for (const inv of reminders) {
      try {
        await queueEmail('invoice', inv.customer_email, { invoice_id: inv.id, reminder: true });
        n++;
      } catch (e) {
        /* keep going */
      }
    }
    setFlash(`${n} reminder${n === 1 ? '' : 's'} queued.`);
    setBusy('');
    setTimeout(loadAll, 1500);
  }

  async function recordPayments() {
    const list = dueUnpaid.filter((i) => paySel[i.id]);
    setBusy('pay');
    try {
      const done = await payInvoicesInFull(list, payMethod, today, emailReceipts);
      setFlash(`Recorded ${done.length} payment${done.length === 1 ? '' : 's'} (${payMethod}).`);
    } catch (e) {
      setFlash('Could not record all payments: ' + e.message);
    }
    setBusy('');
    loadAll();
  }

  // Invoice one student's current (or next) cycle now. Siblings with the same
  // billing date who aren't invoiced yet go on the same invoice.
  function createOne(r) {
    const due = r.toInvoice;
    const together = r.family && !r.family.separate_invoices;
    const kids = students.filter(
      (x) =>
        (x.id === r.s.id || (together && x.customer_id === r.family.id)) &&
        isBillable(x) &&
        !invoicedCycles.has(`${x.id}|${due}`) &&
        (currentCycleStart(x, due) === due)
    );
    const lines = kids.sort((a, b) => a.name.localeCompare(b.name)).flatMap((x) => tuitionLines(x, due, settings));
    setConfirm({ list: [{ key: 'one', customer: r.family || null, students: kids, due_date: due, lines, totals: calcTotals(lines, settings.gst_rate ?? 5) }] });
  }

  if (loading || !settings) return <p style={{ color: '#5B5F56' }}>Loading…</p>;
  const selectedList = proposals.filter((p) => selected[p.key]);
  const lead = Number(settings.invoice_lead_days ?? 7);

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Billing</h1>
          <p style={styles.subtitle}>Tuition invoices from each student's billing date · invoices {lead} days before, reminders {reminderLead} days before</p>
        </div>
        <button className="dp-btn" onClick={loadAll}><RefreshCw size={14} /> Refresh</button>
      </div>

      {flash && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
        <Metric label="Students billed" value={stats.billable} />
        <Metric label="Tuition per month (before GST)" value={money(stats.monthly)} />
        <Metric label="Unpaid tuition invoices" value={`${stats.unpaidCount} · ${money(stats.unpaidAmount)}`} />
        <Metric label={`To invoice (next ${Number(settings.invoice_lead_days ?? 7)} days)`} value={proposals.length} />
      </div>

      {/* 1 ── Ready to invoice */}
      <Panel icon={<FileText size={15} />} title={`Ready to invoice — billing in the next ${lead} days (${proposals.length})`}>
        {proposals.length === 0 ? (
          <Empty>Nothing to invoice right now.</Empty>
        ) : (
          <>
            <table className="dp-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={proposals.every((p) => selected[p.key])} onChange={(e) => setSelected(Object.fromEntries(proposals.map((p) => [p.key, e.target.checked])))} /></th>
                  <th>Billing date</th>
                  <th>Family</th>
                  <th>Students</th>
                  <th style={{ textAlign: 'right' }}>Total (incl. GST)</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.key} className="dp-row" style={{ opacity: selected[p.key] ? 1 : 0.6 }}>
                    <td><input type="checkbox" checked={!!selected[p.key]} onChange={(e) => setSelected({ ...selected, [p.key]: e.target.checked })} /></td>
                    <td>
                      {formatDate(p.due_date)}
                      {p.past && tag('already passed', GREY)}
                    </td>
                    <td>{familyName(p)}{!p.customer?.email && tag('no email', GREY)}</td>
                    <td style={{ fontSize: 12.5, color: '#5B5F56' }}>{p.lines.map((l) => (l.line_kind === 'tuition' ? l.description.split(' — ')[0] : null)).filter(Boolean).join(', ')}
                      {p.lines.some((l) => l.line_kind === 'discount') && tag(`-${settings.family_discount_pct ?? 20}%`, PURPLE)}
                      {p.lines.some((l) => l.line_kind === 'subsidy') && tag('subsidy', GREEN)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{money(p.totals.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ActionBar>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={emailNow} onChange={(e) => setEmailNow(e.target.checked)} /> Email them to families now
              </label>
              <button className="dp-btn dp-btn-primary" disabled={!selectedList.length || !!busy} onClick={() => setConfirm({ list: selectedList })}>
                <FileText size={14} /> {busy === 'create' ? 'Creating…' : `Create ${selectedList.length} invoice${selectedList.length === 1 ? '' : 's'}`}
              </button>
            </ActionBar>
          </>
        )}
      </Panel>

      {/* 2 ── Reminders */}
      <Panel icon={<Bell size={15} />} title={`Payment reminders — billing in the next ${reminderLead} days (${reminders.length})`}>
        {reminders.length === 0 ? (
          <Empty>No reminders to send.</Empty>
        ) : (
          <>
            <InvoiceList list={reminders} onOpen={setPreviewId} />
            <ActionBar>
              <span style={{ fontSize: 12.5, color: '#5B5F56' }}>Re-sends the invoice with the reminder wording (Invoice Settings → Email templates).</span>
              <button className="dp-btn dp-btn-primary" disabled={!!busy} onClick={sendReminders}><Mail size={14} /> {busy === 'remind' ? 'Sending…' : `Send ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`}</button>
            </ActionBar>
          </>
        )}
      </Panel>

      {/* 3 ── Due: record the card charges */}
      <Panel icon={<Wallet size={15} />} title={`Due — record payments (${dueUnpaid.length})`}>
        {dueUnpaid.length === 0 ? (
          <Empty>No unpaid tuition invoices that are due.</Empty>
        ) : (
          <>
            <InvoiceList list={dueUnpaid} onOpen={setPreviewId} sel={paySel} setSel={setPaySel} />
            <ActionBar>
              <select className="dp-select" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {methods.map((m) => <option key={m}>{m}</option>)}
              </select>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={emailReceipts} onChange={(e) => setEmailReceipts(e.target.checked)} /> Email receipts
              </label>
              <button className="dp-btn dp-btn-primary" disabled={!dueUnpaid.some((i) => paySel[i.id]) || !!busy} onClick={recordPayments}>
                <Wallet size={14} /> {busy === 'pay' ? 'Saving…' : `Mark ${dueUnpaid.filter((i) => paySel[i.id]).length} paid in full`}
              </button>
            </ActionBar>
          </>
        )}
      </Panel>

      {/* Roster */}
      <div style={{ ...styles.filterBar, alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 13, color: '#5B5F56' }}>Sort by</span>
        <select className="dp-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date">Billing date</option>
          <option value="family">Family</option>
          <option value="name">Student name</option>
        </select>
      </div>
      <div style={styles.card}>
        <table className="dp-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Family</th>
              <th>Plan · Tuition</th>
              <th>This cycle</th>
              <th>Next billing</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.s;
              return (
                <tr key={s.id} className="dp-row" style={{ opacity: s.billing_exempt ? 0.6 : 1 }}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ fontSize: 12.5, color: '#5B5F56' }}>{r.family?.name || '—'}{r.family?.separate_invoices && tag('separate', GREY)}</td>
                  <td>
                    {s.billing_exempt ? (
                      tag('Staff — no invoice', BLUE)
                    ) : (
                      <>
                        {s.plan || '1 Month'} · {s.tuition ? money(s.tuition) : <span style={{ color: '#9A2B2B' }}>not set</span>}
                        {s.classes_per_week ? tag(`${s.classes_per_week}x/wk`, GREY) : null}
                        {s.family_discount && tag(`-${settings.family_discount_pct ?? 20}%`, PURPLE)}
                        {s.subsidy && tag('subsidy', GREEN)}
                      </>
                    )}
                  </td>
                  <td>
                    {r.cycle && !s.billing_exempt ? (
                      r.cycleInv ? (
                        <button className="dp-btn" style={{ padding: '1px 6px', border: 'none', background: 'none' }} onClick={() => setPreviewId(r.cycleInv.id)}>
                          <span style={{ fontSize: 12, color: '#5B5F56', marginRight: 6 }}>#{r.cycleInv.invoice_number}</span>
                          <StatusPill status={r.cycleInv.status} />
                        </button>
                      ) : r.recent ? (
                        <span style={{ fontSize: 12.5, color: '#9A2B2B' }}>Not invoiced ({formatDate(r.cycle)})</span>
                      ) : (
                        <span style={{ fontSize: 12.5, color: '#8A8D84' }} title="Started before billing moved to the portal">Since {formatDate(r.cycle)}</span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {r.next && !s.billing_exempt ? formatDate(r.next) : '—'}
                    {r.nextInv && <span style={{ marginLeft: 6 }}><StatusPill status={r.nextInv.status} /></span>}
                  </td>
                  <td>
                    {isBillable(s) && r.toInvoice && (
                      <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => createOne(r)} title="Create this invoice now">
                        <FileText size={12} /> Invoice {formatDate(r.toInvoice)}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmDialog
          message={`Create ${confirm.list.length} invoice${confirm.list.length === 1 ? '' : 's'} (${money(confirm.list.reduce((n, p) => n + p.totals.total, 0))} total)${emailNow ? ' and email them' : ''}?`}
          confirmLabel="Create"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const list = confirm.list;
            setConfirm(null);
            createInvoices(list);
          }}
        />
      )}

      {previewId && (
        <InvoicePreview invoiceId={previewId} settings={settings} onClose={() => setPreviewId(null)} onEdit={() => setFlash('To edit, open the invoice from the Invoices page.')} onPay={() => setFlash('Use "Mark paid" above, or Apply Payment on the Invoices page.')} onChanged={loadAll} />
      )}
    </>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.metricCard}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={{ ...styles.metricValue, fontSize: 20 }}>{value}</p>
    </div>
  );
}

function Panel({ icon, title, children }) {
  return (
    <div style={{ ...styles.card, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #EDEAE0', fontSize: 14, fontWeight: 500 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p style={{ padding: '12px 14px', color: '#8A8D84', fontSize: 13, margin: 0 }}>{children}</p>;
}

function ActionBar({ children }) {
  return <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', padding: '10px 14px', borderTop: '1px solid #EDEAE0', flexWrap: 'wrap' }}>{children}</div>;
}

function InvoiceList({ list, onOpen, sel, setSel }) {
  return (
    <table className="dp-table">
      <thead>
        <tr>
          {sel && <th style={{ width: 30 }}><input type="checkbox" checked={list.every((i) => sel[i.id])} onChange={(e) => setSel(Object.fromEntries(list.map((i) => [i.id, e.target.checked])))} /></th>}
          <th>Billing date</th>
          <th>Invoice</th>
          <th>Family</th>
          <th style={{ textAlign: 'right' }}>Balance</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {list.map((i) => (
          <tr key={i.id} className="dp-row">
            {sel && <td><input type="checkbox" checked={!!sel[i.id]} onChange={(e) => setSel({ ...sel, [i.id]: e.target.checked })} /></td>}
            <td>{formatDate(i.due_date || i.invoice_date)}</td>
            <td><button className="dp-btn" style={{ padding: '1px 6px', fontSize: 12.5 }} onClick={() => onOpen(i.id)}>#{i.invoice_number}</button></td>
            <td>{i.customer_name}{!i.customer_email && tag('no email', GREY)}</td>
            <td style={{ textAlign: 'right' }}>{money(i.balance)}</td>
            <td><StatusPill status={i.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
