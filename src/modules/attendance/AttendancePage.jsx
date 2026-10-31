import React, { useEffect, useMemo, useState } from 'react';
import { CircleCheck, CircleX, CalendarClock, BarChart3, Mail, Plus, Trash2, Check, Plane, Copy, User } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { MAKEUP_STATUSES } from '../../lib/constants';
import { todayISO, computeMakeupWindow, addDaysISO } from '../../lib/billingDates';
import { splitClasses, allClassNames, inClass, DOJANG_CLASSES } from '../../lib/classes';
import { ATTENDANCE_KINDS, studentSummary, weekCount, lastAttended, minutesLabel } from '../../lib/attendanceStats';
import { fillTemplate, makeupVars, studentVars } from '../../lib/emailTemplates';
import { formatDate } from '../../lib/invoiceUtils';
import { useAuth } from '../../auth/AuthContext';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmailComposeModal from '../../components/EmailComposeModal';

const ABSENCE_DAYS = 7;
const classOrder = (c) => {
  const i = DOJANG_CLASSES.indexOf(c);
  return i < 0 ? 100 : i;
};

export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [makeupRecords, setMakeupRecords] = useState([]);
  const [payments, setPayments] = useState([]);
  const [packages, setPackages] = useState([]);
  const [settings, setSettings] = useState({});
  const [view, setView] = useState('checkin');
  const [checkinDate, setCheckinDate] = useState(todayISO());
  const [checkinClass, setCheckinClass] = useState('all');
  const [sortBy, setSortBy] = useState('class');
  const [historyStudentId, setHistoryStudentId] = useState('');
  const [statsFor, setStatsFor] = useState(null);
  const [email, setEmail] = useState(null);
  const [pkgModal, setPkgModal] = useState(null);
  const [sessionModal, setSessionModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [{ data: s }, { data: a }, { data: m }, { data: p }, { data: pk }, { data: st }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('attendance').select('*'),
      supabase.from('makeup_records').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('private_packages').select('*').order('purchased_date'),
      supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    setStudents((s || []).filter((x) => (x.status || 'active') !== 'withdrawn'));
    setAttendance(a || []);
    setMakeupRecords(m || []);
    setPayments(p || []);
    setPackages(pk || []);
    setSettings(st || {});
  }

  const classes = useMemo(() => allClassNames(students).filter((c) => students.some((s) => inClass(s, c))), [students]);
  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const recordsBy = useMemo(() => {
    const m = {};
    attendance.forEach((a) => (m[a.student_id] = m[a.student_id] || []).push(a));
    return m;
  }, [attendance]);
  const packagesBy = useMemo(() => {
    const m = {};
    packages.forEach((p) => (m[p.student_id] = m[p.student_id] || []).push(p));
    return m;
  }, [packages]);

  function upsertLocal(row) {
    setAttendance((prev) => {
      const idx = prev.findIndex((a) => a.id === row.id || (a.student_id === row.student_id && a.date === row.date && a.class_name === row.class_name));
      if (idx >= 0) return prev.map((a, i) => (i === idx ? row : a));
      return [...prev, row];
    });
  }

  async function setAttendanceStatus(studentId, date, className, status, minutes) {
    const { data, error } = await supabase
      .from('attendance')
      .upsert({ student_id: studentId, date, class_name: className, status, minutes: status === 'private' ? minutes || 30 : null }, { onConflict: 'student_id,date,class_name' })
      .select();
    if (error) return;
    upsertLocal(data[0]);
    if (status === 'absent') {
      await createOrUpdateMakeupRecord(studentId, date, className);
    } else {
      // Present / double / private / vacation: no makeup owed for this class.
      await supabase.from('makeup_records').delete().eq('student_id', studentId).eq('absence_date', date).eq('class_name', className);
      setMakeupRecords((prev) => prev.filter((m) => !(m.student_id === studentId && m.absence_date === date && m.class_name === className)));
    }
  }

  async function clearAttendance(rec) {
    await supabase.from('attendance').delete().eq('id', rec.id);
    setAttendance((prev) => prev.filter((a) => a.id !== rec.id));
    if (rec.status === 'absent') {
      await supabase.from('makeup_records').delete().eq('student_id', rec.student_id).eq('absence_date', rec.date).eq('class_name', rec.class_name);
      setMakeupRecords((prev) => prev.filter((m) => !(m.student_id === rec.student_id && m.absence_date === rec.date && m.class_name === rec.class_name)));
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

  async function setMakeupReservation(makeupId, reservationDate, reservationClassName) {
    const { data } = await supabase
      .from('makeup_records')
      .update({ reservation_date: reservationDate, reservation_class_name: reservationDate ? reservationClassName : null, status: reservationDate ? 'reserved' : 'pending' })
      .eq('id', makeupId)
      .select();
    if (data) setMakeupRecords((prev) => prev.map((m) => (m.id === makeupId ? data[0] : m)));
  }

  async function setMakeupCompleted(makeupId) {
    const { data } = await supabase.from('makeup_records').update({ status: 'completed' }).eq('id', makeupId).select();
    if (data) setMakeupRecords((prev) => prev.map((m) => (m.id === makeupId ? data[0] : m)));
  }

  // Guests attending a makeup session in a class that isn't their home class.
  async function setMakeupGuestStatus(makeupRecord, date, className, status) {
    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        { student_id: makeupRecord.student_id, date, class_name: className, status, is_makeup: true, makeup_record_id: makeupRecord.id },
        { onConflict: 'student_id,date,class_name' }
      )
      .select();
    if (error) return;
    upsertLocal(data[0]);
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

  // ── Emails ─────────────────────────────────────────────────────────────
  function openMakeupEmail(m) {
    const s = studentMap[m.student_id];
    if (!s) return;
    const reserved = m.status === 'reserved' && m.reservation_date;
    const vars = makeupVars(m, s, settings);
    setEmail({
      title: `Makeup class email — ${s.name}`,
      type: 'makeup',
      to: s.guardian_email || '',
      subject: fillTemplate(settings.makeup_subject || 'Makeup class for {student}', vars),
      message: fillTemplate((reserved ? settings.makeup_reserved_message : settings.makeup_message) || '', vars),
      studentId: s.id,
      payload: { makeup_record_id: m.id },
      note: m.emailed_at ? `Already emailed on ${new Date(m.emailed_at).toLocaleDateString('en-CA')}.` : reserved ? 'Confirms the booked makeup date.' : 'Tells the family the date the makeup must be used by.',
      onSent: async (at) => {
        await supabase.from('makeup_records').update({ emailed_at: at }).eq('id', m.id);
        setMakeupRecords((prev) => prev.map((x) => (x.id === m.id ? { ...x, emailed_at: at } : x)));
      },
    });
  }

  function openAbsenceEmail(s, last) {
    const vars = { ...studentVars(s, settings), last_attended: last ? formatDate(last) : 'a while ago' };
    setEmail({
      title: `Absence check — ${s.name}`,
      type: 'absence_check',
      to: s.guardian_email || '',
      subject: fillTemplate(settings.absence_subject || 'We miss {student}!', vars),
      message: fillTemplate(settings.absence_message || '', vars),
      studentId: s.id,
      payload: {},
      note: s.absence_emailed_at ? `Last check-in email: ${new Date(s.absence_emailed_at).toLocaleDateString('en-CA')}.` : '',
      onSent: async (at) => {
        await supabase.rpc('mark_absence_emailed', { p_student: s.id });
        setStudents((prev) => prev.map((x) => (x.id === s.id ? { ...x, absence_emailed_at: at } : x)));
      },
    });
  }

  // ── Private lessons ───────────────────────────────────────────────────
  async function savePackage() {
    const f = pkgModal;
    if (!f.student_id) return setPkgModal({ ...f, error: 'Choose a student.' });
    const minutes = Number(f.total_minutes);
    if (!(minutes > 0)) return setPkgModal({ ...f, error: 'Enter the minutes in the package.' });
    const { data, error } = await supabase.from('private_packages').insert({ student_id: f.student_id, purchased_date: f.purchased_date, total_minutes: minutes, notes: f.notes || null }).select().single();
    if (error) return setPkgModal({ ...f, error: error.message });
    setPackages((prev) => [...prev, data]);
    setPkgModal(null);
  }

  async function saveSession() {
    const f = sessionModal;
    if (!f.student_id) return setSessionModal({ ...f, error: 'Choose a student.' });
    const exists = attendance.some((a) => a.student_id === f.student_id && a.date === f.date && a.class_name === 'Private');
    if (exists) return setSessionModal({ ...f, error: 'A private lesson is already logged for that day — change it in the history.' });
    const { data, error } = await supabase.from('attendance').insert({ student_id: f.student_id, date: f.date, class_name: 'Private', status: 'private', minutes: Number(f.minutes) || 30 }).select().single();
    if (error) return setSessionModal({ ...f, error: error.message });
    upsertLocal(data);
    setSessionModal(null);
  }

  // ── Lists ─────────────────────────────────────────────────────────────
  const checkinList = useMemo(() => {
    const list = students.flatMap((s) => {
      const cls = splitClasses(s.class_name);
      return (cls.length ? cls : ['Unassigned']).filter((c) => checkinClass === 'all' || c === checkinClass).map((c) => ({ ...s, _class: c }));
    });
    return list.sort((a, b) => {
      if (sortBy === 'class' && a._class !== b._class) return classOrder(a._class) - classOrder(b._class) || a._class.localeCompare(b._class);
      return a.name.localeCompare(b.name) || classOrder(a._class) - classOrder(b._class);
    });
  }, [students, checkinClass, sortBy]);

  const makeupGuests = makeupRecords.filter(
    (m) =>
      m.status === 'reserved' &&
      m.reservation_date === checkinDate &&
      (checkinClass === 'all' || m.reservation_class_name === checkinClass) &&
      !checkinList.some((s) => s.id === m.student_id && s._class === m.reservation_class_name)
  );

  // Students with no class in the last 7 days and no vacation marked.
  const absentees = useMemo(() => {
    const today = todayISO();
    const since = addDaysISO(today, -ABSENCE_DAYS);
    return students
      .filter((s) => !s.billing_exempt)
      .map((s) => {
        const recs = recordsBy[s.id] || [];
        const last = lastAttended(recs);
        const onVacation = recs.some((r) => r.status === 'vacation' && r.date >= since);
        const started = s.enroll_date || s.created_at?.slice(0, 10);
        return { s, last, days: last ? Math.round((new Date(today) - new Date(last)) / 86400000) : null, onVacation, started };
      })
      .filter((x) => !x.onVacation && (!x.last || x.last < since) && (!x.started || x.started <= since))
      .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999) || a.s.name.localeCompare(b.s.name));
  }, [students, recordsBy]);

  const privateRows = useMemo(() => {
    const ids = new Set([...packages.map((p) => p.student_id), ...attendance.filter((a) => a.status === 'private').map((a) => a.student_id)]);
    return [...ids]
      .map((id) => studentMap[id])
      .filter(Boolean)
      .map((s) => ({ s, sum: studentSummary(s, recordsBy[s.id] || [], packagesBy[s.id] || []) }))
      .sort((a, b) => a.s.name.localeCompare(b.s.name));
  }, [packages, attendance, studentMap, recordsBy, packagesBy]);

  function statusBadge(status) {
    const m = MAKEUP_STATUSES[status] || MAKEUP_STATUSES.pending;
    return <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: m.bg, color: m.text, border: `1px solid ${m.border}` }}>{m.label}</span>;
  }

  function kindButton(kind, active, onClick, icon) {
    const k = ATTENDANCE_KINDS[kind];
    return (
      <button
        className="dp-btn"
        style={{ padding: '4px 8px', fontSize: 12.5, background: active ? k.bg : '#FFFFFF', borderColor: active ? k.border : '#DEDACC', color: active ? k.color : '#20241F' }}
        onClick={onClick}
      >
        {icon} {k.label}
      </button>
    );
  }

  const tabs = [
    { id: 'checkin', label: 'Check-in' },
    { id: 'history', label: 'History' },
    { id: 'makeup', label: 'Makeup Classes' },
    { id: 'private', label: 'Private Lessons' },
    { id: 'absence', label: `Absence Check${absentees.length ? ` (${absentees.length})` : ''}` },
  ];

  let lastClass = null;

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Attendance</h1>
          <p style={styles.subtitle}>Check-in, history, makeup classes, private lessons</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((v) => (
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
          <div style={{ ...styles.filterBar, alignItems: 'center' }}>
            <input type="date" className="dp-input" value={checkinDate} onChange={(e) => setCheckinDate(e.target.value)} />
            <select className="dp-select" value={checkinClass} onChange={(e) => setCheckinClass(e.target.value)}>
              <option value="all">All Classes</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: 13, color: '#5B5F56', marginLeft: 8 }}>Sort by</span>
            <select className="dp-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="class">Class</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div style={styles.card}>
            {checkinList.length === 0 && makeupGuests.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No matching students.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Class</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {checkinList.map((s) => {
                    const className = s._class;
                    const record = attendance.find((a) => a.student_id === s.id && a.date === checkinDate && a.class_name === className);
                    const st = record?.status;
                    const wk = weekCount(recordsBy[s.id] || [], checkinDate);
                    const header = sortBy === 'class' && checkinClass === 'all' && className !== lastClass;
                    lastClass = className;
                    return (
                      <React.Fragment key={s.id + '|' + className}>
                        {header && (
                          <tr>
                            <td colSpan={3} style={{ background: '#FAF8F2', fontSize: 11.5, fontWeight: 600, color: '#5B5F56', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{className}</td>
                          </tr>
                        )}
                        <tr className="dp-row">
                          <td style={{ fontWeight: 500 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {s.name}
                              {s.classes_per_week ? (
                                <span title="Classes this week / classes per week" style={{ fontSize: 11, color: wk >= s.classes_per_week ? '#2A5A30' : '#5B5F56', border: '1px solid #DEDACC', borderRadius: 999, padding: '0 6px', fontWeight: 400 }}>
                                  {wk}/{s.classes_per_week} this wk
                                </span>
                              ) : null}
                              <button className="dp-btn" title="Attendance summary" aria-label="Attendance summary" style={{ padding: 3, border: 'none', background: 'none' }} onClick={() => setStatsFor(s)}>
                                <BarChart3 size={14} color="#5B5F56" />
                              </button>
                            </div>
                          </td>
                          <td>{className}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                              {kindButton('present', st === 'present', () => setAttendanceStatus(s.id, checkinDate, className, 'present'), <CircleCheck size={13} />)}
                              {kindButton('absent', st === 'absent', () => setAttendanceStatus(s.id, checkinDate, className, 'absent'), <CircleX size={13} />)}
                              {kindButton('double', st === 'double', () => setAttendanceStatus(s.id, checkinDate, className, 'double'), <Copy size={13} />)}
                              {kindButton('private', st === 'private', () => setAttendanceStatus(s.id, checkinDate, className, 'private', record?.minutes || 30), <User size={13} />)}
                              {st === 'private' && (
                                <select className="dp-select" style={{ padding: '3px 6px', fontSize: 12 }} value={record.minutes || 30} onChange={(e) => setAttendanceStatus(s.id, checkinDate, className, 'private', Number(e.target.value))}>
                                  <option value={30}>30 min</option>
                                  <option value={60}>1 hour</option>
                                  <option value={90}>1.5 hours</option>
                                </select>
                              )}
                              {kindButton('vacation', st === 'vacation', () => setAttendanceStatus(s.id, checkinDate, className, 'vacation'), <Plane size={13} />)}
                              {record && (
                                <button className="dp-btn" title="Clear" style={{ padding: '3px 6px', fontSize: 11.5, color: '#8A8D84', border: 'none' }} onClick={() => clearAttendance(record)}>
                                  clear
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {makeupGuests.length > 0 && (
                    <tr>
                      <td colSpan={3} style={{ background: '#FCFAF3', fontSize: 11.5, fontWeight: 600, color: '#854F0B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Makeup guests</td>
                    </tr>
                  )}
                  {makeupGuests.map((m) => {
                    const s = studentMap[m.student_id];
                    if (!s) return null;
                    const className = m.reservation_class_name || checkinClass;
                    const record = attendance.find((a) => a.student_id === s.id && a.date === checkinDate && a.class_name === className);
                    return (
                      <tr key={'guest_' + m.id} className="dp-row" style={{ background: '#FCFAF3' }}>
                        <td style={{ fontWeight: 500 }}>
                          {s.name}
                          <span style={{ marginLeft: 6, fontSize: 10.5, color: '#854F0B', border: '1px solid #F0D9A8', background: '#FAEEDA', borderRadius: 999, padding: '1px 6px' }}>Makeup</span>
                        </td>
                        <td>{className} (home class: {s.class_name || 'Unassigned'})</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {kindButton('present', record?.status === 'present', () => setMakeupGuestStatus(m, checkinDate, className, 'present'), <CircleCheck size={13} />)}
                            {kindButton('absent', record?.status === 'absent', () => setMakeupGuestStatus(m, checkinDate, className, 'absent'), <CircleX size={13} />)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#8A8D84', marginTop: 8 }}>
            Double = took two classes that day (counts as 2). Private = private lesson (counted in minutes, not as a class). Vacation = away, no makeup owed.
          </p>
        </>
      )}

      {view === 'history' && (
        <>
          <div style={styles.filterBar}>
            <select className="dp-select" value={historyStudentId} onChange={(e) => setHistoryStudentId(e.target.value)}>
              <option value="">Select a student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {!historyStudentId ? (
            <div style={styles.card}><p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Select a student.</p></div>
          ) : (
            <StudentAttendance student={studentMap[historyStudentId]} records={recordsBy[historyStudentId] || []} packages={packagesBy[historyStudentId] || []} onClear={(r) => setConfirm({ msg: `Remove the ${formatDate(r.date)} ${r.class_name} record?`, run: () => clearAttendance(r) })} />
          )}
        </>
      )}

      {view === 'makeup' && (
        <>
          <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 12px' }}>
            The expiration date is tentatively the absence date + 30 days, and is confirmed once the next tuition invoice is paid. If the next month isn't paid, it shrinks to the last day of the month that was paid for.
          </p>
          <div style={styles.card}>
            {makeupRecords.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No makeup classes.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Absence</th>
                    <th>Expires</th>
                    {isAdmin && <th>Next payment</th>}
                    <th>Reservation</th>
                    <th>Status</th>
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
                      return (
                        <tr key={m.id} className="dp-row">
                          <td style={{ fontWeight: 500 }}>{student ? student.name : '(withdrawn / deleted)'}</td>
                          <td>{m.absence_date}<div style={{ fontSize: 11.5, color: '#8A8D84' }}>{m.class_name}</div></td>
                          <td>
                            {m.expiration_date}
                            {m.conditional && (
                              <div style={{ fontSize: 11, color: '#8A7A00', marginTop: 2 }}>
                                <CalendarClock size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
                                Awaiting payment
                              </div>
                            )}
                          </td>
                          {isAdmin && (
                            <td style={{ fontSize: 12.5, color: '#5B5F56' }}>
                              {m.next_billing_date}
                              <div style={{ color: payment?.paid ? '#2A5A30' : '#8A8D84' }}>{payment?.paid ? 'Paid' : 'Not paid yet'}</div>
                            </td>
                          )}
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input type="date" className="dp-input" style={{ padding: '5px 8px', fontSize: 12.5, width: 130 }} value={m.reservation_date || ''} onChange={(e) => setMakeupReservation(m.id, e.target.value || null, m.reservation_class_name || m.class_name)} />
                              <select className="dp-select" style={{ padding: '5px 6px', fontSize: 12.5 }} value={m.reservation_class_name || m.class_name || ''} onChange={(e) => setMakeupReservation(m.id, m.reservation_date, e.target.value)} disabled={!m.reservation_date}>
                                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </td>
                          <td>{statusBadge(m.status)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {student && m.status !== 'completed' && (
                                <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} disabled={!student.guardian_email} title={student.guardian_email ? (m.status === 'reserved' ? 'Email the booked makeup date' : 'Email the expiry date') : 'No guardian email'} onClick={() => openMakeupEmail(m)}>
                                  <Mail size={12} /> Email{m.emailed_at ? ' ✓' : ''}
                                </button>
                              )}
                              {m.status !== 'completed' && (
                                <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setMakeupCompleted(m.id)}>Complete</button>
                              )}
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

      {view === 'private' && (
        <>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="dp-btn" onClick={() => setSessionModal({ student_id: '', date: todayISO(), minutes: 30, error: '' })}><Plus size={14} /> Log a lesson</button>
            <button className="dp-btn dp-btn-primary" onClick={() => setPkgModal({ student_id: '', purchased_date: todayISO(), total_minutes: 150, notes: '', error: '' })}><Plus size={14} /> Add package</button>
          </div>
          <div style={styles.card}>
            {privateRows.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No private lessons yet. A package is usually 5 × 30 min (2.5 hours); lessons are counted in minutes, so 30-minute and 1-hour lessons both work.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Bought</th>
                    <th>Used</th>
                    <th>Left</th>
                    <th>Lessons</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {privateRows.map(({ s, sum }) => {
                    const lessons = (recordsBy[s.id] || []).filter((r) => r.status === 'private').sort((a, b) => (a.date < b.date ? 1 : -1));
                    return (
                      <tr key={s.id} className="dp-row">
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td>{minutesLabel(sum.privateBought)}</td>
                        <td>{minutesLabel(sum.privateUsed)}</td>
                        <td style={{ fontWeight: 600, color: sum.privateLeft <= 0 ? '#9A2B2B' : sum.privateLeft <= 30 ? '#854F0B' : '#2A5A30' }}>
                          {sum.privateLeft < 0 ? `${minutesLabel(-sum.privateLeft)} over` : minutesLabel(sum.privateLeft)}
                          <div style={{ fontSize: 11, fontWeight: 400, color: '#8A8D84' }}>= {Math.max(sum.privateLeft, 0) / 30} × 30 min</div>
                        </td>
                        <td style={{ fontSize: 12, color: '#5B5F56' }}>{lessons.slice(0, 6).map((r) => `${r.date.slice(5)} (${r.minutes || 30}m)`).join(', ')}{lessons.length > 6 ? ' …' : ''}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setSessionModal({ student_id: s.id, date: todayISO(), minutes: 30, error: '' })}>+ Lesson</button>
                            <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setPkgModal({ student_id: s.id, purchased_date: todayISO(), total_minutes: 150, notes: '', error: '' })}>+ Package</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {packages.length > 0 && (
            <div style={{ ...styles.card, marginTop: 14 }}>
              <p style={{ ...styles.metricLabel, padding: '12px 12px 0', margin: 0 }}>Packages</p>
              <table className="dp-table">
                <tbody>
                  {packages.slice().sort((a, b) => (a.purchased_date < b.purchased_date ? 1 : -1)).map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.purchased_date)}</td>
                      <td>{studentMap[p.student_id]?.name || '—'}</td>
                      <td>{minutesLabel(p.total_minutes)}</td>
                      <td style={{ color: '#5B5F56' }}>{p.notes}</td>
                      <td style={{ width: 40 }}>
                        <button className="dp-btn dp-btn-danger" style={{ padding: 4 }} aria-label="Delete package" onClick={() => setConfirm({ msg: 'Delete this package?', run: async () => { await supabase.from('private_packages').delete().eq('id', p.id); setPackages((prev) => prev.filter((x) => x.id !== p.id)); } })}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'absence' && (
        <>
          <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 12px' }}>
            Students with no class in the last {ABSENCE_DAYS} days and no vacation marked. Send a quick "is everything okay?" email (wording in Invoice Settings → Email templates).
          </p>
          <div style={styles.card}>
            {absentees.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Everyone has been in class this week.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Classes</th>
                    <th>Last class</th>
                    <th>Last check-in email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {absentees.map(({ s, last, days }) => (
                    <tr key={s.id} className="dp-row">
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td style={{ fontSize: 12.5, color: '#5B5F56' }}>{s.class_name || '—'}</td>
                      <td>{last ? `${formatDate(last)} (${days} days ago)` : <span style={{ color: '#8A8D84' }}>No record yet</span>}</td>
                      <td style={{ fontSize: 12.5, color: '#5B5F56' }}>{s.absence_emailed_at ? new Date(s.absence_emailed_at).toLocaleDateString('en-CA') : '—'}</td>
                      <td>
                        <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} disabled={!s.guardian_email} title={s.guardian_email ? '' : 'No guardian email'} onClick={() => openAbsenceEmail(s, last)}>
                          <Mail size={12} /> Email
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {statsFor && (
        <Modal title={`Attendance — ${statsFor.name}`} maxWidth={640} onClose={() => setStatsFor(null)} footer={<button className="dp-btn" onClick={() => setStatsFor(null)}>Close</button>}>
          <StudentAttendance student={statsFor} records={recordsBy[statsFor.id] || []} packages={packagesBy[statsFor.id] || []} compact />
        </Modal>
      )}

      {email && (
        <EmailComposeModal
          draft={email}
          onClose={() => setEmail(null)}
          onSent={async (at) => {
            await email.onSent(at);
            setEmail(null);
          }}
        />
      )}

      {pkgModal && (
        <Modal
          title="Add private lesson package"
          maxWidth={420}
          onClose={() => setPkgModal(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setPkgModal(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" onClick={savePackage}><Check size={15} /> Save</button>
            </>
          }
        >
          <Field label="Student" required>
            <select className="dp-select" style={{ width: '100%' }} value={pkgModal.student_id} onChange={(e) => setPkgModal({ ...pkgModal, student_id: e.target.value })}>
              <option value="">Select</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div style={styles.formRow}>
            <Field label="Date bought"><input type="date" className="dp-input" style={{ width: '100%' }} value={pkgModal.purchased_date} onChange={(e) => setPkgModal({ ...pkgModal, purchased_date: e.target.value })} /></Field>
            <Field label="Package">
              <select className="dp-select" style={{ width: '100%' }} value={[150, 300, 60, 600].includes(Number(pkgModal.total_minutes)) ? pkgModal.total_minutes : 'custom'} onChange={(e) => setPkgModal({ ...pkgModal, total_minutes: e.target.value === 'custom' ? '' : Number(e.target.value) })}>
                <option value={150}>5 × 30 min (2.5 h)</option>
                <option value={300}>5 × 1 hour (5 h)</option>
                <option value={600}>10 × 1 hour (10 h)</option>
                <option value={60}>1 hour</option>
                <option value="custom">Other…</option>
              </select>
            </Field>
          </div>
          {![150, 300, 60, 600].includes(Number(pkgModal.total_minutes)) && (
            <Field label="Total minutes"><input type="number" className="dp-input" style={{ width: '100%' }} value={pkgModal.total_minutes} onChange={(e) => setPkgModal({ ...pkgModal, total_minutes: e.target.value })} /></Field>
          )}
          <Field label="Notes"><input className="dp-input" style={{ width: '100%' }} value={pkgModal.notes} onChange={(e) => setPkgModal({ ...pkgModal, notes: e.target.value })} /></Field>
          {pkgModal.error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: 0 }}>{pkgModal.error}</p>}
        </Modal>
      )}

      {sessionModal && (
        <Modal
          title="Log a private lesson"
          maxWidth={420}
          onClose={() => setSessionModal(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setSessionModal(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" onClick={saveSession}><Check size={15} /> Save</button>
            </>
          }
        >
          <Field label="Student" required>
            <select className="dp-select" style={{ width: '100%' }} value={sessionModal.student_id} onChange={(e) => setSessionModal({ ...sessionModal, student_id: e.target.value })}>
              <option value="">Select</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div style={styles.formRow}>
            <Field label="Date"><input type="date" className="dp-input" style={{ width: '100%' }} value={sessionModal.date} onChange={(e) => setSessionModal({ ...sessionModal, date: e.target.value })} /></Field>
            <Field label="Length">
              <select className="dp-select" style={{ width: '100%' }} value={sessionModal.minutes} onChange={(e) => setSessionModal({ ...sessionModal, minutes: Number(e.target.value) })}>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
              </select>
            </Field>
          </div>
          {sessionModal.error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: 0 }}>{sessionModal.error}</p>}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.msg}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const run = confirm.run;
            setConfirm(null);
            await run();
          }}
        />
      )}
    </>
  );
}

// Month + billing-cycle counts, private-lesson balance and the record list.
function StudentAttendance({ student, records, packages, compact, onClear }) {
  if (!student) return null;
  const sum = studentSummary(student, records, packages);
  const sorted = records.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const box = (title, p) => (
    <div style={{ ...styles.metricCard, flex: 1, minWidth: 180 }}>
      <p style={styles.metricLabel}>{title}</p>
      {p ? (
        <>
          <p style={{ ...styles.metricValue, fontSize: 22 }}>
            {p.classes}
            {p.expected ? <span style={{ fontSize: 13, color: '#8A8D84', fontWeight: 400 }}> / ~{p.expected} expected</span> : <span style={{ fontSize: 13, color: '#8A8D84', fontWeight: 400 }}> classes</span>}
          </p>
          <p style={{ fontSize: 12, color: '#5B5F56', margin: '4px 0 0' }}>
            {formatDate(p.from)} – {formatDate(p.to)}
            <br />
            {p.absent} absent · {p.vacation} vacation{p.privateMinutes ? ` · private ${minutesLabel(p.privateMinutes)}` : ''}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 13, color: '#8A8D84' }}>No billing date set</p>
      )}
    </div>
  );
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {box('This month', sum.month)}
        {box('This billing cycle', sum.cycle)}
        {(sum.privateBought > 0 || sum.privateUsed > 0) && (
          <div style={{ ...styles.metricCard, flex: 1, minWidth: 150 }}>
            <p style={styles.metricLabel}>Private lessons left</p>
            <p style={{ ...styles.metricValue, fontSize: 22, color: sum.privateLeft <= 0 ? '#9A2B2B' : '#20241F' }}>{minutesLabel(Math.abs(sum.privateLeft))}{sum.privateLeft < 0 ? ' over' : ''}</p>
            <p style={{ fontSize: 12, color: '#5B5F56', margin: '4px 0 0' }}>{minutesLabel(sum.privateUsed)} used of {minutesLabel(sum.privateBought)}</p>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 8px' }}>
        {student.classes_per_week ? `${student.classes_per_week} classes per week` : 'Classes per week not set (Students → Edit)'} · last class {sum.lastAttended ? formatDate(sum.lastAttended) : '—'}
      </p>
      <div style={styles.card}>
        {sorted.length === 0 ? (
          <p style={{ padding: 16, color: '#5B5F56', fontSize: 13.5 }}>No attendance records.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Status</th>
                {onClear && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(compact ? sorted.slice(0, 15) : sorted).map((r) => {
                const k = ATTENDANCE_KINDS[r.status] || ATTENDANCE_KINDS.present;
                return (
                  <tr key={r.id} className="dp-row">
                    <td>{r.date}</td>
                    <td>{r.class_name}{r.is_makeup ? ' (makeup)' : ''}</td>
                    <td style={{ color: k.color }}>{k.label}{r.status === 'private' ? ` · ${r.minutes || 30} min` : ''}</td>
                    {onClear && (
                      <td style={{ width: 40 }}>
                        <button className="dp-btn dp-btn-danger" style={{ padding: 4 }} aria-label="Remove" onClick={() => onClear(r)}><Trash2 size={13} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
