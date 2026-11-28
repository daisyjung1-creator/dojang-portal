import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { askConfirm } from '../../lib/dialogs';

// Parent portal invites for every family at once: each family not invited yet
// (active, with an email and at least one current student) gets the same
// invite as "Send invite" on the student profile — every email on the family.
// Sent one family at a time so the email service isn't flooded.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function PortalInvites() {
  const [fams, setFams] = useState(null);
  const [run, setRun] = useState(null); // { done, total, sent, skipped: [] }

  async function load() {
    const [{ data: cs }, { data: st }] = await Promise.all([
      supabase.from('customers').select('id, name, email, active, portal_invited_at'),
      supabase.from('students').select('customer_id, status'),
    ]);
    const current = new Set((st || []).filter((s) => s.customer_id && (s.status || 'active') !== 'withdrawn').map((s) => s.customer_id));
    setFams((cs || []).filter((c) => c.active !== false && current.has(c.id) && String(c.email || '').includes('@')));
  }
  useEffect(() => {
    load();
  }, []);

  if (!fams) return null;
  const todo = fams.filter((c) => !c.portal_invited_at);
  const invited = fams.length - todo.length;

  async function go() {
    if (!(await askConfirm(`Each of the ${todo.length} families gets an email with a link to set their password. Families with more than one email address get one invite per address.`, { title: `Invite ${todo.length} families to the parent portal?`, confirmLabel: 'Send invites' }))) return;
    const r = { done: 0, total: todo.length, sent: 0, skipped: [], running: true };
    setRun({ ...r });
    for (const c of todo) {
      const { data, error } = await supabase.functions.invoke('parent-portal', { body: { action: 'invite', customer_id: c.id, origin: window.location.origin } });
      if (error || data?.error) r.skipped.push({ name: c.name, reason: data?.error || error?.message || 'failed' });
      else {
        r.sent += (data?.sent || []).length;
        (data?.skipped || []).forEach((s) => r.skipped.push({ name: c.name, reason: `${s.email}: ${s.reason}` }));
      }
      r.done += 1;
      setRun({ ...r, skipped: [...r.skipped] });
      await wait(700);
    }
    setRun({ ...r, skipped: [...r.skipped], running: false });
    load();
  }

  return (
    <div data-testid="portal-invites" style={{ border: '1px solid var(--dp-line)', borderRadius: 8, background: '#fff', padding: '10px 14px', margin: '0 0 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <UserPlus size={18} style={{ color: 'var(--dp-ink-soft)' }} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Parent portal invites</div>
        <div style={{ fontSize: 13, color: 'var(--dp-ink-soft)' }}>
          {invited} of {fams.length} families invited
          {run && ` · ${run.running ? `sending ${run.done}/${run.total}…` : `done: ${run.sent} email${run.sent === 1 ? '' : 's'} sent`}`}
        </div>
      </div>
      {todo.length > 0 && (
        <button className="dp-btn dp-btn-primary" disabled={!!run?.running} onClick={go}>
          {run?.running ? 'Sending…' : `Invite ${todo.length} ${todo.length === 1 ? 'family' : 'families'}`}
        </button>
      )}
      {run && !run.running && run.skipped.length > 0 && (
        <div style={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--dp-danger)' }}>
          Not sent:
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {run.skipped.map((s, i) => <li key={i}>{s.name} — {s.reason}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
