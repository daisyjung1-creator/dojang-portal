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

export default function App() {
  const { session, loading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('students');

  if (loading) {
    return <div style={{ padding: 40, color: '#5B5F56' }}>불러오는 중...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  // A staff account landing on an admin-only tab (e.g. via a stale link) gets
  // bounced to a page it actually has access to.
  const adminOnlyTabs = ['leads', 'tryouts', 'register', 'billing', 'invoice', 'receipt'];
  const effectiveTab = !isAdmin && adminOnlyTabs.includes(activeTab) ? 'students' : activeTab;

  return (
    <div style={styles.shell}>
      <Sidebar activeTab={effectiveTab} setActiveTab={setActiveTab} />
      <div style={styles.main}>
        {effectiveTab === 'students' && <StudentsPage />}
        {effectiveTab === 'attendance' && <AttendancePage />}
        {isAdmin && effectiveTab === 'leads' && <LeadsPage setActiveTab={setActiveTab} />}
        {isAdmin && effectiveTab === 'tryouts' && <TryoutsPage setActiveTab={setActiveTab} />}
        {isAdmin && effectiveTab === 'register' && <RegisterPage />}
        {isAdmin && effectiveTab === 'billing' && <BillingPage />}
        {isAdmin && (effectiveTab === 'invoice' || effectiveTab === 'receipt') && (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <p style={{ color: '#5B5F56', fontSize: 14 }}>이 모듈은 다음 단계에서 만들어질 예정입니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
