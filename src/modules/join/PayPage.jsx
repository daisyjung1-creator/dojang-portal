import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { SCHOOL } from '../../lib/agreement';
import { Page, In, C, box, btn } from './JoinPage';

// Public "Pay now" page for one invoice: /pay/<pay_token>
// Card fields are Worldline Custom Checkout iframes (TD Online Mart), so the
// card number goes straight to the gateway; we only get a one-time token,
// which the td-pay edge function charges for the invoice balance.

const SCRIPTS = ['https://libs.bam.shift4api.net/customcheckout/2/customcheckout.js', 'https://libs.na.bambora.com/customcheckout/1/customcheckout.js'];
// What the family agrees to when they tick "save this card" (same terms as the
// paper Credit Card Pre-Authorized Payment Authorization).
export const SAVE_CONSENT =
  'I authorize Champion Hankook Taekwondo to charge this card through TD Online Mart for my tuition, in the amount and on the schedule shown, until I cancel. Other purchases (belt testing, uniforms, events) are charged only after I approve the invoice by email. The Dojang gives at least 30 days\u2019 notice by email before the amount changes. Membership cancellation must be emailed to hankooktkd@gmail.com at least 14 days before the next payment date; cancelling this card authorization does not cancel the membership. A receipt is emailed after each charge.';
export const money = (n) => '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fdate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

export function loadScript(i = 0) {
  if (window.customcheckout) return Promise.resolve();
  if (i >= SCRIPTS.length) return Promise.reject(new Error('The secure card form could not load.'));
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPTS[i];
    s.onload = () => (window.customcheckout ? resolve() : loadScript(i + 1).then(resolve, reject));
    s.onerror = () => loadScript(i + 1).then(resolve, reject);
    document.head.appendChild(s);
  });
}

export async function call(body) {
  const { data, error } = await supabase.functions.invoke('td-pay', { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      return j;
    } catch (_e) {
      return { error: msg };
    }
  }
  return data;
}

