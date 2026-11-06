import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Printer, Mail, FileText, Award, Search, Check, AlertTriangle, Pencil } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { BELTS } from '../../lib/constants';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import ConfirmDialog from '../../components/ConfirmDialog';
import { matchScore } from '../../components/SearchSelect';
import { money, round2, localISO, formatDate } from '../../lib/invoiceUtils';
import { fetchAll, loadSettings, saveInvoice, queueEmail } from '../invoices/api';
import ScoresView from './ScoresView';
import SparringView from './SparringView';
import { openReports, openBracket } from './testReports';
import { MIN_CLASSES, TEST_FEE_ITEMS, feeItemFor, nextBelt, beltMeta, beltIndex, countStart, classesSince, matchFees, NOTICE_SUBJECT, NOTICE_MESSAGE } from '../../lib/beltTesting';

const RESULTS = [
  { value: 'pending', label: 'Pending', color: '#5B5F56' },
  { value: 'pass', label: 'Pass', color: '#2A5A30' },
  { value: 'retest', label: 'Retest', color: '#854F0B' },
  { value: 'absent', label: 'Absent', color: '#9A2B2B' },
];

function BeltChip({ belt }) {
  const m = beltMeta(belt);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, whiteSpace: 'nowrap' }}>
      <span style={{ width: 22, height: 9, borderRadius: 2, background: m.bg, border: `1px solid ${m.border}` }} />
      {belt || 'White'}
    </span>
  );
}

const chip = (bg, color, border) => ({ background: bg, color, border: `1px solid ${border}`, borderRadius: 999, padding: '1px 9px', fontSize: 12, whiteSpace: 'nowrap' });

