import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Users, Calendar, BarChart3, StickyNote, Plus, X, Trash2, ChevronLeft, ChevronRight, Pencil, Download, Settings, AlertTriangle, Bell, Repeat, History, Check as CheckIcon, Zap, Copy, Mail, Star, Eye, EyeOff, Banknote } from 'lucide-react'
import PayHoursTab from './PayHoursTab'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { supabase, loadPins, savePin, emailScheduleImage } from './clockDb.js'
import { styles } from '../../lib/uiStyles'
import { COLORS, inputStyle, navBtnStyle, globalFontImport } from './clockTheme.js'
import { pad, todayStr, DAYS, minutesBetween, fmtHM, colorForIndex, getLateMinutes, getOvertimeMinutes, isoToLocalInput, localInputToIso, getMonthDates, formatTime12h, formatClockTime, parseLocalDate } from './clockUtils.js'

export default function StaffClockAdmin() {
  const [tab, setTab] = useState('employees')
  const [employees, setEmployees] = useState([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadNotes, setUnreadNotes] = useState([])
  const [showNotesPopup, setShowNotesPopup] = useState(false)

  const refreshEmployees = async () => {
    setLoadingEmployees(true)
    const [{ data }, pins] = await Promise.all([supabase.from('employees').select('id, name, email').order('name'), loadPins()])
    setEmployees((data || []).map((e) => ({ ...e, password: pins[e.id] || '' })))
    setLoadingEmployees(false)
  }
  useEffect(() => { refreshEmployees() }, [])

  const refreshPendingCount = async () => {
    const { count } = await supabase.from('swap_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    setPendingCount(count || 0)
  }
  useEffect(() => { refreshPendingCount() }, [tab])

  const refreshUnreadNotes = async () => {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('author', 'employee')
      .eq('read', false)
      .order('created_at', { ascending: false })
    setUnreadNotes(data || [])
    return data || []
  }

  useEffect(() => {
    (async () => {
      const data = await refreshUnreadNotes()
      if (data.length > 0) setShowNotesPopup(true)
    })()
  }, [])

  const markNotesRead = async (ids) => {
    if (!ids || ids.length === 0) return
    await supabase.from('notes').update({ read: true }).in('id', ids)
    refreshUnreadNotes()
  }

  const colorMap = useMemo(() => {
    const m = {}
    employees.forEach((e, i) => { m[e.id] = colorForIndex(i) })
    return m
  }, [employees])

  const nameById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.name])), [employees])

  return (
    <div className="sc-root" style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{globalFontImport}</style>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Staff Clock</h1>
          <p style={styles.subtitle}>Clock in/out, schedules, notes and shift swaps. Staff use the Time Clock tab on the front-desk iPad.</p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, width: '100%', padding: '0 0 0' }}>
        <TabBar tab={tab} setTab={setTab} pendingCount={pendingCount} unreadNotesCount={unreadNotes.length} />
      </div>

      <main style={{ flex: 1, maxWidth: 1000, width: '100%', padding: '20px 0 60px' }}>
        {tab === 'employees' && (
          <EmployeesTab employees={employees} loading={loadingEmployees} refresh={refreshEmployees} />
        )}
        {tab === 'schedule' && <ScheduleTab employees={employees} colorMap={colorMap} />}
        {tab === 'hours' && <HoursTab employees={employees} />}
        {tab === 'payhours' && <PayHoursTab employees={employees} />}
        {tab === 'notes' && <NotesTab employees={employees} colorMap={colorMap} unreadNotes={unreadNotes} markNotesRead={markNotesRead} />}
        {tab === 'alerts' && <AlertsTab employees={employees} />}
        {tab === 'requests' && <RequestsTab employees={employees} />}
        {tab === 'log' && <LogTab employees={employees} />}
        {tab === 'settings' && <SettingsTab />}
      </main>

      {showNotesPopup && (
        <NewNotesPopup
          notes={unreadNotes}
          nameById={nameById}
          onDismiss={async () => { await markNotesRead(unreadNotes.map((n) => n.id)); setShowNotesPopup(false) }}
          onView={() => { setShowNotesPopup(false); setTab('notes') }}
        />
      )}
    </div>
  )
}

