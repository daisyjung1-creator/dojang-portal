import React, { useEffect, useMemo, useState } from 'react'
import { Clock, Calendar, StickyNote, BarChart3, LogOut, ChevronLeft, ChevronRight, Check, AlertTriangle, Repeat, Users, X, Trash2, Check as CheckIcon, Lock, Star } from 'lucide-react'
import { supabase, notifyEmail } from './clockDb.js'
import { COLORS, inputStyle, navBtnStyle, globalFontImport } from './clockTheme.js'
import { pad, todayStr, timeStr, DAYS, minutesBetween, fmtHM, getLateMinutes, getOvertimeMinutes, getMonthGridDates, formatTime12h, formatClockTime, colorForIndex, parseLocalDate, distanceMeters, getCurrentPosition } from './clockUtils.js'

export default function EmployeePortal({ employee, onLogout }) {
  const [tab, setTab] = useState('clock')
  const [now, setNow] = useState(new Date())
  const [openEntry, setOpenEntry] = useState(null)
  const [loadingEntry, setLoadingEntry] = useState(true)
  const [toast, setToast] = useState(null)
  const [unreadNotes, setUnreadNotes] = useState([])
  const [showNotesPopup, setShowNotesPopup] = useState(false)
  const [pendingSwapsForMe, setPendingSwapsForMe] = useState(0)
  const [locationLock, setLocationLock] = useState(null) // { lat, lng, radius } or null if disabled
  const [checkingLocation, setCheckingLocation] = useState(false)
  const [deviceLockToken, setDeviceLockToken] = useState(null) // the token required by admin, or null if disabled

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('admin_settings').select('location_lat, location_lng, location_radius_m, device_lock_token').eq('id', 1).single()
      if (data?.location_lat != null && data?.location_lng != null) {
        setLocationLock({ lat: data.location_lat, lng: data.location_lng, radius: data.location_radius_m || 100 })
      }
      if (data?.device_lock_token) setDeviceLockToken(data.device_lock_token)
    })()
  }, [])

  const refreshPendingSwaps = async () => {
    const { count } = await supabase
      .from('swap_requests')
      .select('id', { count: 'exact', head: true })
      .eq('target_id', employee.id)
      .eq('status', 'pending')
    setPendingSwapsForMe(count || 0)
  }
  useEffect(() => { refreshPendingSwaps() }, [employee.id])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const refreshOpenEntry = async () => {
    const { data } = await supabase
      .from('entries')
      .select('*')
      .eq('employee_id', employee.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
    setOpenEntry(data && data.length > 0 ? data[0] : null)
    setLoadingEntry(false)
  }

  useEffect(() => { refreshOpenEntry() }, [employee.id])

  const refreshUnreadNotes = async () => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('author', 'admin')
      .eq('read', false)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Could not load unread notes — the database may need the latest schema update:', error.message)
      setUnreadNotes([])
      return []
    }
    setUnreadNotes(data || [])
    return data || []
  }

  useEffect(() => {
    (async () => {
      const data = await refreshUnreadNotes()
      if (data.length > 0) setShowNotesPopup(true)
    })()
  }, [employee.id])

  const markNotesRead = async (ids) => {
    if (!ids || ids.length === 0) return
    await supabase.from('notes').update({ read: true }).in('id', ids)
    refreshUnreadNotes()
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200) }

  const DEVICE_TOKEN_KEY = 'attendance_device_token'

  const verifyLocation = async () => {
    // Device lock check first — fast, no permissions needed
    if (deviceLockToken) {
      const myToken = localStorage.getItem(DEVICE_TOKEN_KEY)
      if (myToken !== deviceLockToken) {
        showToast("This device isn't set up for clocking in — use the front desk device")
        return false
      }
    }
    if (!locationLock) return true
    setCheckingLocation(true)
    try {
      const pos = await getCurrentPosition()
      const dist = distanceMeters(pos.lat, pos.lng, locationLock.lat, locationLock.lng)
      setCheckingLocation(false)
      if (dist > locationLock.radius) {
        showToast(`You're too far away (${Math.round(dist)}m) — get closer to clock in/out`)
        return false
      }
      return true
    } catch (e) {
      setCheckingLocation(false)
      showToast(e.message)
      return false
    }
  }

  const clockIn = async () => {
    if (!(await verifyLocation())) return
    const { error } = await supabase.from('entries').insert({
      employee_id: employee.id,
      date: todayStr(),
      clock_in: new Date().toISOString(),
    })
    if (!error) { showToast('Clocked in'); refreshOpenEntry() }
  }

  const clockOut = async () => {
    if (!openEntry) return
    if (!(await verifyLocation())) return
    const { error } = await supabase.from('entries').update({ clock_out: new Date().toISOString() }).eq('id', openEntry.id)
    if (!error) { showToast('Clocked out'); refreshOpenEntry() }
  }

  return (
    <div className="sc-root" style={{ minHeight: '80vh', background: COLORS.bg, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'clip' }}>
      <style>{globalFontImport}</style>
      <Header now={now} name={employee.name} onLogout={onLogout} />

      <main style={{ flex: 1, maxWidth: 900, width: '100%', margin: '0 auto', padding: '24px 20px 32px' }}>
        {tab === 'clock' && (
          <ClockTab
            now={now}
            openEntry={openEntry}
            loading={loadingEntry}
            onClockIn={clockIn}
            onClockOut={clockOut}
            checking={checkingLocation}
          />
        )}
        {tab === 'hours' && <HoursTab employeeId={employee.id} />}
        {tab === 'schedule' && <ScheduleTab employee={employee} showToast={showToast} refreshPendingSwaps={refreshPendingSwaps} />}
        {tab === 'notes' && <NotesTab employee={employee} unreadNotes={unreadNotes} markNotesRead={markNotesRead} />}
      </main>

      <BottomNav tab={tab} setTab={setTab} openEntry={openEntry} unreadNotesCount={unreadNotes.length} pendingSwapsForMe={pendingSwapsForMe} />

      {toast && (
        <div style={{
          position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)',
          background: COLORS.navy, color: COLORS.bg, padding: '10px 20px', borderRadius: 999,
          fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 60,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={16} color={COLORS.amber} /> {toast}
        </div>
      )}

      {showNotesPopup && (
        <NewNotesPopup
          notes={unreadNotes}
          onDismiss={async () => { await markNotesRead(unreadNotes.map((n) => n.id)); setShowNotesPopup(false) }}
          onView={() => { setShowNotesPopup(false); setTab('notes') }}
        />
      )}
    </div>
  )
}

