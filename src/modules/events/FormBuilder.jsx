import React, { useState } from 'react';
import { Plus, Trash2, Copy, ArrowUp, ArrowDown, Eye, X, PenLine } from 'lucide-react';
import Modal from '../../components/Modal';
import { QUESTION_TYPES, HAS_OPTIONS, DEFAULT_SIGNATURE_TEXT, newQuestion, FormQuestions, SignaturePad } from '../../components/EventFormFields';

// Google-Forms-style editor for an event's sign-up questions + signature.
const box = { border: '1px solid #E4E6DF', borderLeft: '4px solid var(--dp-hankook-red)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, background: '#fff' };
const iconBtn = { padding: '4px 7px', fontSize: 12 };
const toggle = { display: 'flex', gap: 6, fontSize: 13, alignItems: 'center', whiteSpace: 'nowrap' };

export function cleanForm(form) {
  return (form || []).map((q) => ({
    id: q.id,
    type: q.type,
    label: (q.label || '').trim(),
    help: (q.help || '').trim(),
    required: !!q.required,
    per_child: !!q.per_child,
    options: HAS_OPTIONS.includes(q.type) ? [...new Set((q.options || []).map((o) => o.trim()).filter(Boolean))] : [],
  }));
}
export function formProblem(form) {
  for (const [i, q] of cleanForm(form).entries()) {
    if (!q.label) return `Question ${i + 1} needs a title.`;
    if (HAS_OPTIONS.includes(q.type) && !q.options.length) return `"${q.label}" needs at least one option.`;
  }
  return '';
}

function QuestionCard({ q, i, n, onChange, onMove, onCopy, onDelete }) {
  const set = (k, v) => onChange({ ...q, [k]: v });
  const opts = q.options?.length ? q.options : [''];
  return (
    <div style={box} data-builder-q={i}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="dp-input" style={{ flex: '1 1 260px', fontWeight: 500 }} value={q.label} placeholder={`Question ${i + 1}`} aria-label={`Question ${i + 1} title`} onChange={(e) => set('label', e.target.value)} />
        <select className="dp-select" style={{ flex: '0 0 170px' }} value={q.type} aria-label={`Question ${i + 1} type`} onChange={(e) => set('type', e.target.value)}>
          {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <input className="dp-input" style={{ width: '100%', marginTop: 6, fontSize: 13 }} value={q.help} placeholder="Description (optional)" onChange={(e) => set('help', e.target.value)} />
      {HAS_OPTIONS.includes(q.type) && (
        <div style={{ marginTop: 8 }}>
          {opts.map((o, j) => (
            <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ width: 16, textAlign: 'center', color: 'var(--dp-ink-faint)', fontSize: 13 }}>{q.type === 'choice' ? '○' : q.type === 'checkboxes' ? '☐' : `${j + 1}.`}</span>
              <input
                className="dp-input"
                style={{ flex: 1, fontSize: 13.5 }}
                value={o}
                placeholder={`Option ${j + 1}`}
                aria-label={`Question ${i + 1} option ${j + 1}`}
                onChange={(e) => set('options', opts.map((x, k) => (k === j ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    set('options', [...opts.slice(0, j + 1), '', ...opts.slice(j + 1)]);
                  }
                }}
              />
              {opts.length > 1 && <button type="button" className="dp-btn" style={iconBtn} aria-label="Remove option" onClick={() => set('options', opts.filter((_, k) => k !== j))}><X size={12} /></button>}
            </div>
          ))}
          <button type="button" className="dp-btn" style={{ ...iconBtn, marginLeft: 22 }} onClick={() => set('options', [...opts, ''])}><Plus size={12} /> Add option</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #F0EEE8', flexWrap: 'wrap' }}>
        <label style={toggle}><input type="checkbox" checked={!!q.required} onChange={(e) => set('required', e.target.checked)} /> Required</label>
        <label style={toggle} title="e.g. T-shirt size or allergies — one answer per child"><input type="checkbox" checked={!!q.per_child} onChange={(e) => set('per_child', e.target.checked)} /> Ask for each child</label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button type="button" className="dp-btn" style={iconBtn} aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp size={13} /></button>
          <button type="button" className="dp-btn" style={iconBtn} aria-label="Move down" disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown size={13} /></button>
          <button type="button" className="dp-btn" style={iconBtn} aria-label="Duplicate" onClick={onCopy}><Copy size={13} /></button>
          <button type="button" className="dp-btn" style={iconBtn} aria-label="Delete question" onClick={onDelete}><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
}

export default function FormBuilder({ form, onForm, signatureRequired, onSignatureRequired, signatureText, onSignatureText }) {
  const [preview, setPreview] = useState(false);
  const list = form || [];
  const update = (i, q) => onForm(list.map((x, j) => (j === i ? q : x)));
  const move = (i, d) => {
    const a = [...list];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    onForm(a);
  };
  return (
    <div style={{ border: '1px solid #E4E6DF', borderRadius: 8, padding: '10px 12px', marginBottom: 10, background: '#FBFAF6' }} data-testid="form-builder">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Sign-up form</div>
          <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)' }}>Questions families answer when they sign up — like a Google Form.</div>
        </div>
        <button type="button" className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setPreview(true)}><Eye size={13} /> Preview</button>
      </div>
      {list.map((q, i) => (
        <QuestionCard
          key={q.id}
          q={q}
          i={i}
          n={list.length}
          onChange={(nq) => update(i, nq)}
          onMove={(d) => move(i, d)}
          onCopy={() => onForm([...list.slice(0, i + 1), { ...q, id: newQuestion().id, options: [...(q.options || [])] }, ...list.slice(i + 1)])}
          onDelete={() => onForm(list.filter((_, j) => j !== i))}
        />
      ))}
      <button type="button" className="dp-btn" style={{ fontSize: 13 }} onClick={() => onForm([...list, newQuestion()])}><Plus size={14} /> Add question</button>
      <div style={{ borderTop: '1px solid #E4E6DF', marginTop: 12, paddingTop: 10 }}>
        <label style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'center' }}>
          <input type="checkbox" checked={!!signatureRequired} onChange={(e) => { onSignatureRequired(e.target.checked); if (e.target.checked && !signatureText) onSignatureText(DEFAULT_SIGNATURE_TEXT); }} />
          <PenLine size={15} /> Parent signs at the end (hand-drawn signature)
        </label>
        {signatureRequired && (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '6px 0 4px' }}>Text the parent agrees to when signing (consent / waiver):</div>
            <textarea className="dp-input" style={{ width: '100%', minHeight: 90, fontSize: 13 }} value={signatureText || ''} onChange={(e) => onSignatureText(e.target.value)} aria-label="Signature agreement text" />
          </>
        )}
      </div>
      {preview && (
        <Modal title="Preview — what families see" maxWidth={640} onClose={() => setPreview(false)} footer={<button className="dp-btn" onClick={() => setPreview(false)}>Close preview</button>}>
          <PreviewBody form={cleanForm(list)} signatureRequired={signatureRequired} signatureText={signatureText} />
        </Modal>
      )}
    </div>
  );
}