function NewNotesPopup({ notes, nameById, onDismiss, onView }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,35,51,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 20 }}>
      <div style={{ background: '#FFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <StickyNote size={18} color={COLORS.amber} />
          <div style={{ fontWeight: 800, fontSize: 17 }}>
            {notes.length === 1 ? 'New note from an employee' : `${notes.length} new notes from employees`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0 20px' }}>
          {notes.slice(0, 5).map((n) => (
            <div key={n.id} style={{ background: COLORS.bg, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: COLORS.textFaint, fontWeight: 700, marginBottom: 4 }}>{nameById[n.employee_id] || 'Unknown'} · {n.date}</div>
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

function TabBar({ tab, setTab, pendingCount, unreadNotesCount }) {
  const items = [
    { key: 'employees', label: 'Employees', icon: Users },
    { key: 'schedule', label: 'Schedule', icon: Calendar },
    { key: 'hours', label: 'Clock Hours', icon: BarChart3 },
    { key: 'payhours', label: 'Pay Hours', icon: Banknote },
    { key: 'alerts', label: 'Alerts', icon: Bell },
    { key: 'requests', label: 'Requests', icon: Repeat, badge: pendingCount },
    { key: 'notes', label: 'Notes', icon: StickyNote, badge: unreadNotesCount },
    { key: 'log', label: 'Audit Log', icon: History },
    { key: 'settings', label: 'Settings', icon: Settings },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${COLORS.cardLine}`, overflowX: 'auto' }}>
      {items.map(({ key, label, icon: Icon, badge }) => {
        const active = tab === key
        return (
          <button key={key} onClick={() => setTab(key)} style={{
            background: 'transparent', border: 'none', padding: '10px 14px', display: 'flex',
            alignItems: 'center', gap: 7, fontSize: 14, fontWeight: active ? 700 : 500,
            color: active ? COLORS.navy : COLORS.textFaint, borderBottom: active ? `2px solid ${COLORS.amber}` : '2px solid transparent',
            whiteSpace: 'nowrap', position: 'relative',
          }}>
            <Icon size={16} /> {label}
            {!!badge && (
              <span style={{
                background: COLORS.rust, color: '#FFF', borderRadius: 999, fontSize: 10, fontWeight: 800,
                minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>{badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

async function logAction(action, employeeId, details) {
  try {
    await supabase.from('audit_log').insert({ action, employee_id: employeeId, details })
  } catch (e) {
    console.error('Failed to write audit log', e)
  }
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

// ---------- Employees ----------
function EmployeesTab({ employees, loading, refresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [revealed, setRevealed] = useState(() => new Set())

  const toggleReveal = (id) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const addEmployee = async () => {
    const n = name.trim()
    if (!n || !password) return
    setError('')
    const { data: row, error: err } = await supabase.from('employees').insert({ name: n, email: email.trim() || null }).select('id').single()
    if (!err) await savePin(row.id, password)
    if (err) {
      setError(err.message.includes('duplicate') ? 'That name is already taken.' : 'Something went wrong adding this employee.')
      return
    }
    setName(''); setPassword(''); setEmail(''); setShowAdd(false)
    refresh()
  }

  const removeEmployee = async (id) => {
    if (!confirm('Delete this employee? Their clock records, schedule, and notes will be deleted too.')) return
    await supabase.from('employees').delete().eq('id', id)
    refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textMuted }}>All Employees ({employees.length})</div>
        <button onClick={() => setShowAdd(true)} style={{
          background: COLORS.navy, color: COLORS.bg, border: 'none', borderRadius: 10,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14,
        }}>
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {loading ? (
        <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : employees.length === 0 ? (
        <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>No employees yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {employees.map((emp) => (
            <div key={emp.id} style={{
              background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{emp.name}</div>
                <div style={{ fontSize: 12, color: emp.email ? COLORS.textFaint : COLORS.amber, marginBottom: 3 }}>
                  {emp.email || 'No email — swap alerts won\'t reach them'}
                </div>
                <button onClick={() => toggleReveal(emp.id)} style={{
                  background: 'transparent', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 5,
                  color: COLORS.textMuted, fontSize: 12,
                }}>
                  {revealed.has(emp.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span className="mono">PIN: {revealed.has(emp.id) ? (emp.password || '—') : '••••'}</span>
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditing(emp)} style={{
                  background: COLORS.bg, border: `1px solid ${COLORS.inputLine}`, borderRadius: 8, padding: 8, display: 'flex',
                }}><Pencil size={15} color={COLORS.textMuted} /></button>
                <button onClick={() => removeEmployee(emp.id)} style={{
                  background: COLORS.bg, border: `1px solid ${COLORS.inputLine}`, borderRadius: 8, padding: 8, display: 'flex',
                }}><Trash2 size={15} color={COLORS.rust} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => { setShowAdd(false); setName(''); setPassword(''); setEmail(''); setError('') }} title="Add Employee">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...inputStyle, marginBottom: 10 }} />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
            placeholder="PIN (numbers only)"
            inputMode="numeric"
            pattern="[0-9]*"
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional, for swap alerts)" style={{ ...inputStyle, marginBottom: 10 }} />
          {error && <div style={{ color: COLORS.rust, fontSize: 13, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
          <button onClick={addEmployee} style={{
            width: '100%', background: COLORS.navy, color: COLORS.bg, border: 'none',
            borderRadius: 10, padding: 13, fontWeight: 700, fontSize: 15,
          }}>Add</button>
        </Modal>
      )}

      {editing && (
        <EmployeeEditModal employee={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh() }} />
      )}
    </div>
  )
}

function EmployeeEditModal({ employee, onClose, onDone }) {
  const [email, setEmail] = useState(employee.email || '')
  const [password, setPassword] = useState(employee.password || '')
  const [revealPin, setRevealPin] = useState(false)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    await supabase.from('employees').update({ email: email.trim() || null }).eq('id', employee.id)
    if (password) await savePin(employee.id, password)
    setSaving(false)
    onDone()
  }
  return (
    <Modal onClose={onClose} title={employee.name}>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Email</div>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" style={{ ...inputStyle, marginBottom: 14 }} />
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>PIN</div>
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <input
          type={revealPin ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
          placeholder="PIN (numbers only)"
          inputMode="numeric"
          pattern="[0-9]*"
          style={{ ...inputStyle, paddingRight: 40 }}
        />
        <button onClick={() => setRevealPin((v) => !v)} style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'transparent', border: 'none', color: COLORS.textMuted, display: 'flex', padding: 4,
        }}>{revealPin ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
      <button onClick={save} disabled={saving} style={{
        width: '100%', background: COLORS.navy, color: COLORS.bg, border: 'none',
        borderRadius: 10, padding: 13, fontWeight: 700, fontSize: 15,
      }}>{saving ? 'Saving…' : 'Save'}</button>
    </Modal>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,35,51,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: COLORS.textMuted }}><X size={20} /></button>
        </div>
        {children}
      </div>
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

function EditedTag() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, color: COLORS.textMuted, background: `${COLORS.textMuted}1A`,
      borderRadius: 999, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <Pencil size={9} /> Edited
    </span>
  )
}

// ---------- Schedule (week / month) ----------
function ScheduleTab({ employees, colorMap }) {
  const [view, setView] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [shifts, setShifts] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [isLead, setIsLead] = useState(false)
  const [qfOpen, setQfOpen] = useState(false)
  const [qfEmployeeIds, setQfEmployeeIds] = useState([])
  const [qfFrom, setQfFrom] = useState('')
  const [qfTo, setQfTo] = useState('')
  const [qfDays, setQfDays] = useState({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
  const [qfStart, setQfStart] = useState('16:30')
  const [qfEnd, setQfEnd] = useState('18:00')
  const [qfApplying, setQfApplying] = useState(false)
  const [qfResult, setQfResult] = useState(null)
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState('')
  const [events, setEvents] = useState([])
  const [eventModal, setEventModal] = useState(null) // { id?, date, type, title, note }
  const gridRef = useRef(null)

  const weekDates = useMemo(() => {
    const today = new Date()
    const dow = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((dow + 6) % 7) + weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
  }, [weekOffset])

  const monthBase = new Date(); monthBase.setDate(1); monthBase.setMonth(monthBase.getMonth() + monthOffset)
  const monthDates = useMemo(() => getMonthDates(monthBase.getFullYear(), monthBase.getMonth()), [monthOffset])

  const columns = view === 'week' ? weekDates : monthDates

  const refresh = async () => {
    setLoading(true)
    const from = todayStr(columns[0]); const to = todayStr(columns[columns.length - 1])
    const [shiftsRes, timeOffRes, eventsRes] = await Promise.all([
      supabase.from('schedule').select('*').gte('date', from).lte('date', to),
      supabase.from('time_off').select('*').gte('date', from).lte('date', to),
      supabase.from('schedule_events').select('*').gte('date', from).lte('date', to),
    ])
    setShifts(shiftsRes.data || [])
    setTimeOff(timeOffRes.data || [])
    setEvents(eventsRes.data || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [weekOffset, monthOffset, view, employees.length])

  const shiftFor = (empId, dateStr) => shifts.find((s) => s.employee_id === empId && s.date === dateStr)
  const blockedFor = (empId, dateStr) => timeOff.find((t) => t.employee_id === empId && t.date === dateStr)
  const eventsFor = (dateStr) => events.filter((e) => e.date === dateStr)
  const isHoliday = (dateStr) => events.some((e) => e.date === dateStr && e.type === 'holiday')

  const openEventModal = (dateStr) => setEventModal({ date: dateStr, type: 'event', title: '', note: '' })
  const editEventModal = (ev) => setEventModal({ id: ev.id, date: ev.date, type: ev.type, title: ev.title, note: ev.note || '' })

  const saveEvent = async () => {
    if (!eventModal || !eventModal.title.trim()) return
    if (eventModal.id) {
      await supabase.from('schedule_events').update({ type: eventModal.type, title: eventModal.title.trim(), note: eventModal.note.trim() || null }).eq('id', eventModal.id)
    } else {
      await supabase.from('schedule_events').insert({ date: eventModal.date, type: eventModal.type, title: eventModal.title.trim(), note: eventModal.note.trim() || null })
    }
    setEventModal(null)
    refresh()
  }

  const deleteEvent = async () => {
    if (!eventModal?.id) return
    await supabase.from('schedule_events').delete().eq('id', eventModal.id)
    setEventModal(null)
    refresh()
  }

  const openEditor = (emp, dateStr) => {
    if (isHoliday(dateStr)) return // no shifts on a company holiday — remove the holiday first if you really need to
    const existing = shiftFor(emp.id, dateStr)
    setStart(existing?.start_time || '16:30')
    setEnd(existing?.end_time || '19:30')
    setIsLead(existing?.is_lead || false)
    setEditing({ employee: emp, date: dateStr })
  }

  const saveShift = async () => {
    if (!editing) return
    const existing = shiftFor(editing.employee.id, editing.date)
    if (existing) {
      await supabase.from('schedule').update({ start_time: start, end_time: end, is_lead: isLead }).eq('id', existing.id)
    } else {
      await supabase.from('schedule').insert({ employee_id: editing.employee.id, date: editing.date, start_time: start, end_time: end, is_lead: isLead })
    }
    setEditing(null)
    refresh()
  }

  const removeShift = async () => {
    if (!editing) return
    const existing = shiftFor(editing.employee.id, editing.date)
    if (existing) await supabase.from('schedule').delete().eq('id', existing.id)
    setEditing(null)
    refresh()
  }

  const markUnavailable = async () => {
    if (!editing) return
    const existingShift = shiftFor(editing.employee.id, editing.date)
    if (existingShift) await supabase.from('schedule').delete().eq('id', existingShift.id)
    await supabase.from('time_off').upsert(
      { employee_id: editing.employee.id, date: editing.date, created_by: 'admin' },
      { onConflict: 'employee_id,date' }
    )
    await logAction('mark_unavailable', editing.employee.id, `${editing.employee.name} marked unavailable on ${editing.date} by admin`)
    setEditing(null)
    refresh()
  }

  const removeBlock = async () => {
    if (!editing) return
    const existing = blockedFor(editing.employee.id, editing.date)
    if (existing) await supabase.from('time_off').delete().eq('id', existing.id)
    setEditing(null)
    refresh()
  }

  const openQuickFill = () => {
    setQfEmployeeIds(employees.map((e) => e.id))
    setQfFrom(todayStr())
    setQfTo(todayStr())
    setQfDays({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
    setQfStart('16:30')
    setQfEnd('18:00')
    setQfResult(null)
    setQfOpen(true)
  }

  const toggleQfEmployee = (id) => {
    setQfEmployeeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const applyQuickFill = async () => {
    if (qfEmployeeIds.length === 0 || !qfFrom || !qfTo) return
    setQfApplying(true)
    const [{ data: blockedRows }, { data: holidayRows }] = await Promise.all([
      supabase.from('time_off').select('employee_id, date').gte('date', qfFrom).lte('date', qfTo),
      supabase.from('schedule_events').select('date').eq('type', 'holiday').gte('date', qfFrom).lte('date', qfTo),
    ])
    const blockedSet = new Set((blockedRows || []).map((b) => `${b.employee_id}_${b.date}`))
    const holidaySet = new Set((holidayRows || []).map((h) => h.date))
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const rows = []
    let skipped = 0
    const cur = parseLocalDate(qfFrom)
    const last = parseLocalDate(qfTo)
    while (cur <= last) {
      if (qfDays[dayKeys[cur.getDay()]]) {
        const dateStr = todayStr(cur)
        if (holidaySet.has(dateStr)) { skipped += qfEmployeeIds.length; cur.setDate(cur.getDate() + 1); continue }
        qfEmployeeIds.forEach((empId) => {
          if (blockedSet.has(`${empId}_${dateStr}`)) { skipped++; return }
          rows.push({ employee_id: empId, date: dateStr, start_time: qfStart, end_time: qfEnd })
        })
      }
      cur.setDate(cur.getDate() + 1)
    }
    if (rows.length === 0) { setQfApplying(false); setQfResult(skipped > 0 ? `Skipped ${skipped} — holidays or booked-off days in that range.` : 'No matching days in that range.'); return }
    const { error } = await supabase.from('schedule').upsert(rows, { onConflict: 'employee_id,date' })
    setQfApplying(false)
    if (error) {
      setQfResult('Something went wrong — please try again.')
    } else {
      setQfResult(`Applied to ${rows.length} shift${rows.length === 1 ? '' : 's'}.${skipped > 0 ? ` Skipped ${skipped} (marked unavailable).` : ''}`)
      refresh()
    }
  }

  const copyWeekForward = async () => {
    if (shifts.length === 0) return
    if (!confirm('Copy this week\'s schedule to next week? Existing shifts next week for the same employee/day will be overwritten.')) return
    const rows = shifts.map((s) => {
      const d = parseLocalDate(s.date); d.setDate(d.getDate() + 7)
      return { employee_id: s.employee_id, date: todayStr(d), start_time: s.start_time, end_time: s.end_time }
    })
    await supabase.from('schedule').upsert(rows, { onConflict: 'employee_id,date' })
    refresh()
  }

  const emailScheduleToEmployees = async () => {
    if (!gridRef.current) return
    const recipients = employees.filter((e) => e.email)
    if (recipients.length === 0) { setEmailResult('No employees have an email on file yet.'); return }
    setEmailSending(true)
    setEmailResult('')
    try {
      const canvas = await html2canvas(gridRef.current, { backgroundColor: '#F5F3EE', scale: 2 })
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]
      const monthLabel = monthBase.toLocaleString('en-US', { month: 'long' })
      const { data: settings } = await supabase.from('admin_settings').select('notify_email').eq('id', 1).single()
      const to = [...new Set([...recipients.map((e) => e.email.trim().toLowerCase()), (settings?.notify_email || '').trim().toLowerCase()].filter(Boolean))]
      const { error: sendErr } = await emailScheduleImage(
        to,
        `Schedule for ${monthLabel} ${monthBase.getFullYear()}`,
        `Attached is the team schedule for ${monthLabel} ${monthBase.getFullYear()}.`,
        `schedule-${monthLabel}-${monthBase.getFullYear()}.png`,
        base64,
      )
      if (sendErr) throw sendErr
      await logAction('email_schedule', null, `Emailed the ${monthLabel} ${monthBase.getFullYear()} schedule to ${recipients.length} employee(s)`)
      setEmailResult(`Sent to ${recipients.length} employee${recipients.length === 1 ? '' : 's'}.`)
    } catch (e) {
      setEmailResult('Could not send the schedule email. Please try again.')
    }
    setEmailSending(false)
  }

  if (employees.length === 0) {
    return <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Add an employee first.</div>
  }

  const editingBlock = editing ? blockedFor(editing.employee.id, editing.date) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', background: '#FFF', border: `1px solid ${COLORS.inputLine}`, borderRadius: 10, padding: 3, marginLeft: 8 }}>
            {['week', 'month'].map((v) => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? COLORS.navy : 'transparent', color: view === v ? COLORS.bg : COLORS.textMuted,
                border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 13, fontWeight: 700, textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {view === 'week' && (
            <button onClick={copyWeekForward} disabled={shifts.length === 0} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: '#FFF', color: COLORS.textMuted,
              border: `1px solid ${COLORS.inputLine}`, borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13,
              opacity: shifts.length === 0 ? 0.5 : 1,
            }}>
              <Copy size={15} /> Copy week → next
            </button>
          )}
          {view === 'month' && (
            <button onClick={emailScheduleToEmployees} disabled={emailSending} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: '#FFF', color: COLORS.textMuted,
              border: `1px solid ${COLORS.inputLine}`, borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13,
            }}>
              <Mail size={15} /> {emailSending ? 'Sending…' : 'Email Schedule'}
            </button>
          )}
          <button onClick={openQuickFill} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: COLORS.amber, color: COLORS.navy,
            border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13,
          }}>
            <Zap size={15} /> Quick Fill
          </button>
        </div>
      </div>

      {emailResult && <div style={{ fontSize: 13, fontWeight: 700, color: emailResult.startsWith('Sent') ? COLORS.teal : COLORS.rust, marginBottom: 14 }}>{emailResult}</div>}
      <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 10 }}>Tap a date in the header row to add a holiday or event for that day.</div>

      {loading ? <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div> : (
        <div className="scrollbar-none" style={{ overflowX: 'auto' }}>
          <div ref={gridRef} style={{ minWidth: Math.max(700, columns.length * 64 + 110), background: COLORS.bg, padding: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `110px repeat(${columns.length}, 1fr)`, gap: 4, marginBottom: 4 }}>
              <div />
              {columns.map((d) => {
                const isToday = todayStr(d) === todayStr()
                const dateStr = todayStr(d)
                const dayEvents = eventsFor(dateStr)
                const holiday = dayEvents.find((e) => e.type === 'holiday')
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => dayEvents.length > 0 ? editEventModal(dayEvents[0]) : openEventModal(dateStr)}
                    style={{
                      textAlign: 'center', padding: '8px 2px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: isToday ? COLORS.navy : holiday ? `${COLORS.rust}1A` : 'transparent',
                      color: isToday ? COLORS.bg : COLORS.navy, width: '100%', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{DAYS[d.getDay()]}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{d.getDate()}</div>
                    {dayEvents.length > 0 && (
                      <div style={{
                        fontSize: 8, fontWeight: 800, marginTop: 2, color: holiday ? COLORS.rust : COLORS.amber,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{holiday ? '🔴' : '🟡'} {dayEvents[0].title}</div>
                    )}
                  </button>
                )
              })}
            </div>
            {employees.map((emp) => (
              <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: `110px repeat(${columns.length}, 1fr)`, gap: 4, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, padding: '4px 6px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: colorMap[emp.id], flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</span>
                </div>
                {columns.map((d) => {
                  const dateStr = todayStr(d)
                  const s = shiftFor(emp.id, dateStr)
                  const blocked = blockedFor(emp.id, dateStr)
                  const holiday = isHoliday(dateStr)
                  return (
                    <button
                      key={dateStr}
                      onClick={() => openEditor(emp, dateStr)}
                      disabled={holiday}
                      style={{
                        minHeight: 48, borderRadius: 8,
                        border: holiday ? `1px solid ${COLORS.cardLine}` : blocked ? `1px solid ${COLORS.rust}55` : s ? 'none' : `1px dashed ${COLORS.inputLine}`,
                        background: holiday ? COLORS.bg : blocked ? `${COLORS.rust}14` : s ? `${colorMap[emp.id]}1A` : '#FFF',
                        color: holiday ? COLORS.textFaint : blocked ? COLORS.rust : s ? colorMap[emp.id] : '#D1D5DB',
                        fontSize: 9, fontWeight: 700, padding: 3, lineHeight: 1.35,
                        cursor: holiday ? 'default' : 'pointer',
                      }}
                    >
                      {holiday ? '—' : blocked ? 'Off' : s ? <span className="mono">{s.is_lead && '⭐ '}{formatTime12h(s.start_time)}<br />{formatTime12h(s.end_time)}</span> : '+'}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <Modal title={`${editing.employee.name} · ${editing.date}`} onClose={() => setEditing(null)}>
          {editingBlock ? (
            <>
              <div style={{ fontSize: 14, color: COLORS.slate, marginBottom: 4 }}>Marked unavailable{editingBlock.created_by === 'employee' ? ' by the employee' : ''}.</div>
              {editingBlock.note && <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>"{editingBlock.note}"</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: editingBlock.note ? 0 : 16 }}>
                <button onClick={() => setEditing(null)} style={{ flex: 1, background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Close</button>
                <button onClick={removeBlock} style={{ flex: 1, background: COLORS.navy, color: COLORS.bg, border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>Remove Block</button>
              </div>
            </>
          ) : (
            <>
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
                <Star size={16} fill={isLead ? COLORS.amber : 'none'} /> {isLead ? 'Leading this class' : 'Mark as class lead'}
              </button>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={() => setEditing(null)} style={{ flex: 1, background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Close</button>
                <button onClick={removeShift} style={{ flex: 1, background: COLORS.bg, color: COLORS.rust, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Remove</button>
                <button onClick={saveShift} style={{ flex: 1, background: COLORS.navy, color: COLORS.bg, border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>Save</button>
              </div>
              <button onClick={markUnavailable} style={{ width: '100%', background: 'transparent', border: 'none', color: COLORS.textFaint, fontSize: 12, fontWeight: 700, padding: 4 }}>
                Mark this day unavailable instead
              </button>
            </>
          )}
        </Modal>
      )}

      {eventModal && (
        <Modal title={eventModal.id ? 'Edit' : 'Add Holiday / Event'} onClose={() => setEventModal(null)}>
          <div style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 16 }}>{eventModal.date}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['holiday', 'event'].map((t) => (
              <button key={t} onClick={() => setEventModal((prev) => ({ ...prev, type: t }))} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, textTransform: 'capitalize',
                background: eventModal.type === t ? (t === 'holiday' ? COLORS.rust : COLORS.amber) : COLORS.bg,
                color: eventModal.type === t ? '#FFF' : COLORS.textMuted,
              }}>{t === 'holiday' ? '🔴 Holiday' : '🟡 Event'}</button>
            ))}
          </div>
          <input
            autoFocus
            value={eventModal.title}
            onChange={(e) => setEventModal((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={eventModal.type === 'holiday' ? 'e.g. Closed for New Year' : 'e.g. Team meeting 3pm'}
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <input
            value={eventModal.note}
            onChange={(e) => setEventModal((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="Note (optional)"
            style={{ ...inputStyle, marginBottom: 18 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {eventModal.id && (
              <button onClick={deleteEvent} style={{ flex: 1, background: COLORS.bg, color: COLORS.rust, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Delete</button>
            )}
            <button onClick={saveEvent} disabled={!eventModal.title.trim()} style={{
              flex: eventModal.id ? 1 : 1, background: eventModal.title.trim() ? COLORS.navy : '#D1D5DB', color: COLORS.bg,
              border: 'none', borderRadius: 10, padding: 12, fontWeight: 700,
            }}>Save</button>
          </div>
        </Modal>
      )}

      {qfOpen && (
        <Modal title="Quick Fill Schedule" onClose={() => setQfOpen(false)}>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4, fontWeight: 700 }}>Employees</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={() => setQfEmployeeIds(employees.map((e) => e.id))} style={{ background: 'transparent', border: 'none', color: COLORS.teal, fontSize: 12, fontWeight: 700, padding: 0 }}>Select all</button>
            <button onClick={() => setQfEmployeeIds([])} style={{ background: 'transparent', border: 'none', color: COLORS.textFaint, fontSize: 12, fontWeight: 700, padding: 0 }}>Clear</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 140, overflowY: 'auto' }}>
            {employees.map((emp) => (
              <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={qfEmployeeIds.includes(emp.id)} onChange={() => toggleQfEmployee(emp.id)} />
                {emp.name}
              </label>
            ))}
          </div>

          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8, fontWeight: 700 }}>Date range</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>From</div>
              <input type="date" lang="en-US" value={qfFrom} onChange={(e) => setQfFrom(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>To</div>
              <input type="date" lang="en-US" value={qfTo} onChange={(e) => setQfTo(e.target.value)} style={inputStyle} />
            </label>
          </div>

          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8, fontWeight: 700 }}>Which days (tap to select)</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((key, i) => (
              <button key={key} onClick={() => setQfDays((prev) => ({ ...prev, [key]: !prev[key] }))} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                background: qfDays[key] ? COLORS.navy : COLORS.bg, color: qfDays[key] ? COLORS.bg : COLORS.textFaint,
              }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <label>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Start</div>
              <TimeSelect12h value={qfStart} onChange={setQfStart} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>End</div>
              <TimeSelect12h value={qfEnd} onChange={setQfEnd} />
            </label>
          </div>

          {qfResult && <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.teal, marginBottom: 12 }}>{qfResult}</div>}

          <button onClick={applyQuickFill} disabled={qfApplying || qfEmployeeIds.length === 0} style={{
            width: '100%', background: qfEmployeeIds.length > 0 ? COLORS.amber : '#D1D5DB', color: COLORS.navy, border: 'none',
            borderRadius: 10, padding: 13, fontWeight: 800, fontSize: 15,
          }}>{qfApplying ? 'Applying…' : `Apply to ${qfEmployeeIds.length} employee${qfEmployeeIds.length === 1 ? '' : 's'}`}</button>
        </Modal>
      )}
    </div>
  )
}

// ---------- Hours (all employees) ----------
function HoursTab({ employees }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [who, setWho] = useState('all')
  const [entries, setEntries] = useState([])
  const [scheduleMap, setScheduleMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)

  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset)
  const year = base.getFullYear(); const month = base.getMonth()
  const nameById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.name])), [employees])
  const colorById = useMemo(() => Object.fromEntries(employees.map((e, i) => [e.id, colorForIndex(i)])), [employees])

  const dateRange = () => {
    const from = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`
    return { from, to }
  }

  const refresh = async () => {
    setLoading(true)
    const { from, to } = dateRange()
    let query = supabase.from('entries').select('*').gte('date', from).lte('date', to).order('date').order('clock_in')
    if (who !== 'all') query = query.eq('employee_id', who)
    let scheduleQuery = supabase.from('schedule').select('*').gte('date', from).lte('date', to)
    if (who !== 'all') scheduleQuery = scheduleQuery.eq('employee_id', who)
    const [entriesRes, scheduleRes] = await Promise.all([query, scheduleQuery])
    setEntries(entriesRes.data || [])
    const map = {}
    ;(scheduleRes.data || []).forEach((s) => { map[`${s.employee_id}_${s.date}`] = s })
    setScheduleMap(map)
    setLoading(false)
  }
  useEffect(() => { refresh() }, [year, month, who])

  const totalMins = entries.reduce((sum, e) => e.clock_out ? sum + minutesBetween(e.clock_in, e.clock_out) : sum, 0)

  const exportToExcel = () => {
    const rows = entries.map((e) => {
      const mins = e.clock_out ? minutesBetween(e.clock_in, e.clock_out) : null
      const lateMins = getLateMinutes(e.clock_in, scheduleMap[`${e.employee_id}_${e.date}`]?.start_time, e.date)
      const overtimeMins = mins !== null ? getOvertimeMinutes(mins) : 0
      const ci = new Date(e.clock_in)
      const co = e.clock_out ? new Date(e.clock_out) : null
      return {
        Employee: nameById[e.employee_id] || 'Unknown',
        Date: e.date,
        'Clock In': `${pad(ci.getHours())}:${pad(ci.getMinutes())}`,
        'Clock Out': co ? `${pad(co.getHours())}:${pad(co.getMinutes())}` : 'In progress',
        'Hours Worked': mins !== null ? (mins / 60).toFixed(2) : '',
        'Late (min)': lateMins || '',
        'Overtime (min)': overtimeMins || '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hours')
    const monthLabel = base.toLocaleString('en-US', { month: 'short' })
    const who_label = who === 'all' ? 'all-employees' : (nameById[who] || 'employee').replace(/\s+/g, '-')
    XLSX.writeFile(wb, `attendance-${who_label}-${monthLabel}-${year}.xlsx`)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setMonthOffset((m) => m - 1)} style={navBtnStyle}><ChevronLeft size={18} /></button>
          <div style={{ fontSize: 18, fontWeight: 800, minWidth: 140, textAlign: 'center' }}>{base.toLocaleString('en-US', { month: 'long' })} {year}</div>
          <button onClick={() => setMonthOffset((m) => m + 1)} style={navBtnStyle}><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${COLORS.inputLine}`, fontWeight: 600, background: '#FFF' }}>
            <option value="all">All Employees</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <button onClick={exportToExcel} disabled={entries.length === 0} style={{
            display: 'flex', alignItems: 'center', gap: 7, background: COLORS.teal, color: '#FFF', border: 'none',
            borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 14, opacity: entries.length === 0 ? 0.5 : 1,
          }}>
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      <div style={{ background: COLORS.navy, color: COLORS.bg, borderRadius: 16, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: COLORS.textFaint, fontWeight: 600, marginBottom: 4 }}>Total hours</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: COLORS.amber }}>{fmtHM(totalMins)}</div>
        </div>
        <BarChart3 size={32} color={COLORS.teal} />
      </div>

      {loading ? <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div> : entries.length === 0 ? (
        <div style={{ color: COLORS.textFaint, fontSize: 14, textAlign: 'center', padding: 40 }}>No records this month.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((e) => {
            const d = parseLocalDate(e.date)
            const mins = e.clock_out ? minutesBetween(e.clock_in, e.clock_out) : null
            const lateMins = getLateMinutes(e.clock_in, scheduleMap[`${e.employee_id}_${e.date}`]?.start_time, e.date)
            const overtimeMins = mins !== null ? getOvertimeMinutes(mins) : 0
            return (
              <div key={e.id} style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: colorById[e.employee_id] }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {DAYS[d.getDay()]}, {d.getMonth() + 1}/{d.getDate()} {who === 'all' ? `· ${nameById[e.employee_id] || 'Unknown'}` : ''}
                      {!e.clock_out && <Badge color={COLORS.rust}>Missing clock-out</Badge>}
                      {lateMins > 0 && <Badge color={COLORS.rust}>Late {fmtHM(lateMins)}</Badge>}
                      {overtimeMins > 0 && <Badge color={COLORS.amber}>Overtime {fmtHM(overtimeMins)}</Badge>}
                      {e.edited_by_admin && <EditedTag />}
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: COLORS.textFaint }}>
                      {formatClockTime(new Date(e.clock_in))} – {e.clock_out ? formatClockTime(new Date(e.clock_out)) : 'in progress'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: mins === null ? COLORS.teal : COLORS.navy }}>
                    {mins === null ? 'In progress' : fmtHM(mins)}
                  </div>
                  <button onClick={() => setEditingEntry(e)} style={{
                    background: COLORS.bg, border: `1px solid ${COLORS.inputLine}`, borderRadius: 8, padding: 8, display: 'flex',
                  }}><Pencil size={14} color={COLORS.textMuted} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editingEntry && (
        <FixEntryModal
          entry={editingEntry}
          employeeName={nameById[editingEntry.employee_id] || 'Unknown'}
          onClose={() => setEditingEntry(null)}
          onDone={() => { setEditingEntry(null); refresh() }}
        />
      )}
    </div>
  )
}

// Lets the admin correct a clock in/out time, most often when someone forgot to clock out.
// Every save/delete writes an audit log entry so there's a record of who changed what.
function FixEntryModal({ entry, employeeName, onClose, onDone }) {
  const [clockIn, setClockIn] = useState(isoToLocalInput(entry.clock_in))
  const [clockOut, setClockOut] = useState(isoToLocalInput(entry.clock_out))
  const [saving, setSaving] = useState(false)

  const fmtOld = (iso) => iso ? isoToLocalInput(iso).replace('T', ' ') : 'blank'
  const [saveError, setSaveError] = useState('')

  const save = async () => {
    setSaving(true)
    setSaveError('')
    const oldIn = fmtOld(entry.clock_in)
    const oldOut = fmtOld(entry.clock_out)
    const newInIso = localInputToIso(clockIn)
    const newOutIso = clockOut ? localInputToIso(clockOut) : null
    const newDate = clockIn.split('T')[0] // keep "date" in sync with the (possibly edited) clock-in day — this was the bug
    const { error } = await supabase.from('entries').update({ clock_in: newInIso, clock_out: newOutIso, date: newDate, edited_by_admin: true }).eq('id', entry.id)
    if (error) {
      setSaving(false)
      setSaveError(`Could not save: ${error.message}`)
      return
    }
    await logAction(
      'edit_entry',
      entry.employee_id,
      `${employeeName} — ${entry.date}${newDate !== entry.date ? ` → ${newDate}` : ''}: clock-in ${oldIn} → ${clockIn.replace('T', ' ')}, clock-out ${oldOut} → ${clockOut ? clockOut.replace('T', ' ') : 'blank'}`
    )
    setSaving(false)
    onDone()
  }

  const remove = async () => {
    if (!confirm('Delete this entry entirely?')) return
    setSaveError('')
    const { error } = await supabase.from('entries').delete().eq('id', entry.id)
    if (error) { setSaveError(`Could not delete: ${error.message}`); return }
    await logAction('delete_entry', entry.employee_id, `${employeeName} — ${entry.date}: entry deleted (was ${fmtOld(entry.clock_in)} – ${fmtOld(entry.clock_out)})`)
    onDone()
  }

  return (
    <Modal title={`Fix entry · ${employeeName}`} onClose={onClose}>
      <label>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Clock in</div>
        <input type="datetime-local" lang="en-US" value={clockIn} onChange={(e) => setClockIn(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
      </label>
      <label>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>Clock out (leave blank if still working)</div>
        <input type="datetime-local" lang="en-US" value={clockOut} onChange={(e) => setClockOut(e.target.value)} style={{ ...inputStyle, marginBottom: 18 }} />
      </label>
      {saveError && <div style={{ background: `${COLORS.rust}14`, color: COLORS.rust, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{saveError}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ flex: 1, background: COLORS.bg, color: COLORS.textMuted, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Close</button>
        <button onClick={remove} style={{ flex: 1, background: COLORS.bg, color: COLORS.rust, border: `1px solid ${COLORS.cardLine}`, borderRadius: 10, padding: 12, fontWeight: 700 }}>Delete</button>
        <button onClick={save} disabled={saving} style={{ flex: 1, background: COLORS.navy, color: COLORS.bg, border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

// ---------- Alerts (late / missing clock-out / overtime, last 14 days) ----------
function AlertsTab({ employees }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)
  const nameById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.name])), [employees])

  const refresh = async () => {
    setLoading(true)
    const to = new Date()
    const from = new Date(); from.setDate(from.getDate() - 14)
    const fromStr = todayStr(from); const toStr = todayStr(to)
    const [entriesRes, scheduleRes] = await Promise.all([
      supabase.from('entries').select('*').gte('date', fromStr).lte('date', toStr).order('date', { ascending: false }),
      supabase.from('schedule').select('*').gte('date', fromStr).lte('date', toStr),
    ])
    const scheduleMap = {}
    ;(scheduleRes.data || []).forEach((s) => { scheduleMap[`${s.employee_id}_${s.date}`] = s })

    const flagged = []
    ;(entriesRes.data || []).forEach((e) => {
      const mins = e.clock_out ? minutesBetween(e.clock_in, e.clock_out) : null
      const hoursOpen = !e.clock_out ? minutesBetween(e.clock_in, new Date().toISOString()) / 60 : 0
      const lateMins = getLateMinutes(e.clock_in, scheduleMap[`${e.employee_id}_${e.date}`]?.start_time, e.date)
      const overtimeMins = mins !== null ? getOvertimeMinutes(mins) : 0

      if (!e.clock_out && (e.date !== todayStr() || hoursOpen > 12)) {
        flagged.push({ entry: e, type: 'missing', label: 'Missing clock-out', color: COLORS.rust })
      }
      if (lateMins > 0) {
        flagged.push({ entry: e, type: 'late', label: `Late ${fmtHM(lateMins)}`, color: COLORS.rust })
      }
      if (overtimeMins > 0) {
        flagged.push({ entry: e, type: 'overtime', label: `Overtime ${fmtHM(overtimeMins)}`, color: COLORS.amber })
      }
    })
    setItems(flagged)
    setLoading(false)
  }
  useEffect(() => { refresh() }, [employees.length])

  if (loading) return <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 16 }}>Last 14 days · late arrivals, missing clock-outs, and overtime shifts</div>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', color: COLORS.textFaint, padding: 40 }}>
          <Bell size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>Nothing to flag right now.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => {
            const d = parseLocalDate(item.entry.date)
            return (
              <div key={`${item.entry.id}-${item.type}`} style={{
                background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{nameById[item.entry.employee_id] || 'Unknown'} · {DAYS[d.getDay()]} {d.getMonth() + 1}/{d.getDate()}</div>
                  <Badge color={item.color}>{item.label}</Badge>
                </div>
                <button onClick={() => setEditingEntry(item.entry)} style={{
                  background: COLORS.navy, color: COLORS.bg, border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13,
                }}>Fix</button>
              </div>
            )
          })}
        </div>
      )}

      {editingEntry && (
        <FixEntryModal
          entry={editingEntry}
          employeeName={nameById[editingEntry.employee_id] || 'Unknown'}
          onClose={() => setEditingEntry(null)}
          onDone={() => { setEditingEntry(null); refresh() }}
        />
      )}
    </div>
  )
}

// ---------- Swap requests ----------
function RequestsTab({ employees }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const nameById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.name])), [employees])

  const refresh = async () => {
    setLoading(true)
    const { data } = await supabase.from('swap_requests').select('*').order('created_at', { ascending: false }).limit(50)
    setRequests(data || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [employees.length])

  const pending = requests.filter((r) => r.status === 'pending')
  const resolved = requests.filter((r) => r.status !== 'pending')

  if (loading) return <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 20 }}>
        Coworkers approve or reject swap requests themselves — this is a read-only view so you can keep track.
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textMuted, marginBottom: 12 }}>Pending ({pending.length})</div>
      {pending.length === 0 ? (
        <div style={{ color: COLORS.textFaint, fontSize: 14, padding: '10px 0 24px' }}>No pending swap requests.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {pending.map((r) => (
            <div key={r.id} style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  {nameById[r.requester_id] || 'Unknown'} → {nameById[r.target_id] || 'Unknown'} · {r.date}
                </div>
                {r.note && <div style={{ fontSize: 13, color: COLORS.textMuted }}>"{r.note}"</div>}
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '4px 10px', color: COLORS.amber, background: `${COLORS.amber}1A`, whiteSpace: 'nowrap' }}>
                Awaiting {nameById[r.target_id] || 'response'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textMuted, marginBottom: 12 }}>History</div>
      {resolved.length === 0 ? (
        <div style={{ color: COLORS.textFaint, fontSize: 14 }}>No resolved requests yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resolved.slice(0, 20).map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: `1px solid ${COLORS.cardLine}` }}>
              <div style={{ fontSize: 13 }}>{nameById[r.requester_id] || 'Unknown'} → {nameById[r.target_id] || 'Unknown'} · {r.date}</div>
              <span style={{
                fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 9px',
                color: r.status === 'approved' ? COLORS.teal : COLORS.rust,
                background: r.status === 'approved' ? `${COLORS.teal}1A` : `${COLORS.rust}1A`,
              }}>{r.status === 'approved' ? 'Approved' : 'Rejected'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Audit log ----------
function LogTab({ employees }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const nameById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.name])), [employees])

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100)
      setLogs(data || [])
      setLoading(false)
    })()
  }, [])

  const actionLabel = { edit_entry: 'Edited entry', delete_entry: 'Deleted entry', approve_swap: 'Approved swap', reject_swap: 'Rejected swap', edit_own_schedule: 'Employee edited own schedule', mark_unavailable: 'Marked unavailable', email_schedule: 'Emailed schedule' }

  if (loading) return <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 16 }}>Recent admin corrections and approvals, most recent first</div>
      {logs.length === 0 ? (
        <div style={{ textAlign: 'center', color: COLORS.textFaint, padding: 40 }}>
          <History size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>No changes logged yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map((log) => {
            const t = new Date(log.created_at)
            return (
              <div key={log.id} style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.navy, background: COLORS.bg, borderRadius: 999, padding: '3px 9px' }}>
                    {actionLabel[log.action] || log.action}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: COLORS.textFaint }}>
                    {t.getMonth() + 1}/{t.getDate()} {formatClockTime(t)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: COLORS.slate, lineHeight: 1.5 }}>{log.details}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- Notes (all employees) ----------
function NotesTab({ employees, colorMap, unreadNotes, markNotesRead }) {
  const [dateOffset, setDateOffset] = useState(0)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [sendTo, setSendTo] = useState('')
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [noteError, setNoteError] = useState('')
  const [unreadReplyingTo, setUnreadReplyingTo] = useState(null)
  const [unreadReplyText, setUnreadReplyText] = useState('')
  const nameById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.name])), [employees])

  const date = new Date(); date.setDate(date.getDate() + dateOffset)
  const dateStr = todayStr(date)

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('notes').select('*').eq('date', dateStr).order('created_at')
    if (error) {
      setNoteError('Could not load notes — the database may need the latest schema update. See supabase-schema.sql.')
      setNotes([])
    } else {
      setNotes(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [dateStr])
  useEffect(() => { if (employees.length > 0 && !sendTo) setSendTo(employees[0].id) }, [employees])

  const threads = useMemo(() => {
    const top = notes.filter((n) => !n.parent_id)
    return top.map((n) => ({ ...n, replies: notes.filter((r) => r.parent_id === n.id) }))
  }, [notes])

  const sendNote = async () => {
    const t = sendText.trim()
    if (!t || !sendTo) return
    setSending(true)
    setNoteError('')
    const { error } = await supabase.from('notes').insert({ employee_id: sendTo, date: dateStr, text: t, author: 'admin' })
    setSending(false)
    if (error) {
      setNoteError(`Could not send the note: ${error.message}`)
      return
    }
    setSendText('')
    refresh()
  }

  const sendReply = async (thread) => {
    const t = replyText.trim()
    if (!t) return
    setNoteError('')
    const { error } = await supabase.from('notes').insert({ employee_id: thread.employee_id, date: dateStr, text: t, author: 'admin', parent_id: thread.id })
    if (error) {
      setNoteError(`Could not send the reply: ${error.message}`)
      return
    }
    setReplyText(''); setReplyingTo(null)
    if (thread.author === 'employee' && !thread.read) markNotesRead([thread.id])
    refresh()
  }

  const sendUnreadReply = async (note) => {
    const t = unreadReplyText.trim()
    if (!t) return
    setNoteError('')
    const { error } = await supabase.from('notes').insert({ employee_id: note.employee_id, date: note.date, text: t, author: 'admin', parent_id: note.id })
    if (error) { setNoteError(`Could not send the reply: ${error.message}`); return }
    setUnreadReplyText(''); setUnreadReplyingTo(null)
    markNotesRead([note.id])
    if (note.date === dateStr) refresh()
  }

  const deleteNote = async (note) => {
    if (!confirm(note.replies_count > 0 || !note.parent_id ? 'Delete this note? Any replies to it will be deleted too.' : 'Delete this reply?')) return
    setNoteError('')
    const { error } = await supabase.from('notes').delete().eq('id', note.id)
    if (error) { setNoteError(`Could not delete: ${error.message}`); return }
    refresh()
  }

  return (
    <div>
      {unreadNotes && unreadNotes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.amber, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <StickyNote size={14} /> New from employees
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unreadNotes.map((n) => (
              <div key={n.id} style={{ background: '#FFF', border: `1px solid ${COLORS.amber}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: colorMap[n.employee_id] }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{nameById[n.employee_id] || 'Unknown'}</span>
                  <span style={{ fontSize: 12, color: COLORS.textFaint }}>{n.date}</span>
                </div>
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

      {employees.length > 0 && (
        <div style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textMuted, marginBottom: 10 }}>Send a note to an employee</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={sendTo} onChange={(e) => setSendTo(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 0 160px' }}>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
            <input
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendNote()}
              placeholder={`Note for ${nameById[sendTo] || 'employee'} on ${dateStr}`}
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            />
            <button onClick={sendNote} disabled={sending || !sendText.trim()} style={{
              background: sendText.trim() ? COLORS.amber : '#D1D5DB', color: COLORS.navy, border: 'none',
              borderRadius: 8, padding: '0 18px', fontWeight: 700,
            }}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
          {noteError && <div style={{ color: COLORS.rust, fontSize: 12, fontWeight: 600, marginTop: 8 }}>{noteError}</div>}
        </div>
      )}

      {loading ? <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div> : threads.length === 0 ? (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: colorMap[n.employee_id] }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{nameById[n.employee_id] || 'Unknown'}</span>
                  <NoteAuthorBadge author={n.author} />
                  <span className="mono" style={{ fontSize: 12, color: COLORS.textFaint }}>{formatClockTime(t)}</span>
                  <button onClick={() => deleteNote(n)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: COLORS.textFaint, display: 'flex', padding: 2 }}><Trash2 size={13} /></button>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: COLORS.slate, marginBottom: n.replies.length || replyingTo === n.id ? 10 : 0 }}>{n.text}</div>

                {n.replies.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 14, paddingLeft: 12, borderLeft: `2px solid ${COLORS.cardLine}`, marginBottom: 10 }}>
                    {n.replies.map((r) => {
                      const rt = new Date(r.created_at)
                      return (
                        <div key={r.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <NoteAuthorBadge author={r.author} />
                            <span className="mono" style={{ fontSize: 11, color: COLORS.textFaint }}>{formatClockTime(rt)}</span>
                            <button onClick={() => deleteNote(r)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: COLORS.textFaint, display: 'flex', padding: 2 }}><Trash2 size={12} /></button>
                          </div>
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

function NoteAuthorBadge({ author }) {
  const isAdmin = author === 'admin'
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px',
      color: isAdmin ? COLORS.amber : COLORS.teal, background: isAdmin ? `${COLORS.amber}1A` : `${COLORS.teal}1A`,
    }}>{isAdmin ? 'Admin' : 'Employee'}</span>
  )
}

// ---------- Settings ----------
function SettingsTab() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingEmail, setSavingEmail] = useState(false)
  const [toast, setToast] = useState('')
  const [deviceLockToken, setDeviceLockToken] = useState(null)
  const [savingDevice, setSavingDevice] = useState(false)

  const DEVICE_TOKEN_KEY = 'attendance_device_token'

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('admin_settings').select('notify_email, device_lock_token').eq('id', 1).single()
      setEmail(data?.notify_email || '')
      setDeviceLockToken(data?.device_lock_token || null)
      setLoading(false)
    })()
  }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const saveEmail = async () => {
    setSavingEmail(true)
    await supabase.from('admin_settings').update({ notify_email: email.trim() || null }).eq('id', 1)
    setSavingEmail(false)
    showToast('Notification email saved')
  }

  const thisDeviceToken = typeof window !== 'undefined' ? localStorage.getItem(DEVICE_TOKEN_KEY) : null
  const isThisDeviceRegistered = deviceLockToken && deviceLockToken === thisDeviceToken

  const registerThisDevice = async () => {
    setSavingDevice(true)
    const token = crypto.randomUUID()
    const { error } = await supabase.from('admin_settings').update({ device_lock_token: token }).eq('id', 1)
    setSavingDevice(false)
    if (error) { showToast('Could not register this device — please try again'); return }
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
    setDeviceLockToken(token)
    showToast('This device is now the only one that can clock in/out')
  }

  const disableDeviceLock = async () => {
    setSavingDevice(true)
    await supabase.from('admin_settings').update({ device_lock_token: null }).eq('id', 1)
    setSavingDevice(false)
    setDeviceLockToken(null)
    showToast('Device lock turned off — any device can clock in/out now')
  }

  if (loading) return <div style={{ color: COLORS.textFaint, textAlign: 'center', padding: 40 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 420 }}>
      <div style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Notification email</div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>
          Sent an alert whenever an employee changes their own schedule or requests a shift swap.
        </div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.com" style={{ ...inputStyle, marginBottom: 12 }} />
        <button onClick={saveEmail} disabled={savingEmail} style={{
          width: '100%', background: COLORS.navy, color: COLORS.bg, border: 'none',
          borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14,
        }}>{savingEmail ? 'Saving…' : 'Save Email'}</button>
      </div>

      <div style={{ background: '#FFF', border: `1px solid ${COLORS.cardLine}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Device lock for clock in/out</div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14 }}>
          Restrict clock in/out to one device — for example, the front-desk tablet. Do this from
          that device itself; it registers whichever browser you're using right now.
        </div>

        {!deviceLockToken ? (
          <>
            <div style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 12 }}>Currently off — any device can clock in/out.</div>
            <button onClick={registerThisDevice} disabled={savingDevice} style={{
              width: '100%', background: COLORS.amber, color: COLORS.navy, border: 'none',
              borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14,
            }}>{savingDevice ? 'Registering…' : 'Register this device'}</button>
          </>
        ) : isThisDeviceRegistered ? (
          <>
            <div style={{ fontSize: 13, color: COLORS.teal, fontWeight: 700, marginBottom: 12 }}>✓ This device is the registered clock-in device.</div>
            <button onClick={disableDeviceLock} disabled={savingDevice} style={{
              width: '100%', background: COLORS.bg, color: COLORS.rust, border: `1px solid ${COLORS.cardLine}`,
              borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14,
            }}>{savingDevice ? 'Saving…' : 'Turn off device lock'}</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: COLORS.rust, marginBottom: 12 }}>A different device is registered. Re-register from this device to switch, or turn it off.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={disableDeviceLock} disabled={savingDevice} style={{
                flex: 1, background: COLORS.bg, color: COLORS.rust, border: `1px solid ${COLORS.cardLine}`,
                borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 13,
              }}>Turn off</button>
              <button onClick={registerThisDevice} disabled={savingDevice} style={{
                flex: 1, background: COLORS.amber, color: COLORS.navy, border: 'none',
                borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 13,
              }}>Register this one</button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: COLORS.teal }}>{toast}</div>
      )}
    </div>
  )
}