export default function TestingPage() {
  const [tests, setTests] = useState([]);
  const [testId, setTestId] = useState('');
  const [entries, setEntries] = useState([]);
  const [students, setStudents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [firstAttendance, setFirstAttendance] = useState(null);
  const [feeItems, setFeeItems] = useState([]);
  const [feeLines, setFeeLines] = useState([]);
  const [invoiceMap, setInvoiceMap] = useState({});
  const [settings, setSettings] = useState(null);
  const [flash, setFlash] = useState({ text: '', error: false });
  const [modal, setModal] = useState(null); // 'add' | 'new' | 'invoice' | 'notice' | 'promote'
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('list'); // list | scores | sparring

  const test = tests.find((t) => t.id === testId);
  const say = (text, error = false) => setFlash({ text, error });

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: st }, { data: cu }, { data: fi }, s, { data: fa }] = await Promise.all([
        supabase.from('belt_tests').select('*').order('test_date', { ascending: false }),
        fetchAll(() => supabase.from('students').select('id, name, belt, dob, status, customer_id, guardian_name, guardian_email, enroll_date, last_test_date, class_name, billing_exempt').order('name')),
        fetchAll(() => supabase.from('customers').select('id, name, email, address, printed_info, active, separate_invoices')),
        supabase.from('fee_items').select('*'),
        loadSettings(),
        supabase.from('attendance').select('date').order('date', { ascending: true }).limit(1),
      ]);
      setTests(t || []);
      setStudents(st || []);
      setCustomers(cu || []);
      setFeeItems(fi || []);
      setSettings(s);
      setFirstAttendance(fa?.[0]?.date || null);
      const today = localISO();
      const upcoming = (t || []).filter((x) => x.test_date >= today).sort((a, b) => (a.test_date < b.test_date ? -1 : 1))[0];
      setTestId((upcoming || (t || [])[0])?.id || '');
    })();
  }, []);

  // Attendance since the earliest "last test" of anyone, for class counts.
  useEffect(() => {
    if (!students.length) return;
    const from = students.filter((s) => s.status !== 'withdrawn').map(countStart).sort()[0] || '2000-01-01';
    fetchAll(() => supabase.from('attendance').select('student_id, date, status').gte('date', from)).then(({ data }) => setAttendance(data || []));
  }, [students]);

  useEffect(() => {
    if (testId) loadEntries();
  }, [testId]);

  async function loadEntries() {
    const { data } = await supabase.from('belt_test_entries').select('*').eq('test_id', testId);
    setEntries(data || []);
    await loadFees();
  }

  async function loadFees() {
    const { data: lines } = await fetchAll(() => supabase.from('invoice_lines').select('id, invoice_id, student_id, item_name, description, amount, quantity').in('item_name', TEST_FEE_ITEMS));
    const ids = [...new Set((lines || []).map((l) => l.invoice_id))];
    const map = {};
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from('invoice_summary').select('id, invoice_number, invoice_date, customer_id, voided, balance, status, total').in('id', ids.slice(i, i + 100));
      (data || []).forEach((r) => (map[r.id] = r));
    }
    setFeeLines(lines || []);
    setInvoiceMap(map);
  }

  const sById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const cById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const itemByName = useMemo(() => Object.fromEntries(feeItems.map((f) => [f.name, f])), [feeItems]);
  const attBy = useMemo(() => {
    const m = {};
    attendance.forEach((r) => (m[r.student_id] ||= []).push(r));
    return m;
  }, [attendance]);
  const countFor = (s) => classesSince(s, attBy[s.id] || []);

  const fees = useMemo(() => {
    if (!test) return {};
    const prev = tests.filter((t) => t.test_date < test.test_date).map((t) => t.test_date).sort().pop() || null;
    const next = tests.filter((t) => t.test_date > test.test_date).map((t) => t.test_date).sort()[0] || null;
    return matchFees(entries, students, feeLines, invoiceMap, test.test_date, prev, next);
  }, [entries, students, feeLines, invoiceMap, test, tests]);
  const feeState = (e) => {
    const f = fees[e.id];
    if (!f) return 'none';
    return Number(f.invoice.balance) <= 0.005 ? 'paid' : 'unpaid';
  };

  // A belt fixed on the student's record carries over to the test list (until
  // they're promoted): current belt, and the "testing for" belt and fee if
  // those were still the automatic picks. Fees already invoiced stay as they are.
  useEffect(() => {
    if (!entries.length || !students.length) return;
    const fixes = [];
    entries.forEach((e) => {
      const s = sById[e.student_id];
      if (!s || e.promoted_at || !s.belt || s.belt === e.current_belt) return;
      const patch = { current_belt: s.belt };
      if (!e.target_belt || e.target_belt === nextBelt(e.current_belt)) patch.target_belt = nextBelt(s.belt);
      if (!fees[e.id] && (!e.fee_item || e.fee_item === feeItemFor(e.current_belt))) {
        patch.fee_item = feeItemFor(s.belt);
        patch.fee_amount = itemByName[patch.fee_item]?.default_amount ?? e.fee_amount;
      }
      fixes.push([e, patch]);
    });
    if (!fixes.length) return;
    setEntries((list) => list.map((x) => {
      const f = fixes.find(([e]) => e.id === x.id);
      return f ? { ...x, ...f[1] } : x;
    }));
    fixes.forEach(([e, patch]) => supabase.from('belt_test_entries').update(patch).eq('id', e.id).then(() => {}));
  }, [entries, students, fees, itemByName]);

  const rows = useMemo(
    () =>
      entries
        .map((e) => ({ e, s: sById[e.student_id] }))
        .filter((r) => r.s)
        .sort((a, b) => beltIndex(a.e.current_belt) - beltIndex(b.e.current_belt) || a.s.name.localeCompare(b.s.name)),
    [entries, sById]
  );

  const stats = useMemo(() => {
    const n = rows.length;
    return {
      n,
      forms: rows.filter((r) => r.e.form_received).length,
      paid: rows.filter((r) => feeState(r.e) === 'paid').length,
      noInvoice: rows.filter((r) => feeState(r.e) === 'none'),
      passed: rows.filter((r) => r.e.result === 'pass'),
      toPromote: rows.filter((r) => r.e.result === 'pass' && !r.e.promoted_at),
    };
  }, [rows, fees]);

  // Counts are incomplete when attendance wasn't recorded for the whole period.
  const partialCounts = !!firstAttendance && students.some((s) => s.status !== 'withdrawn' && countStart(s) < firstAttendance);

  async function patchEntry(e, patch) {
    setEntries((list) => list.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from('belt_test_entries').update(patch).eq('id', e.id);
    if (error) {
      say('Could not save: ' + error.message, true);
      loadEntries();
    }
  }

  async function addStudents(ids) {
    const rowsToAdd = ids.map((id) => {
      const s = sById[id];
      const item = itemByName[feeItemFor(s.belt)];
      return { test_id: testId, student_id: id, current_belt: s.belt || 'White', target_belt: nextBelt(s.belt || 'White'), fee_item: item?.name || feeItemFor(s.belt), fee_amount: item?.default_amount ?? null, result: 'pending' };
    });
    const { error } = await supabase.from('belt_test_entries').insert(rowsToAdd);
    if (error) return say('Could not add: ' + error.message, true);
    setModal(null);
    say(`${ids.length} student${ids.length === 1 ? '' : 's'} added to the test list.`);
    loadEntries();
  }

  async function patchTest(patch) {
    setTests((t) => t.map((x) => (x.id === test.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from('belt_tests').update(patch).eq('id', test.id);
    if (error) say('Could not save: ' + error.message, true);
  }

  async function updateTest(date, title) {
    const { data, error } = await supabase.from('belt_tests').update({ test_date: date, title: title || null }).eq('id', test.id).select().single();
    if (error) return say('Could not save the test: ' + error.message, true);
    setTests((t) => t.map((x) => (x.id === data.id ? data : x)).sort((a, b) => (a.test_date < b.test_date ? 1 : -1)));
    setModal(null);
    say('Test updated.');
  }

  // Delete a test (and its list). Not once students were promoted from it.
  async function deleteTest() {
    const { error } = await supabase.from('belt_tests').delete().eq('id', test.id);
    if (error) return say('Could not delete the test: ' + error.message, true);
    const rest = tests.filter((x) => x.id !== test.id);
    setTests(rest);
    const today = localISO(new Date());
    const next = rest.filter((x) => x.test_date >= today).sort((a, b) => (a.test_date < b.test_date ? -1 : 1))[0] || rest[0];
    setTestId(next ? next.id : '');
    setModal(null);
    say('Test deleted.');
  }

  async function createTest(date, title) {
    const { data, error } = await supabase.from('belt_tests').insert({ test_date: date, title: title || null }).select().single();
    if (error) return say('Could not create the test: ' + error.message, true);
    setTests((t) => [data, ...t].sort((a, b) => (a.test_date < b.test_date ? 1 : -1)));
    setTestId(data.id);
    setModal(null);
  }

  // One invoice per family for everyone on the list without a test-fee invoice.
  async function createInvoices(sendEmail) {
    setBusy(true);
    const groups = {};
    const skipped = [];
    stats.noInvoice.forEach(({ e, s }) => {
      if (!s.customer_id || !cById[s.customer_id]) return skipped.push(s.name);
      const key = cById[s.customer_id].separate_invoices ? s.customer_id + '|' + s.id : s.customer_id;
      (groups[key] ||= []).push({ e, s });
    });
    let made = 0;
    let emailed = 0;
    try {
      for (const [key, list] of Object.entries(groups)) {
        const cid = key.split('|')[0];
        const c = cById[cid];
        const lines = list.map(({ e, s }) => {
          const item = itemByName[e.fee_item];
          return {
            fee_item_id: item?.id || null,
            item_name: e.fee_item,
            description: `${item?.description || e.fee_item} - ${s.name} (${e.current_belt} → ${e.target_belt})`,
            quantity: 1,
            unit_price: priceOf(e, itemByName),
            taxable: item ? item.taxable !== false : true,
            student_id: s.id,
          };
        });
        const inv = await saveInvoice(
          {
            customer_id: cid,
            customer_name: c.name,
            customer_email: c.email || '',
            customer_address: [c.address, c.printed_info].filter(Boolean).join('\n'),
            invoice_date: localISO(),
            due_date: test.test_date,
            gst_rate: settings?.gst_rate ?? 5,
            notes: `${test.title || 'Belt testing'} – ${formatDate(test.test_date)}`,
          },
          lines,
          null
        );
        made++;
        if (sendEmail && c.email) {
          await queueEmail('invoice', c.email, { invoice_id: inv.id });
          emailed++;
        }
      }
      say(`${made} invoice${made === 1 ? '' : 's'} created${sendEmail ? `, ${emailed} emailed` : ''}.${skipped.length ? ' Not linked to a family (skipped): ' + skipped.join(', ') : ''}`, skipped.length > 0);
    } catch (err) {
      say(`Stopped after ${made} invoice(s): ${err.message || err}`, true);
    }
    setBusy(false);
    setModal(null);
    loadFees();
  }

  async function promote() {
    setBusy(true);
    let n = 0;
    for (const { e, s } of stats.toPromote) {
      const { error } = await supabase.from('students').update({ belt: e.target_belt, last_test_date: test.test_date }).eq('id', s.id);
      if (error) {
        say(`Could not update ${s.name}: ${error.message}`, true);
        break;
      }
      await supabase.from('belt_test_entries').update({ promoted_at: new Date().toISOString() }).eq('id', e.id);
      n++;
    }
    // Everyone who tested (pass or retest) starts counting again from today's test.
    const others = rows.filter((r) => r.e.result === 'retest').map((r) => r.s.id);
    if (others.length) await supabase.from('students').update({ last_test_date: test.test_date }).in('id', others);
    setBusy(false);
    setModal(null);
    const { data: st } = await fetchAll(() => supabase.from('students').select('id, name, belt, dob, status, customer_id, guardian_name, guardian_email, enroll_date, last_test_date, class_name, billing_exempt').order('name'));
    setStudents(st || []);
    say(`${n} student${n === 1 ? '' : 's'} moved up to their new belt.`);
    loadEntries();
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return say('Allow pop-ups to print the list.', true);
    const esc = (x) => String(x ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
    const body = rows
      .map(
        ({ e, s }, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(e.current_belt)}</td><td>${esc(e.target_belt)}</td><td style="text-align:center">${e.form_received ? '✓' : ''}</td><td style="text-align:center">${feeState(e) === 'paid' ? '✓' : ''}</td><td></td><td></td><td></td><td></td></tr>`
      )
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(test.title || 'Belt Testing')}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0}p{margin:4px 0 14px;color:#555;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:6px 7px;text-align:left}th{background:#eee}td:nth-child(n+7){width:70px}</style></head>
<body><h1>${esc(test.title || 'Belt Testing')}</h1><p>${esc(formatDate(test.test_date))} · ${rows.length} students</p>
<table><thead><tr><th>#</th><th>Student</th><th>Current belt</th><th>Testing for</th><th>Form</th><th>Paid</th><th>Poomsae</th><th>Kicks</th><th>Sparring</th><th>Result</th></tr></thead><tbody>${body}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Belt Testing</h1>
          <p style={styles.subtitle}>Test list, forms, fees and results · {MIN_CLASSES} classes since the last test to be eligible</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="dp-select" value={testId} onChange={(e) => setTestId(e.target.value)}>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {formatDate(t.test_date)}{t.title ? ' — ' + t.title : ''}
              </option>
            ))}
          </select>
          {test && <button className="dp-btn" aria-label="Edit or delete this test" title="Change the date / name, or delete this test" onClick={() => setModal('edit')}><Pencil size={14} /> Edit</button>}
          <button className="dp-btn" onClick={() => setModal('new')}><Plus size={15} /> New test</button>
        </div>
      </div>

      {flash.text && <p style={{ background: flash.error ? '#FBEAEA' : '#E8F1E9', color: flash.error ? '#9A2B2B' : '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash.text}</p>}

      {!test ? (
        <div style={{ ...styles.card, padding: 20, fontSize: 14, color: '#5B5F56' }}>No tests yet — click “New test”.</div>
      ) : (
        <>
          {partialCounts && (
            <p style={{ background: '#FAEEDA', color: '#854F0B', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={15} /> Attendance has only been recorded in the portal since {formatDate(firstAttendance)}, so class counts before then are missing. Pick this test’s students yourself; counts will be complete from the next test.
            </p>
          )}

          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E4E0D4', marginBottom: 14 }}>
            {[['list', 'Test list'], ['scores', 'Scores & reports'], ['sparring', 'Sparring pairings']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} style={{ background: 'none', border: 'none', borderBottom: view === k ? '2px solid #20241F' : '2px solid transparent', padding: '8px 14px', fontSize: 14, fontWeight: view === k ? 600 : 400, color: view === k ? '#20241F' : '#5B5F56', cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>{l}</button>
            ))}
          </div>

          {view === 'scores' && (
            <ScoresView
              key={test.id}
              rows={rows}
              test={test}
              onPatch={patchEntry}
              onExaminer={(name) => patchTest({ examiner: name })}
              onPrint={(list) => openReports(list, test, settings?.logo_data) || say('Allow pop-ups to print the reports.', true)}
            />
          )}
          {view === 'sparring' && (
            <SparringView
              key={test.id}
              rows={rows}
              test={test}
              onSave={(pairs) => patchTest({ bracket: pairs })}
              onPrint={(pairs) => openBracket(pairs, sById, test) || say('Allow pop-ups to print.', true)}
            />
          )}

          {view === 'list' && (<>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <button className="dp-btn dp-btn-primary" onClick={() => setModal('add')}><Plus size={15} /> Add students</button>
            <button className="dp-btn" disabled={!stats.noInvoice.length} onClick={() => setModal('invoice')}><FileText size={15} /> Create fee invoices ({stats.noInvoice.length})</button>
            <button className="dp-btn" disabled={!rows.length} onClick={() => setModal('notice')}><Mail size={15} /> Email test notice</button>
            <button className="dp-btn" disabled={!rows.length} onClick={printList}><Printer size={15} /> Print list</button>
            <button className="dp-btn" disabled={!stats.toPromote.length} onClick={() => setModal('promote')}><Award size={15} /> Promote passed ({stats.toPromote.length})</button>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#5B5F56', display: 'flex', gap: 14 }}>
              <span>{stats.n} on list</span>
              <span>Forms {stats.forms}/{stats.n}</span>
              <span>Paid {stats.paid}/{stats.n}</span>
              <span>Passed {stats.passed.length}</span>
            </span>
          </div>

          <div style={styles.card}>
            {rows.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Nobody on this test yet — click “Add students”.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Current belt</th>
                    <th>Testing for</th>
                    <th style={{ textAlign: 'center' }}>Classes</th>
                    <th style={{ textAlign: 'center' }}>Form</th>
                    <th>Test fee</th>
                    <th>Result</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ e, s }) => {
                    const n = countFor(s);
                    const fs = feeState(e);
                    const f = fees[e.id];
                    return (
                      <tr key={e.id} className="dp-row">
                        <td style={{ fontWeight: 500 }}>
                          {s.name}
                          {e.promoted_at && <span style={{ ...chip('#E8F1E9', '#2A5A30', '#BFDCC3'), marginLeft: 6 }}>Promoted</span>}
                        </td>
                        <td><BeltChip belt={e.current_belt} /></td>
                        <td>
                          <select className="dp-select" style={{ fontSize: 12.5, padding: '3px 6px' }} value={e.target_belt || ''} disabled={!!e.promoted_at} onChange={(ev) => patchEntry(e, { target_belt: ev.target.value })}>
                            {BELTS.map((b) => <option key={b.value}>{b.value}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={n >= MIN_CLASSES ? chip('#E8F1E9', '#2A5A30', '#BFDCC3') : chip('#F1EFE7', '#5B5F56', '#DEDACC')} title={`Since ${formatDate(countStart(s))}`}>{n}/{MIN_CLASSES}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" aria-label="Form received" checked={!!e.form_received} onChange={(ev) => patchEntry(e, { form_received: ev.target.checked })} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {fs === 'paid' && <span style={chip('#E8F1E9', '#2A5A30', '#BFDCC3')}>Paid · #{f.invoice.invoice_number}</span>}
                            {fs === 'unpaid' && <span style={chip('#FBEAEA', '#9A2B2B', '#E4B8B8')}>Unpaid · #{f.invoice.invoice_number}</span>}
                            {fs === 'none' && (
                              <>
                                <select
                                  className="dp-select"
                                  style={{ fontSize: 12.5, padding: '3px 6px' }}
                                  value={e.fee_item || ''}
                                  onChange={(ev) => patchEntry(e, { fee_item: ev.target.value, fee_amount: itemByName[ev.target.value]?.default_amount ?? e.fee_amount })}
                                >
                                  {TEST_FEE_ITEMS.map((x) => <option key={x}>{x}</option>)}
                                </select>
                                <span style={{ fontSize: 12.5, color: '#5B5F56' }}>{money(priceOf(e, itemByName))}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <select
                            className="dp-select"
                            style={{ fontSize: 12.5, padding: '3px 6px', color: RESULTS.find((r) => r.value === e.result)?.color }}
                            value={e.result}
                            disabled={!!e.promoted_at}
                            onChange={(ev) => patchEntry(e, { result: ev.target.value })}
                          >
                            {RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <button
                            aria-label="Remove"
                            title="Remove from this test"
                            className="dp-btn"
                            style={{ padding: 5 }}
                            onClick={() =>
                              setConfirm({
                                msg: `Remove ${s.name} from this test?`,
                                run: async () => {
                                  await supabase.from('belt_test_entries').delete().eq('id', e.id);
                                  loadEntries();
                                },
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          </>)}
        </>
      )}

      {modal === 'new' && <NewTestModal onClose={() => setModal(null)} onSave={createTest} />}
      {modal === 'edit' && test && (
        <NewTestModal
          test={test}
          entryCount={entries.length}
          promoted={entries.filter((e) => e.promoted_at).length}
          onClose={() => setModal(null)}
          onSave={updateTest}
          onDelete={deleteTest}
        />
      )}
      {modal === 'add' && test && (
        <AddStudentsModal students={students} already={new Set(entries.map((e) => e.student_id))} countFor={countFor} partial={partialCounts} onClose={() => setModal(null)} onAdd={addStudents} />
      )}
      {modal === 'invoice' && (
        <InvoiceConfirm list={stats.noInvoice} cById={cById} itemByName={itemByName} gstRate={settings?.gst_rate ?? 5} busy={busy} onClose={() => setModal(null)} onRun={createInvoices} />
      )}
      {modal === 'notice' && test && (
        <NoticeModal
          rows={rows}
          test={test}
          cById={cById}
          itemByName={itemByName}
          gstRate={settings?.gst_rate ?? 5}
          onClose={() => setModal(null)}
          onSent={async (ids, count) => {
            const now = new Date().toISOString();
            if (ids.length) await supabase.from('belt_test_entries').update({ notice_sent_at: now }).in('id', ids);
            setModal(null);
            say(`Test notice queued for ${count} famil${count === 1 ? 'y' : 'ies'}.`);
            loadEntries();
          }}
        />
      )}
      {modal === 'promote' && (
        <Modal
          title="Promote passed students"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" disabled={busy} onClick={promote}><Check size={15} /> Update {stats.toPromote.length} belts</button>
            </>
          }
        >
          <p style={{ fontSize: 13.5, margin: '0 0 10px' }}>These students’ belts will change in their records, and their class count for the next test starts again from {formatDate(test.test_date)}:</p>
          <ul style={{ fontSize: 13.5, margin: 0, paddingLeft: 18 }}>
            {stats.toPromote.map(({ e, s }) => (
              <li key={e.id}>{s.name}: {e.current_belt} → <b>{e.target_belt}</b></li>
            ))}
          </ul>
        </Modal>
      )}
      {confirm && (
        <ConfirmDialog
          message={confirm.msg}
          confirmLabel="Remove"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const r = confirm.run;
            setConfirm(null);
            await r();
          }}
        />
      )}
    </>
  );
}

function NewTestModal({ test, entryCount = 0, promoted = 0, onClose, onSave, onDelete }) {
  const [date, setDate] = useState(test?.test_date || '');
  const [title, setTitle] = useState(test?.title || '');
  const [sure, setSure] = useState(false);
  return (
    <Modal
      title={test ? 'Edit belt test' : 'New belt test'}
      onClose={onClose}
      footer={
        <>
          {test && (
            <button
              className="dp-btn dp-btn-danger"
              style={{ marginRight: 'auto' }}
              disabled={promoted > 0}
              title={promoted > 0 ? 'Students were already promoted from this test' : ''}
              onClick={() => (sure || entryCount === 0 ? onDelete() : setSure(true))}
            >
              <Trash2 size={14} /> {sure ? `Yes, delete with ${entryCount} student${entryCount === 1 ? '' : 's'}` : 'Delete test'}
            </button>
          )}
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={!date} onClick={() => onSave(date, title.trim())}><Check size={15} /> {test ? 'Save' : 'Create'}</button>
        </>
      }
    >
      {test && sure && (
        <p style={{ background: '#FBEAEA', color: '#9A2B2B', padding: '8px 10px', borderRadius: 6, fontSize: 12.5, margin: '0 0 12px' }}>
          This test has {entryCount} student{entryCount === 1 ? '' : 's'} on its list. Deleting removes the list (forms, results). Invoices already made stay as they are.
        </p>
      )}
      {test && promoted > 0 && <p style={{ fontSize: 12.5, color: '#854F0B', margin: '0 0 12px' }}>{promoted} student{promoted === 1 ? ' was' : 's were'} already promoted from this test, so it can't be deleted.</p>}
      <Field label="Test date" required><input type="date" className="dp-input" style={{ width: '100%' }} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Name"><input className="dp-input" style={{ width: '100%' }} placeholder="e.g. February 2027 Belt Testing" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
    </Modal>
  );
}

function AddStudentsModal({ students, already, countFor, partial, onClose, onAdd }) {
  const [q, setQ] = useState('');
  const [onlyEligible, setOnlyEligible] = useState(!partial);
  const [picked, setPicked] = useState(() => new Set());
  const list = useMemo(() => {
    return students
      .filter((s) => s.status !== 'withdrawn' && !already.has(s.id))
      .map((s) => ({ s, n: countFor(s) }))
      .filter((r) => !onlyEligible || r.n >= MIN_CLASSES)
      .filter((r) => !q.trim() || matchScore(q, r.s.name + ' ' + (r.s.belt || '')) !== null)
      .sort((a, b) => b.n - a.n || a.s.name.localeCompare(b.s.name));
  }, [students, already, q, onlyEligible]);
  const eligible = list.filter((r) => r.n >= MIN_CLASSES);
  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <Modal
      title="Add students to the test"
      maxWidth={640}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={!picked.size} onClick={() => onAdd([...picked])}><Plus size={15} /> Add {picked.size}</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ ...styles.searchBox, flex: 1, minWidth: 180 }}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Find student…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)} /> Only {MIN_CLASSES}+ classes
        </label>
        <button className="dp-btn" style={{ fontSize: 12.5, padding: '4px 10px' }} disabled={!eligible.length} onClick={() => setPicked(new Set([...picked, ...eligible.map((r) => r.s.id)]))}>
          Select all eligible ({eligible.length})
        </button>
      </div>
      <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, maxHeight: '48vh', overflowY: 'auto' }}>
        {list.length === 0 ? (
          <p style={{ padding: 14, fontSize: 13.5, color: '#5B5F56', margin: 0 }}>{onlyEligible ? `No one else has ${MIN_CLASSES}+ classes yet.` : 'No students to add.'}</p>
        ) : (
          list.map(({ s, n }) => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid #F3F1EA', cursor: 'pointer', background: picked.has(s.id) ? '#FAF8F2' : 'transparent' }}>
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              <span style={{ flex: 1, fontSize: 13.5 }}>{s.name}</span>
              <BeltChip belt={s.belt} />
              <span style={{ ...(n >= MIN_CLASSES ? chip('#E8F1E9', '#2A5A30', '#BFDCC3') : chip('#F1EFE7', '#5B5F56', '#DEDACC')), minWidth: 44, textAlign: 'center' }}>{n}/{MIN_CLASSES}</span>
            </label>
          ))
        )}
      </div>
      <p style={{ fontSize: 12, color: '#8A8D84', margin: '8px 0 0' }}>Classes are counted since each student’s last test (double class = 2, makeups count).</p>
    </Modal>
  );
}

// The price comes from the item in Invoice Settings, so a price change there
// shows up here straight away (until the invoice is made).
function priceOf(e, itemByName) {
  return Number(itemByName[e.fee_item]?.default_amount ?? e.fee_amount) || 0;
}

function feeWithTax(e, itemByName, gstRate) {
  const amt = priceOf(e, itemByName);
  const taxable = itemByName[e.fee_item] ? itemByName[e.fee_item].taxable !== false : true;
  return round2(amt * (1 + (taxable ? Number(gstRate) / 100 : 0)));
}

function InvoiceConfirm({ list, cById, itemByName, gstRate, busy, onClose, onRun }) {
  const [email, setEmail] = useState(true);
  const families = {};
  list.forEach(({ e, s }) => {
    const c = s.customer_id && cById[s.customer_id];
    const k = !c ? 'none' : c.separate_invoices ? c.id + '|' + s.id : c.id;
    (families[k] ||= []).push({ e, s });
  });
  return (
    <Modal
      title="Create test fee invoices"
      maxWidth={560}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={busy} onClick={() => onRun(email)}><FileText size={15} /> Create {Object.keys(families).filter((k) => k !== 'none').length} invoices</button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, margin: '0 0 10px' }}>One invoice per family, dated today and due on the test day:</p>
      <table className="dp-table" style={{ fontSize: 13 }}>
        <tbody>
          {Object.entries(families).map(([k, l]) => (
            <tr key={k}>
              <td style={{ color: k === 'none' ? '#9A2B2B' : undefined }}>{k === 'none' ? 'No family linked — skipped' : cById[k.split('|')[0]].name}</td>
              <td>{l.map(({ e, s }) => `${s.name.split(' ')[0]} (${e.fee_item})`).join(', ')}</td>
              <td style={{ textAlign: 'right' }}>{money(l.reduce((t, { e }) => t + feeWithTax(e, itemByName, gstRate), 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 12 }}>
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email each invoice to the family
      </label>
    </Modal>
  );
}

function NoticeModal({ rows, test, cById, itemByName, gstRate, onClose, onSent }) {
  const [subject, setSubject] = useState(NOTICE_SUBJECT);
  const [message, setMessage] = useState(NOTICE_MESSAGE);
  const [onlyNew, setOnlyNew] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const families = useMemo(() => {
    const m = {};
    rows
      .filter((r) => !onlyNew || !r.e.notice_sent_at)
      .forEach((r) => {
        const c = r.s.customer_id ? cById[r.s.customer_id] : null;
        const email = c?.email || r.s.guardian_email;
        const key = c?.id || 'stu:' + r.s.id;
        (m[key] ||= { email, guardian: r.s.guardian_name || c?.name || 'Parent', list: [] }).list.push(r);
      });
    return Object.values(m);
  }, [rows, onlyNew, cById]);

  const fill = (tpl, fam) => {
    const names = fam.list.map((r) => `${r.s.name.split(' ')[0]} (${r.e.current_belt} → ${r.e.target_belt})`);
    const studentsText = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    const fee = fam.list.reduce((t, r) => t + feeWithTax(r.e, itemByName, gstRate), 0);
    const date = new Date(test.test_date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return tpl.replaceAll('{guardian}', fam.guardian).replaceAll('{students}', studentsText).replaceAll('{date}', date).replaceAll('{fee}', money(fee) + ' (incl. GST)');
  };
  const missing = families.filter((f) => !f.email);
  const ready = families.filter((f) => f.email);

  async function send() {
    setSending(true);
    setError('');
    const rowsQ = ready.map((f) => ({ type: 'broadcast', student_id: f.list[0].s.id, recipient_email: f.email, payload: { subject: fill(subject, f), message: fill(message, f) } }));
    const { error: e } = await supabase.from('email_queue').insert(rowsQ);
    if (e) {
      setSending(false);
      return setError('Could not send: ' + e.message);
    }
    await onSent(ready.flatMap((f) => f.list.map((r) => r.e.id)), ready.length);
  }

  return (
    <Modal
      title="Email test notice"
      maxWidth={640}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={sending || !ready.length} onClick={send}><Mail size={15} /> Send to {ready.length} famil{ready.length === 1 ? 'y' : 'ies'}</button>
        </>
      }
    >
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
        <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Only students who haven’t been sent a notice yet
      </label>
      <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Message">
        <textarea className="dp-input" rows={11} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <p style={{ fontSize: 12, color: '#8A8D84', margin: '-6px 0 10px' }}>{'{guardian} {students} {date} {fee}'} are filled in for each family.</p>
      {ready[0] && (
        <div style={{ background: '#FAF8F2', border: '1px solid #EDEAE0', borderRadius: 8, padding: 12, fontSize: 13, whiteSpace: 'pre-wrap' }}>
          <div style={{ color: '#8A8D84', marginBottom: 6 }}>Preview — to {ready[0].email}</div>
          <b>{fill(subject, ready[0])}</b>
          {'\n\n'}
          {fill(message, ready[0])}
        </div>
      )}
      {missing.length > 0 && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>No email on file (skipped): {missing.map((f) => f.list.map((r) => r.s.name).join(', ')).join('; ')}</p>}
      {error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
    </Modal>
  );
}
