import React, { useEffect, useMemo, useState } from 'react';
import { CircleCheck, CircleX, CalendarClock } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { MAKEUP_STATUSES } from '../../lib/constants';
import { todayISO, computeMakeupWindow } from '../../lib/billingDates';
import { useAuth } from '../../auth/AuthContext';

export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [makeupRecords, setMakeupRecords] = useState([]);
  const [payments, setPayments] = useState([]);
  const [view, setView] = useState('checkin');
  const [checkinDate, setCheckinDate] = useState(todayISO());
  const [checkinClass, setCheckinClass] = useState('all');
  const [historyStudentId, setHistoryStudentId] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [{ data: s }, { data: a }, { data: m }, { data: p }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('attendance').select('*'),
      supabase.from('makeup_records').select('*'),
      supabase.from('payments').select('*'),
    ]);
    setStudents(s || []);
    setAttendance(a || []);
    setMakeupRecords(m || []);
    setPayments(p || []);
  }

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name).filter(Boolean))), [students]);
  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  async function setAttendanceStatus(studentId, date, className, status) {
    const { data, error } = await supabase
      .from('attendance')
      .upsert({ student_id: studentId, date, class_name: className, status }, { onConflict: 'student_id,date,class_name' })
      .select();
    if (error) return;
    setAttendance((prev) => {
      const idx = prev.findIndex((a) => a.student_id === studentId && a.date === date && a.class_name === className);
      if (idx >= 0) return prev.map((a, i) => (i === idx ? data[0] : a));
      return [...prev, data[0]];
    });

    if (status === 'absent') {
      await createOrUpdateMakeupRecord(studentId, date, className);
    } else {
      await supabase.from('makeup_records').delete().eq('student_id', studentId).eq('absence_date', date).eq('class_name', className);
      setMakeupRecords((prev) => prev.filter((m) => !(m.student_id === studentId && m.absence_date === date && m.class_name === className)));
    }
  }

  async function createOrUpdateMakeupRecord(studentId, absenceDate, className) {
    const already = makeupRecords.find((m) => m.student_id === studentId && m.absence_date === absenceDate && m.class_name === className);
    if (already) return;
    const student = studentMap[studentId];
    if (!student) return;
    const { nextBillingDate, paidPeriodEnd, tentativeExpiration } = computeMakeupWindow(student, absenceDate);
    const paymentForCycle = payments.find((p) => p.student_id === studentId && p.cycle_start === nextBillingDate);
    const conditional = !paymentForCycle;
    const expirationDate = paymentForCycle ? (paymentForCycle.paid ? tentativeExpiration : paidPeriodEnd) : tentativeExpiration;
    const record = {
      student_id: studentId,
      absence_date: absenceDate,
      class_name: className,
      next_billing_date: nextBillingDate,
      paid_period_end: paidPeriodEnd,
      tentative_expiration: tentativeExpiration,
      expiration_date: expirationDate,
      conditional,
      reservation_date: null,
      status: 'pending',
    };
    const { data, error } = await supabase.from('makeup_records').insert(record).select();
    if (!error) setMakeupRecords((prev) => [...prev, data[0]]);
  }

  async function togglePayment(studentId, cycleStart, paid, amount) {
    const { data, error } = await supabase
      .from('payments')
      .upsert(
        { student_id: studentId, cycle_start: cycleStart, paid, amount: paid ? amount : undefined, paid_date: paid ? todayISO() : null },
        { onConflict: 'student_id,cycle_start' }
      )
      .select();
    if (error) return;
    setPayments((prev) => {
      const idx = prev.findIndex((p) => p.student_id === studentId && p.cycle_start === cycleStart);
      if (idx >= 0) return prev.map((p, i) => (i === idx ? data[0] : p));
      return [...prev, data[0]];
    });

    const affected = makeupRecords.filter((m) => m.student_id === studentId && m.next_billing_date === cycleStart);
    for (const m of affected) {
      const expirationDate = paid ? m.tentative_expiration : m.paid_period_end;
      const isPast = expirationDate < todayISO();
      const nextStatus = m.status === 'reserved' || m.status === 'completed' ? m.status : isPast ? 'expired' : 'pending';
      const { data: updated } = await supabase
        .from('makeup_records')
        .update({ conditional: false, expiration_date: expirationDate, status: nextStatus })
        .eq('id', m.id)
        .select();
      if (updated) setMakeupRecords((prev) => prev.map((rec) => (rec.id === m.id ? updated[0] : rec)));
    }
  }

  async function setMakeupReservation(makeupId, reservationDate, reservationClassName) {
    const { data } = await supabase
      .from('makeup_records')
      .update({ reservation_date: reservationDate, reservation_class_name: reservationDate ? reservationClassName : null, status: reservationDate ? 'reserved' : 'pending' })
      .eq('id', makeupId)
      .select();
    if (data) setMakeupRecords((prev) => prev.map((m) => (m.id === makeupId ? data[0] : m)));
  }

  // Guests attending a makeup session in a class that isn't their home class.
  // Present marks the makeup record completed; absent sends it back to
  // "미예약" so the front desk knows to rebook it.
  async function setMakeupGuestStatus(makeupRecord, date, className, status) {
    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        { student_id: makeupRecord.student_id, date, class_name: className, status, is_makeup: true, makeup_record_id: makeupRecord.id },
        { onConflict: 'student_id,date,class_name' }
      )
      .select();
    if (error) return;
    setAttendance((prev) => {
      const idx = prev.findIndex((a) => a.student_id === makeupRecord.student_id && a.date === date && a.class_name === className);
      if (idx >= 0) return prev.map((a, i) => (i === idx ? data[0] : a));
      return [...prev, data[0]];
    });
    if (status === 'present') {
      await setMakeupCompleted(makeupRecord.id);
    } else {
      const { data: reverted } = await supabase
        .from('makeup_records')
        .update({ status: 'pending', reservation_date: null, reservation_class_name: null })
        .eq('id', makeupRecord.id)
        .select();
      if (reverted) setMakeupRecords((prev) => prev.map((m) => (m.id === makeupRecord.id ? reverted[0] : m)));
    }
  }

  async function setMakeupCompleted(makeupId) {
    const { data } = await supabase.from('makeup_records').update({ status: 'completed' }).eq('id', makeupId).select();
    if (data) setMakeupRecords((prev) => prev.map((m) => (m.id === makeupId ? data[0] : m)));
  }

  const checkinList = students.filter((s) => checkinClass === 'all' || (s.class_name || '미배정') === checkinClass);
  const makeupGuests = makeupRecords.filter(
    (m) =>
      m.status === 'reserved' &&
      m.reservation_date === checkinDate &&
      (checkinClass === 'all' || m.reservation_class_name === checkinClass) &&
      !checkinList.some((s) => s.id === m.student_id)
  );
  const historyRecords = attendance
    .filter((a) => a.student_id === historyStudentId)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  function statusBadge(status) {
    const m = MAKEUP_STATUSES[status] || MAKEUP_STATUSES.pending;
    return (
      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: m.bg, color: m.text, border: `1px solid ${m.border}` }}>{m.label}</span>
    );
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>출석</h1>
          <p style={styles.subtitle}>체크인, 출석 이력, 보강수업을 관리합니다</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'checkin', label: '체크인' },
          { id: 'history', label: '출석 이력' },
          { id: 'makeup', label: '보강수업' },
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

      {view === 'checkin' && (
        <>
          <div style={styles.filterBar}>
            <input type="date" className="dp-input" value={checkinDate} onChange={(e) => setCheckinDate(e.target.value)} />
            <select className="dp-select" value={checkinClass} onChange={(e) => setCheckinClass(e.target.value)}>
              <option value="all">전체 반</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.card}>
            {checkinList.length === 0 && makeupGuests.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>해당하는 학생이 없습니다.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>반</th>
                    <th style={{ width: 200 }}>출결</th>
                  </tr>
                </thead>
                <tbody>
                  {checkinList.map((s) => {
                    const className = s.class_name || '미배정';
                    const record = attendance.find((a) => a.student_id === s.id && a.date === checkinDate && a.class_name === className);
                    return (
                      <tr key={s.id} className="dp-row">
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td>{className}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="dp-btn"
                              style={{
                                padding: '5px 10px',
                                background: record && record.status === 'present' ? '#E8F1E9' : '#FFFFFF',
                                borderColor: record && record.status === 'present' ? '#BFDCC3' : '#DEDACC',
                                color: record && record.status === 'present' ? '#2A5A30' : '#20241F',
                              }}
                              onClick={() => setAttendanceStatus(s.id, checkinDate, className, 'present')}
                            >
                              <CircleCheck size={14} /> 출석
                            </button>
                            <button
                              className="dp-btn"
                              style={{
                                padding: '5px 10px',
                                background: record && record.status === 'absent' ? '#FBEAEA' : '#FFFFFF',
                                borderColor: record && record.status === 'absent' ? '#E4B8B8' : '#DEDACC',
                                color: record && record.status === 'absent' ? '#9A2B2B' : '#20241F',
                              }}
                              onClick={() => setAttendanceStatus(s.id, checkinDate, className, 'absent')}
                            >
                              <CircleX size={14} /> 결석
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {makeupGuests.map((m) => {
                    const s = studentMap[m.student_id];
                    if (!s) return null;
                    const className = m.reservation_class_name || checkinClass;
                    const record = attendance.find((a) => a.student_id === s.id && a.date === checkinDate && a.class_name === className);
                    return (
                      <tr key={'guest_' + m.id} className="dp-row" style={{ background: '#FCFAF3' }}>
                        <td style={{ fontWeight: 500 }}>
                          {s.name}
                          <span style={{ marginLeft: 6, fontSize: 10.5, color: '#854F0B', border: '1px solid #F0D9A8', background: '#FAEEDA', borderRadius: 999, padding: '1px 6px' }}>
                            보강
                          </span>
                        </td>
                        <td>{className} (원래 반: {s.class_name || '미배정'})</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="dp-btn"
                              style={{
                                padding: '5px 10px',
                                background: record && record.status === 'present' ? '#E8F1E9' : '#FFFFFF',
                                borderColor: record && record.status === 'present' ? '#BFDCC3' : '#DEDACC',
                                color: record && record.status === 'present' ? '#2A5A30' : '#20241F',
                              }}
                              onClick={() => setMakeupGuestStatus(m, checkinDate, className, 'present')}
                            >
                              <CircleCheck size={14} /> 출석
                            </button>
                            <button
                              className="dp-btn"
                              style={{
                                padding: '5px 10px',
                                background: record && record.status === 'absent' ? '#FBEAEA' : '#FFFFFF',
                                borderColor: record && record.status === 'absent' ? '#E4B8B8' : '#DEDACC',
                                color: record && record.status === 'absent' ? '#9A2B2B' : '#20241F',
                              }}
                              onClick={() => setMakeupGuestStatus(m, checkinDate, className, 'absent')}
                            >
                              <CircleX size={14} /> 결석
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
        </>
      )}

      {view === 'history' && (
        <>
          <div style={styles.filterBar}>
            <select className="dp-select" value={historyStudentId} onChange={(e) => setHistoryStudentId(e.target.value)}>
              <option value="">학생 선택</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.card}>
            {!historyStudentId ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>학생을 선택해 주세요.</p>
            ) : historyRecords.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>출석 기록이 없습니다.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>반</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map((r) => (
                    <tr key={r.id} className="dp-row">
                      <td>{r.date}</td>
                      <td>{r.class_name}</td>
                      <td style={{ color: r.status === 'absent' ? '#9A2B2B' : '#2A5A30' }}>{r.status === 'absent' ? '결석' : '출석'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === 'makeup' && (
        <>
          <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 12px' }}>
            만료일은 결석일 기준 30일로 임시 설정되며, 다음 결제일에 결제 여부가 확인되면 확정됩니다. 다음 달 결제가 안 되면 원래 결제했던 달의 마지막
            날로 만료일이 조정됩니다.
          </p>
          <div style={styles.card}>
            {makeupRecords.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>보강수업 대상이 없습니다.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>결석일</th>
                    <th>만료일</th>
                    <th>다음 결제일</th>
                    {isAdmin && <th>결제 상태</th>}
                    <th>예약일</th>
                    <th>상태</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {makeupRecords
                    .slice()
                    .sort((a, b) => (a.absence_date < b.absence_date ? 1 : -1))
                    .map((m) => {
                      const student = studentMap[m.student_id];
                      const payment = payments.find((p) => p.student_id === m.student_id && p.cycle_start === m.next_billing_date);
                      const paidLabel = payment ? (payment.paid ? '완료' : '미납') : '미확인';
                      return (
                        <tr key={m.id} className="dp-row">
                          <td style={{ fontWeight: 500 }}>{student ? student.name : '(삭제된 학생)'}</td>
                          <td>{m.absence_date}</td>
                          <td>
                            {m.expiration_date}
                            {m.conditional && (
                              <div style={{ fontSize: 11, color: '#8A7A00', marginTop: 2 }}>
                                <CalendarClock size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
                                결제 확인 대기중
                              </div>
                            )}
                          </td>
                          <td>{m.next_billing_date}</td>
                          {isAdmin && (
                            <td>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <span style={{ fontSize: 12.5, color: paidLabel === '미납' ? '#9A2B2B' : '#5B5F56' }}>{paidLabel}</span>
                                <button
                                  className="dp-btn"
                                  style={{ padding: '3px 8px', fontSize: 12 }}
                                  onClick={() => togglePayment(m.student_id, m.next_billing_date, true, Number(student && student.tuition) || 0)}
                                >
                                  결제완료
                                </button>
                                <button className="dp-btn dp-btn-danger" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => togglePayment(m.student_id, m.next_billing_date, false)}>
                                  미납
                                </button>
                              </div>
                            </td>
                          )}
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input
                                type="date"
                                className="dp-input"
                                style={{ padding: '5px 8px', fontSize: 12.5, width: 130 }}
                                value={m.reservation_date || ''}
                                onChange={(e) => setMakeupReservation(m.id, e.target.value || null, m.reservation_class_name || m.class_name)}
                              />
                              <select
                                className="dp-select"
                                style={{ padding: '5px 6px', fontSize: 12.5 }}
                                value={m.reservation_class_name || m.class_name || ''}
                                onChange={(e) => setMakeupReservation(m.id, m.reservation_date, e.target.value)}
                                disabled={!m.reservation_date}
                              >
                                {classes.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>{statusBadge(m.status)}</td>
                          <td>
                            {m.status !== 'completed' && (
                              <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setMakeupCompleted(m.id)}>
                                완료 처리
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
