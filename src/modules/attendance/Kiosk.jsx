import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Ban, Plus, CalendarOff, CircleX, Undo2 } from 'lucide-react';
import { splitClasses, comesOn } from '../../lib/classes';
import ConfirmDialog from '../../components/ConfirmDialog';
import BeltStrip from '../../components/BeltStrip';

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
  // Last tap, so a mis-tap can be undone: { id, name, here }.
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
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
      .map((s) => ({ s, off: !comesOn(s, cls.weekday, cls.class_name), rec: attendance.find((a) => a.student_id === s.id && a.date === now.date && a.class_name === cls.class_name) }));
    const guests = makeupRecords
      .filter((m) => (m.status === 'reserved' || m.status === 'completed') && m.reservation_date === now.date && (m.reservation_class_name || m.class_name) === cls.class_name)
      .map((m) => ({ s: students.find((x) => x.id === m.student_id), m, rec: attendance.find((a) => a.student_id === m.student_id && a.date === now.date && a.class_name === cls.class_name) }))
      .filter((g) => g.s && !list.some((r) => r.s.id === g.s.id));
    // Checked in here without a makeup record (drop-in / extra class).
    const extras = attendance
      .filter((a) => a.date === now.date && a.class_name === cls.class_name && !list.some((r) => r.s.id === a.student_id) && !guests.some((g) => g.s.id === a.student_id))
      .map((a) => ({ s: students.find((x) => x.id === a.student_id), rec: a, drop: true }))
      .filter((g) => g.s);
    // Students whose class days don't include today go last (not expected today).
    return [...list.sort((a, b) => (a.off === b.off ? a.s.name.localeCompare(b.s.name) : a.off ? 1 : -1)), ...guests, ...extras];
  }, [cls, students, attendance, makeupRecords, now.date]);

  const isHere = (r) => r.rec && ['present', 'double', 'private'].includes(r.rec.status);
  const here = roster.filter(isHere).length;
  const expectedCount = roster.filter((r) => !r.off || isHere(r)).length;
  const ended = cls && now.minutes >= toMin(cls.end_time);

  function tap(r) {
    if (r.rec && r.rec.status === 'present') return r.m || r.drop ? onUndoGuest(r.rec, r.m) : onUnmark(r.rec);
    if (r.m) return onGuest(r.m, now.date, cls.class_name, 'present');
    onMark(r.s.id, now.date, cls.class_name, 'present');
  }

  // Tile tap: toggle "here" and offer an Undo for a few seconds.
  function tapTile(r) {
    const wasHere = r.rec && r.rec.status === 'present';
    setToast({ id: r.s.id, name: r.s.name, here: !wasHere });
    tap(r);
  }

  function undo() {
    if (!toast) return;
    const r = roster.find((x) => x.s.id === toast.id);
    setToast(null);
    if (!r) return;
    const isPresentNow = r.rec && r.rec.status === 'present';
    // Only reverse if the record still matches what the tap did.
    if (toast.here === Boolean(isPresentNow)) tap(r);
  }

  const statusOf = (r, st, on) => {
    if (r.m) return on ? { text: 'Makeup · here', tone: 'success' } : { text: 'Makeup booked', tone: 'soft' };
    if (r.drop) return { text: 'Drop-in · here', tone: 'success' };
    if (st === 'absent') return { text: r.rec.auto ? 'Marked absent' : 'Absent', tone: 'danger' };
    if (st === 'excused') return { text: 'Excused (makeup)', tone: 'warning' };
    if (st === 'vacation') return { text: 'Vacation', tone: 'warning' };
    if (st === 'double') return { text: 'Double class', tone: 'success' };
    if (st === 'private') return { text: 'Private', tone: 'success' };
    if (on) return { text: 'Here', tone: 'success' };
    if (r.off) return { text: 'Not their day · tap if here', tone: 'soft' };
    return { text: 'Tap when here', tone: 'soft' };
  };
  const TONE = { success: 'var(--dp-success)', danger: 'var(--dp-danger)', warning: 'var(--dp-warning)', soft: 'var(--dp-ink-soft)' };
  const touchBtn = { minHeight: 'var(--dp-touch)', fontSize: 'var(--dp-text-body)', padding: '10px 16px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--dp-canvas)', zIndex: 900, display: 'flex', flexDirection: 'column', fontFamily: 'var(--dp-font)', color: 'var(--dp-ink)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'var(--dp-ink)', color: 'var(--dp-paper)', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--dp-text-headline)', fontWeight: 700 }}>{cls ? cls.class_name : 'No classes today'}</div>
        {cls && <div style={{ fontSize: 'var(--dp-text-body)', color: 'var(--dp-line)' }}>{timeLabel(cls.start_time)} – {timeLabel(cls.end_time)}</div>}
        {cls && !cancelled && <div style={{ fontSize: 'var(--dp-text-body)', fontWeight: 600, background: 'var(--dp-success)', borderRadius: 'var(--dp-radius-pill)', padding: '4px 12px', fontVariantNumeric: 'tabular-nums' }}>{here} / {expectedCount} here</div>}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 'var(--dp-text-body)', color: 'var(--dp-line)' }}>{new Date(now.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <button className="dp-btn" style={{ ...touchBtn, background: 'transparent', color: 'var(--dp-paper)', borderColor: 'var(--dp-ink-soft)' }} onClick={onClose}><X size={16} /> Exit</button>
      </div>

      {today.length > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 20px', overflowX: 'auto', borderBottom: '1px solid var(--dp-line)' }}>
          {today.map((c) => {
            const sel = cls && c.id === cls.id;
            return (
              <button
                key={c.id}
                className="dp-btn"
                aria-pressed={sel}
                style={{ ...touchBtn, whiteSpace: 'nowrap', background: sel ? 'var(--dp-ink)' : 'var(--dp-paper)', color: sel ? 'var(--dp-paper)' : 'var(--dp-ink)', borderColor: sel ? 'var(--dp-ink)' : 'var(--dp-line)' }}
                onClick={() => setPicked(c.id)}
              >
                {timeLabel(c.start_time)} {c.class_name}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 88px' }}>
        {!cls ? (
          <p style={{ fontSize: 'var(--dp-text-title)', color: 'var(--dp-ink-soft)', textAlign: 'center', marginTop: 80 }}>No classes on the schedule today.</p>
        ) : cancelled ? (
          <p style={{ fontSize: 'var(--dp-text-title)', color: 'var(--dp-warning)', textAlign: 'center', marginTop: 80 }}>This class is cancelled today — nobody will be marked absent.</p>
        ) : roster.length === 0 ? (
          <p style={{ fontSize: 'var(--dp-text-title)', color: 'var(--dp-ink-soft)', textAlign: 'center', marginTop: 80 }}>No students in this class.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {roster.map((r) => {
              const st = r.rec?.status;
              const on = st === 'present' || st === 'double' || st === 'private';
              const status = statusOf(r, st, on);
              const canExcuse = !on && !r.m && !r.drop && !r.off;
              const excused = st === 'excused';
              const bg = on ? 'var(--dp-success-tint)' : st === 'absent' ? 'var(--dp-danger-tint)' : excused || st === 'vacation' ? 'var(--dp-warning-tint)' : r.off ? 'var(--dp-canvas)' : 'var(--dp-paper)';
              return (
                <div
                  key={r.s.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 'var(--dp-radius-lg)',
                    border: `2px solid ${on ? 'var(--dp-success)' : 'var(--dp-line)'}`,
                    background: bg,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    className="dp-kiosk-tap"
                    onClick={() => tapTile(r)}
                    aria-label={`${r.s.name}, ${r.s.belt || 'White'} belt, ${status.text}`}
                    style={{ flex: 1, minHeight: 104, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', border: 'none', background: 'transparent', padding: '12px 12px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BeltStrip belt={r.s.belt} width={64} />
                      <span style={{ fontSize: 'var(--dp-text-label)', color: 'var(--dp-ink-soft)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.s.belt || 'White'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--dp-text-title)', fontWeight: 600, lineHeight: 1.3 }}>{r.s.name}</div>
                      {on && (
                        <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--dp-success)', color: 'var(--dp-paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Check size={16} />
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--dp-text-label)', color: TONE[status.tone], marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {st === 'absent' && <CircleX size={14} aria-hidden="true" />}
                      {excused && <CalendarOff size={14} aria-hidden="true" />}
                      {status.text}
                    </div>
                  </button>
                  {canExcuse && (
                    <button
                      className="dp-kiosk-tap"
                      onClick={() => (excused ? onUnmark(r.rec) : onMark(r.s.id, now.date, cls.class_name, 'excused'))}
                      aria-pressed={excused}
                      aria-label={excused ? `Undo excused for ${r.s.name}` : `Mark ${r.s.name} excused`}
                      style={{
                        minHeight: 'var(--dp-touch)',
                        border: 'none',
                        borderTop: '1px solid var(--dp-line)',
                        background: excused ? 'var(--dp-warning)' : 'var(--dp-warning-tint)',
                        color: excused ? 'var(--dp-paper)' : 'var(--dp-warning)',
                        fontSize: 'var(--dp-text-label)',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {excused ? <Undo2 size={15} aria-hidden="true" /> : <CalendarOff size={15} aria-hidden="true" />}
                      {excused ? 'Excused · tap to undo' : 'Excused'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        {toast && (
          <div role="status" style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 920, display: 'flex', alignItems: 'center', gap: 16, background: 'var(--dp-ink)', color: 'var(--dp-paper)', borderRadius: 'var(--dp-radius-md)', padding: '6px 6px 6px 16px', fontSize: 'var(--dp-text-body)', boxShadow: '0 6px 20px rgba(32,36,31,0.25)', maxWidth: 'calc(100% - 40px)' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.name} {toast.here ? 'marked here' : 'unmarked'}</span>
            <button className="dp-btn" style={{ ...touchBtn, background: 'transparent', color: 'var(--dp-paper)', borderColor: 'var(--dp-ink-soft)', fontWeight: 600 }} onClick={undo}>
              <Undo2 size={15} aria-hidden="true" /> Undo
            </button>
          </div>
        )}
      </div>

      {/* Right padding keeps the buttons clear of Netlify's "Powered by Netlify" badge (bottom right). */}
      {cls && (
        <div className="dp-kiosk-foot" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 210px 10px 20px', borderTop: '1px solid var(--dp-line)', background: 'var(--dp-paper)', fontSize: 'var(--dp-text-label)', color: 'var(--dp-ink-soft)', flexWrap: 'wrap' }}>
          <span>
            {cancelled
              ? 'Cancelled today.'
              : ended
                ? `Class finished — you can still tap students until ${timeLabel(autoAbsentTime || '23:30')}, then the rest are marked absent.`
                : `Anyone not tapped is marked absent automatically at ${timeLabel(autoAbsentTime || '23:30')} — you can also fill it in later.`}
          </span>
          <div style={{ flex: 1 }} />
          {!cancelled && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="dp-btn" style={{ ...touchBtn, background: 'var(--dp-ink)', color: 'var(--dp-paper)', borderColor: 'var(--dp-ink)' }} onClick={() => { setSearch(''); setAdding(true); }}>
                <Plus size={15} /> Makeup / drop-in
              </button>
              <button className="dp-btn" style={touchBtn} onClick={() => setConfirm(true)}><Ban size={14} /> Class cancelled today</button>
            </div>
          )}
        </div>
      )}

      {adding && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(32,36,31,0.45)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--dp-paper)', borderRadius: 'var(--dp-radius-lg)', width: 'min(640px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderBottom: '1px solid var(--dp-line)' }}>
              <div style={{ fontSize: 'var(--dp-text-title)', fontWeight: 600, flex: 1 }}>Who came to {cls.class_name}?</div>
              <button className="dp-btn" style={touchBtn} onClick={() => setAdding(false)}><X size={15} /> Close</button>
            </div>
            <div style={{ padding: '12px 16px 0' }}>
              <input autoFocus className="dp-input" style={{ width: '100%', fontSize: 'var(--dp-text-title)', padding: 10, minHeight: 'var(--dp-touch)' }} placeholder="Type a name…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <p style={{ fontSize: 'var(--dp-text-label)', color: 'var(--dp-ink-soft)', margin: '8px 0 0' }}>Uses their oldest open makeup; if they don't have one it's recorded as an extra class.</p>
            </div>
            <div style={{ overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {students
                .filter((x) => !x.billing_exempt && !roster.some((r) => r.s.id === x.id) && x.name.toLowerCase().includes(search.trim().toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((x) => {
                  const open = makeupRecords.filter((m) => m.student_id === x.id && ['pending', 'reserved'].includes(m.status) && m.absence_date !== now.date && m.expiration_date >= now.date).length;
                  return (
                    <button
                      key={x.id}
                      className="dp-btn"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', minHeight: 'var(--dp-touch)', fontSize: 'var(--dp-text-body)', display: 'block' }}
                      onClick={async () => {
                        setAdding(false);
                        await onWalkIn(x.id, now.date, cls.class_name);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BeltStrip belt={x.belt} width={44} />
                        <span style={{ fontWeight: 600 }}>{x.name}</span>
                      </div>
                      <div style={{ fontSize: 'var(--dp-text-caption)', color: open ? 'var(--dp-warning)' : 'var(--dp-ink-soft)', marginTop: 4 }}>{open ? `${open} makeup${open > 1 ? 's' : ''} open` : 'No open makeup'}</div>
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
