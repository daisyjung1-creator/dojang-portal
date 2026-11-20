import React, { useEffect, useState } from 'react';
import { SCHOOL } from '../../lib/agreement';
import { Page, C, box } from './JoinPage';
import { SAVE_CONSENT, money, fdate, call } from './PayPage';
import CardForm from './CardForm';

// Public "save your card" page for one family: /card/<card_link_token>
// For families moving from TD Recurring Billing to a saved card. Nothing is
// charged here: the card is saved with TD (Payment Profile) and tuition is
// charged to it automatically on each billing date from then on.

export default function CardPage({ token }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    document.title = `Card for tuition · ${SCHOOL.name}`;
    call({ action: 'card_info', card_token: token }).then((d) => {
      if (d?.error) setErr(d.error);
      else setInfo(d);
    });
  }, [token]);

  async function save(cardToken, name) {
    const nextLine = info.upcoming?.[0] ? ` — tuition currently ${money(info.upcoming[0].total)}, next on ${fdate(info.upcoming[0].date)}` : '';
    const r = await call({ action: 'card_save', card_token: token, token: cardToken, name, consent: `${SAVE_CONSENT}${nextLine}` });
    if (r?.ok) setDone(r);
    return r;
  }

  return (
    <Page subtitle="Card for automatic tuition">
      {!info && !err && <p style={{ color: C.soft }}>Loading…</p>}
      {!info && err && <div style={{ ...box, color: C.red }}>{err}</div>}
      {info && (
        <>
          {info.mode === 'test' && <TestNote />}
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
            <CardForm onSave={save} replaceLast4={info.saved?.last4} />
          )}
        </>
      )}
    </Page>
  );
}

export function TestNote() {
  return (
    <div style={{ ...box, background: '#FFF6E0', borderColor: '#F0D9A8', marginBottom: 14, fontSize: 13.5 }}>
      <b>Test mode</b> — the card is saved on the TD test account only. Use the test card 4030 0000 1000 1234, any future expiry, CVV 123.
    </div>
  );
}
