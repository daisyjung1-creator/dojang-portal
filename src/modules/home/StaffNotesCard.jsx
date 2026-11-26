import React, { useEffect, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { refreshBadges } from '../../lib/badges';
import { Card, smallBtn } from './homeUi';

const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

// New notes staff left in Time Clock (late, forgot to clock in, etc.).
// Shows only while there are unread ones; reply or see older notes in Staff Clock → Notes.
export default function StaffNotesCard({ setActiveTab }) {
  const [notes, setNotes] = useState([]);
  const [names, setNames] = useState({});

  async function load() {
    const [{ data: n }, { data: e }] = await Promise.all([
      supabase.from('staff_clock_notes').select('id, employee_id, date, text, created_at').eq('author', 'employee').eq('read', false).order('created_at', { ascending: false }),
      supabase.from('staff_clock_employees').select('id, name'),
    ]);
    setNotes(n || []);
    setNames(Object.fromEntries((e || []).map((x) => [x.id, x.name])));
  }
  useEffect(() => { load(); }, []);

  async function markRead(ids) {
    setNotes((list) => list.filter((n) => !ids.includes(n.id)));
    await supabase.from('staff_clock_notes').update({ read: true }).in('id', ids);
    refreshBadges();
  }

  if (!notes.length) return null;
  return (
    <Card
      title={`Staff notes (${notes.length})`}
      icon={StickyNote}
      action={<button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('clock')}>Staff Clock</button>}
    >
      <div>
        {notes.map((n, i) => (
          <div key={n.id} style={{ padding: '10px 14px', borderBottom: i < notes.length - 1 ? '1px solid var(--dp-canvas)' : 'none' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{(names[n.employee_id] || 'Staff').split(' ')[0]}</span>
              <span style={{ fontSize: 12, color: 'var(--dp-ink-faint)', flex: 1 }}>{shortDay(n.date)}</span>
              <button className="dp-btn" style={{ ...smallBtn, fontSize: 12 }} onClick={() => markRead([n.id])}>Read</button>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--dp-ink)', marginTop: 3, whiteSpace: 'pre-wrap' }}>{n.text}</div>
          </div>
        ))}
        {notes.length > 1 && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--dp-canvas)' }}>
            <button className="dp-btn" style={smallBtn} onClick={() => markRead(notes.map((n) => n.id))}>Mark all read</button>
          </div>
        )}
      </div>
    </Card>
  );
}
