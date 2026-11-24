import React, { useEffect, useState } from 'react';
import { Upload, Trash2, CalendarDays } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import ConfirmDialog from '../../components/ConfirmDialog';

// Monthly calendar (image or PDF) shown to families in the parent portal's
// Calendar tab, next to the closures (holidays + cancelled classes).
const MAX_MB = 4;
const monthLabel = (m) => new Date(m.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
function nextMonth() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + (d.getDate() > 15 ? 1 : 0), 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
function openData(dataUrl) {
  fetch(dataUrl).then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b), '_blank'));
}

export default function MonthlyCalendars() {
  const [list, setList] = useState(null);
  const [month, setMonth] = useState(nextMonth);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  async function load() {
    const { data } = await supabase.from('monthly_calendars').select('month, title, file_name, mime, file_data, uploaded_at').order('month', { ascending: false }).limit(8);
    setList(data || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function upload(file) {
    setMsg('');
    setErr('');
    if (!file) return;
    if (!/^image\/|^application\/pdf$/.test(file.type)) return setErr('Choose an image (PNG, JPG) or a PDF.');
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`The file is too big (max ${MAX_MB} MB). Export a smaller image or PDF.`);
    setBusy(true);
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const { error } = await supabase.from('monthly_calendars').upsert({ month: month + '-01', file_name: file.name, mime: file.type, file_data: data, uploaded_at: new Date().toISOString() }, { onConflict: 'month' });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg(`${monthLabel(month + '-01')} calendar is now in the parent portal.`);
    load();
  }

  async function remove(m) {
    setDel(null);
    const { error } = await supabase.from('monthly_calendars').delete().eq('month', m.month);
    if (error) return setErr(error.message);
    load();
  }

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return (
    <div style={{ ...styles.card, padding: 16, marginTop: 20 }} data-testid="admin-calendars">
      <h2 style={{ fontSize: 16, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 7 }}><CalendarDays size={17} /> Monthly calendar for families</h2>
      <p style={{ fontSize: 13, color: 'var(--dp-ink-soft)', margin: '0 0 12px' }}>
        Upload the month's schedule (image or PDF). Families see this month's and later calendars in the parent portal's Calendar tab, together with holiday closures and cancelled classes.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="month" className="dp-input" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
        <label className="dp-btn dp-btn-primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          <Upload size={15} /> {busy ? 'Uploading…' : `Upload ${monthLabel(month + '-01')}`}
          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={busy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
        </label>
        <span style={{ fontSize: 12, color: 'var(--dp-ink-faint)' }}>Uploading again for the same month replaces it.</span>
      </div>
      {msg && <p style={{ color: 'var(--dp-success)', fontSize: 13, margin: '8px 0 0' }}>{msg}</p>}
      {err && <p style={{ color: 'var(--dp-danger)', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
      {list?.length > 0 && (
        <table className="dp-table" style={{ marginTop: 12, width: '100%' }}>
          <tbody>
            {list.map((m) => (
              <tr key={m.month}>
                <td style={{ fontWeight: 500 }}>{monthLabel(m.month)}</td>
                <td style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)' }}>{m.file_name}</td>
                <td style={{ fontSize: 12.5 }}>{m.month >= thisMonth ? <span style={{ color: 'var(--dp-success)' }}>Shown to families</span> : <span style={{ color: 'var(--dp-ink-faint)' }}>Past</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => openData(m.file_data)}>View</button>{' '}
                  <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} aria-label={`Delete ${monthLabel(m.month)}`} onClick={() => setDel(m)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {del && <ConfirmDialog message={`Delete the ${monthLabel(del.month)} calendar? Families won't see it any more.`} onCancel={() => setDel(null)} onConfirm={() => remove(del)} />}
    </div>
  );
}
