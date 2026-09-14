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
  { key: 'name', label: '이름', required: true, aliases: ['이름', '성명', 'name'] },
  { key: 'dob', label: '생년월일', aliases: ['생년월일', '생일', 'dob', 'birth'] },
  { key: 'guardian_name', label: '보호자 이름', aliases: ['보호자', '보호자이름', '보호자 이름', 'guardian'] },
  { key: 'guardian_phone', label: '보호자 연락처', aliases: ['연락처', '전화번호', '보호자 연락처', 'phone'] },
  { key: 'guardian_email', label: '보호자 이메일', aliases: ['이메일', 'email'] },
  { key: 'belt', label: '급수(띠)', aliases: ['급수', '띠', 'belt'] },
  { key: 'class_name', label: '반', aliases: ['반', '클래스', 'class'] },
  { key: 'tuition', label: '월 수업비', aliases: ['수업비', '월수업비', 'tuition'] },
  { key: 'enroll_date', label: '등록일', aliases: ['등록일', '가입일', 'enroll'] },
  { key: 'notes', label: '특이사항', aliases: ['특이사항', '메모', 'note'] },
];

function emptyForm() {
  return { name: '', dob: '', guardian_name: '', guardian_phone: '', guardian_email: '', belt: '흰띠', class_name: '', tuition: '', enroll_date: '', notes: '' };
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
    if (fetchError) setError('학생 목록을 불러오지 못했습니다.');
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
      setFormError('이름을 입력해 주세요.');
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
      setFormError('저장하지 못했습니다: ' + submitError.message);
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

  async function setStudentStatus(id, status) {
    const payload = status === 'withdrawn' ? { status, withdrawn_date: new Date().toISOString().slice(0, 10) } : { status, withdrawn_date: null };
    const { data } = await supabase.from('students').update(payload).eq('id', id).select();
    if (data) setStudents((prev) => prev.map((s) => (s.id === id ? data[0] : s)));
  }

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
          setImportState({ error: '파일에서 데이터를 읽지 못했습니다.' });
          return;
        }
        const headers = rows[0];
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ''));
        setImportState({ headers, dataRows, mapping: guessMapping(headers) });
      } catch (err) {
        setImportState({ error: '엑셀 파일을 읽는 중 문제가 발생했습니다. 파일 형식을 확인해 주세요.' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function confirmImport() {
    if (!importState || !importState.dataRows) return;
    if (importState.mapping.name === -1 || importState.mapping.name === undefined) {
      setImportState((prev) => ({ ...prev, error: '이름 열을 지정해 주세요.' }));
      return;
    }
    const rows = importState.dataRows
      .map((row) => {
        const rec = emptyForm();
        FIELD_DEFS.forEach((f) => {
          const idx = importState.mapping[f.key];
          if (idx !== -1 && idx !== undefined && row[idx] !== undefined) rec[f.key] = String(row[idx]).trim();
        });
        if (!BELTS.some((b) => b.value === rec.belt)) rec.belt = '흰띠';
        rec.tuition = rec.tuition === '' ? null : Number(rec.tuition);
        return rec;
      })
      .filter((r) => r.name);
    const { error: importError } = await supabase.from('students').insert(rows);
    if (importError) {
      setImportState((prev) => ({ ...prev, error: '가져오기에 실패했습니다: ' + importError.message }));
      return;
    }
    setImportState(null);
    fetchStudents();
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>학생 관리</h1>
          <p style={styles.subtitle}>{students.length}명 등록됨</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dp-btn" onClick={() => fileInputRef.current.click()}>
              <Upload size={15} /> 엑셀 업로드
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileSelect} />
            <button className="dp-btn dp-btn-primary" onClick={openAdd}>
              <Plus size={15} /> 학생 추가
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
            placeholder="이름, 보호자, 반으로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="dp-select" value={beltFilter} onChange={(e) => setBeltFilter(e.target.value)}>
          <option value="all">전체 급수</option>
          {BELTS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.value}
            </option>
          ))}
        </select>
        <select className="dp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">재원</option>
          <option value="withdrawn">퇴원</option>
          <option value="all">전체</option>
        </select>
      </div>

      {error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{error}</p>}

      <div style={styles.card}>
        {loading ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ color: '#20241F', fontSize: 15, margin: '0 0 4px' }}>
              {students.length === 0 ? '아직 등록된 학생이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          </div>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>급수</th>
                <th>반</th>
                <th>보호자</th>
                <th>연락처</th>
                <th>등록일</th>
                {isAdmin && <th style={{ width: 80 }}></th>}
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
                        <span style={{ marginLeft: 6, fontSize: 10.5, color: '#5B5F56', border: '1px solid #DEDACC', borderRadius: 999, padding: '1px 6px' }}>퇴원</span>
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
                            {s.status === 'withdrawn' ? '재원으로 복귀' : '퇴원 처리'}
                          </button>
                          <button aria-label="수정" className="dp-btn" style={{ padding: 6 }} onClick={() => openEdit(s)}>
                            <Pencil size={14} />
                          </button>
                          <button aria-label="삭제" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteId(s.id)}>
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
          title={editingId ? '학생 정보 수정' : '학생 추가'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setModalOpen(false)}>
                취소
              </button>
              <button className="dp-btn dp-btn-primary" onClick={submitForm}>
                <Check size={15} /> 저장
              </button>
            </>
          }
        >
          <Field label="이름" required>
            <input className="dp-input" style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="생년월일">
            <input type="date" className="dp-input" style={{ width: '100%' }} value={form.dob || ''} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="급수(띠)">
              <select className="dp-select" style={{ width: '100%' }} value={form.belt} onChange={(e) => setForm({ ...form, belt: e.target.value })}>
                {BELTS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="반">
              <input className="dp-input" style={{ width: '100%' }} list="class-options" value={form.class_name || ''} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
              <datalist id="class-options">
                {classes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
          <div style={styles.formRow}>
            <Field label="보호자 이름">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_name || ''} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
            </Field>
            <Field label="보호자 연락처">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_phone || ''} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
            </Field>
          </div>
          <Field label="보호자 이메일">
            <input type="email" className="dp-input" style={{ width: '100%' }} value={form.guardian_email || ''} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="등록일">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={form.enroll_date || ''} onChange={(e) => setForm({ ...form, enroll_date: e.target.value })} />
            </Field>
            <Field label="월 수업비 (원)">
              <input type="number" className="dp-input" style={{ width: '100%' }} value={form.tuition ?? ''} onChange={(e) => setForm({ ...form, tuition: e.target.value })} />
            </Field>
          </div>
          <Field label="특이사항 (알레르기, 메모 등)">
            <textarea className="dp-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 0' }}>{formError}</p>}
        </Modal>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="이 학생 정보를 삭제하시겠습니까? 되돌릴 수 없습니다."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => confirmDelete(confirmDeleteId)}
        />
      )}

      {importState && (
        <Modal
          title="엑셀 데이터 매칭"
          onClose={() => setImportState(null)}
          maxWidth={560}
          footer={
            <>
              <button className="dp-btn" onClick={() => setImportState(null)}>
                취소
              </button>
              {importState.headers && (
                <button className="dp-btn dp-btn-primary" onClick={confirmImport}>
                  <Check size={15} /> {importState.dataRows.length}명 가져오기
                </button>
              )}
            </>
          }
        >
          {importState.error && <p style={{ color: '#9A2B2B', fontSize: 13, marginTop: 0 }}>{importState.error}</p>}
          {importState.headers && (
            <>
              <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>
                엑셀의 각 열이 어떤 항목에 해당하는지 확인해 주세요. ({importState.dataRows.length}행 감지됨)
              </p>
              {FIELD_DEFS.map((f) => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, width: 140, color: '#20241F' }}>
                    {f.label}
                    {f.required && <span style={{ color: '#9A2B2B' }}> *</span>}
                  </span>
                  <select
                    className="dp-select"
                    style={{ flex: 1 }}
                    value={importState.mapping[f.key]}
                    onChange={(e) => setImportState((prev) => ({ ...prev, mapping: { ...prev.mapping, [f.key]: Number(e.target.value) } }))}
                  >
                    <option value={-1}>(사용 안 함)</option>
                    {importState.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `열 ${i + 1}`}
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
