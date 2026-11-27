import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import StaffClockAdmin from './StaffClockAdmin';
import EmployeeClock from './EmployeeClock';
import ClockSignIn from './ClockSignIn';

// Staff Clock tab. Admin: the full clock dashboard (employees, schedule,
// hours, alerts, swap requests, notes, audit log, settings).
// Staff login (front-desk iPad): each employee signs in with their own PIN.
// The iPad is shared, so the employee is signed out after a few idle minutes
// or when they leave the tab, and nothing is remembered on the device.
const IDLE_MS = 3 * 60 * 1000;

export default function StaffClockPage({ kiosk = false }) {
  const { isAdmin } = useAuth();
  const [employee, setEmployee] = useState(null);

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
