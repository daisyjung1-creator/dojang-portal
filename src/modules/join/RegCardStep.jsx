import React, { useEffect, useState } from 'react';
import { C, box, linkBtn } from './JoinPage';
import { SAVE_CONSENT, money, call } from './PayPage';
import CardForm from './CardForm';
import { TestNote } from './CardPage';

// Step 2 of the /join form for families who chose pre-authorized credit card
// payments: save the card right away (TD Payment Profile, no charge). The card
// stays with the registration until the Dojang enrolls the family.
// estimate: { each, count, per } — tuition per student incl. GST, from the plan they picked.
export default function RegCardStep({ token, estimate }) {
  const [info, setInfo] = useState(null);
  const [done, setDone] = useState(null);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    call({ action: 'reg_card_info', reg_token: token }).then((d) => setInfo(d?.error ? { enabled: false } : d));
  }, [token]);

  const later = 'The Dojang will email you a secure link to save your card before automatic payments begin.';
  if (!info) return <p style={{ color: C.soft, textAlign: 'center' }}>Loading…</p>;
  if (!info.enabled || skipped) return <div style={{ ...box, fontSize: 14.5, lineHeight: 1.55 }}>{later}</div>;
  if (done || info.saved) {
    const c = done?.saved || info.saved;
    return (
      <div style={{ ...box, borderColor: '#BFD9C1', background: '#F1F8F1' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Your card is saved</div>
        <p style={{ fontSize: 14.5, margin: '8px 0 0', lineHeight: 1.55 }}>
          {c?.type || 'Card'} ending {c?.last4 || '····'} is saved for automatic tuition. <b>Nothing was charged.</b> Master Daisy will confirm the tuition amount and your first payment date by email before the first charge.
        </p>
      </div>
    );
  }

  const total = estimate ? estimate.each * estimate.count : 0;
  const est = estimate
    ? `${money(total)} ${estimate.per}${estimate.count > 1 ? ` (${estimate.count} students × ${money(estimate.each)})` : ''}, including GST`
    : '';
  const consentNote = `${est ? `Estimated tuition from the plan I chose: ${est}. ` : ''}The Dojang confirms the final amount and the first payment date by email before the first charge.`;

  return (
    <div style={{ textAlign: 'left' }}>
      {info.mode === 'test' && <TestNote />}
      <div style={{ ...box, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.red, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Last step · Credit Card Authorization</div>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '6px 0 0' }}>
          You chose pre-authorized credit card payments. Save the card for tuition now. <b>Nothing is charged today</b> — Master Daisy confirms your tuition and first payment date by email first.
        </p>
        {est && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 8, fontSize: 14 }}>
            <span>Estimated tuition <span style={{ color: C.soft }}>{estimate.per}</span></span>
            <b style={{ whiteSpace: 'nowrap' }}>{money(total)}</b>
          </div>
        )}
        {est && <div style={{ fontSize: 12.5, color: C.faint, marginTop: 4 }}>Including 5% GST. Any discount or grant is applied when the Dojang confirms.</div>}
      </div>
      <CardForm
        consentNote={consentNote}
        onSave={async (cardToken, name) => {
          const r = await call({ action: 'reg_card_save', reg_token: token, token: cardToken, name, consent: `${SAVE_CONSENT} ${consentNote}` });
          if (r?.ok) setDone(r);
          return r;
        }}
      />
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button type="button" style={linkBtn} onClick={() => setSkipped(true)}>Skip for now — I'll do this later</button>
      </div>
    </div>
  );
}
