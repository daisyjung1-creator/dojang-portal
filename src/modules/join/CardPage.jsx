import React, { useEffect, useRef, useState } from 'react';
import { SCHOOL } from '../../lib/agreement';
import { Page, In, C, box, btn } from './JoinPage';
import { SAVE_CONSENT, money, fdate, loadScript, call } from './PayPage';

// Public "save your card" page for one family: /card/<card_link_token>
// For families moving from TD Recurring Billing to a saved card. Nothing is
// charged here: the card is saved with TD (Payment Profile) and tuition is
// charged to it automatically on each billing date from then on.

export default function CardPage({ token }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [ready, setReady] = useState({});
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const cc = useRef(null);

  useEffect(() => {
    document.title = `Card for tuition · ${SCHOOL.name}`;
    call({ action: 'card_info', card_token: token }).then((d) => {
      if (d?.error) setErr(d.error);
      else {
        setInfo(d);
      }
    });
  }, [token]);

  const canSave = info && info.enabled;

  useEffect(() => {
    if (!canSave || cc.current) return;
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
          setFieldErr((r) => ({ ...r, [e.field]: '' }));
        });
        c.on('empty', (e) => setReady((r) => ({ ...r, [e.field]: !e.empty ? r[e.field] : false })));
        c.on('error', (e) => {
          setReady((r) => ({ ...r, [e.field]: false }));
          setFieldErr((r) => ({ ...r, [e.field]: e.message }));
        });
      })
      .catch((e) => setErr(e.message));
  }, [canSave]);

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
      const nextLine = info.upcoming?.[0] ? ` — tuition currently ${money(info.upcoming[0].total)}, next on ${fdate(info.upcoming[0].date)}` : '';
      const r = await call({ action: 'card_save', card_token: token, token: res.token, name, consent: `${SAVE_CONSENT}${nextLine}` });
      setBusy(false);
      if (r?.ok) setDone(r);
      else setErr(r?.error || 'The card could not be saved. Please try again.');
    });
  }

  const allReady = ready['card-number'] && ready.expiry && ready.cvv && name.trim() && agree;
  const fieldBox = { border: '1px solid #D6D2C4', borderRadius: 9, padding: '11px 12px', background: '#fff', minHeight: 22 };
  const lbl = { fontSize: 14, fontWeight: 600, margin: '4px 0 6px' };

  return (
    <Page subtitle="Card for automatic tuition">
      {!info && !err && <p style={{ color: C.soft }}>Loading…</p>}
      {!info && err && <div style={{ ...box, color: C.red }}>{err}</div>}
      {info && (
        <>
          {info.mode === 'test' && (
            <div style={{ ...box, background: '#FFF6E0', borderColor: '#F0D9A8', marginBottom: 14, fontSize: 13.5 }}>
              <b>Test mode</b> — the card is saved on the TD test account only. Use the test card 4030 0000 1000 1234, any future expiry, CVV 123.
            </div>
          )}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{info.customer}</div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '6px 0 0' }}>
              We're moving tuition payments to our new system. Please enter the card you'd like to use for tuition. <b>Nothing is charged today</b> — tuition is charged to this card automatically on each billing date, and a receipt is emailed every time.
            </p>
            {info.upcoming?.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 8 }}>
                {info.upcoming.map((u) => (
                  <div key={u.date} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, padding: '3px 0' }}>
                    <span>
                      Next tuition · {fdate(u.date)}
                      <span style={{ color: C.soft }}> — {u.students.join(', ')}</span>
                    </span>
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{money(u.total)}</span>
                  </div>
                ))}
                <div style={{ fontSize: 12.5, color: C.faint, marginTop: 4 }}>Including GST. If anything looks different from what you expected, please contact the Dojang before saving your card.</div>
              </div>
            )}
          </div>

          {done ? (
            <div style={{ ...box, borderColor: '#BFD9C1', background: '#F1F8F1' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Thank you — your card is saved!</div>
              <p style={{ fontSize: 14.5, margin: '8px 0 0', lineHeight: 1.55 }}>
                {done.saved?.type || 'Card'} ending {done.saved?.last4 || '····'} will be used for tuition from now on. Nothing was charged today. You'll get an emailed receipt after each charge.
              </p>
            </div>
          ) : !info.enabled ? (
            <div style={box}>Saving a card online isn't available right now. Please contact the Dojang at {SCHOOL.email}.</div>
          ) : (
            <div style={box}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Credit card for tuition</div>
              {info.saved && <p style={{ fontSize: 13.5, color: C.soft, margin: '0 0 10px' }}>This replaces the saved card ending {info.saved.last4}.</p>}
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
                  <span style={{ display: 'block', fontSize: 12.5, color: C.soft, marginTop: 4 }}>{SAVE_CONSENT}</span>
                </span>
              </label>
              {err && <div style={{ color: C.red, fontSize: 14, marginTop: 12 }}>{err}</div>}
              <button
                type="button"
                disabled={!allReady || busy}
                onClick={save}
                style={{ ...btn, width: '100%', marginTop: 16, background: allReady && !busy ? C.ink : '#B9B6AC', color: '#fff', borderColor: 'transparent', fontWeight: 700, fontSize: 16 }}
              >
                {busy ? 'Saving…' : 'Save card for tuition'}
              </button>
              <p style={{ fontSize: 12, color: C.faint, margin: '10px 0 0', lineHeight: 1.5 }}>
                Card details are entered on TD Online Mart's secure form and are never stored by the Dojang.
              </p>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