function NewNotesPopup({ notes, onDismiss, onView }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,35,51,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 20 }}>
      <div style={{ background: '#FFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <StickyNote size={18} color={COLORS.amber} />
          <div style={{ fontWeight: 800, fontSize: 17 }}>
            {notes.length === 1 ? 'New note from your manager' : `${notes.length} new notes from your manager`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0 20px' }}>
          {notes.slice(0, 5).map((n) => (
            <div key={n.id} style={{ background: COLORS.bg, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: COLORS.textFaint, fontWeight: 700, marginBottom: 4 }}>{n.date}</div>
              <div style={{ fontSize: 14, color: COLORS.slate, lineHeight: 1.5 }}>{n.text}</div>
            </div>
          ))}
          {notes.length > 5 && <div style={{ fontSize: 12, color: COLORS.textFaint }}>+{notes.length - 5} more in Notes</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onDismiss} style={{ flex: 1, background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Dismiss</button>
          <button onClick={onView} style={{ flex: 1, background: COLORS.amber, color: COLORS.navy, border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>View & Reply</button>
        </div>
      </div>
    </div>
  )
}

function Header({ now, name, onLogout }) {
  return (
    <header style={{ background: COLORS.navy, color: COLORS.bg, padding: '18px 20px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, color: COLORS.amber, fontWeight: 700, textTransform: 'uppercase' }}>Time Clock</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{name}</div>
        </div>
        <div className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>{timeStr(now)}</div>
        <button onClick={onLogout} style={{
          background: 'transparent', border: `1px solid ${COLORS.slateLine}`, color: COLORS.bg,
          borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
        }}>
          <LogOut size={15} /> Done
        </button>
      </div>
    </header>
  )
}

function ClockTab({ now, openEntry, loading, onClockIn, onClockOut, checking }) {
  const elapsedMins = openEntry ? minutesBetween(openEntry.clock_in, now.toISOString()) : 0
  const clockInTime = openEntry ? new Date(openEntry.clock_in) : null

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 20, padding: '40px 24px', textAlign: 'center',
      boxShadow: '0 4px 24px rgba(28,35,51,0.06)', border: `1px solid ${COLORS.cardLine}`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textMuted, marginBottom: 24 }}>
        {DAYS[now.getDay()]}, {now.getMonth() + 1}/{now.getDate()}/{now.getFullYear()}
      </div>

      {loading ? (
        <div style={{ color: COLORS.textFaint }}>Loading…</div>
      ) : openEntry ? (
        <>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4 }}>
            Clocked in at {formatClockTime(clockInTime)} · Working
          </div>
          <div className="mono" style={{ fontSize: 44, fontWeight: 700, color: COLORS.teal, marginBottom: 28 }}>
            {fmtHM(elapsedMins)}
          </div>
          <button onClick={onClockOut} disabled={checking} style={{
            background: COLORS.rust, color: '#FFF', border: 'none', borderRadius: 16,
            padding: '20px 0', width: '100%', maxWidth: 320, fontSize: 20, fontWeight: 800,
            boxShadow: '0 8px 20px rgba(201,79,61,0.3)', opacity: checking ? 0.7 : 1,
          }}>{checking ? 'Checking location…' : 'Clock Out'}</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, color: COLORS.textFaint, marginBottom: 28 }}>Not clocked in yet</div>
          <button onClick={onClockIn} disabled={checking} style={{
            background: COLORS.amber, color: COLORS.navy, border: 'none', borderRadius: 16,
            padding: '20px 0', width: '100%', maxWidth: 320, fontSize: 20, fontWeight: 800,
            boxShadow: '0 8px 20px rgba(232,135,30,0.35)', opacity: checking ? 0.7 : 1,
          }}>{checking ? 'Checking location…' : 'Clock In'}</button>
        </>
      )}
    </div>
  )
}

