import React, { useEffect, useMemo, useState } from 'react';
import { Award } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { fetchAll } from '../invoices/api';
import { MIN_CLASSES, countStart, classesSince } from '../../lib/beltTesting';
import { inClass, DOJANG_CLASSES } from '../../lib/classes';
import { loadTapes, hasTapes, TAPES, TAPE_COUNT } from '../../lib/tapes';
import { Card, Empty, smallBtn } from './homeUi';

// Home: curriculum tape progress at a glance — how far each class is, and
// who is ready to test (all 7 tapes + enough classes).
export default function TapeSummaryCard({ students, setActiveTab }) {
  const [tapes, setTapes] = useState(null);
  const [att, setAtt] = useState([]);
  useEffect(() => {
    const from = students.map(countStart).sort()[0] || '2000-01-01';
    Promise.all([loadTapes(students), fetchAll(() => supabase.from('attendance').select('student_id, date, status').gte('date', from))]).then(([t, { data }]) => {
      setTapes(t);
      setAtt(data || []);
    });
  }, [students]);

  const view = useMemo(() => {
    if (!tapes) return null;
    const attBy = {};
    att.forEach((r) => (attBy[r.student_id] ||= []).push(r));
    const colour = students.filter((s) => hasTapes(s.belt));
    const n = (s) => (tapes[s.id] || new Set()).size;
    const ready = students.filter((s) => (!hasTapes(s.belt) || n(s) >= TAPE_COUNT) && classesSince(s, attBy[s.id] || []) >= MIN_CLASSES);
    const dist = Array.from({ length: TAPE_COUNT + 1 }, (_, k) => colour.filter((s) => n(s) === k).length);
    const byClass = DOJANG_CLASSES.map((c) => {
      const list = colour.filter((s) => inClass(s, c));
      return list.length ? { c, count: list.length, avg: list.reduce((t, s) => t + n(s), 0) / list.length, full: list.filter((s) => n(s) >= TAPE_COUNT).length } : null;
    }).filter(Boolean);
    return { colour, ready, dist, byClass };
  }, [tapes, att, students]);

  return (
    <Card title="Curriculum tapes" icon={Award} action={<button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('testing')}>Belt Testing</button>}>
      {!view ? (
        <Empty>Loading…</Empty>
      ) : view.colour.length === 0 ? (
        <Empty>No colour-belt students.</Empty>
      ) : (
        <div style={{ padding: '10px 14px 12px' }} data-testid="tape-summary">
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 46, marginBottom: 4 }} title="Students by number of tapes (0 – 7)">
            {view.dist.map((v, k) => {
              const max = Math.max(...view.dist, 1);
              return (
                <div key={k} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 10.5, color: '#5B5F56' }}>{v || ''}</div>
                  <div style={{ height: Math.max(2, (v / max) * 30), background: k === TAPE_COUNT ? '#2E7D32' : k === 0 ? '#D8D5CA' : TAPES[k - 1].color, border: k >= 1 && TAPES[k - 1].id === 'white' ? '1px solid #BDB9AC' : 'none', borderRadius: 2 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', fontSize: 10.5, color: '#8A8D84', marginBottom: 10 }}>
            {view.dist.map((_, k) => <span key={k} style={{ flex: 1, textAlign: 'center' }}>{k}</span>)}
          </div>
          <table className="dp-table" style={{ marginBottom: 8 }}>
            <tbody>
              {view.byClass.map((r) => (
                <tr key={r.c}>
                  <td style={{ fontSize: 13 }}>{r.c}</td>
                  <td style={{ width: 120 }}>
                    <div style={{ height: 7, background: '#F1EFE7', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(r.avg / TAPE_COUNT) * 100}%`, height: '100%', background: '#2E7D32' }} />
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, color: '#5B5F56', textAlign: 'right', whiteSpace: 'nowrap' }}>avg {r.avg.toFixed(1)} · {r.full}/{r.count} done</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 13 }}>
            <b style={{ fontWeight: 600, color: '#2A5A30' }}>{view.ready.length} ready to test</b>
            <span style={{ color: '#5B5F56' }}> (all tapes + {MIN_CLASSES} classes){view.ready.length ? ': ' + view.ready.slice(0, 8).map((s) => s.name).join(', ') + (view.ready.length > 8 ? '…' : '') : ''}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
