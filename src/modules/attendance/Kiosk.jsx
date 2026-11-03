import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Ban } from 'lucide-react';
import { splitClasses } from '../../lib/classes';
import { BELTS } from '../../lib/constants';
import ConfirmDialog from '../../components/ConfirmDialog';

// The dojang's clock, whatever time zone the iPad is set to.
export function dojangNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), dow };
}

export const toMin = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};
export const timeLabel = (t) => {
  const m = toMin(t);
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}${h >= 12 ? ' pm' : ' am'}`;
};

// Full-screen check-in for the iPad: the class that's on now opens by itself,
// staff tap each student who's here. Anyone not tapped is marked absent
// automatically 10 minutes after the class ends.
export default function Kiosk({ students, attendance, makeupRecords, schedule, cancellations, onMark, onUnmark, onGuest, onCancelClass, onClose }) {
  const [now, setNow] = useState(dojangNow());
  const [picked, setPicked] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(dojangNow()), 30000);
    return () => clearInterval(t);
  }, []);

  const today = useMemo(
    () => schedule.filter((c) => c.active !== false && c.weekday === now.dow).sort((a, b) => toMin(a.start_time) - toMin(b.start_time)),
    [schedule, now.dow]
  );
  // On now = from 20 min before start until it ends; otherwise the next one, else the last.
  const auto = today.find((c) => now.minutes >= toMin(c.start_time) - 20 && now.minutes < toMin(c.end_time)) || today.find((c) => toMin(c.start_time) > now.minutes) || today[today.length - 1];
  const cls = today.find((c) => c.id === picked) || auto;
  const cancelled = cls && cancellations.some((x) => x.date === now.date && (!x.class_name || x.class_name === cls.class_name));

  const roster = useMemo(() => {
    if (!cls) return [];
    const list = students
      .filter((s) => !s.billing_exempt && splitClasses(s.class_name).includes(cls.class_name) && (!s.enroll_date || s.enroll_date <= now.date))
      .map((s) => ({ s, rec: attendance.find((a) => a.student_id === s.id && a.date === now.date && a.class_name === cls.class_name) }));
    const guests = makeupRecords
      .filter((m) => m.status !== 'expired' && m.reservation_date === now.date && (m.reservation_class_name || m.class_name) === cls.class_name)
      .map((m) => ({ s: students.find((x) => x.id === m.student_id), m, rec: attendance.find((a) => a.student_id === m.student_id && a.date === now.date && a.class_name === cls.class_name) }))
      .filter((g) => g.s && !list.some((r) => r.s.id === g.s.id));
    return [...list.sort((a, b) => a.s.name.localeCompare(b.s.name)), ...guests];
  }, [cls, students, attendance, makeupRecords, now.date]);

  const here = roster.filter((r) => r.rec && ['present', 'double', 'private'].includes(r.rec.status)).length;
  const ended = cls && now.minutes >= toMin(cls.end_time);

  function tap(r) {
    if (r.rec && r.rec.status === 'present') return r.m ? onGuest(r.m, now.date, cls.class_name, 'absent') : onUnmark(r.rec);
    if (r.m) return onGuest(r.m, now.date, cls.class_name, 'present');
    onMark(r.s.id, now.date, cls.class_name, 'present');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F6F4EE', zIndex: 900, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#20241F', color: '#fff', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{cls ? cls.class_name : 'No classes today'}</div>
        {cls && <div style={{ fontSize: 15, opacity: 0.8 }}>{timeLabel(cls.start_time)} – {timeLabel(cls.end_time)}</div>}
        {cls && !cancelled && <div style={{ fontSize: 15, background: '#2A5A30', borderRadius: 999, padding: '3px 12px' }}>{here} / {roster.length} here</div>}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 14, opacity: 0.8 }}>{new Date(now.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <button className="dp-btn" style={{ background: 'transparent', color: '#fff', borderColor: '#5B5F56' }} onClick={onClose}><X size={16} /> Exit</button>
      </div>

      {today.length > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 20px', overflowX: 'auto', borderBottom: '1px solid #E4E0D4' }}>
          {today.map((c) => (
            <button
              key={c.id}
              className="dp-btn"
              style={{ whiteSpace: 'nowrap', fontSize: 14, padding: '8px 14px', background: cls && c.id === cls.id ? '#20241F' : '#fff', color: cls && c.id === cls.id ? '#fff' : '#20241F' }}
              onClick={() => setPicked(c.id)}
            >
              {timeLabel(c.start_time)} {c.class_name}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!cls ? (
          <p style={{ fontSize: 18, color: '#5B5F56', textAlign: 'center', marginTop: 80 }}>No classes on the schedule today.</p>
        ) : cancelled ? (
          <p style={{ fontSize: 18, color: '#854F0B', textAlign: 'center', marginTop: 80 }}>This class is cancelled today — nobody will be marked absent.</p>
        ) : roster.length === 0 ? (
          <p style={{ fontSize: 18, color: '#5B5F56', textAlign: 'center', marginTop: 80 }}>No students in this class.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {roster.map((r) => {
              const st = r.rec?.status;
              const on = st === 'present' || st === 'double' || st === 'private';
              const belt = BELTS.find((b) => b.value === r.s.belt) || BELTS[0];
              return (
                <button
                  key={r.s.id}
                  onClick={() => tap(r)}
                  style={{
                    position: 'relative',
                    minHeight: 96,
                    borderRadius: 12,
                    border: `2px solid ${on ? '#3C7A43' : st === 'absent' ? '#E4B8B8' : st === 'vacation' ? '#F0D9A8' : '#DEDACC'}`,
                    background: on ? '#E8F1E9' : st === 'absent' ? '#FBEAEA' : '#fff',
                    padding: '14px 12px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ height: 6, borderRadius: 3, background: belt.bg, border: `1px solid ${belt.border}`, marginBottom: 10 }} />
                  <div style={{ fontSize: 17, fontWeight: 600, color: '#20241F', lineHeight: 1.25 }}>{r.s.name}</div>
                  <div style={{ fontSize: 12.5, color: '#5B5F56', marginTop: 4 }}>
                    {r.m ? 'Makeup' : st === 'absent' ? (r.rec.auto ? 'Marked absent' : 'Absent') : st === 'vacation' ? 'Vacation' : st === 'double' ? 'Double class' : st === 'private' ? 'Private' : on ? 'Here' : 'Tap when here'}
                  </div>
                  {on && (
                    <div style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, background: '#3C7A43', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={16} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cls && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderTop: '1px solid #E4E0D4', fontSize: 13, color: '#5B5F56', flexWrap: 'wrap' }}>
          <span>
            {cancelled
              ? 'Cancelled today.'
              : ended
                ? 'Class finished — anyone not tapped is marked absent within 10 minutes (you can still tap late arrivals).'
                : `Anyone not tapped is marked absent automatically 10 minutes after ${timeLabel(cls.end_time)}.`}
          </span>
          <div style={{ flex: 1 }} />
          {!cancelled && (
            <button className="dp-btn" onClick={() => setConfirm(true)}><Ban size={14} /> Class cancelled today</button>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={`Mark ${cls.class_name} as cancelled today? Nobody will be marked absent for it.`}
          confirmLabel="Cancel class"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            await onCancelClass(now.date, cls.class_name);
          }}
        />
      )}
    </div>
  );
}
