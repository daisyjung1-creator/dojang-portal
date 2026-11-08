import StudentFlags from '../../components/StudentFlags';
import React, { useEffect, useMemo, useState } from 'react';
import { CircleCheck, CircleX, CalendarClock, BarChart3, Mail, Plus, Trash2, Check, Plane, Copy, User, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { MAKEUP_STATUSES } from '../../lib/constants';
import { todayISO, computeMakeupWindow, addDaysISO } from '../../lib/billingDates';
import { splitClasses, allClassNames, inClass, DOJANG_CLASSES, comesOn } from '../../lib/classes';
import { ATTENDANCE_KINDS, studentSummary, weekCount, lastAttended, minutesLabel, absenceAlerts, trackingStart, NOT_SEEN_DAYS, REGULAR_WINDOW, COMP_WINDOW } from '../../lib/attendanceStats';
import { fillTemplate, makeupVars, studentVars } from '../../lib/emailTemplates';
import { formatDate } from '../../lib/invoiceUtils';
import { useAuth } from '../../auth/AuthContext';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmailComposeModal from '../../components/EmailComposeModal';
import Kiosk from './Kiosk';
import AttendanceMonth from './AttendanceMonth';
import ClassDaysSetup from './ClassDaysSetup';

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
  const [schedule, setSchedule] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [kiosk, setKiosk] = useState(false);
  const [schedDraft, setSchedDraft] = useState(null);
  const [schedMsg, setSchedMsg] = useState('');
  const [walkInModal, setWalkInModal] = useState(null);
  const [absenceModal, setAbsenceModal] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const since = addDaysISO(todayISO(), -30);
    const [{ data: sch }, { data: cx }] = await Promise.all([
      supabase.from('class_schedule').select('*').order('weekday').order('start_time'),
      supabase.from('class_cancellations').select('*').gte('date', since),
    ]);
    setSchedule(sch || []);
    setCancellations(cx || []);
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
    // Comp Team is unlimited classes, so a missed class needs no makeup.
    const unlimited = inClass(studentMap[studentId] || {}, 'Comp Team');
    // Only an excused absence gets a makeup class.
    if (status === 'excused' && !unlimited) {
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
    if (rec.status === 'excused' || rec.status === 'absent') {
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

  // A student who turns up for a makeup without booking (or just drops in).
  // Uses their oldest open makeup if they have one; otherwise it's an extra class.
  async function walkIn(studentId, date, className) {
    const open = makeupRecords
      .filter((m) => m.student_id === studentId && ['pending', 'reserved'].includes(m.status) && m.absence_date !== date && m.expiration_date >= date)
      .sort((a, b) => (a.absence_date < b.absence_date ? -1 : 1))[0];
    const { data, error } = await supabase
      .from('attendance')
      .upsert({ student_id: studentId, date, class_name: className, status: 'present', minutes: null, auto: false, is_makeup: !!open, makeup_record_id: open ? open.id : null }, { onConflict: 'student_id,date,class_name' })
      .select();
    if (error) return null;
    upsertLocal(data[0]);
    if (open) {
      const { data: done } = await supabase.from('makeup_records').update({ status: 'completed', reservation_date: date, reservation_class_name: className }).eq('id', open.id).select();
      if (done) setMakeupRecords((prev) => prev.map((m) => (m.id === open.id ? done[0] : m)));
    }
    return open || 'extra';
  }

  // The student's scheduled classes between two dates (for reporting an absence ahead).
  function scheduledClasses(student, from, to) {
    const mine = splitClasses(student?.class_name);
    const out = [];
    for (let d = from; d && to && d <= to && out.length < 60; d = addDaysISO(d, 1)) {
      const dow = new Date(d + 'T00:00:00').getDay();
      schedule
        .filter((c) => c.active !== false && c.weekday === dow && mine.includes(c.class_name) && comesOn(student, c.weekday, c.class_name))
        .forEach((c) => out.push({ date: d, class_name: c.class_name, start: c.start_time }));
    }
    return out;
  }

  // Family told us ahead: mark each class Excused now (so it gets a makeup,
  // which can even be used before the absence date).
  async function reportAbsence() {
    const f = absenceModal;
    const st = studentMap[f.student_id];
    const picks = scheduledClasses(st, f.from, f.to).filter((x) => f.skip[`${x.date}|${x.class_name}`] !== true);
    if (!st || !picks.length) return setAbsenceModal({ ...f, msg: 'Choose a student and at least one class.' });
    for (const x of picks) {
      await setAttendanceStatus(st.id, x.date, x.class_name, f.kind);
      if (f.note) await supabase.from('attendance').update({ note: f.note }).eq('student_id', st.id).eq('date', x.date).eq('class_name', x.class_name);
    }
    setAbsenceModal(null);
  }

  // Undo a makeup / drop-in check-in: the makeup goes back to "not scheduled".
  async function undoGuest(rec, m) {
    if (rec) await clearAttendance(rec);
    if (m) {
      const { data } = await supabase.from('makeup_records').update({ status: 'pending', reservation_date: null, reservation_class_name: null }).eq('id', m.id).select();
      if (data) setMakeupRecords((prev) => prev.map((x) => (x.id === m.id ? data[0] : x)));
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
      (m.status === 'reserved' || m.status === 'completed') &&
      m.reservation_date === checkinDate &&
      (checkinClass === 'all' || m.reservation_class_name === checkinClass) &&
      !checkinList.some((s) => s.id === m.student_id && s._class === m.reservation_class_name)
  );

  // Checked in to a class that isn't theirs, without a makeup record (drop-ins).
  const dropIns = attendance.filter(
    (a) =>
      a.date === checkinDate &&
      a.class_name !== 'Private' &&
      (checkinClass === 'all' || a.class_name === checkinClass) &&
      !checkinList.some((s) => s.id === a.student_id && s._class === a.class_name) &&
      !makeupGuests.some((m) => m.student_id === a.student_id && m.reservation_class_name === a.class_name)
  );

  // Not in class for a week, or absent a lot lately (see attendanceStats.js).
  const alerts = useMemo(
    () => absenceAlerts(students, recordsBy, { schedule, cancellations, today: todayISO(), start: trackingStart(attendance) }),
    [students, recordsBy, schedule, cancellations, attendance]
  );
  const absentees = alerts.notSeen;
  const frequent = alerts.frequent;
  const alertCount = new Set([...absentees, ...frequent].map((x) => x.s.id)).size;

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
    { id: 'month', label: 'Monthly' },
    { id: 'makeup', label: 'Makeup Classes' },
    { id: 'private', label: 'Private Lessons' },
    { id: 'absence', label: `Absence Check${alertCount ? ` (${alertCount})` : ''}` },
    ...(isAdmin ? [{ id: 'schedule', label: 'Class Schedule' }] : []),
  ];

  async function cancelClass(date, className) {
    const { data } = await supabase.from('class_cancellations').insert({ date, class_name: className }).select().single();
    if (data) setCancellations((prev) => [...prev, data]);
  }

  async function saveSchedule() {
    const rows = schedDraft.filter((r) => r.class_name.trim() && r.start_time && r.end_time);
    if (rows.some((r) => r.end_time <= r.start_time)) return setSchedMsg('An end time is before its start time.');
    const keep = rows.filter((r) => r.id).map((r) => r.id);
    const gone = schedule.filter((r) => !keep.includes(r.id)).map((r) => r.id);
    if (gone.length) await supabase.from('class_schedule').delete().in('id', gone);
    for (const r of rows) {
      const row = { class_name: r.class_name.trim(), weekday: Number(r.weekday), start_time: r.start_time, end_time: r.end_time, active: r.active !== false };
      if (r.id) await supabase.from('class_schedule').update(row).eq('id', r.id);
      else await supabase.from('class_schedule').insert(row);
    }
    const { data } = await supabase.from('class_schedule').select('*').order('weekday').order('start_time');
    setSchedule(data || []);
    setSchedDraft(null);
    setSchedMsg('Schedule saved.');
  }

  let lastClass = null;

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Attendance</h1>
          <p style={styles.subtitle}>Check-in, history, makeup classes, private lessons</p>
        </div>
        <button className="dp-btn dp-btn-primary" style={{ fontSize: 15, padding: '10px 18px' }} onClick={() => setKiosk(true)}>
          <CircleCheck size={16} /> Open Kiosk
        </button>
      </div>

      {kiosk && (
        <Kiosk
          students={students}
          attendance={attendance}
          makeupRecords={makeupRecords}
          schedule={schedule}
          cancellations={cancellations}
          onMark={setAttendanceStatus}
          onUnmark={clearAttendance}
          onGuest={setMakeupGuestStatus}
          onCancelClass={cancelClass}
          onWalkIn={walkIn}
          onUndoGuest={undoGuest}
          autoAbsentTime={settings.auto_absent_time}
          onClose={() => {
            setKiosk(false);
            loadAll();
          }}
        />
      )}

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

      {view !== 'absence' && alertCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FAEEDA', border: '1px solid #F0D9A8', borderRadius: 8, padding: '9px 14px', marginBottom: 14, fontSize: 13, color: '#5C3A07', flexWrap: 'wrap' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 240 }}>
            {frequent.length > 0 && <><b>{frequent.length} below their classes</b> ({frequent.slice(0, 4).map((x) => x.s.name).join(', ')}{frequent.length > 4 ? '…' : ''})</>}
            {frequent.length > 0 && absentees.length > 0 && ' · '}
            {absentees.length > 0 && <><b>{absentees.length} not in class for {NOT_SEEN_DAYS}+ days</b></>}
          </span>
          <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12.5 }} onClick={() => setView('absence')}>Check</button>
        </div>
      )}

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
            <div style={{ flex: 1 }} />
            <button className="dp-btn" onClick={() => setAbsenceModal({ student_id: '', from: checkinDate, to: checkinDate, kind: 'excused', note: '', skip: {}, msg: '' })}>
              <CalendarClock size={14} /> Report absence ahead
            </button>
            <button className="dp-btn" onClick={() => setWalkInModal({ student_id: '', class_name: checkinClass !== 'all' ? checkinClass : classes[0] || '', msg: '' })}>
              <Plus size={14} /> Makeup / drop-in
            </button>
          </div>
          <div style={styles.card}>
            {checkinList.length === 0 && makeupGuests.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No matching students.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="dp-hide-sm">Class</th>
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
                              <StudentFlags s={s} />
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
                          <td className="dp-hide-sm">{className}</td>
                          <td className="dp-att-actions">
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                              {kindButton('present', st === 'present', () => setAttendanceStatus(s.id, checkinDate, className, 'present'), <CircleCheck size={13} />)}
                              {kindButton('absent', st === 'absent', () => setAttendanceStatus(s.id, checkinDate, className, 'absent'), <CircleX size={13} />)}
                              {kindButton('excused', st === 'excused', () => setAttendanceStatus(s.id, checkinDate, className, 'excused'), <CalendarClock size={13} />)}
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
                  {dropIns.map((a) => {
                    const st = studentMap[a.student_id];
                    if (!st) return null;
                    return (
                      <tr key={'drop_' + a.id} className="dp-row" style={{ background: '#FCFAF3' }}>
                        <td style={{ fontWeight: 500 }}>
                          {st.name}
                          <StudentFlags s={st} style={{ marginLeft: 6 }} />
                          <span style={{ marginLeft: 6, fontSize: 10.5, color: '#1E4566', border: '1px solid #B9D3E4', background: '#E6F0F6', borderRadius: 999, padding: '1px 6px' }}>Drop-in</span>
                        </td>
                        <td className="dp-hide-sm">{a.class_name} (home class: {st.class_name || 'Unassigned'})</td>
                        <td className="dp-att-actions">
                          <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => clearAttendance(a)}>Remove</button>
                        </td>
                      </tr>
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
                          <StudentFlags s={s} style={{ marginLeft: 6 }} />
                          <span style={{ marginLeft: 6, fontSize: 10.5, color: '#854F0B', border: '1px solid #F0D9A8', background: '#FAEEDA', borderRadius: 999, padding: '1px 6px' }}>Makeup</span>
                        </td>
                        <td className="dp-hide-sm">{className} (home class: {s.class_name || 'Unassigned'})</td>
                        <td className="dp-att-actions">
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
            Absent = no-show, no makeup. Excused = absent with notice — gets a makeup class (not Comp Team, which is unlimited). Double = took two classes that day (counts as 2). Private = private lesson (counted in minutes). Vacation = away. Students not marked by the end of the day are recorded as Absent.
          </p>
        </>
      )}

      {view === 'month' && <AttendanceMonth students={students} attendance={attendance} schedule={schedule} classes={classes} />}

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
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: '#5B5F56', margin: 0, flex: 1 }}>
              Makeups come only from <b>Excused</b> absences. A makeup can be taken before or after the missed class, up to 30 days after it (confirmed once the next tuition is paid; if it isn't, it ends with the last paid day).
            </p>
            <button className="dp-btn dp-btn-primary" onClick={() => setAbsenceModal({ student_id: '', from: todayISO(), to: todayISO(), kind: 'excused', note: '', skip: {}, msg: '' })}>
              <CalendarClock size={14} /> Report absence ahead
            </button>
          </div>
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
                            {m.reservation_date && m.expiration_date && m.reservation_date > m.expiration_date && m.status !== 'completed' && (
                              <div style={{ fontSize: 11, color: '#9A2B2B', marginTop: 3 }}>After it expires ({m.expiration_date}) — must be within 30 days</div>
                            )}
                          </td>
                          <td>{statusBadge(m.status === 'pending' && m.expiration_date && m.expiration_date < todayISO() ? 'expired' : m.status)}</td>
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
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Below their classes</h3>
          <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 12px' }}>
            Fewer classes in the last {REGULAR_WINDOW / 7} weeks than their plan (e.g. 2x/week → 4), or Comp Team with 0–1 class in the last week. Excused / vacation count as came; cancelled classes aren't expected. Counted up to yesterday.
          </p>
          <div style={{ ...styles.card, marginBottom: 22 }}>
            {frequent.length === 0 ? (
              <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Everyone is keeping up with their classes.</p>
            ) : (
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Classes</th>
                    <th>Came / expected</th>
                    <th>Last class</th>
                    <th>Last check-in email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {frequent.map(({ s, came, expected, comp, from, last }) => (
                    <tr key={s.id} className="dp-row">
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td style={{ fontSize: 12.5, color: '#5B5F56' }}>{s.class_name || '—'}</td>
                      <td style={{ fontSize: 13 }}><span style={{ color: '#9A2B2B', fontWeight: 500 }}>{came} / {expected}</span> <span style={{ fontSize: 12, color: '#8A8D84' }}>since {formatDate(from)}{comp ? ' · Comp Team' : ''}</span></td>
                      <td style={{ fontSize: 13 }}>{last ? formatDate(last) : <span style={{ color: '#8A8D84' }}>None yet</span>}</td>
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

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Not in class for {NOT_SEEN_DAYS}+ days</h3>
          <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 12px' }}>
            Students with no class in the last {NOT_SEEN_DAYS} days and no vacation marked. Send a quick "is everything okay?" email (wording in Invoice Settings → Email templates).
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

      {view === 'schedule' && (() => {
        const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const rows = schedDraft || schedule;
        const edit = (i, patch) => setSchedDraft(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
        return (
          <>
            <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 12px' }}>
              The kiosk opens the class that's on now. At the end of the day, students who weren't checked in are marked absent (with a makeup, except Comp Team) — so you can still enter attendance after classes. Use "Class cancelled today" in the kiosk for holidays.
            </p>
            {schedMsg && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{schedMsg}</p>}
            <div style={{ ...styles.card, padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
              Mark students who weren't checked in as absent at
              <input
                type="time"
                className="dp-input"
                value={String(settings.auto_absent_time || '23:30').slice(0, 5)}
                onChange={(e) => setSettings({ ...settings, auto_absent_time: e.target.value })}
              />
              (Edmonton time, every day)
              <button
                className="dp-btn"
                onClick={async () => {
                  const { error } = await supabase.from('invoice_settings').update({ auto_absent_time: settings.auto_absent_time || '23:30' }).eq('id', 1);
                  setSchedMsg(error ? 'Could not save: ' + error.message : 'Saved.');
                }}
              >
                <Check size={14} /> Save time
              </button>
            </div>
            <div style={styles.card}>
              <table className="dp-table">
                <thead>
                  <tr><th>Day</th><th>Class</th><th>Start</th><th>End</th><th>Active</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id || 'n' + i}>
                      <td>
                        <select className="dp-select" value={r.weekday} onChange={(e) => edit(i, { weekday: Number(e.target.value) })}>
                          {DAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="dp-input" list="sched-classes" style={{ width: '100%' }} value={r.class_name} onChange={(e) => edit(i, { class_name: e.target.value })} />
                      </td>
                      <td><input type="time" className="dp-input" value={String(r.start_time).slice(0, 5)} onChange={(e) => edit(i, { start_time: e.target.value })} /></td>
                      <td><input type="time" className="dp-input" value={String(r.end_time).slice(0, 5)} onChange={(e) => edit(i, { end_time: e.target.value })} /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={r.active !== false} onChange={(e) => edit(i, { active: e.target.checked })} /></td>
                      <td style={{ width: 40 }}>
                        <button className="dp-btn dp-btn-danger" style={{ padding: 4 }} aria-label="Remove" onClick={() => setSchedDraft(rows.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="sched-classes">{DOJANG_CLASSES.map((c) => <option key={c} value={c} />)}</datalist>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 12, borderTop: '1px solid #EDEAE0' }}>
                <button className="dp-btn" onClick={() => setSchedDraft([...rows, { class_name: '', weekday: 1, start_time: '16:30', end_time: '17:20', active: true }])}><Plus size={14} /> Add class time</button>
                {schedDraft && <button className="dp-btn" onClick={() => setSchedDraft(null)}>Discard</button>}
                <button className="dp-btn dp-btn-primary" disabled={!schedDraft} onClick={saveSchedule}><Check size={14} /> Save schedule</button>
              </div>
            </div>
            {cancellations.length > 0 && (
              <div style={{ ...styles.card, marginTop: 14 }}>
                <p style={{ ...styles.metricLabel, padding: '12px 12px 0', margin: 0 }}>Cancelled classes (last 30 days)</p>
                <table className="dp-table">
                  <tbody>
                    {cancellations.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((c) => (
                      <tr key={c.id}>
                        <td>{formatDate(c.date)}</td>
                        <td>{c.class_name || 'All classes'}</td>
                        <td style={{ width: 40 }}>
                          <button className="dp-btn dp-btn-danger" style={{ padding: 4 }} aria-label="Undo" title="Undo cancellation" onClick={async () => { await supabase.from('class_cancellations').delete().eq('id', c.id); setCancellations((prev) => prev.filter((x) => x.id !== c.id)); }}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ClassDaysSetup students={students} schedule={schedule} onSaved={(id, days) => setStudents((prev) => prev.map((x) => (x.id === id ? { ...x, class_days: days } : x)))} onCleared={loadAll} />
          </>
        );
      })()}

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

      {absenceModal && (() => {
        const st = studentMap[absenceModal.student_id];
        const list = st ? scheduledClasses(st, absenceModal.from, absenceModal.to) : [];
        const chosen = list.filter((x) => absenceModal.skip[`${x.date}|${x.class_name}`] !== true);
        return (
          <Modal
            title="Report an absence ahead"
            maxWidth={520}
            onClose={() => setAbsenceModal(null)}
            footer={
              <>
                <button className="dp-btn" onClick={() => setAbsenceModal(null)}>Cancel</button>
                <button className="dp-btn dp-btn-primary" disabled={!chosen.length} onClick={reportAbsence}>
                  <Check size={15} /> Mark {chosen.length} class{chosen.length === 1 ? '' : 'es'} {absenceModal.kind === 'excused' ? 'Excused' : 'Vacation'}
                </button>
              </>
            }
          >
            <Field label="Student" required>
              <select className="dp-select" style={{ width: '100%' }} value={absenceModal.student_id} onChange={(e) => setAbsenceModal({ ...absenceModal, student_id: e.target.value, skip: {} })}>
                <option value="">Select</option>
                {students.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
            <div style={styles.formRow}>
              <Field label="From"><input type="date" className="dp-input" style={{ width: '100%' }} value={absenceModal.from} onChange={(e) => setAbsenceModal({ ...absenceModal, from: e.target.value, to: absenceModal.to < e.target.value ? e.target.value : absenceModal.to })} /></Field>
              <Field label="To"><input type="date" className="dp-input" style={{ width: '100%' }} value={absenceModal.to} min={absenceModal.from} onChange={(e) => setAbsenceModal({ ...absenceModal, to: e.target.value })} /></Field>
            </div>
            <Field label="Mark as">
              <select className="dp-select" style={{ width: '100%' }} value={absenceModal.kind} onChange={(e) => setAbsenceModal({ ...absenceModal, kind: e.target.value })}>
                <option value="excused">Excused — gets a makeup class</option>
                <option value="vacation">Vacation — no makeup</option>
              </select>
            </Field>
            <Field label="Note (optional)"><input className="dp-input" style={{ width: '100%' }} placeholder="e.g. Family trip, sick" value={absenceModal.note} onChange={(e) => setAbsenceModal({ ...absenceModal, note: e.target.value })} /></Field>
            {st && (
              <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, padding: 8, maxHeight: 200, overflowY: 'auto' }}>
                {list.length === 0 ? (
                  <span style={{ fontSize: 13, color: '#8A8D84' }}>No classes for {st.name} on those days.</span>
                ) : (
                  list.map((x) => {
                    const key = `${x.date}|${x.class_name}`;
                    return (
                      <label key={key} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 0' }}>
                        <input type="checkbox" checked={absenceModal.skip[key] !== true} onChange={(e) => setAbsenceModal({ ...absenceModal, skip: { ...absenceModal.skip, [key]: !e.target.checked } })} />
                        {new Date(x.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · {x.class_name}
                      </label>
                    );
                  })
                )}
              </div>
            )}
            {st && inClass(st, 'Comp Team') && absenceModal.kind === 'excused' && <p style={{ fontSize: 12.5, color: '#854F0B', margin: '8px 0 0' }}>Comp Team is unlimited, so no makeup is created.</p>}
            {absenceModal.msg && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>{absenceModal.msg}</p>}
          </Modal>
        );
      })()}

      {walkInModal && (
        <Modal
          title="Makeup / drop-in (no booking)"
          maxWidth={440}
          onClose={() => setWalkInModal(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setWalkInModal(null)}>Cancel</button>
              <button
                className="dp-btn dp-btn-primary"
                onClick={async () => {
                  if (!walkInModal.student_id || !walkInModal.class_name) return setWalkInModal({ ...walkInModal, msg: 'Choose the student and the class.' });
                  await walkIn(walkInModal.student_id, checkinDate, walkInModal.class_name);
                  setWalkInModal(null);
                }}
              >
                <Check size={15} /> Check in
              </button>
            </>
          }
        >
          <Field label="Student" required>
            <select className="dp-select" style={{ width: '100%' }} value={walkInModal.student_id} onChange={(e) => setWalkInModal({ ...walkInModal, student_id: e.target.value })}>
              <option value="">Select</option>
              {students.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Class they came to">
            <select className="dp-select" style={{ width: '100%' }} value={walkInModal.class_name} onChange={(e) => setWalkInModal({ ...walkInModal, class_name: e.target.value })}>
              {allClassNames(students).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {walkInModal.student_id && (() => {
            const open = makeupRecords.filter((m) => m.student_id === walkInModal.student_id && ['pending', 'reserved'].includes(m.status) && m.absence_date !== checkinDate && m.expiration_date >= checkinDate).sort((a, b) => (a.absence_date < b.absence_date ? -1 : 1));
            return (
              <p style={{ fontSize: 13, color: '#5B5F56', margin: 0 }}>
                {open.length ? `Uses the makeup for the class missed on ${formatDate(open[0].absence_date)} (${open.length} open).` : 'No open makeup — recorded as an extra class.'}
              </p>
            );
          })()}
          {walkInModal.msg && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>{walkInModal.msg}</p>}
        </Modal>
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
            {p.absent} absent · {p.excused} excused · {p.vacation} vacation{p.privateMinutes ? ` · private ${minutesLabel(p.privateMinutes)}` : ''}
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
        {inClass(student, 'Comp Team') ? 'Comp Team — unlimited classes (no makeups needed)' : student.classes_per_week ? `${student.classes_per_week} classes per week` : 'Classes per week not set (Students → Edit)'} · last class {sum.lastAttended ? formatDate(sum.lastAttended) : '—'}
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
                    <td>{r.class_name}{r.is_makeup ? ' (makeup)' : ''}{r.auto ? ' · auto' : ''}{r.note ? <span style={{ color: '#8A8D84' }}> · {r.note}</span> : null}</td>
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
