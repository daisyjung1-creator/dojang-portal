import React, { useEffect, useState } from 'react';
import { Globe, Copy, Eye, Printer, X, ArrowDownToLine, Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { SCHOOL, TERMS, EMERGENCY_AUTH, ACKNOWLEDGMENTS, PHOTO_YES, PHOTO_NO, FREQUENCIES } from '../../lib/agreement';

// Registrations families sent from the public /join form, waiting for review.
export const JOIN_URL = `${window.location.origin}/join`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const kidName = (k) => `${k.first || ''} ${k.last || ''}`.trim();
const freqLabel = (r) => (r.frequency === 'other' ? `Other: ${r.other_program || ''}` : FREQUENCIES.find((f) => f.value === r.frequency)?.label || '—');
const daysText = (k) => (k.class_days || []).map((s) => { const [d, c] = s.split(':'); return `${DAYS[d]} ${c}`; }).join(', ');

export default function OnlineRegistrations({ onLoad, reloadKey }) {
  const [rows, setRows] = useState([]);
  const [view, setView] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = () =>
    supabase.from('registrations').select('*').order('created_at', { ascending: false }).limit(60).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [reloadKey]);

  const pending = rows.filter((r) => r.status === 'new');
  const handled = rows.filter((r) => r.status !== 'new');
  const dismiss = async (r) => {
    await supabase.from('registrations').update({ status: 'dismissed', handled_at: new Date().toISOString() }).eq('id', r.id);
    setView(null);
    load();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(JOIN_URL); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt('Copy this link:', JOIN_URL); }
  };

  const list = showDone ? handled : pending;
  return (
    <div style={{ ...styles.card, padding: 16, marginBottom: 20, maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Globe size={17} />
        <b style={{ fontSize: 15 }}>Online registrations</b>
        {pending.length > 0 && <span style={{ background: '#BF1C21', color: '#fff', borderRadius: 999, padding: '1px 9px', fontSize: 12.5, fontWeight: 700 }}>{pending.length} new</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="dp-btn" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy form link'}</button>
          <a className="dp-btn" href="/join" target="_blank" rel="noreferrer">Open form</a>
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: '#8A8D84', marginBottom: 10, wordBreak: 'break-all' }}>{JOIN_URL} — send this to new families (email, text, QR code).</div>

      {list.length === 0 ? (
        <p style={{ fontSize: 13.5, color: '#5B5F56', margin: '6px 0' }}>{showDone ? 'Nothing handled yet.' : 'No new registrations.'}</p>
      ) : (
        list.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #F1EFE7', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{(r.kids || []).map(kidName).join(', ')}</div>
              <div style={{ fontSize: 12.5, color: '#8A8D84' }}>
                {r.family?.guardian_name}{r.adult_student ? ' (adult student)' : ''} · {fmtDate(r.created_at)} · {r.plan}
                {r.status !== 'new' && <> · <b>{r.status === 'approved' ? 'Enrolled' : 'Dismissed'}</b></>}
              </div>
            </div>
            <button className="dp-btn" onClick={() => setView(r)}><Eye size={14} /> View</button>
            {r.status === 'new' && <button className="dp-btn dp-btn-primary" onClick={() => onLoad(r)}><ArrowDownToLine size={14} /> Enroll</button>}
          </div>
        ))
      )}
      {handled.length > 0 && (
        <button className="dp-btn" style={{ marginTop: 8, fontSize: 12.5, padding: '4px 10px' }} onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Show new' : `Show handled (${handled.length})`}
        </button>
      )}

      {view && (
        <div style={styles.overlay} onClick={() => setView(null)}>
          <div style={{ ...styles.modal, width: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHeader }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{(view.kids || []).map(kidName).join(', ')}</h2>
              <button className="dp-btn" style={{ padding: 6 }} onClick={() => setView(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '4px 20px 16px', fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: summaryHtml(view) }} />
            <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderTop: '1px solid #E4E0D4', flexWrap: 'wrap' }}>
              <button className="dp-btn" onClick={() => printAgreement(view)}><Printer size={14} /> Print / PDF</button>
              {view.status === 'new' && <button className="dp-btn" onClick={() => dismiss(view)}>Dismiss</button>}
              {view.status === 'new' && <button className="dp-btn dp-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { onLoad(view); setView(null); }}><ArrowDownToLine size={14} /> Enroll</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function summaryHtml(r) {
  const f = r.family || {};
  const row = (k, v) => `<tr><td style="color:#8A8D84;padding:3px 12px 3px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0">${v}</td></tr>`;
  const kids = (r.kids || [])
    .map(
      (k) => `<div style="border:1px solid #E4E0D4;border-radius:8px;padding:8px 12px;margin:8px 0">
      <b>${esc(kidName(k))}</b> · born ${esc(fmtDate(k.dob))}
      <table style="margin-top:4px">${row('Classes', esc(daysText(k) || '—'))}${row('Medical', k.medical ? `<b style="color:#BF1C21">Yes</b> — ${esc(k.medical_detail)}` : 'No')}${k.instructions ? row('Instructions', esc(k.instructions)) : ''}</table></div>`
    )
    .join('');
  return `<h3 style="font-size:14px;margin:12px 0 4px">Students</h3>${kids}
  <h3 style="font-size:14px;margin:14px 0 4px">${r.adult_student ? 'Adult student' : 'Parent / guardian'}</h3>
  <table>${row('Name', esc(f.guardian_name) + (f.relationship && !r.adult_student ? ` (${esc(f.relationship)})` : ''))}${row('Phone', esc(f.phone))}${row('Email', esc(f.email))}${row('Address', `${esc(f.address)} ${esc(f.postal)}`)}${row('Emergency', `${esc(f.emergency_name)} · ${esc(f.emergency_phone)}${f.emergency_relationship ? ` (${esc(f.emergency_relationship)})` : ''}`)}${row('Heard from', esc(f.heard === 'Other' ? `Other: ${f.heard_other || ''}` : f.heard || '—'))}</table>
  <h3 style="font-size:14px;margin:14px 0 4px">Membership</h3>
  <table>${row('Frequency', esc(freqLabel(r)))}${row('Payment', esc(r.plan))}${row('Start', esc(fmtDate(r.start_date)))}${row('Photo/video', r.photo_consent ? 'Yes — consents' : '<b style="color:#BF1C21">No</b> — no promotional photos')}${row('Signed', `${esc(r.signature_name)} · ${esc(fmtDate(r.signed_on))} · version ${esc(r.agreement_version)}`)}</table>`;
}

// The full signed agreement as a printable page (Save as PDF to keep a copy).
export function printAgreement(r) {
  const w = window.open('', '_blank');
  if (!w) return alert('Allow pop-ups to print.');
  const terms = TERMS.map(
    (t) => `<h3>${esc(t.title)}</h3>${t.body.map((b) => (typeof b === 'string' ? `<p>${esc(b)}</p>` : `<ul>${b.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)).join('')}`
  ).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Registration — ${esc((r.kids || []).map(kidName).join(', '))}</title>
  <style>
    body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#20241F;font-size:11.5px;line-height:1.45;margin:28px 34px}
    h1{font-size:18px;margin:0}h2{font-size:13px;margin:16px 0 6px;border-bottom:2px solid #20241F;padding-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
    h3{font-size:11.5px;margin:10px 0 3px}p{margin:0 0 5px}ul{margin:0 0 5px;padding-left:18px}
    table{border-collapse:collapse;width:100%}td{padding:3px 8px 3px 0;vertical-align:top}td.k{color:#5B5F56;width:150px}
    .kid{border:1px solid #CFCAB9;border-radius:6px;padding:6px 10px;margin:6px 0}
    .sig{font-family:Georgia,serif;font-style:italic;font-size:17px}
    .cols{columns:2;column-gap:22px}.cols h3{break-after:avoid}
    @media print{body{margin:0}}
  </style></head><body>
  <h1>${esc(SCHOOL.name)}</h1><div>Student Registration &amp; Membership Agreement · ${esc(SCHOOL.address)} · ${esc(SCHOOL.email)}</div>
  ${summaryHtml(r).replace(/<h3 style="[^"]*">/g, '<h2>').replace(/<\/h3>/g, '</h2>')}
  <h2>Emergency authorization</h2>${EMERGENCY_AUTH.map((p) => `<p>${esc(p)}</p>`).join('')}
  <h2>Photo &amp; video consent</h2><p>☒ ${esc(r.photo_consent ? PHOTO_YES : PHOTO_NO)}</p>
  <h2>Terms</h2><div class="cols">${terms}</div>
  <h2>Acknowledgment &amp; signature</h2><ul>${ACKNOWLEDGMENTS.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  <table style="margin-top:8px"><tr><td class="k">${r.adult_student ? 'Adult student signature' : 'Parent/guardian signature'}</td><td class="sig">${esc(r.signature_name)}</td></tr>
  <tr><td class="k">Date</td><td>${esc(fmtDate(r.signed_on))} (signed online, agreement version ${esc(r.agreement_version)})</td></tr>
  <tr><td class="k">School representative</td><td>__________________________ &nbsp; Date: ____________</td></tr></table>
  <script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
  w.document.close();
}
