import React, { useEffect, useMemo, useState } from 'react';
import { Download, PenLine, Printer, Trash2 } from 'lucide-react';
import { askConfirm } from '../../lib/dialogs';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Modal from '../../components/Modal';
import { answerText } from '../../components/EventFormFields';
import { PrintPortal } from '../invoices/InvoicePreview';

// Answers to an event's sign-up form, one row per family sign-up, with the
// parent's signature. CSV download for lists (T-shirt sizes, food…).
const when = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

// rows / setRows can come from the page, so the summary at the top
// (EventSummary) and this list stay in step when answers are deleted.
export default function EventResponses({ event: e, students, rows: extRows, setRows: extSetRows }) {
  const [ownRows, setOwnRows] = useState(null);
  const rows = extSetRows ? extRows : ownRows;
  const setRows = extSetRows || setOwnRows;
  const [open, setOpen] = useState(null);
  const form = Array.isArray(e.form) ? e.form : [];
  const load = () =>
    supabase
      .from('event_responses')
      .select('*')
      .eq('event_id', e.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []));
  useEffect(() => { if (!extSetRows) load(); }, [e.id]);
  const byId = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const kidsOf = (r) => (r.student_ids || []).map((id) => byId[id] || { id, name: 'Student' });
  // Newest first, grouped by the day the form was sent.
  const byDay = useMemo(() => {
    const groups = [];
    (rows || []).forEach((r) => {
      const day = r.created_at ? new Date(r.created_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
      const g = groups[groups.length - 1];
      if (g && g.day === day) g.rows.push(r);
      else groups.push({ day, rows: [r] });
    });
    return groups;
  }, [rows]);
  async function remove(r) {
    const names = kidsOf(r).map((k) => k.name).join(', ');
    if (!(await askConfirm(`Delete the form answers from ${names || 'this family'}? Their sign-up and invoice stay as they are.`, { title: 'Delete answers', confirmLabel: 'Delete' }))) return;
    setRows((list) => list.filter((x) => x.id !== r.id));
    await supabase.from('event_responses').delete().eq('id', r.id);
  }
  if (!form.length && !e.signature_required && !rows?.length) return null;

  function csv() {
    const head = ['Children', ...form.map((q) => q.label), ...(e.signature_required ? ['Signed by', 'Signed at'] : []), 'Submitted'];
    const lines = rows.map((r) => {
      const kids = kidsOf(r);
      return [kids.map((k) => k.name).join(', '), ...form.map((q) => answerText(q, r.answers, kids, form)), ...(e.signature_required ? [r.signer_name || '', when(r.signed_at)] : []), when(r.created_at)];
    });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob(['﻿' + [head, ...lines].map((l) => l.map(esc).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${e.title.replace(/[^\w\- ]+/g, '').trim() || 'event'} - form answers.csv`;
    a.click();
  }

  return (
    <>
    <div style={{ ...styles.card, marginTop: 12 }} data-testid="responses">
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 4px', gap: 8 }}>
        <div style={{ fontWeight: 600, flex: 1 }}>Form answers{rows ? ` (${rows.length})` : ''}</div>
        {rows?.length > 0 && <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={csv}><Download size={13} /> Download CSV</button>}
      </div>
      {rows == null ? (
        <p style={{ padding: '4px 14px 14px', color: 'var(--dp-ink-faint)', fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ padding: '4px 14px 14px', color: 'var(--dp-ink-faint)', fontSize: 13 }}>No answers yet. Families fill in the form when they sign up in the parent portal.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="dp-table">
            <thead>
              <tr>
                <th>Children</th>
                {form.map((q) => <th key={q.id}>{q.label}</th>)}
                {e.signature_required && <th>Signature</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((g) => (
                <React.Fragment key={g.day}>
                <tr><td colSpan={form.length + (e.signature_required ? 3 : 2)} style={{ background: 'var(--dp-canvas)', fontSize: 12.5, fontWeight: 600, color: 'var(--dp-ink-soft)', padding: '5px 12px' }}>{g.day} · {g.rows.length}</td></tr>
              {g.rows.map((r) => {
                const kids = kidsOf(r);
                return (
                  <tr key={r.id} className="dp-row" data-response={kids.map((k) => k.name).join(', ')}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{kids.map((k) => <div key={k.id}>{k.name}</div>)}<div style={{ fontSize: 12.5, color: 'var(--dp-ink-faint)', fontWeight: 400 }}>{r.created_at ? new Date(r.created_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : ''}</div></td>
                    {form.map((q) => (
                      <td key={q.id} style={{ fontSize: 13, maxWidth: 260 }}>{answerText(q, r.answers, kids, form) || <span style={{ color: 'var(--dp-ink-faint)' }}>—</span>}</td>
                    ))}
                    {e.signature_required && (
                      <td>
                        {r.signature_data ? (
                          <button className="dp-btn" style={{ padding: 2, background: '#fff' }} onClick={() => setOpen(r)} title="View signed form">
                            <img src={r.signature_data} alt={`Signature of ${r.signer_name || 'parent'}`} style={{ height: 34, display: 'block' }} />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--dp-ink-faint)', fontSize: 12.5 }}>Not signed</span>
                        )}
                        {r.signer_name && <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)' }}>{r.signer_name}</div>}
                      </td>
                    )}
                    <td style={{ textAlign: 'right' }}>
                      <button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Delete answers" title="Delete these answers" onClick={() => remove(r)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <SignedForm event={e} form={form} r={open} kids={kidsOf(open)} onClose={() => setOpen(null)} />}
    </div>
    </>
  );
}

// The whole filled-in form with the signature — printable.
function SignedForm({ event: e, form, r, kids, onClose }) {
  const body = <SignedBody e={e} form={form} r={r} kids={kids} />;
  return (
    <>
      <Modal title="Signed form" maxWidth={680} onClose={onClose} footer={<><button className="dp-btn" onClick={onClose}>Close</button><button className="dp-btn dp-btn-primary" onClick={() => window.print()}><Printer size={14} /> Print</button></>}>
        {body}
      </Modal>
      <PrintPortal><div style={{ padding: 32, fontFamily: 'Helvetica, Arial, sans-serif' }}>{body}</div></PrintPortal>
    </>
  );
}

function SignedBody({ e, form, r, kids }) {
  return (
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <h3 style={{ margin: '0 0 2px' }}>{e.title}</h3>
        <div style={{ color: 'var(--dp-ink-soft)', fontSize: 13, marginBottom: 10 }}>Champion Hankook Taekwondo · {kids.map((k) => k.name).join(', ')}</div>
        {form.map((q) => (
          <div key={q.id} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{q.label}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{answerText(q, r.answers, kids, form) || '—'}</div>
          </div>
        ))}
        {e.signature_text && <p style={{ fontSize: 13, color: '#3A3D36', whiteSpace: 'pre-wrap', borderTop: '1px solid #E4E6DF', paddingTop: 10 }}>{e.signature_text}</p>}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <img src={r.signature_data} alt="Signature" style={{ height: 90, border: '1px solid #E4E6DF', borderRadius: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--dp-ink-soft)', display: 'flex', alignItems: 'center', gap: 4 }}><PenLine size={12} /> Signature</div>
          </div>
          <div style={{ fontSize: 13 }}>
            <div><b>{r.signer_name}</b></div>
            <div style={{ color: 'var(--dp-ink-soft)' }}>Signed {when(r.signed_at)}</div>
          </div>
        </div>
      </div>
  );
}
