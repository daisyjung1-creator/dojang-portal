import React, { useState } from 'react';
import BrandMark from './BrandMark';
import { Users, ClipboardCheck, Wallet, FileText, Receipt, PhoneCall, CalendarPlus, UserPlus, LogOut, Contact, BarChart3, Settings, Package, Mail, Award, Banknote, LayoutDashboard, Target, Menu, X, KeyRound, Sun, Ticket } from 'lucide-react';
import { styles } from '../lib/uiStyles';
import { useAuth } from '../auth/AuthContext';
import { useBadges } from '../lib/badges';

// Admin menu in five groups (DESIGN.md → Navigation). Staff logins see only
// their four tabs, with no group headings.
export const ALL_TABS = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, adminOnly: true },
  { id: 'today', label: 'Today', icon: Sun, staffOnly: true, staff: true },
  { id: 'students', label: 'Students', icon: Users, adminOnly: true, group: 'People' },
  // Leads and Trials are one tab (switch between them at the top of the page).
  // Staff logins only get the Trials side.
  { id: 'leads', label: 'Leads & Trials', staffLabel: 'Trials', staffId: 'tryouts', also: ['tryouts'], icon: PhoneCall, adminOnly: true, staff: true, group: 'People' },
  { id: 'register', label: 'Enrollment', icon: UserPlus, adminOnly: true, group: 'People' },
  { id: 'email', label: 'Email', icon: Mail, adminOnly: true, group: 'People' },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, adminOnly: true, staff: true, group: 'Classes' },
  // Instructors tick curriculum tapes on the front-desk iPad (admins do it in Belt Testing).
  { id: 'tapes', label: 'Tapes', icon: Award, staffOnly: true, staff: true },
  { id: 'testing', label: 'Belt Testing', icon: Award, adminOnly: true, group: 'Classes' },
  { id: 'events', label: 'Events', icon: Ticket, adminOnly: true, group: 'Classes' },
  { id: 'hp', label: 'HP Plans', icon: Target, adminOnly: true, group: 'Classes' },
  { id: 'billing', label: 'Billing', icon: Wallet, adminOnly: true, group: 'Money' },
  { id: 'invoices', label: 'Invoices', icon: FileText, adminOnly: true, group: 'Money' },
  { id: 'payments', label: 'Payments', icon: Receipt, adminOnly: true, group: 'Money' },
  { id: 'customers', label: 'Customers', icon: Contact, adminOnly: true, group: 'Money' },
  { id: 'reports', label: 'Sales & GST', icon: BarChart3, adminOnly: true, group: 'Money' },
  { id: 'payroll', label: 'Payroll', icon: Banknote, adminOnly: true, group: 'Admin' },
  { id: 'inventory', label: 'Inventory', icon: Package, adminOnly: true, group: 'Admin' },
  { id: 'invoice-settings', label: 'Invoice Settings', icon: Settings, adminOnly: true, group: 'Admin' },
  { id: 'staff-logins', label: 'Staff Logins', icon: KeyRound, adminOnly: true, group: 'Admin' },
];

export default function Sidebar({ activeTab, setActiveTab }) {
  const { isAdmin, signOut } = useAuth();
  // Staff logins (e.g. the front-desk iPad) only get Attendance and Trials.
  const tabs = ALL_TABS.filter((t) => (isAdmin ? !t.staffOnly : t.staff));
  // On a phone the sidebar becomes a top bar; the menu slides in from the left.
  const [open, setOpen] = useState(false);
  const current = ALL_TABS.find((t) => t.id === activeTab || t.also?.includes(activeTab));
  const badges = useBadges(isAdmin, activeTab);
  const pick = (id) => {
    // Clicking the tab you're on goes back to its main page (e.g. from a student's page to the list).
    if (id === activeTab && window.location.hash !== `#${id}`) window.location.hash = id;
    setActiveTab(id);
    setOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <>
    <div className="dp-topbar">
      <button className="dp-topbar-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
      <BrandMark />
      <span style={{ ...styles.brandText, fontSize: 15 }}>{(!isAdmin && current?.staffLabel) || current?.label || 'Dojang Portal'}</span>
    </div>
    {open && <div className="dp-drawer-backdrop" onClick={() => setOpen(false)} />}
    <div className={`dp-sidebar${open ? ' open' : ''}`} style={{ ...styles.sidebar, display: 'flex', flexDirection: 'column' }}>
      <div style={styles.brand}>
        <BrandMark />
        <span style={styles.brandText}>Dojang Portal</span>
        <button className="dp-topbar-btn dp-drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
      </div>
      <nav aria-label="Main" style={{ marginTop: 20, flex: 1, overflowY: 'auto' }}>
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const id = !isAdmin && tab.staffId ? tab.staffId : tab.id;
          const active = activeTab === tab.id || !!tab.also?.includes(activeTab);
          const n = badges[tab.id] || 0;
          return (
            <React.Fragment key={tab.id}>
            {isAdmin && tab.group && tab.group !== tabs[i - 1]?.group && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dp-ink-faint)', padding: '16px 10px 6px' }}>{tab.group}</div>
            )}
            <button
              onClick={() => pick(id)}
              aria-current={active ? 'page' : undefined}
              style={{
                ...styles.navItem,
                background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: active ? '#FFFFFF' : '#C9CBC4',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={17} strokeWidth={active ? 2.25 : 1.75} color={active ? 'var(--dp-hankook-red)' : 'currentColor'} aria-hidden="true" />
              <span style={{ flex: 1 }}>{!isAdmin && tab.staffLabel ? tab.staffLabel : tab.label}</span>
              {n > 0 && (
                <span className="dp-badge" data-badge={tab.id} aria-label={`${n} to do`} style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--dp-hankook-red)', color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>{n > 99 ? '99+' : n}</span>
              )}
            </button>
            </React.Fragment>
          );
        })}
      </nav>
      <button
        onClick={signOut}
        style={{ ...styles.navItem, color: '#C9CBC4', border: '1px solid var(--dp-ink-soft)', marginTop: 8 }}
      >
        <LogOut size={16} strokeWidth={1.75} />
        <span>Log out</span>
      </button>
    </div>
    </>
  );
}
