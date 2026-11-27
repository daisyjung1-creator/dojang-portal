import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import StaffClockAdmin from './StaffClockAdmin';
import EmployeeClock from './EmployeeClock';
import ClockSignIn from './ClockSignIn';
import { supabase } from './clockDb.js';
import { COLORS } from './clockTheme.js';

// Staff Clock tab. Admin: the full clock dashboard (employees, schedule,
// hours, alerts, swap requests, notes, audit log, settings).
// Staff login (front-desk iPad): each employee signs in with their own PIN.
// The iPad is shared, so the employee is signed out after a few idle minutes
// or when they leave the tab, and nothing is remembered on the device.
const IDLE_MS = 3 * 60 * 1000;

export default function StaffClockPage({ kiosk = false }) {
  const { isAdmin } = useAuth();
  const [employee, setEmployee] = useState(null);
  // "Lock to this device" (Staff Clock → Settings): on any other device the
  // employee side shows only a notice — no names, schedule or clock buttons.
  const [deviceOk, setDeviceOk] = useState(null);
  useEffect(() => {
    if (isAdmin && !kiosk) return;
    supabase.from('admin_settings').select('device_lock_token').eq('id', 1).single().then(({ data }) => {
      let mine = null;
      try { mine = localStorage.getItem('attendance_device_token'); } catch { /* private mode */ }
      setDeviceOk(!data?.device_lock_token || data.device_lock_token === mine);
    });
  }, [isAdmin, kiosk]);

  useEffect(() => {
    if (!employee) return undefined;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setEmployee(null), IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true, capture: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset, { capture: true }));
    };
  }, [employee]);

  if (isAdmin && !kiosk) return <StaffClockAdmin />;
  if (deviceOk === null) return <div style={{ padding: 40, color: '#9CA3AF', textAlign: 'center' }}>Loading…</div>;
  if (!deviceOk) {
    return (
      <div style={{ minHeight: kiosk ? '100vh' : '60vh', background: COLORS.bg, borderRadius: kiosk ? 0 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.navy, marginBottom: 8 }}>This device can't be used</div>
          <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>The Time Clock only works on the front-desk iPad.</div>
        </div>
      </div>
    );
  }
  const body = !employee
    ? <ClockSignIn onSuccess={setEmployee} />
    : <EmployeeClock employee={employee} onLogout={() => setEmployee(null)} />;
  if (!kiosk) return body;
  // Own page (/clock): full screen, no portal sidebar.
  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EE', padding: 16 }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>{body}</div>
    </div>
  );
}
