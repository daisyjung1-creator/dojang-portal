import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { In, C, box, btn } from './JoinPage';
import { SAVE_CONSENT, loadScript } from './PayPage';

// The secure "save a card for tuition" form (TD Online Mart Custom Checkout
// fields + consent). Used by the /card/<token> page and the card step of /join.
// onSave(oneTimeToken, nameOnCard) → { ok } or { error }.
// inline: no button of its own — the /join form's Submit uses the ref:
//   ref.status() → { started, ready }   ref.tokenize() → { token, name } or { error }
//   ref.showError(msg)
const CardForm = forwardRef(function CardForm({ onSave, replaceLast4, consentNote = '', buttonLabel = 'Save card for tuition', inline = false, title = 'Credit card for tuition', onStatus }, ref) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [ready, setReady] = useState({});
  const [started, setStarted] = useState({});
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cc = useRef(null);

  useEffect(() => {
    if (cc.current) return;
    loadScript()
      .then(() => {
        const c = window.customcheckout();
        cc.current = c;
        const style = { style: { base: { fontSize: '16px', color: C.ink, fontFamily: 'Helvetica, Arial, sans-serif' }, error: { color: C.red } } };
        [
          ['card-number', { ...style, placeholder: '1234 5678 9012 3456', brands: ['visa', 'mastercard', 'amex'] }],
          ['expiry', { ...style, placeholder: 'MM / YY' }],
          ['cvv', { ...style, placeholder: 'CVV' }],
        ].forEach(([f, o]) => c.create(f, o).mount('#cc-' + f));
        c.on('complete', (e) => {
          setReady((r) => ({ ...r, [e.field]: true }));
          setStarted((r) => ({ ...r, [e.field]: true }));
          setFieldErr((r) => ({ ...r, [e.field]: '' }));
        });
        c.on('empty', (e) => {
          setReady((r) => ({ ...r, [e.field]: !e.empty ? r[e.field] : false }));
          setStarted((r) => ({ ...r, [e.field]: !e.empty }));
        });
        c.on('error', (e) => {
          setReady((r) => ({ ...r, [e.field]: false }));
          setStarted((r) => ({ ...r, [e.field]: true }));
          setFieldErr((r) => ({ ...r, [e.field]: e.message }));
        });
      })
      .catch((e) => setErr(e.message));
  }, []);

  function save() {
    if (!cc.current || busy) return;
    setBusy(true);
    setErr('');
    cc.current.createToken(async (res) => {
      if (res.error || !res.token) {
        setBusy(false);
        setErr(res.error?.message || 'Please check the card details.');
        return;
      }
      const r = await onSave(res.token, name);
      setBusy(false);
      if (!r?.ok) setErr(r?.error || 'The card could not be saved. Please try again.');
    });
  }

  const allReady = !!(ready['card-number'] && ready.expiry && ready.cvv && name.trim() && agree);

  const anyStarted = !!(started['card-number'] || started.expiry || started.cvv);
  useEffect(() => {
    onStatus?.({ started: anyStarted, ready: allReady });
  }, [anyStarted, allReady]);

  useImperativeHandle(ref, () => ({
    status: () => ({ started: anyStarted, ready: allReady }),
    showError: (m) => setErr(m || ''),
    tokenize: () =>
      new Promise((resolve) => {
        if (!cc.current) return resolve({ error: 'The secure card form did not load.' });
        setErr('');
        cc.current.createToken((res) => {
          if (res.error || !res.token) {
            const m = res.error?.message || 'Please check the card details.';
            setErr(m);
            return resolve({ error: m });
          }
          resolve({ token: res.token, name });
        });
      }),
  }));
  const fieldBox = { border: '1px solid #D6D2C4', borderRadius: 9, padding: '11px 12px', background: '#fff', minHeight: 22 };
  const lbl = { fontSize: 14, fontWeight: 600, margin: '4px 0 6px' };

  return (
    <div style={box}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {replaceLast4 && <p style={{ fontSize: 13.5, color: C.soft, margin: '0 0 10px' }}>This replaces the saved card ending {replaceLast4}.</p>}
      <In label="Name on card" placeholder="As shown on the card" value={name} onChange={(e) => setName(e.target.value)} autoComplete="cc-name" />
      <div style={lbl}>Card number</div>
      <div id="cc-card-number" style={fieldBox} />
      {fieldErr['card-number'] && <div style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{fieldErr['card-number']}</div>}
      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={lbl}>Expiry</div>
          <div id="cc-expiry" style={fieldBox} />
          {fieldErr.expiry && <div style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{fieldErr.expiry}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={lbl}>CVV</div>
          <div id="cc-cvv" style={fieldBox} />
          {fieldErr.cvv && <div style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{fieldErr.cvv}</div>}
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.soft, margin: '10px 0 0' }}>Credit cards only. Debit cards (including Visa Debit and Debit Mastercard) can't be used.</p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer', marginTop: 14, padding: '12px', border: `1px solid ${agree ? C.ink : C.line}`, borderRadius: 10, background: agree ? '#fff' : C.paper }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, flex: 'none' }} />
        <span style={{ lineHeight: 1.5 }}>
          <b>I agree to automatic tuition payments with this card.</b>
          <span style={{ display: 'block', fontSize: 12.5, color: C.soft, marginTop: 4 }}>{SAVE_CONSENT}{consentNote ? ' ' + consentNote : ''}</span>
        </span>
      </label>
      {err && <div style={{ color: C.red, fontSize: 14, marginTop: 12 }}>{err}</div>}
      {!inline && <button
        type="button"
        disabled={!allReady || busy}
        onClick={save}
        style={{ ...btn, width: '100%', marginTop: 16, background: allReady && !busy ? C.ink : '#B9B6AC', color: '#fff', borderColor: 'transparent', fontWeight: 700, fontSize: 16 }}
      >
        {busy ? 'Saving…' : buttonLabel}
      </button>}
      <p style={{ fontSize: 12, color: C.faint, margin: '10px 0 0', lineHeight: 1.5 }}>
        Card details are entered on TD Online Mart's secure form and are never stored by the Dojang.
      </p>
    </div>
  );
});

export default CardForm;
