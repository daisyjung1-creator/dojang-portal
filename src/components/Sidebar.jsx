import React from 'react';
import { Users, ClipboardCheck, Wallet, FileText, Receipt, PhoneCall, CalendarPlus, UserPlus, LogOut, Contact, BarChart3, Settings } from 'lucide-react';
import { styles } from '../lib/uiStyles';
import { useAuth } from '../auth/AuthContext';

export const ALL_TABS = [
  { id: 'students', label: 'Students', icon: Users, adminOnly: false },
  { id: 'leads', label: 'Leads', icon: PhoneCall, adminOnly: true },
  { id: 'tryouts', label: 'Trials', icon: CalendarPlus, adminOnly: true },
  { id: 'register', label: 'Enrollment', icon: UserPlus, adminOnly: true },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, adminOnly: false },
  { id: 'billing', label: 'Billing', icon: Wallet, adminOnly: true },
  { id: 'invoices', label: 'Invoices', icon: FileText, adminOnly: true, section: 'Invoicing' },
  { id: 'payments', label: 'Payments', icon: Receipt, adminOnly: true },
  { id: 'customers', label: 'Customers', icon: Contact, adminOnly: true },
  { id: 'reports', label: 'Sales & GST', icon: BarChart3, adminOnly: true },
  { id: 'invoice-settings', label: 'Invoice Settings', icon: Settings, adminOnly: true },
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
            <React.Fragment key={tab.id}>
            {tab.section && <div style={{ fontSize: 11, color: '#8A8D84', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '14px 10px 6px' }}>{tab.section}</div>}
            <button
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
            </React.Fragment>
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
