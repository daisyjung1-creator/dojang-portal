import React, { useEffect, useState } from 'react';
import { SCHOOL } from '../../lib/agreement';
import { Page, C, box } from './JoinPage';
import { SAVE_CONSENT, money, fdate, call } from './PayPage';
import CardForm from './CardForm';
import { supabase } from '../../supabaseClient';

// Card wallet calls (list / add / default / delete) for this family's link.
async function wallet(body) {
  const { data, error } = await supabase.functions.invoke('card-wallet', { body });
  if (error) {
    try {
      return await error.context.json();
    } catch (_e) {
      return { error: error.message };
    }
  }
  return data || {};
}

// Public "save your card" page for one family: /card/<card_link_token>
// For families moving from TD Recurring Billing to a saved card. Nothing is
// charged here: the card is saved with TD (Payment Profile) and tuition is
// charged to it automatically on each billing date from then on.

export default function CardPage({ token }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [cards, setCards] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const [cardMsg, setCardMsg] = useState('');

  useEffect(() => {
    document.title = `Card for tuition · ${SCHOOL.name}`;
    call({ action: 'card_info', card_token: token }).then((d) => {
      if (d?.error) setErr(d.error);
      else setInfo(d);
    });
    wallet({ action: 'list', card_token: token }).then((w) => setCards(w?.cards || []));
  }, [token]);

  async function save(cardToken, name) {
    const nextLine = info.upcoming?.[0] ? ` — tuition currently ${money(info.upcoming[0].total)}, next on ${fdate(info.upcoming[0].date)}` : '';
    const r = await wallet({ action: 'add', card_token: token, token: cardToken, name, consent: `${SAVE_CONSENT}${nextLine}` });
    if (r?.ok) {
      setDone(r);
      setCards(r.cards || []);
      setAdding(false);
    }
    return r;
  }

  async function act(action, card) {
    setBusy(card.id + action);
    setCardMsg('');
    const r = await wallet({ action, card_token: token, card_id: card.id });
    setBusy('');
    if (r?.error) return setCardMsg(r.error);
    setCards(r.cards || []);
    setDone(null);
    setCardMsg(action === 'default' ? `${card.type || 'Card'} ending ${card.last4} will be used for tuition from now on.` : `${card.type || 'Card'} ending ${card.last4} was removed.`);
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

          {cards && cards.length > 0 && (
            <div style={{ ...box, marginBottom: 16 }} data-testid="saved-cards">
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Your saved cards</div>
              {cards.map((k) => (
                <div key={k.id} data-card={k.last4} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{k.type || 'Card'} ending {k.last4 || '····'}</div>
                    <div style={{ fontSize: 12.5, color: C.soft }}>{k.expiry ? `Expires ${k.expiry}` : ''}{k.mode === 'test' ? ' · TEST' : ''}</div>
                  </div>
                  {k.is_default ? (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.green, background: '#E8F1E9', borderRadius: 999, padding: '3px 10px' }}>Used for tuition</span>
                  ) : (
                    <>
                      <button type="button" disabled={!!busy} onClick={() => act('default', k)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Use for tuition
                      </button>
                      {cards.length >= 2 && (
                        <button type="button" disabled={!!busy} onClick={() => act('delete', k)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #F0C9C9', background: '#fff', color: C.red, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
              <p style={{ fontSize: 12.5, color: C.faint, margin: '8px 0 0' }}>
                Saved cards can't be removed while they're your only card or the card used for tuition — add another card and choose it for tuition first.
              </p>
              {cardMsg && <p style={{ fontSize: 13.5, color: C.green, margin: '8px 0 0' }}>{cardMsg}</p>}
            </div>
          )}

          {done && (
            <div style={{ ...box, borderColor: '#BFD9C1', background: '#F1F8F1', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Thank you — your card is saved!</div>
              <p style={{ fontSize: 14.5, margin: '8px 0 0', lineHeight: 1.55 }}>
                {done.saved?.type || 'Card'} ending {done.saved?.last4 || '····'} will be used for tuition from now on. Nothing was charged today. You'll get an emailed receipt after each charge.
              </p>
            </div>
          )}
          {!info.enabled ? (
            <div style={box}>Saving a card online isn't available right now. Please contact the Dojang at {SCHOOL.email}.</div>
          ) : cards && cards.length > 0 && !adding ? (
            <button type="button" onClick={() => { setAdding(true); setDone(null); }} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: C.red, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add another card
            </button>
          ) : cards ? (
            <CardForm onSave={save} buttonLabel={cards.length ? 'Save this card' : 'Save card for tuition'} title={cards.length ? 'Add a card' : 'Credit card for tuition'} />
          ) : null}
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
