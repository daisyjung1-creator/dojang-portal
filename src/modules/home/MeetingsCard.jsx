import React, { useState } from 'react';
import { Users, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { addDaysISO } from '../../lib/billingDates';
import { DEFAULT_MEETINGS, nextMeetingDates, meetingMessage, whatsappLink, scheduleText, time12 } from '../../lib/meetings';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import { Card, Tag, AMBER, GREEN, smallBtn } from './homeUi';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

// Staff meetings: the next dates, and the WhatsApp group message one tap away.
export default function MeetingsCard({ settings, today, onSaved }) {
  const meetings = settings?.meetings?.length ? settings.meetings : DEFAULT_MEETINGS;
  const [edit, setEdit] = useState(null);
  const [copied, setCopied] = useState('');

  const upcoming = meetings
    .flatMap((m) => nextMeetingDates(m, today, 2).map((date) => ({ m, date })))
    .sort((a, b) => (a.date === b.date ? String(a.m.time).localeCompare(String(b.m.time)) : a.date < b.date ? -1 : 1))
    .slice(0, 4);

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch (_e) {
      /* clipboard blocked */
    }
  }

  async function save() {
    const list = edit.list.map((m, i) => ({ ...m, key: m.key || `m${Date.now()}${i}`, weekday: Number(m.weekday), weeks: m.weeks.map(Number).sort(), remind: m.remind || [1, 0] })).filter((m) => m.name.trim() && m.weeks.length);
    const { data, error } = await supabase.from('invoice_settings').update({ meetings: list }).eq('id', 1).select().single();
    if (error) return setEdit({ ...edit, error: error.message });
    onSaved && onSaved(data);
    setEdit(null);
  }

  return (
    <>
      <Card title="Staff meetings" icon={Users} action={<button className="dp-btn" style={smallBtn} onClick={() => setEdit({ list: meetings.map((m) => ({ ...m, weeks: [...(m.weeks || [])] })), error: '' })}><Pencil size={11} /> Edit</button>}>
        <div style={{ padding: '4px 0' }}>
          {upcoming.map(({ m, date }, i) => {
            const msg = meetingMessage(m, date, today);
            const soon = date === today ? 'Today' : date === addDaysISO(today, 1) ? 'Tomorrow' : null;
            const key = `${m.key}|${date}`;
            return (
              <div key={key} style={{ padding: '9px 14px', borderBottom: i < upcoming.length - 1 ? '1px solid #F1EFE7' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</span>
                  {soon && <Tag c={soon === 'Today' ? AMBER : GREEN}>{soon}</Tag>}
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5B5F56', whiteSpace: 'nowrap' }}>{shortDay(date)} · {time12(m.time)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <a className="dp-btn" style={{ ...smallBtn, textDecoration: 'none', background: '#E8F5EC', borderColor: '#BFDCC3', color: '#1F6B3A' }} href={whatsappLink(msg)} target="_blank" rel="noreferrer" title={msg}>
                    Post to WhatsApp
                  </a>
                  <button className="dp-btn" style={smallBtn} onClick={() => copy(msg, key)}><Copy size={11} /> {copied === key ? 'Copied' : 'Copy message'}</button>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11.5, color: '#8A8D84', margin: 0, padding: '0 14px 10px' }}>
          A reminder email with the WhatsApp link also goes to the dojang inbox the day before and the morning of each meeting.
        </p>
      </Card>

      {edit && (
        <Modal
          title="Staff meetings"
          maxWidth={600}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setEdit(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" onClick={save}>Save</button>
            </>
          }
        >
          {edit.list.map((m, i) => {
            const upd = (patch) => setEdit({ ...edit, list: edit.list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} style={{ border: '1px solid #E4E6DF', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Field label="Meeting"><input className="dp-input" value={m.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
                  <Field label="Day">
                    <select className="dp-select" value={m.weekday} onChange={(e) => upd({ weekday: Number(e.target.value) })}>
                      {DAYS.map((d, k) => <option key={k} value={k}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Time"><input type="time" className="dp-input" value={m.time} onChange={(e) => upd({ time: e.target.value })} /></Field>
                  <button className="dp-btn dp-btn-danger" style={{ padding: 6, marginBottom: 12 }} aria-label="Remove" onClick={() => setEdit({ ...edit, list: edit.list.filter((_x, j) => j !== i) })}><Trash2 size={13} /></button>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 13, margin: '0 0 8px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#5B5F56' }}>Weeks of the month:</span>
                  {[1, 2, 3, 4, 5].map((w) => (
                    <label key={w} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="checkbox" checked={m.weeks.includes(w)} onChange={(e) => upd({ weeks: e.target.checked ? [...m.weeks, w] : m.weeks.filter((x) => x !== w) })} />
                      {['1st', '2nd', '3rd', '4th', '5th'][w - 1]}
                    </label>
                  ))}
                </div>
                <Field label="WhatsApp message ({day} and {time} are filled in)">
                  <textarea className="dp-input" rows={2} style={{ width: '100%', fontFamily: 'inherit' }} value={m.message || ''} onChange={(e) => upd({ message: e.target.value })} />
                </Field>
                <div style={{ fontSize: 12, color: '#8A8D84' }}>{m.weeks.length ? scheduleText(m) : 'Pick at least one week'}</div>
              </div>
            );
          })}
          <button className="dp-btn" onClick={() => setEdit({ ...edit, list: [...edit.list, { key: '', name: '', weekday: 1, weeks: [1], time: '19:00', remind: [1, 0], message: '📣 Reminder: {day} at {time}.' }] })}>
            <Plus size={13} /> Add a meeting
          </button>
          {edit.error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{edit.error}</p>}
        </Modal>
      )}
    </>
  );
}
