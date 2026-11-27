import React, { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import LoginPage from './auth/LoginPage';
import Sidebar from './components/Sidebar';
import { styles } from './lib/uiStyles';

import StudentsPage from './modules/students/StudentsPage';
import LeadsTrialsPage from './modules/leads/LeadsTrialsPage';
import RegisterPage from './modules/register/RegisterPage';
import AttendancePage from './modules/attendance/AttendancePage';
import BillingPage from './modules/billing/BillingPage';
import InvoicesPage from './modules/invoices/InvoicesPage';
import PaymentsPage from './modules/invoices/PaymentsPage';
import CustomersPage from './modules/invoices/CustomersPage';
import ReportsPage from './modules/invoices/ReportsPage';
import InvoiceSettingsPage from './modules/invoices/InvoiceSettingsPage';
import InventoryPage from './modules/invoices/InventoryPage';
import EmailPage from './modules/email/EmailPage';
import TestingPage from './modules/testing/TestingPage';
import ProgressOverview from './modules/testing/ProgressOverview';
import HpPlansPage from './modules/hp/HpPlansPage';
import PayrollPage from './modules/payroll/PayrollPage';
import ConfirmSendHost from './components/ConfirmSend';
import HomePage from './modules/home/HomePage';
import StaffHomePage from './modules/home/StaffHomePage';
import StaffLoginsPage from './modules/staff/StaffLoginsPage';
import JoinPage from './modules/join/JoinPage';
import TrialPage from './modules/join/TrialPage';
import PayPage from './modules/join/PayPage';
import CardPage from './modules/join/CardPage';
import ParentApp from './modules/parent/ParentApp';
import EventsPage from './modules/events/EventsPage';
import StaffClockPage from './modules/staffclock/StaffClockPage';

const TABS = ['home', 'today', 'tapes', 'students', 'events', 'leads', 'tryouts', 'register', 'attendance', 'testing', 'billing', 'email', 'invoices', 'payments', 'customers', 'reports', 'payroll', 'inventory', 'invoice-settings', 'staff-logins', 'clock'];
const tabFromHash = () => {
  // #students/<id> = a student's page inside the Students tab.
  const t = decodeURIComponent(window.location.hash.slice(1)).split('/')[0];
  return TABS.includes(t) ? t : null;
};

export default function App() {
  const { session, loading, isAdmin, role } = useAuth();
  // null = start page (Home for admins). The page is kept in the address
  // (#students) so a refresh stays on it.
  const [activeTab, setActiveTab] = useState(tabFromHash);
  useEffect(() => {
    const onHash = () => setActiveTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const p = window.location.pathname;
    if (p === '/join' || p === '/trial' || p.startsWith('/clock') || p.startsWith('/pay/') || p.startsWith('/card/') || p.startsWith('/parent')) return;
    const want = activeTab ? `#${activeTab}` : '';
    if (activeTab && window.location.hash.startsWith(`${want}/`)) return; // keep a sub-page (e.g. a student)
    if (window.location.hash !== want) window.history.replaceState(null, '', `${p}${window.location.search}${want}`);
  }, [activeTab]);

  // Public registration form — no login needed.
  const publicPath = window.location.pathname.replace(/\/+$/, '');
  if (publicPath === '/join') return <JoinPage />;
  if (publicPath === '/trial') return <TrialPage />;
  if (publicPath.startsWith('/pay/')) return <PayPage token={publicPath.slice(5)} />;
  if (publicPath.startsWith('/card/')) return <CardPage token={publicPath.slice(6)} />;
  // Parent portal: /parent, and any parent login that lands on the main address.
  if (publicPath === '/parent' || role === 'parent') return <ParentApp />;

  if (loading) {
    return <div style={{ padding: 40, color: '#5B5F56' }}>Loading...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }
  if (!role) return <div style={{ padding: 40, color: '#5B5F56' }}>Loading...</div>;

  // /clock: the Time Clock on its own page (like the old clock-in app) for the
  // front-desk iPad — staff or admin login, employees sign in with their PIN.
  if (publicPath === '/clock' && (isAdmin || role === 'staff')) return <StaffClockPage kiosk />;

  // A staff account landing on an admin-only tab (e.g. via a stale link) gets
  // bounced to a page it actually has access to.
  const adminOnlyTabs = ['home', 'students', 'events', 'email', 'leads', 'register', 'testing', 'hp', 'billing', 'invoices', 'payments', 'customers', 'reports', 'payroll', 'inventory', 'invoice-settings', 'staff-logins'];
  const startTab = activeTab || (isAdmin ? 'home' : 'today');
  const effectiveTab = !isAdmin && adminOnlyTabs.includes(startTab) ? 'today' : isAdmin && startTab === 'today' ? 'home' : isAdmin && startTab === 'tapes' ? 'testing' : startTab;

  return (
    <div className="dp-shell" style={styles.shell}>
      <Sidebar activeTab={effectiveTab} setActiveTab={setActiveTab} />
      <ConfirmSendHost />
      <div className="dp-main" style={styles.main}>
        {isAdmin && effectiveTab === 'home' && <HomePage setActiveTab={setActiveTab} />}
        {!isAdmin && effectiveTab === 'today' && <StaffHomePage setActiveTab={setActiveTab} />}
        {isAdmin && effectiveTab === 'staff-logins' && <StaffLoginsPage />}
        {isAdmin && effectiveTab === 'students' && <StudentsPage />}
        {effectiveTab === 'attendance' && <AttendancePage />}
        {(effectiveTab === 'leads' || effectiveTab === 'tryouts') && <LeadsTrialsPage view={effectiveTab} setActiveTab={setActiveTab} />}
        {isAdmin && effectiveTab === 'register' && <RegisterPage />}
        {isAdmin && effectiveTab === 'testing' && <TestingPage />}
        {isAdmin && effectiveTab === 'events' && <EventsPage setActiveTab={setActiveTab} />}
        {!isAdmin && effectiveTab === 'tapes' && <ProgressOverview isAdmin={false} />}
        {isAdmin && effectiveTab === 'hp' && <HpPlansPage />}
        {(isAdmin || role === 'staff') && effectiveTab === 'clock' && <StaffClockPage />}
        {isAdmin && effectiveTab === 'payroll' && <PayrollPage />}
        {isAdmin && effectiveTab === 'billing' && <BillingPage />}
        {isAdmin && effectiveTab === 'email' && <EmailPage />}
        {isAdmin && effectiveTab === 'invoices' && <InvoicesPage />}
        {isAdmin && effectiveTab === 'payments' && <PaymentsPage />}
        {isAdmin && effectiveTab === 'customers' && <CustomersPage />}
        {isAdmin && effectiveTab === 'reports' && <ReportsPage />}
        {isAdmin && effectiveTab === 'inventory' && <InventoryPage />}
        {isAdmin && effectiveTab === 'invoice-settings' && <InvoiceSettingsPage />}
      </div>
    </div>
  );
}
