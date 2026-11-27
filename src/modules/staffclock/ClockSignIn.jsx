import React, { useEffect, useState } from 'react'
import { Delete } from 'lucide-react'
import { supabase, checkPin } from './clockDb.js'
import { COLORS, globalFontImport } from './clockTheme.js'

// Front-desk iPad: each employee picks their name and enters their own PIN.
export default function ClockSignIn({ onSuccess }) {
  const [employees, setEmployees] = useState([])
  const [selected, setSelected] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.from('employees').select('id, name, email').order('name')
      if (!err && data) {
        setEmployees(data)
        if (data.length > 0) setSelected(data[0].id)
      }
      setFetching(false)
    })()
  }, [])

  const pressDigit = (d) => {
    setError('')
    setPin((prev) => (prev.length >= 12 ? prev : prev + d))
  }
  const backspace = () => { setError(''); setPin((prev) => prev.slice(0, -1)) }
  const clearPin = () => { setError(''); setPin('') }

  const submit = async () => {
    if (!selected || !pin) return
    setLoading(true)
    setError('')
    let ok = false
    try {
      ok = await checkPin(selected, pin)
    } catch (e) {
      setLoading(false)
      setError('Something went wrong connecting. Please try again.')
      return
    }
    setLoading(false)
    const emp = employees.find((e) => e.id === selected)
    if (ok && emp) {
      onSuccess({ id: emp.id, name: emp.name, email: emp.email })
    } else {
      setError('Incorrect PIN.')
      setPin('')
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

  return (
    <div className="sc-root" style={{ minHeight: '80vh', background: COLORS.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{globalFontImport}</style>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: COLORS.navy, marginBottom: 8, textAlign: 'center' }}>Employee Sign In</div>

        {fetching ? (
          <div style={{ color: COLORS.textFaint, fontSize: 16, textAlign: 'center', marginTop: 20 }}>Loading…</div>
        ) : employees.length === 0 ? (
          <div style={{ color: COLORS.textFaint, fontSize: 16, textAlign: 'center', marginTop: 20 }}>
            No employees yet. Please contact your admin.
          </div>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => { setSelected(e.target.value); setPin(''); setError('') }}
              style={{
                width: '100%', padding: '18px 16px', borderRadius: 14, border: `1px solid ${COLORS.inputLine}`,
                fontSize: 20, fontWeight: 700, background: '#FFF', color: COLORS.navy, marginBottom: 20, textAlign: 'center',
              }}
            >
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>

            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, height: 40, marginBottom: 8,
            }}>
              {pin.length === 0 ? (
                <span style={{ color: COLORS.textFaint, fontSize: 16 }}>Enter your PIN</span>
              ) : (
                Array.from({ length: pin.length }).map((_, i) => (
                  <span key={i} style={{ width: 16, height: 16, borderRadius: 999, background: COLORS.navy, display: 'inline-block' }} />
                ))
              )}
            </div>
            {error && <div style={{ color: COLORS.rust, fontSize: 15, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {keys.map((k) => {
                if (k === 'clear') {
                  return (
                    <button key={k} onClick={clearPin} style={{
                      background: COLORS.bg, border: `1px solid ${COLORS.inputLine}`, borderRadius: 16,
                      padding: '22px 0', fontSize: 16, fontWeight: 700, color: COLORS.textMuted,
                    }}>Clear</button>
                  )
                }
                if (k === 'back') {
                  return (
                    <button key={k} onClick={backspace} style={{
                      background: COLORS.bg, border: `1px solid ${COLORS.inputLine}`, borderRadius: 16,
                      padding: '22px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted,
                    }}><Delete size={22} /></button>
                  )
                }
                return (
                  <button key={k} onClick={() => pressDigit(k)} style={{
                    background: '#FFF', border: `1px solid ${COLORS.inputLine}`, borderRadius: 16,
                    padding: '22px 0', fontSize: 28, fontWeight: 700, color: COLORS.navy,
                  }}>{k}</button>
                )
              })}
            </div>

            <button
              onClick={submit}
              disabled={loading || !pin}
              style={{
                width: '100%', background: pin ? COLORS.amber : '#D1D5DB', color: COLORS.navy, border: 'none',
                borderRadius: 14, padding: 22, fontWeight: 800, fontSize: 20,
              }}
            >
              {loading ? 'Checking…' : 'Sign In'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
