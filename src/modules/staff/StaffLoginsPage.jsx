import React, { useEffect, useState } from 'react';
import { Plus, KeyRound, Trash2, Check, Pencil } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import ConfirmDialog from '../../components/ConfirmDialog';

// Portal logins. Staff logins (front-desk iPad, instructors) only see Today,
// Attendance and Trials — no billing, family contact lists or settings.

const ROLE = {
  admin: ['Admin — everything', '#4B3A86', '#EEEAF6'],
  staff: ['Staff — Today, Attendance, Trials', '#2A5A30', '#E8F1E9'],
  coach: ['Tournament coach', '#1E4566', '#E6F0F6'],
};

async function call(body) {
  const { data, error } = await supabase.functions.invoke('manage-staff', { body });
  if (data?.error) return { error: data.error };
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context?.json())?.error || msg;
    } catch (_e) {
      /* keep */
    }
    return { error: msg };
  }
  return { data };
}

export default function StaffLoginsPage() {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null); // { mode: 'new' | 'password' | 'rename', user?, name, email, password, msg }
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await call({ action: 'list' });
    if (error) return setErr(error);
    setUsers((data.users || []).sort((a, b) => (a.role === b.role ? String(a.name || a.email).localeCompare(b.name || b.email) : a.role === 'admin' ? -1 : 1)));
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    const f = form;
    setBusy(true);
    const body =
      f.mode === 'new'
        ? { action: 'create', email: f.email, password: f.password, name: f.name }
        : f.mode === 'password'
        ? { action: 'password', id: f.user.id, password: f.password }
        : { action: 'rename', id: f.user.id, name: f.name };
    const { error } = await call(body);
    setBusy(false);
    if (error) return setForm({ ...f, msg: error });
    setForm(null);
    load();
  }

  async function remove(u) {
    const { error } = await call({ action: 'delete', id: u.id });
    setDel(null);
    if (error) return setErr(error);
    load();
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Staff Logins</h1>
          <p style={styles.subtitle}>Staff see only Today, Attendance and Trials — good for the front-desk iPad</p>
        </div>
        <button className="dp-btn dp-btn-primary" onClick={() => setForm({ mode: 'new', name: '', email: '', password: '', msg: '' })}><Plus size={14} /> Add staff login</button>
      </div>
      {err && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{err}</p>}
      <div style={styles.card}>
        {!users ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>{err ? '' : 'Loading…'}</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login email</th>
                <th>Access</th>
                <th className="dp-hide-sm">Last signed in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const r = ROLE[u.role] || ROLE.staff;
                return (
                  <tr key={u.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>{u.name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{u.email}</td>
                    <td><span style={{ fontSize: 11.5, color: r[1], background: r[2], borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{r[0]}</span></td>
                    <td className="dp-hide-sm" style={{ fontSize: 12.5, color: '#5B5F56' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="dp-btn" style={{ padding: 6 }} aria-label="Rename" title="Change name" onClick={() => setForm({ mode: 'rename', user: u, name: u.name || '', msg: '' })}><Pencil size={13} /></button>
                        {u.role === 'staff' && (
                          <>
                            <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setForm({ mode: 'password', user: u, password: '', msg: '' })}><KeyRound size={12} /> Password</button>
                            <button className="dp-btn dp-btn-danger" style={{ padding: 6 }} aria-label="Delete" onClick={() => setDel(u)}><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Modal
          title={form.mode === 'new' ? 'Add a staff login' : form.mode === 'password' ? `New password — ${form.user.name || form.user.email}` : 'Change name'}
          maxWidth={440}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setForm(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" disabled={busy} onClick={save}><Check size={14} /> {busy ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          {form.mode !== 'password' && (
            <Field label="Name (who is this login for)">
              <input className="dp-input" style={{ width: '100%' }} placeholder="e.g. Front desk iPad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, msg: '' })} />
            </Field>
          )}
          {form.mode === 'new' && (
            <Field label="Login email">
              <input className="dp-input" style={{ width: '100%' }} type="email" autoComplete="off" placeholder="e.g. frontdesk@hankooktkd.ca" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value, msg: '' })} />
            </Field>
          )}
          {form.mode !== 'rename' && (
            <Field label="Password (at least 8 characters)">
              <input className="dp-input" style={{ width: '100%' }} type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value, msg: '' })} />
            </Field>
          )}
          {form.mode === 'new' && <p style={{ fontSize: 12.5, color: '#8A8D84', margin: 0 }}>The email is just the login name — no email is sent. Sign in on the iPad with this email and password.</p>}
          {form.msg && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '8px 0 0' }}>{form.msg}</p>}
        </Modal>
      )}

      {del && <ConfirmDialog message={`Delete the login for ${del.name || del.email}? They won't be able to sign in any more.`} onCancel={() => setDel(null)} onConfirm={() => remove(del)} />}
    </>
  );
}
