import React from 'react';
import { Users, ClipboardCheck, Wallet, FileText, Receipt, PhoneCall, CalendarPlus, UserPlus, LogOut } from 'lucide-react';
import { styles } from '../lib/uiStyles';
import { useAuth } from '../auth/AuthContext';

export const ALL_TABS = [
  { id: 'students', label: 'Students', icon: Users, adminOnly: false },
  { id: 'leads', label: 'Leads', icon: PhoneCall, adminOnly: true },
  { id: 'tryouts', label: 'Trials', icon: CalendarPlus, adminOnly: true },
  { id: 'register', label: 'Enrollment', icon: UserPlus, adminOnly: true },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, adminOnly: false },
  { id: 'billing', label: 'Billing', icon: Wallet, adminOnly: true },
  { id: 'invoice', label: 'Invoices', icon: FileText, adminOnly: true },
  { id: 'receipt', label: 'Receipts', icon: Receipt, adminOnly: true },
];

export default function Sidebar({ activeTab, setActiveTab }) {
  const { isAdmin, signOut } = useAuth();
  const tabs = ALL_TABS.filter((t) => isAdmin || !t.adminOnly);

  return (
    <div style={{ ...styles.sidebar, display: 'flex', flexDirection: 'column' }}>
      <div style={styles.brand}>
        <div style={styles.brandMark} />
        <span style={styles.brandText}>Dojang Portal</span>
      </div>
      <nav style={{ marginTop: 24, flex: 1 }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.navItem,
                background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: active ? '#FFFFFF' : '#B9BCB4',
              }}
            >
              <Icon size={17} strokeWidth={1.75} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        onClick={signOut}
        style={{ ...styles.navItem, color: '#B9BCB4', border: '1px solid #43463F' }}
      >
        <LogOut size={16} strokeWidth={1.75} />
        <span>Log Out</span>
      </button>
    </div>
  );
}
