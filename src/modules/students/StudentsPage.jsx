import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Search, Plus, Upload, Pencil, Trash2, Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { BELTS } from '../../lib/constants';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';

const FIELD_DEFS = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'student name'] },
  { key: 'dob', label: 'Date of Birth', aliases: ['dob', 'birth', 'birthday'] },
  { key: 'guardian_name', label: 'Guardian Name', aliases: ['guardian', 'guardian name', 'parent'] },
  { key: 'guardian_phone', label: 'Guardian Phone', aliases: ['phone', 'guardian phone', 'contact'] },
  { key: 'guardian_email', label: 'Guardian Email', aliases: ['email', 'guardian email'] },
  { key: 'belt', label: 'Belt', aliases: ['belt', 'rank'] },
  { key: 'class_name', label: 'Class', aliases: ['class', 'class name'] },
  { key: 'tuition', label: 'Monthly Tuition', aliases: ['tuition', 'monthly tuition', 'fee'] },
  { key: 'enroll_date', label: 'Enrollment Date', aliases: ['enroll', 'enrollment date', 'join date'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'memo'] },
];

function emptyForm() {
  return { name: '', dob: '', guardian_name: '', guardian_phone: '', guardian_email: '', belt: 'White Belt', class_name: '', tuition: '', enroll_date: '', notes: '' };
}

function guessMapping(headers) {
  const mapping = {};
  FIELD_DEFS.forEach((f) => {
    const idx = headers.findIndex((h) => f.aliases.some((a) => String(h).trim().toLowerCase().includes(a.toLowerCase())));
    mapping[f.key] = idx >= 0 ? idx : -1;
  });
  return mapping;
}

