import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, Check, TrendingUp } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../lib/constants';
import { todayISO } from '../../lib/billingDates';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';

function emptyForm() {
  return { student_name: '', guardian_name: '', phone: '', email: '', source: '전화', inquiry_date: todayISO(), consult_date: '', status: '신규문의', notes: '', linked_student_id: null };
}

export default function LeadsPage({ setActiveTab }) {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pastSearch, setPastSearch] = useState('');
  const [pastMatches, setPastMatches] = useState([]);
  const [linkedStudent, setLinkedStudent] = useState(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  async function searchPastStudents() {
    if (!pastSearch.trim()) {
      setPastMatches([]);
      return;
    }
    const { data } = await supabase
      .from('students')
      .select('id, name, guardian_name, guardian_phone, guardian_email, enroll_date, status')
      .or(`name.ilike.%${pastSearch}%,guardian_phone.ilike.%${pastSearch}%`)
      .limit(6);
    setPastMatches(data || []);
  }

  function linkPastStudent(s) {
    setForm({ ...form, student_name: s.name, guardian_name: s.guardian_name, phone: s.guardian_phone, email: s.guardian_email, linked_student_id: s.id });
    setLinkedStudent(s);
    setPastMatches([]);
    setPastSearch('');
  }

  function unlinkPastStudent() {
    setForm({ ...form, linked_student_id: null });
    setLinkedStudent(null);
  }

  async function fetchLeads() {
    const { data } = await supabase.from('leads').select('*').order('inquiry_date', { ascending: false });
    setLeads(data || []);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setLinkedStudent(null);
    setPastMatches([]);
    setPastSearch('');
    setModalOpen(true);
  }

  async function openEdit(lead) {
    setEditingId(lead.id);
    setForm({ ...emptyForm(), ...lead });
    setFormError('');
    setPastMatches([]);
    setPastSearch('');
    if (lead.linked_student_id) {
      const { data } = await supabase.from('students').select('id, name, guardian_name, guardian_phone, guardian_email, enroll_date, status').eq('id', lead.linked_student_id).single();
      setLinkedStudent(data || null);
    } else {
      setLinkedStudent(null);
    }
    setModalOpen(true);
  }

  async function submitForm() {
    if (!form.student_name.trim()) {
      setFormError('학생 이름을 입력해 주세요.');
      return;
    }
    let submitError;
    if (editingId) ({ error: submitError } = await supabase.from('leads').update(form).eq('id', editingId));
    else ({ error: submitError } = await supabase.from('leads').insert(form));
    if (submitError) {
      setFormError('저장하지 못했습니다: ' + submitError.message);
      return;
    }
    setModalOpen(false);
    fetchLeads();
  }

  async function confirmDelete(id) {
    await supabase.from('leads').delete().eq('id', id);
    setConfirmDeleteId(null);
    fetchLeads();
  }

  async function setStatus(id, status) {
    const { data } = await supabase.from('leads').update({ status }).eq('id', id).select();
    if (data) setLeads((prev) => prev.map((l) => (l.id === id ? data[0] : l)));
  }

  async function convertToStudent(lead) {
    await setStatus(lead.id, '등록완료');
    if (lead.linked_student_id) {
      // Reactivate the existing record instead of creating a duplicate.
      await supabase.from('students').update({ status: 'active', withdrawn_date: null, enroll_date: todayISO() }).eq('id', lead.linked_student_id);
      setActiveTab('students');
      return;
    }
    sessionStorage.setItem(
      'studentDraft',
      JSON.stringify({ name: lead.student_name, guardian_name: lead.guardian_name, guardian_phone: lead.phone, guardian_email: lead.email, enroll_date: todayISO() })
    );
    setActiveTab('students');
  }

  const stats = useMemo(() => {
    const total = leads.length;
    const consulted = leads.filter((l) => l.status !== '신규문의').length;
    const registered = leads.filter((l) => l.status === '등록완료').length;
    const rate = total === 0 ? 0 : Math.round((registered / total) * 1000) / 10;
    return { total, consulted, registered, rate };
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      const matchesSearch =
        !search.trim() ||
        l.student_name.toLowerCase().includes(search.toLowerCase()) ||
        (l.guardian_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.phone || '').includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [leads, statusFilter, search]);

  const statusMeta = (status) => LEAD_STATUSES.find((s) => s.value === status) || LEAD_STATUSES[0];

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>상담문의</h1>
          <p style={styles.subtitle}>{leads.length}건의 문의가 기록되어 있습니다</p>
        </div>
        <button className="dp-btn dp-btn-primary" onClick={openAdd}>
          <Plus size={15} /> 문의 추가
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>총 문의</p>
          <p style={styles.metricValue}>{stats.total}건</p>
        </div>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>상담 진행</p>
          <p style={styles.metricValue}>{stats.consulted}건</p>
        </div>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>
            <TrendingUp size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
            등록 전환율
          </p>
          <p style={styles.metricValue}>
            {stats.rate}% <span style={{ fontSize: 13, color: '#5B5F56', fontWeight: 400 }}>({stats.registered}/{stats.total})</span>
          </p>
        </div>
      </div>

      <div style={styles.filterBar}>
        <div style={styles.searchBox}>
          <Search size={15} color="#5B5F56" />
          <input className="dp-input" style={{ border: 'none', flex: 1, padding: '4px 6px' }} placeholder="학생, 보호자, 연락처로 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="dp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">전체 상태</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>해당하는 문의 기록이 없습니다.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>학생</th>
                <th>보호자</th>
                <th>연락처</th>
                <th>경로</th>
                <th>문의일</th>
                <th>상담일</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const meta = statusMeta(l.status);
                return (
                  <tr key={l.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>
                      {l.student_name}
                      {l.linked_student_id && (
                        <span style={{ marginLeft: 6, fontSize: 10.5, color: '#5B5F56', border: '1px solid #DEDACC', borderRadius: 999, padding: '1px 6px' }}>연결됨</span>
                      )}
                    </td>
                    <td>{l.guardian_name || '—'}</td>
                    <td>{l.phone || '—'}</td>
                    <td>{l.source}</td>
                    <td>{l.inquiry_date || '—'}</td>
                    <td>{l.consult_date || '—'}</td>
                    <td>
                      <select
                        className="dp-select"
                        style={{ fontSize: 12.5, padding: '3px 6px', background: meta.bg, color: meta.text, borderColor: meta.border }}
                        value={l.status}
                        onChange={(e) => setStatus(l.id, e.target.value)}
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.value}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {l.status !== '등록완료' && (
                          <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => convertToStudent(l)}>
                            학생 등록
                          </button>
                        )}
                        <button aria-label="수정" className="dp-btn" style={{ padding: 6 }} onClick={() => openEdit(l)}>
                          <Pencil size={14} />
                        </button>
                        <button aria-label="삭제" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteId(l.id)}>
                          <Trash2 size={14} />
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

      {modalOpen && (
        <Modal
          title={editingId ? '문의 정보 수정' : '상담 문의 추가'}
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
          <div style={{ background: '#F6F4EF', border: '1px solid #DEDACC', borderRadius: 6, padding: 10, marginBottom: 14 }}>
            {linkedStudent ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>
                  이전 학생 연결됨: <strong>{linkedStudent.name}</strong> ({linkedStudent.status === 'withdrawn' ? '퇴원' : '재원'}, 등록일 {linkedStudent.enroll_date})
                </span>
                <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={unlinkPastStudent}>
                  연결 해제
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 6px' }}>이전에 입관했던 아이라면 이름/연락처로 찾아서 연결할 수 있어요.</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="dp-input"
                    style={{ flex: 1 }}
                    placeholder="이름 또는 연락처"
                    value={pastSearch}
                    onChange={(e) => setPastSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchPastStudents()}
                  />
                  <button className="dp-btn" onClick={searchPastStudents}>
                    검색
                  </button>
                </div>
                {pastMatches.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {pastMatches.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, background: '#FFFFFF', border: '1px solid #DEDACC', borderRadius: 6, padding: '5px 8px' }}>
                        <span>
                          {s.name} · {s.status === 'withdrawn' ? '퇴원' : '재원'} · 등록일 {s.enroll_date || '—'}
                        </span>
                        <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => linkPastStudent(s)}>
                          연결
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <Field label="학생 이름" required>
            <input className="dp-input" style={{ width: '100%' }} value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="보호자 이름">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_name || ''} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
            </Field>
            <Field label="연락처">
              <input className="dp-input" style={{ width: '100%' }} value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="이메일">
            <input type="email" className="dp-input" style={{ width: '100%' }} value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="문의 경로">
              <select className="dp-select" style={{ width: '100%' }} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="문의일">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={form.inquiry_date || ''} onChange={(e) => setForm({ ...form, inquiry_date: e.target.value })} />
            </Field>
          </div>
          <div style={styles.formRow}>
            <Field label="상담일">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={form.consult_date || ''} onChange={(e) => setForm({ ...form, consult_date: e.target.value })} />
            </Field>
            <Field label="상태">
              <select className="dp-select" style={{ width: '100%' }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="비고">
            <textarea className="dp-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 0' }}>{formError}</p>}
        </Modal>
      )}

      {confirmDeleteId && <ConfirmDialog message="이 문의 기록을 삭제하시겠습니까? 되돌릴 수 없습니다." onCancel={() => setConfirmDeleteId(null)} onConfirm={() => confirmDelete(confirmDeleteId)} />}
    </>
  );
}
