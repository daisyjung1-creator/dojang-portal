import React, { useEffect, useState } from 'react';
import { Check, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { BELTS } from '../../lib/constants';
import { todayISO } from '../../lib/billingDates';
import Field from '../../components/Field';

function emptyForm() {
  return { name: '', guardian_name: '', guardian_phone: '', guardian_email: '', belt: '흰띠', class_name: '', tuition: '', enroll_date: todayISO(), notes: '' };
}

export default function RegisterPage() {
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);
  const [classes, setClasses] = useState([]);
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    // Picks up a draft handed off from a converted 트라이아웃 booking, if any.
    const draft = sessionStorage.getItem('registerDraft');
    if (draft) {
      setForm((prev) => ({ ...prev, ...JSON.parse(draft) }));
      sessionStorage.removeItem('registerDraft');
    }
    loadClasses();
    loadQueue();
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    setClasses(Array.from(new Set((data || []).map((s) => s.class_name).filter(Boolean))));
  }

  async function loadQueue() {
    const { data } = await supabase.from('welcome_queue').select('*').order('queued_date', { ascending: false });
    setQueue(data || []);
  }

  async function submitRegistration() {
    if (!form.name.trim()) {
      setFormError('학생 이름을 입력해 주세요.');
      return;
    }
    const payload = { ...form, tuition: form.tuition === '' ? null : Number(form.tuition) };
    const { data, error } = await supabase.from('students').insert(payload).select();
    if (error) {
      setFormError('등록하지 못했습니다: ' + error.message);
      return;
    }
    const newStudent = data[0];
    if (form.guardian_email.trim()) {
      const { data: queued } = await supabase
        .from('welcome_queue')
        .insert({ student_id: newStudent.id, student_name: newStudent.name, guardian_email: form.guardian_email, queued_date: todayISO(), sent: false })
        .select();
      if (queued) setQueue((prev) => [queued[0], ...prev]);
    }
    setForm(emptyForm());
    setFormError('');
    setSuccess(true);
  }

  async function setSent(id, sent) {
    const { data } = await supabase.from('welcome_queue').update({ sent }).eq('id', id).select();
    if (data) setQueue((prev) => prev.map((w) => (w.id === id ? data[0] : w)));
  }

  const pending = queue.filter((w) => !w.sent);

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>신규등록</h1>
          <p style={styles.subtitle}>등록을 완료하면 보호자 이메일로 보낼 환영 메일이 대기열에 추가됩니다</p>
        </div>
      </div>

      <div style={{ ...styles.card, padding: 20, marginBottom: 20, maxWidth: 480 }}>
        {success && (
          <div
            style={{
              background: '#E8F1E9',
              border: '1px solid #BFDCC3',
              color: '#2A5A30',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13.5,
              marginBottom: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>등록되었습니다.</span>
            <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setSuccess(false)}>
              닫기
            </button>
          </div>
        )}
        <Field label="학생 이름" required>
          <input className="dp-input" style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div style={styles.formRow}>
          <Field label="보호자 이름">
            <input className="dp-input" style={{ width: '100%' }} value={form.guardian_name || ''} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
          </Field>
          <Field label="보호자 연락처">
            <input className="dp-input" style={{ width: '100%' }} value={form.guardian_phone || ''} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          </Field>
        </div>
        <Field label="보호자 이메일 (환영 메일 발송용)">
          <input type="email" className="dp-input" style={{ width: '100%' }} value={form.guardian_email || ''} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
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
            <input className="dp-input" style={{ width: '100%' }} list="reg-class-options" value={form.class_name || ''} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
            <datalist id="reg-class-options">
              {classes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="등록일">
            <input type="date" className="dp-input" style={{ width: '100%' }} value={form.enroll_date} onChange={(e) => setForm({ ...form, enroll_date: e.target.value })} />
          </Field>
          <Field label="월 수업비 (원)">
            <input type="number" className="dp-input" style={{ width: '100%' }} value={form.tuition} onChange={(e) => setForm({ ...form, tuition: e.target.value })} />
          </Field>
        </div>
        <Field label="특이사항">
          <textarea className="dp-input" style={{ width: '100%', minHeight: 50, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 12px' }}>{formError}</p>}
        <button className="dp-btn dp-btn-primary" style={{ marginTop: 8 }} onClick={submitRegistration}>
          <Check size={15} /> 등록 완료
        </button>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>환영 이메일 대기열 ({pending.length})</h2>
      <div style={styles.card}>
        {queue.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>대기 중인 환영 이메일이 없습니다.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>학생</th>
                <th>보호자 이메일</th>
                <th>등록일</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((w) => (
                <tr key={w.id} className="dp-row">
                  <td style={{ fontWeight: 500 }}>{w.student_name}</td>
                  <td>
                    <Mail size={13} style={{ verticalAlign: '-2px', marginRight: 4, color: '#5B5F56' }} />
                    {w.guardian_email}
                  </td>
                  <td>{w.queued_date}</td>
                  <td>
                    <span style={{ fontSize: 12.5, color: w.sent ? '#2A5A30' : '#5B5F56' }}>{w.sent ? '발송완료' : '대기중'}</span>
                  </td>
                  <td>
                    <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setSent(w.id, !w.sent)}>
                      {w.sent ? '대기로 되돌리기' : '발송완료 처리'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
