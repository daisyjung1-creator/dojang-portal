import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { formatCurrency } from '../../lib/constants';
import { todayISO, getBillingDay, nextBillingDateAfter, currentCycleStart } from '../../lib/billingDates';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';

function emptyChargeForm() {
  return { student_id: '', fee_item_id: '', amount: '', date: todayISO(), status: 'Unpaid' };
}
function emptyFeeItemForm() {
  return { name: '', default_amount: '' };
}

export default function BillingPage() {
  const [view, setView] = useState('tuition');
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [charges, setCharges] = useState([]);
  const [feeItems, setFeeItems] = useState([]);

  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState(null);
  const [chargeForm, setChargeForm] = useState(emptyChargeForm());
  const [chargeFormError, setChargeFormError] = useState('');
  const [confirmDeleteChargeId, setConfirmDeleteChargeId] = useState(null);

  const [feeItemModalOpen, setFeeItemModalOpen] = useState(false);
  const [editingFeeItemId, setEditingFeeItemId] = useState(null);
  const [feeItemForm, setFeeItemForm] = useState(emptyFeeItemForm());
  const [confirmDeleteFeeItemId, setConfirmDeleteFeeItemId] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [{ data: s }, { data: p }, { data: c }, { data: f }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('payments').select('*'),
      supabase.from('charges').select('*'),
      supabase.from('fee_items').select('*'),
    ]);
    setStudents(s || []);
    setPayments(p || []);
    setCharges(c || []);
    setFeeItems(f || []);
  }

  async function togglePayment(studentId, cycleStart, paid, amount) {
    const { data } = await supabase
      .from('payments')
      .upsert({ student_id: studentId, cycle_start: cycleStart, paid, amount: paid ? amount : undefined, paid_date: paid ? todayISO() : null }, { onConflict: 'student_id,cycle_start' })
      .select();
    if (data) setPayments((prev) => {
      const idx = prev.findIndex((p) => p.student_id === studentId && p.cycle_start === cycleStart);
      if (idx >= 0) return prev.map((p, i) => (i === idx ? data[0] : p));
      return [...prev, data[0]];
    });
  }

  const tuitionRows = useMemo(() => {
    const today = todayISO();
    return students.map((s) => {
      const cycleStart = currentCycleStart(s, today);
      const nextDue = nextBillingDateAfter(cycleStart, getBillingDay(s));
      const payment = payments.find((p) => p.student_id === s.id && p.cycle_start === cycleStart);
      return { student: s, cycleStart, nextDue, payment };
    });
  }, [students, payments]);

  const stats = useMemo(() => {
    const paidCount = tuitionRows.filter((r) => r.payment && r.payment.paid).length;
    const unpaidCount = tuitionRows.length - paidCount;
    const expectedTotal = tuitionRows.reduce((sum, r) => sum + (Number(r.student.tuition) || 0), 0);
    const collectedTotal = tuitionRows.reduce((sum, r) => (r.payment && r.payment.paid ? sum + (Number(r.student.tuition) || 0) : sum), 0);
    return { paidCount, unpaidCount, expectedTotal, collectedTotal };
  }, [tuitionRows]);

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const feeItemMap = useMemo(() => Object.fromEntries(feeItems.map((f) => [f.id, f])), [feeItems]);

  function openAddCharge() {
    setEditingChargeId(null);
    setChargeForm(emptyChargeForm());
    setChargeFormError('');
    setChargeModalOpen(true);
  }
  function openEditCharge(c) {
    setEditingChargeId(c.id);
    setChargeForm({ ...c });
    setChargeFormError('');
    setChargeModalOpen(true);
  }
  async function submitChargeForm() {
    if (!chargeForm.student_id) return setChargeFormError('Please select a student.');
    if (!chargeForm.fee_item_id) return setChargeFormError('Please select a fee item.');
    const payload = { ...chargeForm, amount: Number(chargeForm.amount) || 0 };
    let submitError;
    if (editingChargeId) ({ error: submitError } = await supabase.from('charges').update(payload).eq('id', editingChargeId));
    else ({ error: submitError } = await supabase.from('charges').insert(payload));
    if (submitError) return setChargeFormError('Could not save: ' + submitError.message);
    setChargeModalOpen(false);
    const { data } = await supabase.from('charges').select('*');
    setCharges(data || []);
  }
  async function confirmDeleteCharge(id) {
    await supabase.from('charges').delete().eq('id', id);
    setConfirmDeleteChargeId(null);
    setCharges((prev) => prev.filter((c) => c.id !== id));
  }
  async function setChargeStatus(id, status) {
    const { data } = await supabase.from('charges').update({ status }).eq('id', id).select();
    if (data) setCharges((prev) => prev.map((c) => (c.id === id ? data[0] : c)));
  }

  function openAddFeeItem() {
    setEditingFeeItemId(null);
    setFeeItemForm(emptyFeeItemForm());
    setFeeItemModalOpen(true);
  }
  function openEditFeeItem(item) {
    setEditingFeeItemId(item.id);
    setFeeItemForm({ name: item.name, default_amount: item.default_amount });
    setFeeItemModalOpen(true);
  }
  async function submitFeeItemForm() {
    if (!feeItemForm.name.trim()) return;
    const payload = { name: feeItemForm.name, default_amount: Number(feeItemForm.default_amount) || 0 };
    if (editingFeeItemId) await supabase.from('fee_items').update(payload).eq('id', editingFeeItemId);
    else await supabase.from('fee_items').insert(payload);
    setFeeItemModalOpen(false);
    const { data } = await supabase.from('fee_items').select('*');
    setFeeItems(data || []);
  }
  async function confirmDeleteFeeItem(id) {
    await supabase.from('fee_items').delete().eq('id', id);
    setConfirmDeleteFeeItemId(null);
    setFeeItems((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Billing</h1>
          <p style={styles.subtitle}>Manage tuition and other fees</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>Paid This Cycle</p>
          <p style={styles.metricValue}>{stats.paidCount}</p>
        </div>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>Unpaid This Cycle</p>
          <p style={styles.metricValue}>{stats.unpaidCount}</p>
        </div>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>Expected Tuition Total</p>
          <p style={styles.metricValue}>{formatCurrency(stats.expectedTotal)}</p>
        </div>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>Collected Tuition</p>
          <p style={styles.metricValue}>{formatCurrency(stats.collectedTotal)}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'tuition', label: 'Tuition' },
          { id: 'fees', label: 'Other Fees' },
          { id: 'items', label: 'Fee Items' },
        ].map((v) => (
          <button
            key={v.id}
            className="dp-btn"
            style={{ background: view === v.id ? '#20241F' : '#FFFFFF', color: view === v.id ? '#FFFFFF' : '#20241F', borderColor: view === v.id ? '#20241F' : '#DEDACC' }}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'tuition' && (
        <div style={styles.card}>
          {tuitionRows.length === 0 ? (
            <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No students registered.</p>
          ) : (
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Monthly Tuition</th>
                  <th>Current Cycle</th>
                  <th>Next Due Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tuitionRows.map((r) => {
                  const paid = r.payment && r.payment.paid;
                  return (
                    <tr key={r.student.id} className="dp-row">
                      <td style={{ fontWeight: 500 }}>{r.student.name}</td>
                      <td>{r.student.tuition ? formatCurrency(r.student.tuition) : 'Not set'}</td>
                      <td>{r.cycleStart}</td>
                      <td>{r.nextDue}</td>
                      <td>
                        <span style={{ fontSize: 12.5, color: paid ? '#2A5A30' : '#9A2B2B' }}>{paid ? 'Paid' : 'Unpaid'}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => togglePayment(r.student.id, r.cycleStart, true, Number(r.student.tuition) || 0)}>
                            Mark Paid
                          </button>
                          <button className="dp-btn dp-btn-danger" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => togglePayment(r.student.id, r.cycleStart, false)}>
                            Mark Unpaid
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === 'fees' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="dp-btn dp-btn-primary" onClick={openAddCharge}>
              <Plus size={15} /> Add Charge
            </button>
          </div>
          <div style={styles.card}>
            {charges.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No other fees recorded.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {charges
                    .slice()
                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                    .map((c) => (
                      <tr key={c.id} className="dp-row">
                        <td style={{ fontWeight: 500 }}>{studentMap[c.student_id] ? studentMap[c.student_id].name : '(deleted student)'}</td>
                        <td>{feeItemMap[c.fee_item_id] ? feeItemMap[c.fee_item_id].name : '(deleted item)'}</td>
                        <td>{formatCurrency(c.amount)}</td>
                        <td>{c.date}</td>
                        <td>
                          <select className="dp-select" style={{ fontSize: 12.5, padding: '3px 6px' }} value={c.status} onChange={(e) => setChargeStatus(c.id, e.target.value)}>
                            <option value="Unpaid">Unpaid</option>
                            <option value="Paid">Paid</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button aria-label="Edit" className="dp-btn" style={{ padding: 6 }} onClick={() => openEditCharge(c)}>
                              <Pencil size={14} />
                            </button>
                            <button aria-label="Delete" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteChargeId(c.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === 'items' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="dp-btn dp-btn-primary" onClick={openAddFeeItem}>
              <Plus size={15} /> Add Item
            </button>
          </div>
          <div style={styles.card}>
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Default Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {feeItems.map((f) => (
                  <tr key={f.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>{f.name}</td>
                    <td>{formatCurrency(f.default_amount)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button aria-label="Edit" className="dp-btn" style={{ padding: 6 }} onClick={() => openEditFeeItem(f)}>
                          <Pencil size={14} />
                        </button>
                        <button aria-label="Delete" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteFeeItemId(f.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {chargeModalOpen && (
        <Modal
          title={editingChargeId ? 'Edit Charge' : 'Add Charge'}
          onClose={() => setChargeModalOpen(false)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setChargeModalOpen(false)}>
                Cancel
              </button>
              <button className="dp-btn dp-btn-primary" onClick={submitChargeForm}>
                <Check size={15} /> Save
              </button>
            </>
          }
        >
          <Field label="Student" required>
            <select className="dp-select" style={{ width: '100%' }} value={chargeForm.student_id} onChange={(e) => setChargeForm({ ...chargeForm, student_id: e.target.value })}>
              <option value="">Select</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Item" required>
            <select
              className="dp-select"
              style={{ width: '100%' }}
              value={chargeForm.fee_item_id}
              onChange={(e) => {
                const item = feeItems.find((f) => f.id === e.target.value);
                setChargeForm({ ...chargeForm, fee_item_id: e.target.value, amount: item ? item.default_amount : chargeForm.amount });
              }}
            >
              <option value="">Select</option>
              {feeItems.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <div style={styles.formRow}>
            <Field label="Amount (₩)">
              <input type="number" className="dp-input" style={{ width: '100%' }} value={chargeForm.amount} onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })} />
            </Field>
            <Field label="Date">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={chargeForm.date} onChange={(e) => setChargeForm({ ...chargeForm, date: e.target.value })} />
            </Field>
          </div>
          <Field label="Status">
            <select className="dp-select" style={{ width: '100%' }} value={chargeForm.status} onChange={(e) => setChargeForm({ ...chargeForm, status: e.target.value })}>
              <option value="Unpaid">Unpaid</option>
              <option value="Paid">Paid</option>
            </select>
          </Field>
          {chargeFormError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 0' }}>{chargeFormError}</p>}
        </Modal>
      )}

      {confirmDeleteChargeId && <ConfirmDialog message="Delete this charge?" onCancel={() => setConfirmDeleteChargeId(null)} onConfirm={() => confirmDeleteCharge(confirmDeleteChargeId)} />}

      {feeItemModalOpen && (
        <Modal
          title={editingFeeItemId ? 'Edit Item' : 'Add Item'}
          maxWidth={360}
          onClose={() => setFeeItemModalOpen(false)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setFeeItemModalOpen(false)}>
                Cancel
              </button>
              <button className="dp-btn dp-btn-primary" onClick={submitFeeItemForm}>
                <Check size={15} /> Save
              </button>
            </>
          }
        >
          <Field label="Item Name" required>
            <input className="dp-input" style={{ width: '100%' }} value={feeItemForm.name} onChange={(e) => setFeeItemForm({ ...feeItemForm, name: e.target.value })} />
          </Field>
          <Field label="Default Amount (₩)">
            <input type="number" className="dp-input" style={{ width: '100%' }} value={feeItemForm.default_amount} onChange={(e) => setFeeItemForm({ ...feeItemForm, default_amount: e.target.value })} />
          </Field>
        </Modal>
      )}

      {confirmDeleteFeeItemId && (
        <ConfirmDialog message="Delete this item? Existing charge records will be kept." onCancel={() => setConfirmDeleteFeeItemId(null)} onConfirm={() => confirmDeleteFeeItem(confirmDeleteFeeItemId)} />
      )}
    </>
  );
}
