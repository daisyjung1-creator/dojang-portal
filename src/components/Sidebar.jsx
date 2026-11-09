import React, { useState } from 'react';
import BrandMark from './BrandMark';
import { Users, ClipboardCheck, Wallet, FileText, Receipt, PhoneCall, CalendarPlus, UserPlus, LogOut, Contact, BarChart3, Settings, Package, Mail, Award, Banknote, LayoutDashboard, Target, Menu, X } from 'lucide-react';
import { styles } from '../lib/uiStyles';
import { useAuth } from '../auth/AuthContext';

export const ALL_TABS = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, adminOnly: true },
  { id: 'students', label: 'Students', icon: Users, adminOnly: false },
  { id: 'leads', label: 'Leads', icon: PhoneCall, adminOnly: true },
  { id: 'tryouts', label: 'Trials', icon: CalendarPlus, adminOnly: true },
  { id: 'register', label: 'Enrollment', icon: UserPlus, adminOnly: true },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, adminOnly: false },
  { id: 'testing', label: 'Belt Testing', icon: Award, adminOnly: true },
  { id: 'hp', label: 'HP Plans', icon: Target, adminOnly: true },
  { id: 'billing', label: 'Billing', icon: Wallet, adminOnly: true },
  { id: 'email', label: 'Email', icon: Mail, adminOnly: true },
  { id: 'invoices', label: 'Invoices', icon: FileText, adminOnly: true, section: 'Invoicing' },
  { id: 'payments', label: 'Payments', icon: Receipt, adminOnly: true },
  { id: 'customers', label: 'Customers', icon: Contact, adminOnly: true },
  { id: 'reports', label: 'Sales & GST', icon: BarChart3, adminOnly: true },
  { id: 'payroll', label: 'Payroll', icon: Banknote, adminOnly: true },
  { id: 'inventory', label: 'Inventory', icon: Package, adminOnly: true },
  { id: 'invoice-settings', label: 'Invoice Settings', icon: Settings, adminOnly: true },
];

export default function Sidebar({ activeTab, setActiveTab }) {
  const { isAdmin, signOut } = useAuth();
  const tabs = ALL_TABS.filter((t) => isAdmin || !t.adminOnly);
  // On a phone the sidebar becomes a top bar; the menu slides in from the left.
  const [open, setOpen] = useState(false);
  const current = ALL_TABS.find((t) => t.id === activeTab);
  const pick = (id) => {
    setActiveTab(id);
    setOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <>
    <div className="dp-topbar">
      <button className="dp-topbar-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
      <BrandMark />
      <span style={{ ...styles.brandText, fontSize: 15 }}>{current?.label || 'Dojang Portal'}</span>
    </div>
    {open && <div className="dp-drawer-backdrop" onClick={() => setOpen(false)} />}
    <div className={`dp-sidebar${open ? ' open' : ''}`} style={{ ...styles.sidebar, display: 'flex', flexDirection: 'column' }}>
      <div style={styles.brand}>
        <BrandMark />
        <span style={styles.brandText}>Dojang Portal</span>
        <button className="dp-topbar-btn dp-drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
      </div>
      <nav style={{ marginTop: 24, flex: 1 }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <React.Fragment key={tab.id}>
            {tab.section && <div style={{ fontSize: 11, color: '#8A8D84', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '14px 10px 6px' }}>{tab.section}</div>}
            <button
              onClick={() => pick(tab.id)}
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
    </>
  );
}