export function PreviewBody({ form, signatureRequired, signatureText, event }) {
  const [answers, setAnswers] = useState({});
  const kids = [{ id: 'a', name: 'First Child' }, { id: 'b', name: 'Second Child' }];
  return (
    <div style={{ background: '#F7F5EF', margin: -4, padding: 8, borderRadius: 8 }}>
      <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '0 0 4px' }}>Shown with two sample children. Nothing is saved.</p>
      {event && (
        <div style={{ background: '#fff', border: '1px solid #E6E3DA', borderRadius: 10, padding: '12px 14px', marginTop: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Sign up — {event.title}</div>
          {event.description && <div style={{ fontSize: 13.5, color: 'var(--dp-ink-soft)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{event.description}</div>}
          <div style={{ fontSize: 13, color: 'var(--dp-ink-soft)', margin: '10px 0 4px' }}>Who is coming?</div>
          {kids.map((k) => <label key={k.id} style={{ display: 'flex', gap: 8, fontSize: 15, padding: '4px 0' }}><input type="checkbox" defaultChecked /> {k.name}</label>)}
          {event.allow_guests && <div style={{ fontSize: 13, color: 'var(--dp-ink-soft)', marginTop: 6 }}>Guests: families can add guest names{event.pricing === 'per_family' ? ' (they count toward the family price)' : Number(event.guest_price) > 0 ? ` ($${Number(event.guest_price).toFixed(2)} each)` : ' (free)'}.</div>}
        </div>
      )}
      {!form.length && !signatureRequired && <p style={{ fontSize: 13, color: 'var(--dp-ink-faint)', margin: '10px 0 0' }}>This event has no questions or signature — families just choose who is coming.</p>}
      <FormQuestions form={form} kids={kids} answers={answers} onChange={setAnswers} />
      {signatureRequired && (
        <div style={{ border: '1px solid #E6E3DA', borderRadius: 10, padding: '12px 14px', background: '#fff', marginTop: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Parent / guardian signature <span style={{ color: 'var(--dp-hankook-red)' }}>*</span></div>
          {signatureText && <p style={{ fontSize: 13.5, color: 'var(--dp-ink-soft)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{signatureText}</p>}
          <SignaturePad onChange={() => {}} />
          <div style={{ fontSize: 13, color: 'var(--dp-ink-soft)', marginTop: 6 }}>Full name of parent / guardian *</div>
          <input className="dp-input" style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}