export default function StudentsPage() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [beltFilter, setBeltFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [importState, setImportState] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchStudents();
    const draft = sessionStorage.getItem('studentDraft');
    if (draft) {
      setForm({ ...emptyForm(), ...JSON.parse(draft) });
      setEditingId(null);
      setFormError('');
      setModalOpen(true);
      sessionStorage.removeItem('studentDraft');
    }
  }, []);

  async function fetchStudents() {
    setLoading(true);
    const { data, error: fetchError } = await supabase.from('students').select('*').order('name');
    if (fetchError) setError('Could not load the student list.');
    else setStudents(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(student) {
    setEditingId(student.id);
    setForm({ ...emptyForm(), ...student });
    setFormError('');
    setModalOpen(true);
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError('Please enter a name.');
      return;
    }
    const payload = { ...form, tuition: form.tuition === '' ? null : Number(form.tuition) };
    let submitError;
    if (editingId) {
      ({ error: submitError } = await supabase.from('students').update(payload).eq('id', editingId));
    } else {
      ({ error: submitError } = await supabase.from('students').insert(payload));
    }
    if (submitError) {
      setFormError('Could not save: ' + submitError.message);
      return;
    }
    setModalOpen(false);
    fetchStudents();
  }

  async function confirmDelete(id) {
    await supabase.from('students').delete().eq('id', id);
    setConfirmDeleteId(null);
    fetchStudents();
  }

  async function setStudentStatus(id, status) {
    const payload = status === 'withdrawn' ? { status, withdrawn_date: new Date().toISOString().slice(0, 10) } : { status, withdrawn_date: null };
    const { data } = await supabase.from('students').update(payload).eq('id', id).select();
    if (data) setStudents((prev) => prev.map((s) => (s.id === id ? data[0] : s)));
  }

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name).filter(Boolean))), [students]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch =
        !search.trim() ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.guardian_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.class_name || '').toLowerCase().includes(search.toLowerCase());
      const matchesBelt = beltFilter === 'all' || s.belt === beltFilter;
      const matchesStatus = statusFilter === 'all' || (s.status || 'active') === statusFilter;
      return matchesSearch && matchesBelt && matchesStatus;
    });
  }, [students, search, beltFilter, statusFilter]);

  function beltMeta(belt) {
    return BELTS.find((b) => b.value === belt) || BELTS[0];
  }

  function handleFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        if (!rows.length) {
          setImportState({ error: 'No data could be read from this file.' });
          return;
        }
        const headers = rows[0];
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ''));
        const mapping = guessMapping(headers);
        setImportState({ headers, dataRows, mapping });
      } catch (err) {
        setImportState({ error: 'There was a problem reading this file. Please check the format.' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function updateImportMapping(fieldKey, colIndex) {
    setImportState((prev) => ({ ...prev, mapping: { ...prev.mapping, [fieldKey]: colIndex } }));
  }

  async function confirmImport() {
    if (!importState || !importState.dataRows) return;
    const nameIdx = importState.mapping.name;
    if (nameIdx === -1 || nameIdx === undefined) {
      setImportState((prev) => ({ ...prev, error: 'Please choose which column is the name.' }));
      return;
    }
    const imported = importState.dataRows
      .map((row) => {
        const rec = emptyForm();
        FIELD_DEFS.forEach((f) => {
          const idx = importState.mapping[f.key];
          if (idx !== -1 && idx !== undefined && row[idx] !== undefined) {
            rec[f.key] = String(row[idx]).trim();
          }
        });
        if (!BELTS.some((b) => b.value === rec.belt)) rec.belt = 'White Belt';
        rec.tuition = rec.tuition === '' ? null : Number(rec.tuition);
        return rec;
      })
      .filter((r) => r.name);
    const { error } = await supabase.from('students').insert(imported);
    if (!error) {
      setImportState(null);
      fetchStudents();
    } else {
      setImportState((prev) => ({ ...prev, error: 'Import failed: ' + error.message }));
    }
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Students</h1>
          <p style={styles.subtitle}>{students.length} registered</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dp-btn" onClick={() => fileInputRef.current.click()}>
              <Upload size={15} /> Upload Excel
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileSelect} />
            <button className="dp-btn dp-btn-primary" onClick={openAdd}>
              <Plus size={15} /> Add Student
            </button>
          </div>
        )}
      </div>

      <div style={styles.filterBar}>
        <div style={styles.searchBox}>
          <Search size={15} color="#5B5F56" />
          <input
            className="dp-input"
            style={{ border: 'none', flex: 1, padding: '4px 6px' }}
            placeholder="Search by name, guardian, or class"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="dp-select" value={beltFilter} onChange={(e) => setBeltFilter(e.target.value)}>
          <option value="all">All Belts</option>
          {BELTS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.value}
            </option>
          ))}
        </select>
        <select className="dp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Active</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{error}</p>}

      <div style={styles.card}>
        {loading ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ color: '#20241F', fontSize: 15, margin: '0 0 4px' }}>
              {students.length === 0 ? 'No students yet.' : 'No matching results.'}
            </p>
          </div>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Belt</th>
                <th>Class</th>
                <th>Guardian</th>
                <th>Phone</th>
                <th>Enrolled</th>
                {isAdmin && <th style={{ width: 160 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const belt = beltMeta(s.belt);
                return (
                  <tr key={s.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>
                      {s.name}
                      {s.status === 'withdrawn' && (
                        <span style={{ marginLeft: 6, fontSize: 10.5, color: '#5B5F56', border: '1px solid #DEDACC', borderRadius: 999, padding: '1px 6px' }}>Withdrawn</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontSize: 12.5,
                          background: belt.bg,
                          color: belt.text,
                          border: `1px solid ${belt.border}`,
                        }}
                      >
                        {s.belt}
                      </span>
                    </td>
                    <td>{s.class_name || '—'}</td>
                    <td>{s.guardian_name || '—'}</td>
                    <td>{s.guardian_phone || '—'}</td>
                    <td>{s.enroll_date || '—'}</td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="dp-btn"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => setStudentStatus(s.id, s.status === 'withdrawn' ? 'active' : 'withdrawn')}
                          >
                            {s.status === 'withdrawn' ? 'Reactivate' : 'Withdraw'}
                          </button>
                          <button aria-label="Edit" className="dp-btn" style={{ padding: 6 }} onClick={() => openEdit(s)}>
                            <Pencil size={14} />
                          </button>
                          <button aria-label="Delete" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteId(s.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editingId ? 'Edit Student' : 'Add Student'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="dp-btn dp-btn-primary" onClick={submitForm}>
                <Check size={15} /> Save
              </button>
            </>
          }
        >
          <Field label="Name" required>
            <input className="dp-input" style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" className="dp-input" style={{ width: '100%' }} value={form.dob || ''} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="Belt">
              <select className="dp-select" style={{ width: '100%' }} value={form.belt} onChange={(e) => setForm({ ...form, belt: e.target.value })}>
                {BELTS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class">
              <input className="dp-input" style={{ width: '100%' }} list="class-options" value={form.class_name || ''} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
              <datalist id="class-options">
                {classes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
          <div style={styles.formRow}>
            <Field label="Guardian Name">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_name || ''} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
            </Field>
            <Field label="Guardian Phone">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_phone || ''} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Guardian Email">
            <input type="email" className="dp-input" style={{ width: '100%' }} value={form.guardian_email || ''} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="Enrollment Date">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={form.enroll_date || ''} onChange={(e) => setForm({ ...form, enroll_date: e.target.value })} />
            </Field>
            <Field label="Monthly Tuition (₩)">
              <input type="number" className="dp-input" style={{ width: '100%' }} value={form.tuition ?? ''} onChange={(e) => setForm({ ...form, tuition: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="dp-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 0' }}>{formError}</p>}
        </Modal>
      )}

      {confirmDeleteId && (
        <ConfirmDialog message="Delete this student? This can't be undone." onCancel={() => setConfirmDeleteId(null)} onConfirm={() => confirmDelete(confirmDeleteId)} />
      )}

      {importState && (
        <Modal
          title="Match Excel Columns"
          maxWidth={560}
          onClose={() => setImportState(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setImportState(null)}>
                Cancel
              </button>
              {importState.headers && (
                <button className="dp-btn dp-btn-primary" onClick={confirmImport}>
                  <Check size={15} /> Import {importState.dataRows.length}
                </button>
              )}
            </>
          }
        >
          {importState.error && <p style={{ color: '#9A2B2B', fontSize: 13, marginTop: 0 }}>{importState.error}</p>}
          {importState.headers && (
            <>
              <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>
                Match each spreadsheet column to a field. ({importState.dataRows.length} rows found)
              </p>
              {FIELD_DEFS.map((f) => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, width: 150, color: '#20241F' }}>
                    {f.label}
                    {f.required && <span style={{ color: '#9A2B2B' }}> *</span>}
                  </span>
                  <select
                    className="dp-select"
                    style={{ flex: 1 }}
                    value={importState.mapping[f.key]}
                    onChange={(e) => updateImportMapping(f.key, Number(e.target.value))}
                  >
                    <option value={-1}>(Not used)</option>
                    {importState.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