export default function PayPage({ token }) {
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [ready, setReady] = useState({});
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [saveCard, setSaveCard] = useState(false);
  const cc = useRef(null);

  useEffect(() => {
    document.title = `Pay invoice · ${SCHOOL.name}`;
    call({ action: 'invoice', pay_token: token }).then((d) => {
      if (d?.error) setErr(d.error);
      else {
        setInv(d);
      }
    });
  }, [token]);

  const canPay = inv && inv.enabled && inv.balance > 0.004;

  useEffect(() => {
    if (!canPay || cc.current) return;
    loadScript()
      .then(() => {
        const c = window.customcheckout();
        cc.current = c;
        // Literal colours on purpose: these fields live in the payment provider's iframe,
        // where the portal's CSS variables don't exist.
        const style = { style: { base: { fontSize: '16px', color: '#20241F', fontFamily: 'Helvetica, Arial, sans-serif' }, error: { color: '#9A2B2B' } } };
        const fields = [
          ['card-number', { ...style, placeholder: '1234 5678 9012 3456', brands: ['visa', 'mastercard', 'amex'] }],
          ['expiry', { ...style, placeholder: 'MM / YY' }],
          ['cvv', { ...style, placeholder: 'CVV' }],
        ];
        fields.forEach(([f, o]) => c.create(f, o).mount('#cc-' + f));
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
  }, [canPay]);

  function pay() {
    if (!cc.current || busy) return;
    setBusy(true);
    setErr('');
    // One single-use token pays this invoice; with automatic tuition a second
    // token (same card fields) sets up the TD Recurring Billing account.
    const tokenOnce = () => new Promise((resolve) => cc.current.createToken((res) => resolve(res)));
    (async () => {
      const first = await tokenOnce();
      if (first.error || !first.token) {
        setBusy(false);
        setErr(first.error?.message || 'Please check the card details.');
        return;
      }
      let rbToken = '';
      // Recurring Billing needs its own token; a saved card (profile) doesn't.
      if (saveCard && inv.auto && inv.auto_method !== 'card') {
        const second = await tokenOnce();
        rbToken = second?.token || '';
      }
      const consent = saveCard ? `${SAVE_CONSENT} — ${inv.auto ? `${money(inv.auto.amount)} every ${inv.auto.months === 3 ? '3 months' : 'month'} from ${fdate(inv.auto.first)}; ` : ''}agreed online by ${name} on ${new Date().toISOString()}` : '';
      const r = await call({ action: 'pay', pay_token: token, token: first.token, name, email: inv.email, auto: saveCard && !!inv.auto, rb_token: rbToken, consent });
      setBusy(false);
      if (r?.approved) setDone(r);
      else setErr(r?.error || 'The payment did not go through. Please try again.');
    })();
  }

  const allReady = ready['card-number'] && ready.expiry && ready.cvv && name.trim() && (!inv?.auto_required || saveCard);
  const fieldBox = { border: '1px solid #D6D2C4', borderRadius: 9, padding: '11px 12px', background: '#fff', minHeight: 22 };
  const lbl = { fontSize: 14, fontWeight: 600, margin: '4px 0 6px' };

  return (
    <Page subtitle="Pay your invoice">
      {!inv && !err && <p style={{ color: C.soft }}>Loading…</p>}
      {!inv && err && <div style={{ ...box, color: C.danger }}>{err}</div>}
      {inv && (
        <>
          {inv.mode === 'test' && (
            <div style={{ ...box, background: 'var(--dp-warning-tint)', borderColor: 'var(--dp-warning-tint)', marginBottom: 14, fontSize: 14 }}>
              <b>Test mode</b> — no real money is charged and nothing is recorded on the invoice. Use the test card 4030 0000 1000 1234, any future expiry, CVV 123.
            </div>
          )}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, color: C.faint }}>Invoice #{inv.number} · {fdate(inv.date)}</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{inv.customer}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: C.faint }}>Amount due</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{money(done ? 0 : inv.balance)}</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 8 }}>
              {inv.lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, padding: '4px 0' }}>
                  <span>
                    {l.name}
                    {l.quantity !== 1 ? ` × ${l.quantity}` : ''}
                    {l.description && <span style={{ color: C.soft }}> — {l.description}</span>}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>{money(l.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.soft, paddingTop: 4 }}>
                <span>GST</span>
                <span>{money(inv.gst)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, paddingTop: 4 }}>
                <span>Total</span>
                <span>{money(inv.total)}</span>
              </div>
            </div>
          </div>

          {done ? (
            <div style={{ ...box, borderColor: 'var(--dp-success-tint)', background: 'var(--dp-success-tint)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Thank you — payment received!</div>
              <p style={{ fontSize: 16, margin: '8px 0 0', lineHeight: 1.55 }}>
                {money(done.amount)} was charged{done.card ? ` to the card ending ${done.card}` : ''}.
                {done.auto && !done.auto.error ? (done.auto.saved ? ` Your card is saved for automatic tuition; the next charge is on ${fdate(done.auto.first)}. A receipt is emailed after each charge.` : ` Automatic tuition is set up: ${money(done.auto.amount)} ${done.auto.months === 3 ? 'every 3 months' : 'every month'} from ${fdate(done.auto.first)}. A receipt is emailed after each charge.`) : ''}
                {done.auto?.error ? ' (Automatic tuition could not be set up — the Dojang has been notified and will contact you.)' : ''}
                {done.test ? ' (Test mode: approved by the TD test account; nothing was recorded on the invoice.)' : done.recorded ? ` Your receipt${done.receipt ? ` #${done.receipt}` : ''} has been emailed to you.` : ' The Dojang will send your receipt shortly.'}
              </p>
              <a href="/parent" style={{ display: 'inline-block', marginTop: 12, fontSize: 16, fontWeight: 600, color: C.ink }}>Back to the parent portal</a>
            </div>
          ) : !inv.enabled ? (
            <div style={box}>Online card payment isn't available right now. Please contact the Dojang at {SCHOOL.email}.</div>
          ) : !(inv.balance > 0.004) ? (
            <div style={{ ...box, color: C.green, fontWeight: 600 }}>This invoice is paid in full. Thank you!</div>
          ) : (
            <div style={box}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Pay by credit card</div>
              <In label="Name on card" placeholder="As shown on the card" value={name} onChange={(e) => setName(e.target.value)} autoComplete="cc-name" />
              <div style={lbl}>Card number</div>
              <div id="cc-card-number" style={fieldBox} />
              {fieldErr['card-number'] && <div style={{ color: C.danger, fontSize: 13, marginTop: 4 }}>{fieldErr['card-number']}</div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={lbl}>Expiry</div>
                  <div id="cc-expiry" style={fieldBox} />
                  {fieldErr.expiry && <div style={{ color: C.danger, fontSize: 13, marginTop: 4 }}>{fieldErr.expiry}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={lbl}>CVV</div>
                  <div id="cc-cvv" style={fieldBox} />
                  {fieldErr.cvv && <div style={{ color: C.danger, fontSize: 13, marginTop: 4 }}>{fieldErr.cvv}</div>}
                </div>
              </div>
              <p style={{ fontSize: 13, color: C.soft, margin: '10px 0 0' }}>Credit cards only. Debit cards (including Visa Debit and Debit Mastercard) can't be used.</p>
              {inv.auto && (
                <div style={{ marginTop: 14, padding: '12px 12px', border: `1px solid ${saveCard ? C.ink : C.line}`, borderRadius: 10, background: saveCard ? '#fff' : C.paper }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, cursor: 'pointer', fontWeight: 600 }}>
                    <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, flex: 'none' }} />
                    <span>
                      {inv.auto.replace ? 'Use this card for future tuition' : 'Pay tuition automatically with this card'}
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 400, color: C.soft, marginTop: 2 }}>
                        {inv.auto.replace
                          ? `Replaces the card ending ${inv.auto.replace} for automatic tuition. Next charge on ${fdate(inv.auto.first)}.`
                          : inv.auto_method === 'card'
                          ? `Your card is saved securely with TD. Tuition (currently ${money(inv.auto.amount)} ${inv.auto.months === 3 ? 'every 3 months' : 'a month'}, next on ${fdate(inv.auto.first)}) is charged to it on each billing date.`
                          : `${money(inv.auto.amount)} ${inv.auto.months === 3 ? 'every 3 months' : 'every month'}, starting ${fdate(inv.auto.first)}`}
                      </span>
                    </span>
                  </label>
                  {(saveCard || inv.auto_required) && <p style={{ fontSize: 14, color: C.soft, lineHeight: 1.55, margin: '8px 0 0 28px' }}>{SAVE_CONSENT}</p>}
                  {inv.auto_required && !saveCard && <p style={{ fontSize: 13, color: C.danger, margin: '8px 0 0 28px', fontWeight: 600 }}>Required: your membership is paid by pre-authorized credit card. Please tick the box to agree to automatic tuition payments.</p>}
                </div>
              )}
              {err && <div style={{ color: C.danger, fontSize: 14, marginTop: 12 }}>{err}</div>}
              <button
                type="button"
                disabled={!allReady || busy}
                onClick={pay}
                style={{ ...btn, width: '100%', marginTop: 16, background: allReady && !busy ? C.ink : '#B9B6AC', color: '#fff', borderColor: 'transparent', fontWeight: 700, fontSize: 16 }}
              >
                {busy ? 'Processing…' : saveCard ? `Pay ${money(inv.balance)} and ${inv.auto?.replace ? 'save this card' : 'set up automatic tuition'}` : `Pay ${money(inv.balance)}`}
              </button>
              <p style={{ fontSize: 13, color: C.faint, margin: '10px 0 0', lineHeight: 1.5 }}>
                Card details are entered on TD Online Mart's secure form and are never stored by the Dojang. A receipt is emailed after payment.
              </p>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
