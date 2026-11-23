import React from 'react';
import { PhoneCall, CalendarPlus } from 'lucide-react';
import LeadsPage from './LeadsPage';
import TryoutsPage from '../tryouts/TryoutsPage';
import { styles } from '../../lib/uiStyles';
import { useAuth } from '../../auth/AuthContext';

// Leads (inquiries) and Trials in one tab. The address stays #leads or
// #tryouts so old links and buttons keep working. Staff only see Trials.
export default function LeadsTrialsPage({ view, setActiveTab }) {
  const { isAdmin } = useAuth();
  const showTrials = view === 'tryouts' || !isAdmin;
  const tabs = isAdmin ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <h1 style={{ ...styles.title, margin: 0 }}>Leads & Trials</h1>
      <div role="tablist" style={{ display: 'inline-flex', border: '1px solid #DAD7CC', borderRadius: 8, overflow: 'hidden' }}>
        {[
          ['leads', 'Inquiries', PhoneCall],
          ['tryouts', 'Trials', CalendarPlus],
        ].map(([id, label, Icon]) => {
          const on = (id === 'tryouts') === showTrials;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={on}
              onClick={() => setActiveTab(id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: 'none', background: on ? '#20241F' : '#fff', color: on ? '#fff' : '#20241F', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;
  return showTrials ? <TryoutsPage setActiveTab={setActiveTab} tabs={tabs} /> : <LeadsPage setActiveTab={setActiveTab} tabs={tabs} />;
}
