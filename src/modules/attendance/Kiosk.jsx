import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Ban, Plus } from 'lucide-react';
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
export default function Kiosk({ students, attendance, makeupRecords, schedule, cancellations, onMark, onUnmark, onGuest, onCancelClass, onWalkIn, onUndoGuest, autoAbsentTime, onClose }) {
  // Tiles: tap = here. The small "Excused" button marks an absence with notice
  // (gets a makeup); anyone left unmarked becomes a plain Absent at the end of the day.
  const [now, setNow] = useState(dojangNow());
  const [picked, setPicked] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
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
      .filter((m) => (m.status === 'reserved' || m.status === 'completed') && m.reservation_date === now.date && (m.reservation_class_name || m.class_name) === cls.class_name)
      .map((m) => ({ s: students.find((x) => x.id === m.student_id), m, rec: attendance.find((a) => a.student_id === m.student_id && a.date === now.date && a.class_name === cls.class_name) }))
      .filter((g) => g.s && !list.some((r) => r.s.id === g.s.id));
    // Checked in here without a makeup record (drop-in / extra class).
    const extras = attendance
      .filter((a) => a.date === now.date && a.class_name === cls.class_name && !list.some((r) => r.s.id === a.student_id) && !guests.some((g) => g.s.id === a.student_id))
      .map((a) => ({ s: students.find((x) => x.id === a.student_id), rec: a, drop: true }))
      .filter((g) => g.s);
    return [...list.sort((a, b) => a.s.name.localeCompare(b.s.name)), ...guests, ...extras];
  }, [cls, students, attendance, makeupRecords, now.date]);

  const here = roster.filter((r) => r.rec && ['present', 'double', 'private'].includes(r.rec.status)).length;
  const ended = cls && now.minutes >= toMin(cls.end_time);

  function tap(r) {
    if (r.rec && r.rec.status === 'present') return r.m || r.drop ? onUndoGuest(r.rec, r.m) : onUnmark(r.rec);
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
                    border: `2px solid ${on ? '#3C7A43' : st === 'absent' ? '#E4B8B8' : st === 'vacation' || st === 'excused' ? '#F0D9A8' : '#DEDACC'}`,
                    background: on ? '#E8F1E9' : st === 'absent' ? '#FBEAEA' : st === 'excused' ? '#FAEEDA' : '#fff',
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
                    {r.m ? (on ? 'Makeup · here' : 'Makeup booked') : r.drop ? 'Drop-in · here' : st === 'absent' ? (r.rec.auto ? 'Marked absent' : 'Absent') : st === 'excused' ? 'Excused (makeup)' : st === 'vacation' ? 'Vacation' : st === 'double' ? 'Double class' : st === 'private' ? 'Private' : on ? 'Here' : 'Tap when here'}
                  </div>
                  {!on && !r.m && !r.drop && (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        st === 'excused' ? onUnmark(r.rec) : onMark(r.s.id, now.date, cls.class_name, 'excused');
                      }}
                      style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 11.5, padding: '3px 8px', borderRadius: 999, border: '1px solid #F0D9A8', background: st === 'excused' ? '#854F0B' : '#FAEEDA', color: st === 'excused' ? '#fff' : '#854F0B' }}
                    >
                      Excused
                    </span>
                  )}
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
                ? `Class finished — you can still tap students until ${timeLabel(autoAbsentTime || '23:30')}, then the rest are marked absent.`
                : `Anyone not tapped is marked absent automatically at ${timeLabel(autoAbsentTime || '23:30')} — you can also fill it in later.`}
          </span>
          <div style={{ flex: 1 }} />
          {!cancelled && (
            <>
              <button className="dp-btn dp-btn-primary" style={{ fontSize: 14, padding: '8px 14px' }} onClick={() => { setSearch(''); setAdding(true); }}>
                <Plus size={15} /> Makeup / drop-in
              </button>
              <button className="dp-btn" onClick={() => setConfirm(true)}><Ban size={14} /> Class cancelled today</button>
            </>
          )}
        </div>
      )}

      {adding && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(32,36,31,0.45)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(640px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderBottom: '1px solid #EDEAE0' }}>
              <div style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Who came to {cls.class_name}?</div>
              <button className="dp-btn" onClick={() => setAdding(false)}><X size={15} /> Close</button>
            </div>
            <div style={{ padding: '12px 16px 0' }}>
              <input autoFocus className="dp-input" style={{ width: '100%', fontSize: 16, padding: 10 }} placeholder="Type a name…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '8px 0 0' }}>Uses their oldest open makeup; if they don't have one it's recorded as an extra class.</p>
            </div>
            <div style={{ overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
              {students
                .filter((x) => !x.billing_exempt && !roster.some((r) => r.s.id === x.id) && x.name.toLowerCase().includes(search.trim().toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((x) => {
                  const open = makeupRecords.filter((m) => m.student_id === x.id && ['pending', 'reserved'].includes(m.status) && m.absence_date !== now.date && m.expiration_date >= now.date).length;
                  return (
                    <button
                      key={x.id}
                      className="dp-btn"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', fontSize: 14.5, display: 'block' }}
                      onClick={async () => {
                        setAdding(false);
                        await onWalkIn(x.id, now.date, cls.class_name);
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{x.name}</div>
                      <div style={{ fontSize: 12, color: open ? '#854F0B' : '#8A8D84' }}>{open ? `${open} makeup${open > 1 ? 's' : ''} open` : 'No open makeup'}</div>
                    </button>
                  );
                })}
            </div>
          </div>
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
