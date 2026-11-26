export const pad = (n) => String(n).padStart(2, '0')
export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const timeStr = (d = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Parse a "YYYY-MM-DD" date-only string as a LOCAL calendar date.
// `new Date("2026-08-19")` parses as UTC midnight, which can silently roll back
// a day once converted to local time (e.g. in US timezones) — this avoids that.
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function minutesBetween(startISO, endISO) {
  const s = new Date(startISO)
  const e = new Date(endISO)
  return Math.max(0, Math.round((e - s) / 60000))
}
export function fmtHM(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}

export const EMPLOYEE_COLORS = ['#E8871E', '#4A7A6C', '#7A5CC9', '#C94F3D', '#2E7DAF', '#B8862E', '#6B8E23', '#A34E9E']
export function colorForIndex(idx) {
  return EMPLOYEE_COLORS[(idx < 0 ? 0 : idx) % EMPLOYEE_COLORS.length]
}

// ---- Late / overtime rules ----
export const LATE_GRACE_MINUTES = 5
export const STANDARD_WORKDAY_MINUTES = 480 // 8 hours

// scheduledStart like "09:00", dateStr like "2026-08-18"
export function getLateMinutes(clockInISO, scheduledStart, dateStr) {
  if (!scheduledStart) return 0
  const [h, m] = scheduledStart.split(':').map(Number)
  const scheduled = new Date(`${dateStr}T00:00:00`)
  scheduled.setHours(h, m, 0, 0)
  const actual = new Date(clockInISO)
  const diff = Math.round((actual - scheduled) / 60000)
  return diff > LATE_GRACE_MINUTES ? diff : 0
}

export function getOvertimeMinutes(workedMinutes) {
  return workedMinutes > STANDARD_WORKDAY_MINUTES ? workedMinutes - STANDARD_WORKDAY_MINUTES : 0
}

// datetime-local input <-> ISO helpers (keeps local wall-clock time)
export function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function localInputToIso(val) {
  if (!val) return null
  return new Date(val).toISOString()
}

// ---- Calendar helpers ----
// Full 6-week grid (42 days) for a month calendar view, Monday-start.
export function getMonthGridDates(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const startDow = firstOfMonth.getDay() // Sunday = 0, matches the DAYS header (Sun first)
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(firstOfMonth.getDate() - startDow)
  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }
  return days
}

// Just the actual days in a month (no padding) — used for the admin's wide per-employee grid.
export function getMonthDates(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: lastDay }, (_, i) => new Date(year, month, i + 1))
}

// ---- 12-hour time formatting ----
// "HH:MM" (24h, from a time input or stored shift) -> "h:MM AM/PM"
export function formatTime12h(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${period}`
}

// Date object -> "h:MM AM/PM" (for clock in/out timestamps, note times, etc.)
export function formatClockTime(date) {
  const h = date.getHours()
  const m = date.getMinutes()
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${period}`
}

// ---- Distance between two GPS coordinates (meters), used for the clock-in location lock ----
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Wraps the browser Geolocation API in a promise with a friendly error message.
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device/browser does not support location services.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location access was denied. Please enable location permissions and try again.'))
        } else {
          reject(new Error('Could not determine your location. Please try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}