function HoursTab({ employeeId }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [entries, setEntries] = useState([])
  const [scheduleMap, setScheduleMap] = useState({})
  const [loading, setLoading] = useState(true)

  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset)
  const year = base.getFullYear(); const month = base.getMonth()

  useEffect(() => {
    (async () => {
      setLoading(true)
      const from = `${year}-${pad(month + 1)}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`
      const [entriesRes, scheduleRes] = await Promise.all([
        supabase.from('entries').select('*').eq('employee_id', employeeId).gte('date', from).lte('date', to).order('date').order('clock_in'),
        supabase.from('schedule').select('*').eq('employee_id', employeeId).gte('date', from).lte('date', to),
      ])
      setEntries(entriesRes.data || [])
      const map = {}
      ;(scheduleRes.data || []).forEach((s) => { map[s.date] = s })
      setScheduleMap(map)
      setLoading(false)
    })()
  }, [employeeId, year, month])

  const totalMins = entries.reduce((sum, e) => e.clock_out ? sum + minutesBetween(e.clock_in, e.clock_out) : sum, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setMonthOffset((m) => m - 1)} style={navBtnStyle}><ChevronLeft size={18} /></button>
        <div style={{ fontSize: 18, fontWeight: 800, minWidth: 140, textAlign: 'center' }}>
          {base.toLocaleString('en-US', { month: 'long' })} {year}
        </div>
        <button onClick={() => setMonthOffset((m) => m + 1)} style={navBtnStyle}><ChevronRight size={18} /></button>
      </div>

      <div style={{
        background: COLORS.navy, color: COLORS.bg, borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, color: COLORS.textFaint, fontWeight: 600, marginBottom: 4 }}>Total hours this month</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: COLORS.amber }}>{fmtHM(totalMins)}</div>
        </div>
        <BarChart3 size={32} color={COLORS.teal} />
      </div>

      {loading ? (
        <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ color: COLORS.textFaint, fontSize: 14, textAlign: 'center', padding: 40 }}>No records this month.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((e) => {
            const d = parseLocalDate(e.date)
            const mins = e.clock_out ? minutesBetween(e.clock_in, e.clock_out) : null
            const lateMins = getLateMinutes(e.clock_in, scheduleMap[e.date]?.start_time, e.date)
            const overtimeMins = mins !== null ? getOvertimeMinutes(mins) : 0
            return (
              <div key={e.id} style={{
                background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {DAYS[d.getDay()]}, {d.getMonth() + 1}/{d.getDate()}
                    {lateMins > 0 && <Badge color={COLORS.rust}>Late {fmtHM(lateMins)}</Badge>}
                    {overtimeMins > 0 && <Badge color={COLORS.amber}>Overtime {fmtHM(overtimeMins)}</Badge>}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: COLORS.textFaint }}>
                    {formatClockTime(new Date(e.clock_in))} – {e.clock_out ? formatClockTime(new Date(e.clock_out)) : 'in progress'}
                  </div>
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: mins === null ? COLORS.teal : COLORS.navy }}>
                  {mins === null ? 'In progress' : fmtHM(mins)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Badge({ color, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, color, background: `${color}1A`,
      borderRadius: 999, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <AlertTriangle size={10} /> {children}
    </span>
  )
}

// A 12-hour time picker built from plain <select> elements so it always shows
// English AM/PM, regardless of the browser or OS language (native <input type="time">
// follows the browser's locale and can't be forced to English in every browser).
function TimeSelect12h({ value, onChange }) {
  const [h24raw, mRaw] = (value || '09:00').split(':')
  const h24 = Number(h24raw); const m = Number(mRaw)
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12

  const setPart = (newH12, newM, newPeriod) => {
    let hh = newH12 % 12
    if (newPeriod === 'PM') hh += 12
    onChange(`${pad(hh)}:${pad(newM)}`)
  }

  const selectStyle = { ...inputStyle, padding: '10px 6px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={h12} onChange={(e) => setPart(Number(e.target.value), m, period)} style={selectStyle}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ color: COLORS.textFaint, fontWeight: 700 }}>:</span>
      <select value={m} onChange={(e) => setPart(h12, Number(e.target.value), period)} style={selectStyle}>
        {Array.from({ length: 60 }, (_, i) => i).map((mm) => <option key={mm} value={mm}>{pad(mm)}</option>)}
      </select>
      <select value={period} onChange={(e) => setPart(h12, m, e.target.value)} style={{ ...selectStyle, fontWeight: 700 }}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

async function logAudit(action, employeeId, details) {
  try {
    await supabase.from('audit_log').insert({ action, employee_id: employeeId, details })
  } catch (e) {
    console.error('Failed to write audit log', e)
  }
}

async function notifyAdmin(subject, text) {
  try {
    const { data: settings } = await supabase.from('admin_settings').select('notify_email').eq('id', 1).single()
    if (!settings?.notify_email) return
    await notifyEmail(settings.notify_email, subject, text)
  } catch (e) {
    console.error('Email notification failed', e)
  }
}

async function notifyEmployee(email, subject, text) {
  if (!email) return
  try {
    await notifyEmail(email, subject, text)
  } catch (e) {
    console.error('Email notification failed', e)
  }
}


// Employees can view/edit their own schedule (week or month view) and request
// someone else cover a shift. Saving or requesting a swap emails the admin.
function ScheduleTab({ employee, showToast, refreshPendingSwaps }) {
  const [view, setView] = useState('week') // 'week' | 'month'
  const [scope, setScope] = useState('mine') // 'mine' | 'team'
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [shifts, setShifts] = useState([]) // all employees' shifts in the visible range
  const [timeOff, setTimeOff] = useState([]) // all employees' booked-off days in the visible range
  const [events, setEvents] = useState([]) // company-wide holidays/events in the visible range
  const [allEmployees, setAllEmployees] = useState([]) // everyone, including self — for team view + colors
  const [myRequests, setMyRequests] = useState([])
  const [requestsForMe, setRequestsForMe] = useState([])
  const [resolvingId, setResolvingId] = useState(null)
  const [resolveError, setResolveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [isLead, setIsLead] = useState(false)
  const [saving, setSaving] = useState(false)
  const [swapTarget, setSwapTarget] = useState('')
  const [swapNote, setSwapNote] = useState('')
  const [sendingSwap, setSendingSwap] = useState(false)
  const [viewingDay, setViewingDay] = useState(null) // date string, for the read-only team day modal

  const weekDates = useMemo(() => {
    const today = new Date()
    const dow = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((dow + 6) % 7) + weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
  }, [weekOffset])

  const monthBase = new Date(); monthBase.setDate(1); monthBase.setMonth(monthBase.getMonth() + monthOffset)
  const monthGrid = useMemo(() => getMonthGridDates(monthBase.getFullYear(), monthBase.getMonth()), [monthOffset])

  const visibleRange = view === 'week'
    ? [weekDates[0], weekDates[6]]
    : [monthGrid[0], monthGrid[monthGrid.length - 1]]

  const refresh = async () => {
    setLoading(true)
    const from = todayStr(visibleRange[0]); const to = todayStr(visibleRange[1])
    const [shiftsRes, timeOffRes, eventsRes, empRes, reqRes, forMeRes] = await Promise.all([
      supabase.from('schedule').select('*').gte('date', from).lte('date', to),
      supabase.from('time_off').select('*').gte('date', from).lte('date', to),
      supabase.from('schedule_events').select('*').gte('date', from).lte('date', to),
      supabase.from('employees').select('id, name, email').order('name'),
      supabase.from('swap_requests').select('*').eq('requester_id', employee.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('swap_requests').select('*').eq('target_id', employee.id).eq('status', 'pending').order('created_at', { ascending: false }),
    ])
    setShifts(shiftsRes.data || [])
    setTimeOff(timeOffRes.data || [])
    setEvents(eventsRes.data || [])
    setAllEmployees(empRes.data || [])
    setMyRequests(reqRes.data || [])
    setRequestsForMe(forMeRes.data || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [employee.id, weekOffset, monthOffset, view])

  const nameById = useMemo(() => Object.fromEntries(allEmployees.map((e) => [e.id, e.name])), [allEmployees])

  const resolveSwap = async (req, status) => {
    setResolvingId(req.id)
    setResolveError('')
    if (status === 'approved') {
      const { data: shiftRows, error: fetchErr } = await supabase.from('schedule').select('*').eq('employee_id', req.requester_id).eq('date', req.date)
      if (fetchErr) { setResolveError('Could not look up the shift. Please try again.'); setResolvingId(null); return }
      const shift = (shiftRows || [])[0]
      if (shift) {
        // If you already have a shift that day, remove it first — otherwise the
        // reassignment fails because (employee, date) has to stay unique.
        await supabase.from('schedule').delete().eq('employee_id', req.target_id).eq('date', req.date)
        const { error: updateErr } = await supabase.from('schedule').update({ employee_id: req.target_id }).eq('id', shift.id)
        if (updateErr) { setResolveError('Could not reassign the shift. Please try again.'); setResolvingId(null); return }
      }
      await logAudit('approve_swap', req.target_id,
        `${nameById[req.requester_id] || 'Unknown'} → ${nameById[req.target_id] || 'Unknown'} on ${req.date}, approved by ${employee.name}${shift ? '' : ' (original shift was no longer on the schedule)'}`)
    } else {
      await logAudit('reject_swap', req.requester_id, `${employee.name} declined ${nameById[req.requester_id] || 'Unknown'}'s swap request for ${req.date}`)
    }
    const { error: statusErr } = await supabase.from('swap_requests').update({ status, resolved_at: new Date().toISOString() }).eq('id', req.id)
    if (statusErr) { setResolveError('Could not update the request. Please try again.'); setResolvingId(null); return }
    setResolvingId(null)
    showToast(status === 'approved' ? 'Shift accepted' : 'Request declined')

    const requesterEmail = allEmployees.find((e) => e.id === req.requester_id)?.email
    const verb = status === 'approved' ? 'accepted' : 'declined'
    notifyEmployee(
      requesterEmail,
      `${employee.name} ${verb} your swap request`,
      `${employee.name} ${verb} your request to cover ${req.date}.`
    )
    notifyAdmin(
      `Swap ${status}: ${req.date}`,
      `${employee.name} ${verb} ${nameById[req.requester_id] || 'a coworker'}'s swap request for ${req.date}.`
    )

    refresh()
    refreshPendingSwaps && refreshPendingSwaps()
  }

  const coworkers = useMemo(() => allEmployees.filter((e) => e.id !== employee.id), [allEmployees, employee.id])
  const colorById = useMemo(() => Object.fromEntries(allEmployees.map((e, i) => [e.id, colorForIndex(i)])), [allEmployees])

  const shiftFor = (dateStr) => shifts.find((s) => s.employee_id === employee.id && s.date === dateStr)
  const teamShiftsFor = (dateStr) => shifts.filter((s) => s.date === dateStr).sort((a, b) => (b.is_lead - a.is_lead) || a.start_time.localeCompare(b.start_time))
  const blockedFor = (dateStr) => timeOff.find((t) => t.employee_id === employee.id && t.date === dateStr)
  const eventsFor = (dateStr) => events.filter((e) => e.date === dateStr)
  const isHoliday = (dateStr) => events.some((e) => e.date === dateStr && e.type === 'holiday')

  const bookOff = async () => {
    if (!editing) return
    setSaving(true)
    const existingShift = shiftFor(editing)
    if (existingShift) await supabase.from('schedule').delete().eq('id', existingShift.id)
    const { error } = await supabase.from('time_off').upsert(
      { employee_id: employee.id, date: editing, created_by: 'employee' },
      { onConflict: 'employee_id,date' }
    )
    if (error) { setSaving(false); showToast('Could not book off that day — please try again'); return }
    await notifyAdmin(
      `${employee.name} booked off ${editing}`,
      `${employee.name} marked ${editing} as unavailable.${existingShift ? ' Their scheduled shift that day was removed.' : ''}\n\nOpen the admin dashboard to review.`
    )
    await logAudit('mark_unavailable', employee.id, `${employee.name} marked themselves unavailable on ${editing}`)
    setSaving(false)
    setEditing(null)
    showToast('Day booked off · admin notified')
    refresh()
  }

  const removeBookOff = async () => {
    if (!editing) return
    const existing = blockedFor(editing)
    if (existing) await supabase.from('time_off').delete().eq('id', existing.id)
    setEditing(null)
    showToast('Block removed')
    refresh()
  }

  const openEditor = (dateStr) => {
    if (dateStr <= todayStr()) return // employees can only edit shifts starting tomorrow — today and earlier are admin-only
    if (isHoliday(dateStr)) { showToast('Taekwondo is closed!'); return }
    const existing = shiftFor(dateStr)
    setStart(existing?.start_time || '16:30')
    setEnd(existing?.end_time || '19:30')
    setIsLead(existing?.is_lead || false)
    setSwapTarget(''); setSwapNote('')
    setEditing(dateStr)
  }

  const saveShift = async () => {
    if (!editing) return
    setSaving(true)
    const existing = shiftFor(editing)
    if (existing) {
      await supabase.from('schedule').update({ start_time: start, end_time: end, is_lead: isLead }).eq('id', existing.id)
    } else {
      await supabase.from('schedule').insert({ employee_id: employee.id, date: editing, start_time: start, end_time: end, is_lead: isLead })
    }
    await notifyAdmin(
      `Schedule change: ${employee.name} · ${editing}`,
      `${employee.name} updated their schedule for ${editing}.\n\nNew shift: ${start} - ${end}\n\nOpen the admin dashboard to review.`
    )
    await logAudit('edit_own_schedule', employee.id,
      existing
        ? `${employee.name} changed their shift on ${editing} from ${existing.start_time}-${existing.end_time} to ${start}-${end}`
        : `${employee.name} set a shift on ${editing}: ${start}-${end}`)
    setSaving(false)
    setEditing(null)
    showToast('Schedule updated · admin notified')
    refresh()
  }

  const removeShift = async () => {
    if (!editing) return
    const existing = shiftFor(editing)
    if (existing) await supabase.from('schedule').delete().eq('id', existing.id)
    await notifyAdmin(
      `Schedule change: ${employee.name} · ${editing}`,
      `${employee.name} removed their shift on ${editing}.\n\nOpen the admin dashboard to review.`
    )
    if (existing) {
      await logAudit('edit_own_schedule', employee.id,
        `${employee.name} removed their shift on ${editing} (was ${existing.start_time}-${existing.end_time})`)
    }
    setEditing(null)
    showToast('Shift removed · admin notified')
    refresh()
  }

  const sendSwapRequest = async () => {
    if (!editing || !swapTarget) return
    setSendingSwap(true)
    const targetEmp = coworkers.find((e) => e.id === swapTarget)
    const { error } = await supabase.from('swap_requests').insert({
      requester_id: employee.id,
      target_id: swapTarget,
      date: editing,
      note: swapNote.trim() || null,
      status: 'pending',
    })
    if (error) {
      setSendingSwap(false)
      showToast('Could not send the swap request — please try again')
      return
    }
    await notifyAdmin(
      `Swap request: ${employee.name} · ${editing}`,
      `${employee.name} asked ${targetEmp?.name || 'a coworker'} to cover their shift on ${editing}.\n\n` +
      (swapNote.trim() ? `Note: ${swapNote.trim()}\n\n` : '') +
      `The coworker can accept or decline it from their own Schedule tab.`
    )
    await notifyEmployee(
      targetEmp?.email,
      `${employee.name} needs coverage on ${editing}`,
      `${employee.name} asked if you could cover their shift on ${editing}.\n\n` +
      (swapNote.trim() ? `Note: ${swapNote.trim()}\n\n` : '') +
      `Sign in and check the Schedule tab to accept or decline.`
    )
    setSendingSwap(false)
    setEditing(null)
    showToast('Swap request sent')
    refresh()
  }

  const currentShift = editing ? shiftFor(editing) : null
  const currentBlock = editing ? blockedFor(editing) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {view === 'week' ? (
            <>
              <button onClick={() => setWeekOffset((w) => w - 1)} style={navBtnStyle}><ChevronLeft size={18} /></button>
              <div style={{ fontSize: 16, fontWeight: 800, minWidth: 170, textAlign: 'center' }}>
                {weekDates[0].getMonth() + 1}/{weekDates[0].getDate()} – {weekDates[6].getMonth() + 1}/{weekDates[6].getDate()}
              </div>
              <button onClick={() => setWeekOffset((w) => w + 1)} style={navBtnStyle}><ChevronRight size={18} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setMonthOffset((m) => m - 1)} style={navBtnStyle}><ChevronLeft size={18} /></button>
              <div style={{ fontSize: 16, fontWeight: 800, minWidth: 150, textAlign: 'center' }}>
                {monthBase.toLocaleString('en-US', { month: 'long' })} {monthBase.getFullYear()}
              </div>
              <button onClick={() => setMonthOffset((m) => m + 1)} style={navBtnStyle}><ChevronRight size={18} /></button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', background: '#FFF', border: `1px solid ${COLORS.inputLine}`, borderRadius: 10, padding: 3 }}>
          {['week', 'month'].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? COLORS.navy : 'transparent', color: view === v ? COLORS.bg : COLORS.textMuted,
              border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 13, fontWeight: 700, textTransform: 'capitalize',
            }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', background: '#FFF', border: `1px solid ${COLORS.inputLine}`, borderRadius: 10, padding: 3, marginBottom: 16, width: 'fit-content' }}>
        <button onClick={() => setScope('mine')} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: scope === 'mine' ? COLORS.amber : 'transparent',
          color: scope === 'mine' ? COLORS.navy : COLORS.textMuted, border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 700,
        }}>My Schedule</button>
        <button onClick={() => setScope('team')} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: scope === 'team' ? COLORS.amber : 'transparent',
          color: scope === 'team' ? COLORS.navy : COLORS.textMuted, border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 700,
        }}><Users size={14} /> Team</button>
      </div>

      {scope === 'mine' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textFaint, marginBottom: 12 }}>
          <Lock size={11} /> Today and past shifts can only be changed by your admin — you can edit from tomorrow onward.
        </div>
      )}

      {loading ? (
        <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : view === 'week' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {weekDates.map((d) => {
            const dateStr = todayStr(d)
            const isToday = dateStr === todayStr()
            if (scope === 'mine') {
              const s = shiftFor(dateStr)
              const blocked = blockedFor(dateStr)
              const dayEvents = eventsFor(dateStr)
              const holiday = isHoliday(dateStr)
              const editable = dateStr > todayStr() && !holiday
              return (
                <button
                  key={dateStr}
                  onClick={() => editable && openEditor(dateStr)}
                  disabled={!editable}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: blocked ? `${COLORS.rust}0D` : editable ? '#FFF' : COLORS.bg,
                    border: `1px solid ${blocked ? `${COLORS.rust}55` : isToday ? COLORS.amber : COLORS.cardLine}`, borderRadius: 12, padding: '14px 16px', textAlign: 'left',
                    cursor: editable ? 'pointer' : 'default', opacity: editable ? 1 : 0.75,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {DAYS[d.getDay()]}, {d.getMonth() + 1}/{d.getDate()}
                      {!editable && <Lock size={12} color={COLORS.textFaint} />}
                    </div>
                    {dayEvents.map((ev) => (
                      <div key={ev.id} style={{ fontSize: 11, fontWeight: 700, color: ev.type === 'holiday' ? COLORS.rust : COLORS.amber, marginTop: 2 }}>
                        {ev.type === 'holiday' ? '🔴' : '🟡'} {ev.title}
                      </div>
                    ))}
                  </div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: blocked ? COLORS.rust : s ? COLORS.teal : COLORS.textFaint }}>
                    {blocked ? 'Booked off' : s ? `${formatTime12h(s.start_time)} – ${formatTime12h(s.end_time)}` : editable ? 'Off · tap to set' : holiday ? '' : 'Off'}
                  </div>
                </button>
              )
            }
            const dayShifts = teamShiftsFor(dateStr)
            const dayBlocked = timeOff.filter((t) => t.date === dateStr)
            const dayEvents = eventsFor(dateStr)
            return (
              <div key={dateStr} style={{
                background: '#FFF', border: `1px solid ${isToday ? COLORS.amber : COLORS.cardLine}`, borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: (dayShifts.length || dayBlocked.length || dayEvents.length) ? 8 : 0 }}>{DAYS[d.getDay()]}, {d.getMonth() + 1}/{d.getDate()}</div>
                {dayEvents.map((ev) => (
                  <div key={ev.id} style={{ fontSize: 12, fontWeight: 700, color: ev.type === 'holiday' ? COLORS.rust : COLORS.amber, marginBottom: 4 }}>
                    {ev.type === 'holiday' ? '🔴' : '🟡'} {ev.title}
                  </div>
                ))}
                {dayShifts.length === 0 && dayBlocked.length === 0 ? (
                  <div style={{ fontSize: 13, color: COLORS.textFaint }}>No one scheduled</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dayShifts.map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: s.employee_id === employee.id ? 800 : 600 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: colorById[s.employee_id] }} />
                          {s.is_lead && <Star size={12} fill={COLORS.amber} color={COLORS.amber} />}
                          {nameById[s.employee_id] || 'Unknown'}{s.employee_id === employee.id ? ' (you)' : ''}
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: COLORS.textFaint }}>{formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}</div>
                      </div>
                    ))}
                    {dayBlocked.length > 0 && (
                      <div style={{ fontSize: 12, color: COLORS.rust, marginTop: dayShifts.length ? 4 : 0 }}>
                        Off: {dayBlocked.map((t) => nameById[t.employee_id] || 'Unknown').join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {DAYS.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: COLORS.textFaint, padding: '4px 0' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {monthGrid.map((d) => {
              const dateStr = todayStr(d)
              const inMonth = d.getMonth() === monthBase.getMonth()
              const isToday = dateStr === todayStr()
              if (scope === 'mine') {
                const s = shiftFor(dateStr)
                const blocked = blockedFor(dateStr)
                const dayEvents = eventsFor(dateStr)
                const holiday = isHoliday(dateStr)
                const editable = dateStr > todayStr() && !holiday
                return (
                  <button
                    key={dateStr}
                    onClick={() => editable && openEditor(dateStr)}
                    disabled={!editable}
                    style={{
                      minHeight: 58, borderRadius: 8, padding: '6px 4px', textAlign: 'left',
                      background: blocked ? `${COLORS.rust}0D` : s ? `${COLORS.teal}14` : (editable ? '#FFF' : COLORS.bg),
                      opacity: (inMonth ? 1 : 0.35) * (editable ? 1 : 0.75),
                      border: `1px solid ${blocked ? `${COLORS.rust}55` : isToday ? COLORS.amber : COLORS.cardLine}`,
                      cursor: editable ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.navy, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {d.getDate()}
                      {!editable && <Lock size={9} color={COLORS.textFaint} />}
                      {dayEvents.length > 0 && <span>{dayEvents.some((e) => e.type === 'holiday') ? '🔴' : '🟡'}</span>}
                    </div>
                    {blocked && <div style={{ fontSize: 8, fontWeight: 700, color: COLORS.rust }}>Off</div>}
                    {!blocked && s && <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: COLORS.teal, lineHeight: 1.3 }}>{formatTime12h(s.start_time)}<br />{formatTime12h(s.end_time)}</div>}
                  </button>
                )
              }
              const dayShifts = teamShiftsFor(dateStr)
              const shown = dayShifts.slice(0, 3)
              const extra = dayShifts.length - shown.length
              const dayEvents = eventsFor(dateStr)
              return (
                <button key={dateStr} onClick={() => (dayShifts.length > 0 || dayEvents.length > 0) && setViewingDay(dateStr)} style={{
                  minHeight: 58, borderRadius: 8, padding: '6px 4px', textAlign: 'left',
                  background: dayShifts.length ? '#FFF' : '#FFF', opacity: inMonth ? 1 : 0.35,
                  border: `1px solid ${isToday ? COLORS.amber : COLORS.cardLine}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.navy, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {d.getDate()}
                    {dayEvents.length > 0 && <span>{dayEvents.some((e) => e.type === 'holiday') ? '🔴' : '🟡'}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {shown.map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: colorById[s.employee_id], flexShrink: 0 }} />
                        {s.is_lead && <Star size={7} fill={COLORS.amber} color={COLORS.amber} style={{ flexShrink: 0 }} />}
                        <span style={{ fontSize: 8, fontWeight: 700, color: COLORS.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(nameById[s.employee_id] || '').split(' ')[0]}
                        </span>
                      </div>
                    ))}
                    {extra > 0 && <div style={{ fontSize: 8, fontWeight: 700, color: COLORS.textFaint }}>+{extra} more</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {requestsForMe.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.amber, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Repeat size={14} /> Coverage Requests For You
          </div>
          {resolveError && <div style={{ background: `${COLORS.rust}14`, color: COLORS.rust, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{resolveError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requestsForMe.map((r) => (
              <div key={r.id} style={{ background: '#FFF', border: `1px solid ${COLORS.amber}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{nameById[r.requester_id] || 'A coworker'} asked you to cover {r.date}</div>
                {r.note && <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 10 }}>"{r.note}"</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => resolveSwap(r, 'rejected')} disabled={resolvingId === r.id} style={{ flex: 1, background: COLORS.bg, color: COLORS.rust, border: `1px solid ${COLORS.cardLine}`, borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 13 }}>Decline</button>
                  <button onClick={() => resolveSwap(r, 'approved')} disabled={resolvingId === r.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: COLORS.teal, color: '#FFF', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 13 }}><CheckIcon size={14} /> {resolvingId === r.id ? 'Saving…' : 'Accept'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myRequests.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            My Swap Requests
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myRequests.map((r) => (
              <div key={r.id} style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.date}</div>
                <RequestStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {viewingDay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,35,51,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 20 }} onClick={() => setViewingDay(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{viewingDay}</div>
              <button onClick={() => setViewingDay(null)} style={{ background: 'transparent', border: 'none', color: COLORS.textMuted }}><X size={20} /></button>
            </div>
            {eventsFor(viewingDay).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {eventsFor(viewingDay).map((ev) => (
                  <div key={ev.id} style={{ fontSize: 13, fontWeight: 700, color: ev.type === 'holiday' ? COLORS.rust : COLORS.amber }}>
                    {ev.type === 'holiday' ? '🔴' : '🟡'} {ev.title}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teamShiftsFor(viewingDay).map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: s.employee_id === employee.id ? 800 : 600 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: colorById[s.employee_id] }} />
                    {s.is_lead && <Star size={13} fill={COLORS.amber} color={COLORS.amber} />}
                    {nameById[s.employee_id] || 'Unknown'}{s.employee_id === employee.id ? ' (you)' : ''}
                  </div>
                  <div className="mono" style={{ fontSize: 13, color: COLORS.textFaint }}>{formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,35,51,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 20 }} onClick={() => !saving && !sendingSwap && setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, maxHeight: '90vh', overflowY: 'auto' }}>
            {currentBlock ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Booked off</div>
                <div style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 16 }}>{editing}</div>
                <div style={{ fontSize: 14, color: COLORS.slate, marginBottom: 20 }}>You marked this day as unavailable.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditing(null)} style={{ flex: 1, background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Close</button>
                  <button onClick={removeBookOff} style={{ flex: 1, background: COLORS.navy, color: COLORS.bg, border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>Undo Book Off</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Edit shift</div>
                <div style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 16 }}>{editing}</div>
                <button
                  onClick={() => { setStart('16:30'); setEnd('19:30') }}
                  style={{
                    width: '100%', background: COLORS.bg, color: COLORS.teal, border: `1px solid ${COLORS.cardLine}`,
                    borderRadius: 10, padding: 10, fontWeight: 700, fontSize: 13, marginBottom: 16,
                  }}
                >
                  Use usual hours (4:30 – 7:30 PM)
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                  <label>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Start</div>
                    <TimeSelect12h value={start} onChange={setStart} />
                  </label>
                  <label>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>End</div>
                    <TimeSelect12h value={end} onChange={setEnd} />
                  </label>
                </div>
                <button
                  onClick={() => setIsLead((prev) => !prev)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: isLead ? `${COLORS.amber}1A` : COLORS.bg, border: `1px solid ${isLead ? COLORS.amber : COLORS.cardLine}`,
                    borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14, color: isLead ? COLORS.amber : COLORS.textMuted, marginBottom: 20,
                  }}
                >
                  <Star size={16} fill={isLead ? COLORS.amber : 'none'} /> {isLead ? "I'm leading this class" : "I'm leading this class?"}
                </button>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setEditing(null)} disabled={saving} style={{ flex: 1, background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Close</button>
                  <button onClick={removeShift} disabled={saving} style={{ flex: 1, background: COLORS.bg, color: COLORS.rust, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Remove</button>
                  <button onClick={saveShift} disabled={saving} style={{ flex: 1, background: COLORS.navy, color: COLORS.bg, border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
                <button onClick={bookOff} disabled={saving} style={{ width: '100%', background: 'transparent', border: 'none', color: COLORS.rust, fontSize: 12, fontWeight: 700, padding: 4, marginBottom: currentShift ? 16 : 0 }}>
                  I can't work this day — book it off
                </button>

                {currentShift && coworkers.length > 0 && (
                  <div style={{ borderTop: `1px solid ${COLORS.cardLine}`, paddingTop: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                      <Repeat size={15} color={COLORS.amber} /> Need someone to cover this?
                    </div>
                    <select value={swapTarget} onChange={(e) => setSwapTarget(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
                      <option value="">Choose a coworker…</option>
                      {coworkers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <input value={swapNote} onChange={(e) => setSwapNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, marginBottom: 10 }} />
                    <button onClick={sendSwapRequest} disabled={!swapTarget || sendingSwap} style={{
                      width: '100%', background: swapTarget ? COLORS.amber : '#D1D5DB', color: COLORS.navy, border: 'none',
                      borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14,
                    }}>{sendingSwap ? 'Sending…' : 'Send Swap Request'}</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RequestStatusBadge({ status }) {
  const map = {
    pending: { color: COLORS.amber, label: 'Pending' },
    approved: { color: COLORS.teal, label: 'Approved' },
    rejected: { color: COLORS.rust, label: 'Rejected' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: s.color, background: `${s.color}1A`, borderRadius: 999, padding: '4px 10px' }}>{s.label}</span>
  )
}

function NotesTab({ employee, unreadNotes, markNotesRead }) {
  const [dateOffset, setDateOffset] = useState(0)
  const [text, setText] = useState('')
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [unreadReplyingTo, setUnreadReplyingTo] = useState(null)
  const [unreadReplyText, setUnreadReplyText] = useState('')
  const [noteError, setNoteError] = useState('')

  const date = new Date(); date.setDate(date.getDate() + dateOffset)
  const dateStr = todayStr(date)

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('notes').select('*').eq('employee_id', employee.id).eq('date', dateStr).order('created_at')
    if (error) {
      setNoteError('Could not load notes — the database may need the latest schema update.')
      setNotes([])
    } else {
      setNotes(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [employee.id, dateStr])

  const threads = useMemo(() => {
    const top = notes.filter((n) => !n.parent_id)
    return top.map((n) => ({ ...n, replies: notes.filter((r) => r.parent_id === n.id) }))
  }, [notes])

  const addNote = async () => {
    const t = text.trim()
    if (!t) return
    setNoteError('')
    const { error } = await supabase.from('notes').insert({ employee_id: employee.id, date: dateStr, text: t, author: 'employee' })
    if (error) { setNoteError(`Could not save your note: ${error.message}`); return }
    setText(''); refresh()
  }

  const sendReply = async (thread) => {
    const t = replyText.trim()
    if (!t) return
    setNoteError('')
    const { error } = await supabase.from('notes').insert({ employee_id: employee.id, date: dateStr, text: t, author: 'employee', parent_id: thread.id })
    if (error) { setNoteError(`Could not send your reply: ${error.message}`); return }
    setReplyText(''); setReplyingTo(null)
    if (thread.author === 'admin' && !thread.read) markNotesRead([thread.id])
    refresh()
  }

  const sendUnreadReply = async (note) => {
    const t = unreadReplyText.trim()
    if (!t) return
    setNoteError('')
    const { error } = await supabase.from('notes').insert({ employee_id: employee.id, date: note.date, text: t, author: 'employee', parent_id: note.id })
    if (error) { setNoteError(`Could not send your reply: ${error.message}`); return }
    setUnreadReplyText(''); setUnreadReplyingTo(null)
    markNotesRead([note.id])
    if (note.date === dateStr) refresh()
  }

  const deleteNote = async (note) => {
    if (!confirm(!note.parent_id ? 'Delete this note? Any replies to it will be deleted too.' : 'Delete this reply?')) return
    setNoteError('')
    const { error } = await supabase.from('notes').delete().eq('id', note.id)
    if (error) { setNoteError(`Could not delete: ${error.message}`); return }
    refresh()
  }

  return (
    <div>
      {noteError && <div style={{ background: `${COLORS.rust}14`, color: COLORS.rust, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{noteError}</div>}
      {unreadNotes && unreadNotes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.amber, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <StickyNote size={14} /> New from your manager
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unreadNotes.map((n) => (
              <div key={n.id} style={{ background: '#FFF', border: `1px solid ${COLORS.amber}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, color: COLORS.textFaint, fontWeight: 700, marginBottom: 6 }}>{n.date}</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: COLORS.slate, marginBottom: 10 }}>{n.text}</div>
                {unreadReplyingTo === n.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      autoFocus
                      value={unreadReplyText}
                      onChange={(e) => setUnreadReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendUnreadReply(n)}
                      placeholder="Write a reply…"
                      style={{ ...inputStyle, flex: 1, padding: '8px 12px', fontSize: 13 }}
                    />
                    <button onClick={() => sendUnreadReply(n)} disabled={!unreadReplyText.trim()} style={{
                      background: unreadReplyText.trim() ? COLORS.amber : '#D1D5DB', color: COLORS.navy, border: 'none',
                      borderRadius: 8, padding: '0 14px', fontWeight: 700, fontSize: 13,
                    }}>Send</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 14 }}>
                    <button onClick={() => { setUnreadReplyingTo(n.id); setUnreadReplyText('') }} style={{ background: 'transparent', border: 'none', color: COLORS.teal, fontSize: 12, fontWeight: 700, padding: 0 }}>Reply</button>
                    <button onClick={() => markNotesRead([n.id])} style={{ background: 'transparent', border: 'none', color: COLORS.textFaint, fontSize: 12, fontWeight: 700, padding: 0 }}>Mark as read</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setDateOffset((d) => d - 1)} style={navBtnStyle}><ChevronLeft size={18} /></button>
        <div style={{ fontSize: 16, fontWeight: 800, minWidth: 190, textAlign: 'center' }}>
          {DAYS[date.getDay()]}, {date.getMonth() + 1}/{date.getDate()} {dateOffset === 0 && '· Today'}
        </div>
        <button onClick={() => setDateOffset((d) => d + 1)} style={navBtnStyle}><ChevronRight size={18} /></button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNote()}
          placeholder="Leave a note about today"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={addNote} disabled={!text.trim()} style={{
          background: text.trim() ? COLORS.amber : '#D1D5DB', color: COLORS.navy, border: 'none',
          borderRadius: 8, padding: '0 18px', fontWeight: 700,
        }}>Add</button>
      </div>

      {loading ? (
        <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : threads.length === 0 ? (
        <div style={{ textAlign: 'center', color: COLORS.textFaint, padding: 40 }}>
          <StickyNote size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>No notes for this day.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {threads.map((n) => {
            const t = new Date(n.created_at)
            return (
              <div key={n.id} style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: 14 }}>
                <NoteAuthorLine author={n.author} time={t} onDelete={n.author === 'employee' ? () => deleteNote(n) : null} />
                <div style={{ fontSize: 14, lineHeight: 1.5, color: COLORS.slate, marginBottom: n.replies.length || replyingTo === n.id ? 10 : 0 }}>{n.text}</div>

                {n.replies.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 14, paddingLeft: 12, borderLeft: `2px solid ${COLORS.cardLine}`, marginBottom: 10 }}>
                    {n.replies.map((r) => {
                      const rt = new Date(r.created_at)
                      return (
                        <div key={r.id}>
                          <NoteAuthorLine author={r.author} time={rt} onDelete={r.author === 'employee' ? () => deleteNote(r) : null} />
                          <div style={{ fontSize: 13, lineHeight: 1.5, color: COLORS.slate }}>{r.text}</div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {replyingTo === n.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      autoFocus
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendReply(n)}
                      placeholder="Write a reply…"
                      style={{ ...inputStyle, flex: 1, padding: '8px 12px', fontSize: 13 }}
                    />
                    <button onClick={() => sendReply(n)} disabled={!replyText.trim()} style={{
                      background: replyText.trim() ? COLORS.amber : '#D1D5DB', color: COLORS.navy, border: 'none',
                      borderRadius: 8, padding: '0 14px', fontWeight: 700, fontSize: 13,
                    }}>Send</button>
                  </div>
                ) : (
                  <button onClick={() => { setReplyingTo(n.id); setReplyText('') }} style={{
                    background: 'transparent', border: 'none', color: COLORS.textFaint, fontSize: 12, fontWeight: 700, padding: 0,
                  }}>Reply</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NoteAuthorLine({ author, time, onDelete }) {
  const isAdmin = author === 'admin'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{
        fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px',
        color: isAdmin ? COLORS.amber : COLORS.teal, background: isAdmin ? `${COLORS.amber}1A` : `${COLORS.teal}1A`,
      }}>{isAdmin ? 'Admin' : 'You'}</span>
      <span className="mono" style={{ fontSize: 11, color: COLORS.textFaint }}>{formatClockTime(time)}</span>
      {onDelete && (
        <button onClick={onDelete} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: COLORS.textFaint, display: 'flex', padding: 2 }}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

function BottomNav({ tab, setTab, openEntry, unreadNotesCount, pendingSwapsForMe }) {
  const items = [
    { key: 'clock', label: 'Clock', icon: Clock },
    { key: 'hours', label: 'Hours', icon: BarChart3 },
    { key: 'schedule', label: 'Schedule', icon: Calendar },
    { key: 'notes', label: 'Notes', icon: StickyNote },
  ]
  return (
    <nav style={{
      position: 'sticky', bottom: 0, background: '#FFFFFF',
      borderTop: `1px solid ${COLORS.cardLine}`, display: 'flex', zIndex: 50,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', width: '100%' }}>
        {items.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, background: 'transparent', border: 'none', padding: '12px 0 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: active ? COLORS.amber : COLORS.textFaint, position: 'relative',
            }}>
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{label}</span>
              {key === 'clock' && openEntry && (
                <span style={{ position: 'absolute', top: 8, right: '32%', width: 7, height: 7, borderRadius: 999, background: COLORS.teal }} />
              )}
              {key === 'notes' && unreadNotesCount > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: '28%', background: COLORS.rust, color: '#FFF',
                  borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{unreadNotesCount}</span>
              )}
              {key === 'schedule' && pendingSwapsForMe > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: '28%', background: COLORS.rust, color: '#FFF',
                  borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{pendingSwapsForMe}</span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
