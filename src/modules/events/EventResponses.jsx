import React, { useEffect, useMemo, useState } from 'react';
import { Download, PenLine, Printer } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Modal from '../../components/Modal';
import { answerText } from '../../components/EventFormFields';
import { PrintPortal } from '../invoices/InvoicePreview';

// Answers to an event's sign-up form, one row per family sign-up, with the
// parent's signature. CSV download for lists (T-shirt sizes, food…).
const when = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export default function EventResponses({ event: e, students }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const form = Array.isArray(e.form) ? e.form : [];
  useEffect(() => {
    supabase
      .from('event_responses')
      .select('*')
      .eq('event_id', e.id)
      .order('created_at')
      .then(({ data }) => setRows(data || []));
  }, [e.id]);
  const byId = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  if (!form.length && !e.signature_required && !rows?.length) return null;
  const kidsOf = (r) => (r.student_ids || []).map((id) => byId[id] || { id, name: 'Student' });

  function csv() {
    const head = ['Children', ...form.map((q) => q.label), ...(e.signature_required ? ['Signed by', 'Signed at'] : []), 'Submitted'];
    const lines = rows.map((r) => {
      const kids = kidsOf(r);
      return [kids.map((k) => k.name).join(', '), ...form.map((q) => answerText(q, r.answers, kids)), ...(e.signature_required ? [r.signer_name || '', when(r.signed_at)] : []), when(r.created_at)];
    });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob(['﻿' + [head, ...lines].map((l) => l.map(esc).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${e.title.replace(/[^\w\- ]+/g, '').trim() || 'event'} - form answers.csv`;
    a.click();
  }

  return (
    <div style={{ ...styles.card, marginTop: 12 }} data-testid="responses">
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 4px', gap: 8 }}>
        <div style={{ fontWeight: 600, flex: 1 }}>Form answers{rows ? ` (${rows.length})` : ''}</div>
        {rows?.length > 0 && <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={csv}><Download size={13} /> Download CSV</button>}
      </div>
      {rows == null ? (
        <p style={{ padding: '4px 14px 14px', color: '#8A8D84', fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ padding: '4px 14px 14px', color: '#8A8D84', fontSize: 13 }}>No answers yet. Families fill in the form when they sign up in the parent portal.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="dp-table">
            <thead>
              <tr>
                <th>Children</th>
                {form.map((q) => <th key={q.id}>{q.label}</th>)}
                {e.signature_required && <th>Signature</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const kids = kidsOf(r);
                return (
                  <tr key={r.id} className="dp-row" data-response={kids.map((k) => k.name).join(', ')}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{kids.map((k) => <div key={k.id}>{k.name}</div>)}<div style={{ fontSize: 12.5, color: '#8A8D84', fontWeight: 400 }}>{when(r.created_at)}</div></td>
                    {form.map((q) => (
                      <td key={q.id} style={{ fontSize: 13, maxWidth: 260 }}>{answerText(q, r.answers, kids) || <span style={{ color: '#8A8D84' }}>—</span>}</td>
                    ))}
                    {e.signature_required && (
                      <td>
                        {r.signature_data ? (
                          <button className="dp-btn" style={{ padding: 2, background: '#fff' }} onClick={() => setOpen(r)} title="View signed form">
                            <img src={r.signature_data} alt={`Signature of ${r.signer_name || 'parent'}`} style={{ height: 34, display: 'block' }} />
                          </button>
                        ) : (
                          <span style={{ color: '#8A8D84', fontSize: 12.5 }}>Not signed</span>
                        )}
                        {r.signer_name && <div style={{ fontSize: 12.5, color: '#5B5F56' }}>{r.signer_name}</div>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <SignedForm event={e} form={form} r={open} kids={kidsOf(open)} onClose={() => setOpen(null)} />}
    </div>
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
        <div style={{ color: '#5B5F56', fontSize: 13, marginBottom: 10 }}>Champion Hankook Taekwondo · {kids.map((k) => k.name).join(', ')}</div>
        {form.map((q) => (
          <div key={q.id} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{q.label}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{answerText(q, r.answers, kids) || '—'}</div>
          </div>
        ))}
        {e.signature_text && <p style={{ fontSize: 13, color: '#3A3D36', whiteSpace: 'pre-wrap', borderTop: '1px solid #E4E6DF', paddingTop: 10 }}>{e.signature_text}</p>}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <img src={r.signature_data} alt="Signature" style={{ height: 90, border: '1px solid #E4E6DF', borderRadius: 6 }} />
            <div style={{ fontSize: 12, color: '#5B5F56', display: 'flex', alignItems: 'center', gap: 4 }}><PenLine size={12} /> Signature</div>
          </div>
          <div style={{ fontSize: 13 }}>
            <div><b>{r.signer_name}</b></div>
            <div style={{ color: '#5B5F56' }}>Signed {when(r.signed_at)}</div>
          </div>
        </div>
      </div>
  );
}
