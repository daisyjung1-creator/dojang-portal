import React, { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import LoginPage from './auth/LoginPage';
import Sidebar from './components/Sidebar';
import { styles } from './lib/uiStyles';

import StudentsPage from './modules/students/StudentsPage';
import LeadsPage from './modules/leads/LeadsPage';
import TryoutsPage from './modules/tryouts/TryoutsPage';
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
import PayrollPage from './modules/payroll/PayrollPage';
import ConfirmSendHost from './components/ConfirmSend';
import HomePage from './modules/home/HomePage';
import JoinPage from './modules/join/JoinPage';
import TrialPage from './modules/join/TrialPage';

export default function App() {
  const { session, loading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState(null); // null = start page (Home for admins)

  // Public registration form — no login needed.
  const publicPath = window.location.pathname.replace(/\/+$/, '');
  if (publicPath === '/join') return <JoinPage />;
  if (publicPath === '/trial') return <TrialPage />;

  if (loading) {
    return <div style={{ padding: 40, color: '#5B5F56' }}>Loading...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  // A staff account landing on an admin-only tab (e.g. via a stale link) gets
  // bounced to a page it actually has access to.
  const adminOnlyTabs = ['home', 'students', 'email', 'leads', 'register', 'testing', 'billing', 'invoices', 'payments', 'customers', 'reports', 'payroll', 'inventory', 'invoice-settings'];
  const startTab = activeTab || (isAdmin ? 'home' : 'attendance');
  const effectiveTab = !isAdmin && adminOnlyTabs.includes(startTab) ? 'attendance' : startTab;

  return (
    <div className="dp-shell" style={styles.shell}>
      <Sidebar activeTab={effectiveTab} setActiveTab={setActiveTab} />
      <ConfirmSendHost />
      <div className="dp-main" style={styles.main}>
        {isAdmin && effectiveTab === 'home' && <HomePage setActiveTab={setActiveTab} />}
        {isAdmin && effectiveTab === 'students' && <StudentsPage />}
        {effectiveTab === 'attendance' && <AttendancePage />}
        {isAdmin && effectiveTab === 'leads' && <LeadsPage setActiveTab={setActiveTab} />}
        {effectiveTab === 'tryouts' && <TryoutsPage setActiveTab={setActiveTab} />}
        {isAdmin && effectiveTab === 'register' && <RegisterPage />}
        {isAdmin && effectiveTab === 'testing' && <TestingPage />}
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
