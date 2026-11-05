import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Trash2, Pencil, Check, ChevronDown, ChevronRight, ChevronLeft, AlertTriangle, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import ConfirmDialog from '../../components/ConfirmDialog';
import { money, formatDate, localISO } from '../../lib/invoiceUtils';
import { PrintPortal } from '../invoices/InvoicePreview';
import { calcPayslip, ytdTotals, ratesFor, PAY_TYPES, PAYROLL_RATES, parseHours } from '../../lib/payroll';
import PayslipDocument from './PayslipDocument';
import { queueEmail } from '../invoices/api';

// Queue payslip emails (the PDF is made and attached by the email function).
async function emailPayslips(list, empById) {
  let sent = 0;
  const skipped = [];
  for (const s of list) {
    const e = empById[s.employee_id];
    if (!e?.email) {
      skipped.push(e?.name || '?');
      continue;
    }
    await queueEmail('payslip', e.email, { payslip_id: s.id });
    sent++;
  }
  return { sent, skipped };
}
const emailNote = ({ sent, skipped }) => `${sent} payslip${sent === 1 ? '' : 's'} emailed (PDF attached).${skipped.length ? ' No email on file: ' + skipped.join(', ') + '.' : ''}`;

const pad = (n) => String(n).padStart(2, '0');
function monthRange(offset = -1) {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  return { from: `${m.getFullYear()}-${pad(m.getMonth() + 1)}-01`, to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` };
}

export default function PayrollPage() {
  const [tab, setTab] = useState('run');
  const [employees, setEmployees] = useState([]);
  const [slips, setSlips] = useState([]);
  const [settings, setSettings] = useState({});
  const [flash, setFlash] = useState({ text: '', error: false });
  const [view, setView] = useState(null);
  const [editEmp, setEditEmp] = useState(null);
  const say = (text, error = false) => setFlash({ text, error });

  async function loadAll() {
    const [{ data: e }, { data: s }, { data: st }] = await Promise.all([
      supabase.from('payroll_employees').select('*').order('name'),
      supabase.from('payslips').select('*').order('pay_date', { ascending: false }),
      supabase.from('payroll_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    setEmployees(e || []);
    setSlips(s || []);
    setSettings(st || {});
  }
  useEffect(() => {
    loadAll();
  }, []);

  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Payroll</h1>
          <p style={styles.subtitle}>Enter hours worked → payslips with vacation pay, CPP and EI</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          ['run', 'Run payroll'],
          ['slips', `Payslips (${slips.length})`],
          ['staff', 'Staff & settings'],
        ].map(([k, l]) => (
          <button key={k} className={'dp-btn' + (tab === k ? ' dp-btn-dark' : '')} style={tab === k ? { background: '#20241F', color: '#fff', borderColor: '#20241F' } : undefined} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {flash.text && <p style={{ background: flash.error ? '#FBEAEA' : '#E8F1E9', color: flash.error ? '#9A2B2B' : '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash.text}</p>}

      {tab === 'run' && <RunPayroll employees={employees} slips={slips} onSaved={async (ids, note = '') => { await loadAll(); say(`${ids.length} payslip${ids.length === 1 ? '' : 's'} saved.${note}`); setTab('slips'); }} onError={(m) => say(m, true)} />}
      {tab === 'slips' && <SlipList slips={slips} empById={empById} onView={setView} onDeleted={() => { loadAll(); say('Payslip deleted.'); }} onEmailed={(m) => { loadAll(); say(m); }} />}
      {tab === 'staff' && (
        <StaffTab
          employees={employees}
          settings={settings}
          onEdit={setEditEmp}
          onSettingsSaved={async () => { await loadAll(); say('Company details saved.'); }}
        />
      )}

      {view && (
        <PayslipView
          slip={view}
          employee={empById[view.employee_id]}
          ytd={ytdTotals(slips, view.employee_id, view.pay_date)}
          settings={settings}
          onClose={() => setView(null)}
          onEmailed={loadAll}
        />
      )}
      {editEmp && (
        <EmployeeModal
          employee={editEmp}
          onClose={() => setEditEmp(null)}
          onSaved={async () => { setEditEmp(null); await loadAll(); say('Staff saved.'); }}
        />
      )}
    </>
  );
}

// ── Run payroll ──────────────────────────────────────────────────────────────
function RunPayroll({ employees, slips, onSaved, onError }) {
  // One run per month: pick the month worked; the period is that whole month
  // and pay day defaults to the 1st of the next month.
  const [month, setMonth] = useState(monthRange(-1).from.slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = `${month}-${pad(new Date(y, m, 0).getDate())}`;
  const defaultPay = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const [payOverride, setPayOverride] = useState({});
  const payDate = payOverride[month] || defaultPay;
  const setPayDate = (d) => setPayOverride((o) => ({ ...o, [month]: d }));
  const shiftMonth = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  const [rows, setRows] = useState({});
  const [open, setOpen] = useState({});
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const active = employees.filter((e) => e.active !== false);

  // Hours are typed in (the clock-in app's times include late log-outs that
  // aren't paid). Everyone with an hourly rate starts ticked.
  useEffect(() => {
    setRows(() => {
      const next = {};
      active.forEach((e) => {
        const done = slips.find((x) => x.employee_id === e.id && x.pay_date === payDate);
        if (done) {
          next[e.id] = {
            include: true,
            hours: Number(done.hours),
            rate: Number(done.rate),
            overtime_hours: Number(done.overtime_hours || 0),
            overtime_rate: Number(done.overtime_rate || 0),
            bonus: Number(done.bonus || 0),
            sick_pay: Number(done.sick_pay || 0),
            expenses: Number(done.expenses || 0),
            tax: Number(done.tax || 0),
            other_deductions: Number(done.other_deductions || 0),
            notes: done.notes || '',
          };
          return;
        }
        next[e.id] = {
          include: !!e.hourly_rate,
          hours: '',
          rate: e.hourly_rate ?? '',
          overtime_hours: 0,
          overtime_rate: e.hourly_rate ? Math.round(e.hourly_rate * 150) / 100 : 0,
          bonus: 0,
          sick_pay: 0,
          expenses: 0,
          tax: '',
          other_deductions: 0,
          notes: '',
        };
      });
      return next;
    });
  }, [employees, payDate, slips.length]);

  const calc = (e) => {
    const r = rows[e.id];
    if (!r) return null;
    const ytd = ytdTotals(slips.filter((s) => s.pay_date !== payDate), e.id, payDate, { inclusive: false });
    return calcPayslip({ ...r, pay_date: payDate, pay_type: e.pay_type, vacation_pct: e.vacation_pct ?? 4 }, ytd);
  };
  const set = (id, k, v) => setRows((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));
  const chosen = active.filter((e) => rows[e.id]?.include && parseHours(rows[e.id]?.hours) > 0);
  const missingHours = active.filter((e) => rows[e.id]?.include && !(parseHours(rows[e.id]?.hours) > 0));
  const existing = chosen.filter((e) => slips.some((s) => s.employee_id === e.id && s.pay_date === payDate));

  async function save() {
    setSaving(true);
    const out = chosen.map((e) => {
      const r = rows[e.id];
      const c = calc(e);
      return {
        employee_id: e.id,
        pay_date: payDate,
        period_start: from,
        period_end: to,
        pay_type: e.pay_type,
        payment_method: e.payment_method,
        hours: Math.round(parseHours(r.hours) * 10000) / 10000,
        rate: Number(r.rate) || 0,
        overtime_hours: Math.round(parseHours(r.overtime_hours) * 10000) / 10000,
        overtime_rate: Number(r.overtime_rate) || 0,
        notes: r.notes || null,
        ...c,
      };
    });
    const { data: saved, error } = await supabase.from('payslips').upsert(out, { onConflict: 'employee_id,pay_date' }).select();
    if (error) {
      setSaving(false);
      return onError('Could not save: ' + error.message);
    }
    let note = '';
    if (sendEmail) {
      try {
        note = ' ' + emailNote(await emailPayslips(saved || [], Object.fromEntries(employees.map((e) => [e.id, e]))));
      } catch (err) {
        note = ' Could not email: ' + (err.message || err);
      }
    }
    setSaving(false);
    onSaved(out.map((o) => o.employee_id), note);
  }

  const rates = ratesFor(payDate);
  // What goes to CRA for this pay date: employee + employer CPP, EI (employer
  // pays 1.4×) and income tax — due by the 15th of the month after pay day.
  const remit = chosen.reduce(
    (t, e) => {
      const c = calc(e);
      return { cpp: t.cpp + c.cpp, ei: t.ei + c.ei, tax: t.tax + c.tax, net: t.net + c.net, gross: t.gross + c.gross };
    },
    { cpp: 0, ei: 0, tax: 0, net: 0, gross: 0 }
  );
  const r2 = (n) => Math.round(n * 100) / 100;
  const remitTotal = r2(remit.cpp * 2 + remit.ei + r2(remit.ei * 1.4) + remit.tax);
  const pd = new Date(payDate + 'T00:00:00');
  const remitDue = new Date(pd.getFullYear(), pd.getMonth() + 1, 15);
  const inp = (w) => ({ width: w, padding: '4px 6px', fontSize: 13, textAlign: 'right' });

  return (
    <>
      <div style={{ ...styles.card, padding: 14, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Month worked</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="dp-btn" style={{ padding: '6px 9px' }} aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={15} /></button>
            <div style={{ minWidth: 150, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>{monthLabel}</div>
            <button className="dp-btn" style={{ padding: '6px 9px' }} aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={15} /></button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Pay date</div>
          <input type="date" className="dp-input" value={payDate} onChange={(e) => e.target.value && setPayDate(e.target.value)} />
        </div>
        <span style={{ fontSize: 12, color: '#8A8D84', marginBottom: 14, marginLeft: 'auto' }}>
          {String(payDate).slice(0, 4)}: CPP {rates.cppRate}% over ${rates.cppExemption.toLocaleString()}/yr · EI {rates.eiRate}% · vacation pay 4% · income tax federal + Alberta (basic TD1)
        </span>
      </div>

      {!PAYROLL_RATES[Number(String(payDate).slice(0, 4))] && (
        <p style={{ background: '#FAEEDA', color: '#854F0B', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={15} /> {String(payDate).slice(0, 4)} CPP / EI / tax rates haven’t been added yet — this uses {Math.max(...Object.keys(PAYROLL_RATES).map(Number))} rates. Check the amounts against CRA’s calculator.
        </p>
      )}
      {active.length === 0 ? (
        <div style={{ ...styles.card, padding: 20, fontSize: 14, color: '#5B5F56' }}>Add staff in “Staff & settings” first.</div>
      ) : (
        <div style={styles.card}>
          <table className="dp-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Staff</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Vacation</th>
                <th style={{ textAlign: 'right' }}>Bonus / other</th>
                <th style={{ textAlign: 'right' }}>Gross</th>
                <th style={{ textAlign: 'right' }}>CPP</th>
                <th style={{ textAlign: 'right' }}>EI</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Net pay</th>
              </tr>
            </thead>
            <tbody>
              {active.map((e) => {
                const r = rows[e.id];
                const c = calc(e);
                return (
                  <React.Fragment key={e.id}>
                    <tr className="dp-row" style={{ opacity: r?.include ? 1 : 0.55 }}>
                      <td><input type="checkbox" aria-label={`Include ${e.name}`} checked={!!r?.include} onChange={(ev) => set(e.id, 'include', ev.target.checked)} /></td>
                      <td>
                        <button onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500, fontSize: 13.5, color: '#20241F' }}>
                          {open[e.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {e.name}
                        </button>
                        <div style={{ fontSize: 11.5, color: '#8A8D84', marginLeft: 17 }}>
                          {e.hourly_rate ? `${money(e.hourly_rate)}/h · ${e.payment_method}` : <span style={{ color: '#9A2B2B' }}>no hourly rate</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}><input className="dp-input" style={inp(78)} inputMode="decimal" placeholder="0 or h:mm" title="Hours as a number (36.52) or hours:minutes (36:31)" value={r?.hours ?? ''} onChange={(ev) => set(e.id, 'hours', ev.target.value)} />
                        {String(r?.hours ?? '').includes(':') && <div style={{ fontSize: 11, color: '#8A8D84' }}>= {parseHours(r.hours).toFixed(3)} h</div>}</td>
                      <td style={{ textAlign: 'right' }}><input className="dp-input" style={inp(62)} type="number" step="0.01" value={r?.rate ?? ''} onChange={(ev) => set(e.id, 'rate', ev.target.value)} /></td>
                      <td style={{ textAlign: 'right' }}>{c ? money(c.vacation_pay) : ''}</td>
                      <td style={{ textAlign: 'right' }}><input className="dp-input" style={inp(70)} type="number" step="0.01" value={r?.bonus ?? ''} onChange={(ev) => set(e.id, 'bonus', ev.target.value)} /></td>
                      <td style={{ textAlign: 'right' }}>{c ? money(c.gross) : ''}</td>
                      <td style={{ textAlign: 'right' }}>{c ? money(c.cpp) : ''}</td>
                      <td style={{ textAlign: 'right' }}>{c ? money(c.ei) : ''}</td>
                      <td style={{ textAlign: 'right' }}><input className="dp-input" style={inp(62)} type="number" step="0.01" title="Worked out automatically (federal + Alberta). Type an amount to use your own." placeholder={c ? c.tax.toFixed(2) : 'auto'} value={r?.tax ?? ''} onChange={(ev) => set(e.id, 'tax', ev.target.value)} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{c ? money(c.net) : ''}</td>
                    </tr>
                    {open[e.id] && r && (
                      <tr>
                        <td></td>
                        <td colSpan={10} style={{ background: '#FAF8F2' }}>
                          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, alignItems: 'center', marginBottom: 8 }}>
                            <label>Overtime hrs <input className="dp-input" style={inp(60)} inputMode="decimal" value={r.overtime_hours} onChange={(ev) => set(e.id, 'overtime_hours', ev.target.value)} /></label>
                            <label>OT rate <input className="dp-input" style={inp(60)} type="number" step="0.01" value={r.overtime_rate} onChange={(ev) => set(e.id, 'overtime_rate', ev.target.value)} /></label>
                            <label>Sick pay <input className="dp-input" style={inp(70)} type="number" step="0.01" value={r.sick_pay} onChange={(ev) => set(e.id, 'sick_pay', ev.target.value)} /></label>
                            <label>Expenses <input className="dp-input" style={inp(70)} type="number" step="0.01" value={r.expenses} onChange={(ev) => set(e.id, 'expenses', ev.target.value)} /></label>
                            <label>Other deductions <input className="dp-input" style={inp(70)} type="number" step="0.01" value={r.other_deductions} onChange={(ev) => set(e.id, 'other_deductions', ev.target.value)} /></label>
                            <label style={{ flex: 1, minWidth: 200 }}>Note on payslip <input className="dp-input" style={{ width: '100%', padding: '4px 6px', fontSize: 13 }} value={r.notes} onChange={(ev) => set(e.id, 'notes', ev.target.value)} /></label>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {chosen.length > 0 && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid #EDEAE0', background: '#FAF8F2', fontSize: 12.5, color: '#5B5F56', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <span>Total gross <b style={{ color: '#20241F' }}>{money(remit.gross)}</b></span>
              <span>Total net pay <b style={{ color: '#20241F' }}>{money(remit.net)}</b></span>
              <span title={`CPP ${money(remit.cpp)} × 2 + EI ${money(remit.ei)} + employer EI ${money(remit.ei * 1.4)} + tax ${money(remit.tax)}`}>
                CRA remittance <b style={{ color: '#20241F' }}>{money(remitTotal)}</b> due {remitDue.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                <span style={{ color: '#8A8D84' }}> (CPP {money(remit.cpp * 2)} · EI {money(remit.ei + r2(remit.ei * 1.4))} · tax {money(remit.tax)})</span>
              </span>
            </div>
          )}
          <div style={{ padding: '12px 14px', borderTop: '1px solid #EDEAE0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {missingHours.length > 0 && (
              <span style={{ fontSize: 12.5, color: '#5B5F56' }}>Enter hours for {missingHours.map((e) => e.name.split(' ')[0]).join(', ')}.</span>
            )}
            {existing.length > 0 && (
              <span style={{ fontSize: 12.5, color: '#854F0B', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={14} /> {existing.map((e) => e.name.split(' ')[0]).join(', ')} already {existing.length === 1 ? 'has a payslip' : 'have payslips'} for {formatDate(payDate)} — saving replaces {existing.length === 1 ? 'it' : 'them'}.
              </span>
            )}
            <label style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email each payslip (PDF) to the staff member
            </label>
            <button className="dp-btn dp-btn-primary" disabled={!chosen.length || saving} onClick={save}>
              <Check size={15} /> {saving ? 'Saving…' : `Save ${chosen.length} payslip${chosen.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Payslip list ─────────────────────────────────────────────────────────────
function SlipList({ slips, empById, onView, onDeleted, onEmailed }) {
  const [emp, setEmp] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [confirm, setConfirm] = useState(null);
  const years = [...new Set(slips.map((s) => String(s.pay_date).slice(0, 4)))].sort().reverse();
  const list = slips.filter((s) => (!emp || s.employee_id === emp) && (!year || String(s.pay_date).startsWith(year)));
  const tot = (k) => list.reduce((t, s) => t + Number(s[k] || 0), 0);
  const latest = list.map((s) => s.pay_date).sort().pop();
  const unsent = list.filter((s) => s.pay_date === latest && !s.emailed_at);
  async function send(items) {
    try {
      onEmailed(emailNote(await emailPayslips(items, empById)));
    } catch (err) {
      onEmailed('Could not email: ' + (err.message || err));
    }
  }
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select className="dp-select" value={emp} onChange={(e) => setEmp(e.target.value)}>
          <option value="">All staff</option>
          {Object.values(empById).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className="dp-select" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {(years.includes(year) || !year ? years : [year, ...years]).map((y) => <option key={y}>{y}</option>)}
        </select>
        {unsent.length > 0 && (
          <button className="dp-btn dp-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => send(unsent)}>
            <Mail size={14} /> Email {unsent.length} unsent payslip{unsent.length === 1 ? '' : 's'} for {formatDate(latest)}
          </button>
        )}
      </div>
      <div style={styles.card}>
        {list.length === 0 ? (
          <p style={{ padding: 20, fontSize: 14, color: '#5B5F56' }}>No payslips yet.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Pay date</th>
                <th>Staff</th>
                <th>Period</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
                <th style={{ textAlign: 'right' }}>Gross</th>
                <th style={{ textAlign: 'right' }}>CPP</th>
                <th style={{ textAlign: 'right' }}>EI</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="dp-row" style={{ cursor: 'pointer' }} onClick={() => onView(s)}>
                  <td>{formatDate(s.pay_date)}</td>
                  <td style={{ fontWeight: 500 }}>{empById[s.employee_id]?.name}</td>
                  <td style={{ fontSize: 12.5, color: '#5B5F56' }}>{s.period_start ? `${formatDate(s.period_start)} – ${formatDate(s.period_end)}` : s.pay_type}</td>
                  <td style={{ textAlign: 'right' }}>{Number(s.hours).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>{money(s.gross)}</td>
                  <td style={{ textAlign: 'right' }}>{money(s.cpp)}</td>
                  <td style={{ textAlign: 'right' }}>{money(s.ei)}</td>
                  <td style={{ textAlign: 'right' }}>{money(s.tax)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {money(s.net)}
                    {s.emailed_at && <div style={{ fontSize: 11, color: '#2A5A30', fontWeight: 400 }}>Emailed</div>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <button className="dp-btn" style={{ padding: 5, marginRight: 4 }} aria-label="Payslip" title="View / print payslip" onClick={() => onView(s)}><Printer size={13} /></button>
                    <button className="dp-btn" style={{ padding: 5, marginRight: 4 }} aria-label="Email" title={empById[s.employee_id]?.email ? `Email PDF to ${empById[s.employee_id].email}` : 'No email on file'} disabled={!empById[s.employee_id]?.email} onClick={() => send([s])}><Mail size={13} /></button>
                    <button className="dp-btn" style={{ padding: 5 }} aria-label="Delete" title="Delete payslip" onClick={() => setConfirm(s)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} style={{ fontWeight: 600 }}>Total ({list.length})</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{tot('hours').toFixed(2)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(tot('gross'))}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(tot('cpp'))}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(tot('ei'))}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(tot('tax'))}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(tot('net'))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          message={`Delete ${empById[confirm.employee_id]?.name}'s payslip for ${formatDate(confirm.pay_date)}?`}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await supabase.from('payslips').delete().eq('id', confirm.id);
            setConfirm(null);
            onDeleted();
          }}
        />
      )}
    </>
  );
}

function PayslipView({ slip, employee, ytd, settings, onClose, onEmailed }) {
  const [msg, setMsg] = useState('');
  const doc = <PayslipDocument slip={slip} employee={employee} ytd={ytd} settings={settings} />;
  return (
    <>
      <Modal
        title={`Payslip — ${employee?.name || ''} · ${formatDate(slip.pay_date)}`}
        onClose={onClose}
        maxWidth={860}
        footer={
          <>
            <button className="dp-btn" onClick={onClose}>Close</button>
            <button className="dp-btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            <button
              className="dp-btn dp-btn-primary"
              disabled={!employee?.email}
              title={employee?.email ? `Email PDF to ${employee.email}` : 'No email on file'}
              onClick={async () => {
                try {
                  await queueEmail('payslip', employee.email, { payslip_id: slip.id });
                  setMsg(`Payslip (PDF) emailed to ${employee.email}.`);
                  onEmailed && onEmailed();
                } catch (err) {
                  setMsg('Could not email: ' + (err.message || err));
                }
              }}
            >
              <Mail size={14} /> Email
            </button>
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

// ── Staff & settings ─────────────────────────────────────────────────────────
function StaffTab({ employees, settings, onEdit, onSettingsSaved }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  async function saveSettings() {
    const { id, ...rest } = form;
    await supabase.from('payroll_settings').upsert({ id: 1, ...rest });
    onSettingsSaved();
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="dp-btn dp-btn-primary" onClick={() => onEdit({ pay_type: 'Monthly', payment_method: 'Cheque', active: true })}><Plus size={15} /> Add staff</button>
      </div>
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <table className="dp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Hourly rate</th>
              <th>Pay type</th>
              <th>Paid by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="dp-row" style={{ opacity: e.active === false ? 0.5 : 1 }}>
                <td style={{ fontWeight: 500 }}>{e.name}{e.active === false ? ' (inactive)' : ''}</td>
                <td style={{ textAlign: 'right' }}>{e.hourly_rate ? money(e.hourly_rate) : <span style={{ color: '#9A2B2B' }}>—</span>}</td>
                <td>{e.pay_type}</td>
                <td>{e.payment_method}</td>
                <td><button className="dp-btn" style={{ padding: 5 }} aria-label="Edit" onClick={() => onEdit(e)}><Pencil size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...styles.card, padding: 16, maxWidth: 640 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Company details on the payslip</h3>
        <Field label="Company name"><input className="dp-input" style={{ width: '100%' }} value={form.company_name || ''} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></Field>
        <Field label="Address"><input className="dp-input" style={{ width: '100%' }} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <div style={styles.formRow}>
          <Field label="Phone"><input className="dp-input" style={{ width: '100%' }} value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="dp-input" style={{ width: '100%' }} value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </div>
        <Field label="Questions contact (bottom of payslip)"><input className="dp-input" style={{ width: '100%' }} value={form.contact_line || ''} onChange={(e) => setForm({ ...form, contact_line: e.target.value })} /></Field>
        <button className="dp-btn dp-btn-primary" onClick={saveSettings}><Check size={15} /> Save</button>
      </div>
    </>
  );
}

function EmployeeModal({ employee, onClose, onSaved }) {
  const [f, setF] = useState(employee);
  const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!f.name?.trim()) return setErr('Name is required.');
    const row = {
      name: f.name.trim(),
      address: f.address || null,
      phone: f.phone || null,
      email: f.email || null,
      sin_masked: f.sin_masked || null,
      payroll_no: f.payroll_no || null,
      pay_type: f.pay_type || 'Monthly',
      payment_method: f.payment_method || 'Cheque',
      hourly_rate: f.hourly_rate === '' || f.hourly_rate == null ? null : Number(f.hourly_rate),
      vacation_pct: f.vacation_pct === '' || f.vacation_pct == null ? null : Number(f.vacation_pct),
      active: f.active !== false,
    };
    const { error } = f.id ? await supabase.from('payroll_employees').update(row).eq('id', f.id) : await supabase.from('payroll_employees').insert(row);
    if (error) return setErr(error.message);
    onSaved();
  }
  return (
    <Modal
      title={f.id ? 'Edit staff' : 'Add staff'}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button>
        </>
      }
    >
      {err && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{err}</p>}
      <Field label="Name (as on the payslip)" required><input className="dp-input" style={{ width: '100%' }} value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
      <div style={styles.formRow}>
        <Field label="Hourly rate ($)"><input className="dp-input" style={{ width: '100%' }} type="number" step="0.01" value={f.hourly_rate ?? ''} onChange={(e) => set('hourly_rate', e.target.value)} /></Field>
        <Field label="Vacation pay %"><input className="dp-input" style={{ width: '100%' }} type="number" step="0.01" placeholder="4" value={f.vacation_pct ?? ''} onChange={(e) => set('vacation_pct', e.target.value)} /></Field>
      </div>
      <div style={styles.formRow}>
        <Field label="Pay type">
          <select className="dp-select" style={{ width: '100%' }} value={f.pay_type || 'Monthly'} onChange={(e) => set('pay_type', e.target.value)}>
            {Object.keys(PAY_TYPES).map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Payment method">
          <select className="dp-select" style={{ width: '100%' }} value={f.payment_method || 'Cheque'} onChange={(e) => set('payment_method', e.target.value)}>
            {['Cheque', 'EFT', 'Direct deposit', 'e-Transfer', 'Cash'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Address"><input className="dp-input" style={{ width: '100%' }} value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
      <div style={styles.formRow}>
        <Field label="Phone"><input className="dp-input" style={{ width: '100%' }} value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="dp-input" style={{ width: '100%' }} value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
      </div>
      <div style={styles.formRow}>
        <Field label="SIN (last 3 only)">
          <input className="dp-input" style={{ width: '100%' }} placeholder="***-***-123" value={f.sin_masked || ''} onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-3);
            set('sin_masked', d ? `***-***-${d}` : '');
          }} />
        </Field>
        <Field label="Payroll #"><input className="dp-input" style={{ width: '100%' }} value={f.payroll_no || ''} onChange={(e) => set('payroll_no', e.target.value)} /></Field>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
        <input type="checkbox" checked={f.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active
      </label>
    </Modal>
  );
}
