import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// A family's saved cards (admin): which one is used for tuition, switch it,
// and remove one — only when there are 2+ cards and never the tuition card.
export default function CardWallet({ customerId, onChanged, compact }) {
  const [cards, setCards] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  async function call(body) {
    const { data, error } = await supabase.functions.invoke('card-wallet', { body: { customer_id: customerId, ...body } });
    if (error) {
      try {
        return await error.context.json();
      } catch (_e) {
        return { error: error.message };
      }
    }
    return data || {};
  }
  useEffect(() => {
    call({ action: 'list' }).then((r) => setCards(r.cards || []));
  }, [customerId]);

  async function act(action, k) {
    setBusy(k.id);
    setMsg('');
    const r = await call({ action, card_id: k.id });
    setBusy('');
    if (r.error) return setMsg(r.error);
    setCards(r.cards || []);
    onChanged?.(r.cards || []);
  }

  if (!cards) return <span style={{ color: 'var(--dp-ink-faint)', fontSize: 12.5 }}>…</span>;
  if (!cards.length) return <span style={{ color: 'var(--dp-ink-faint)', fontSize: 12.5 }}>No card saved</span>;
  const btn = { padding: '1px 8px', fontSize: 12.5 };
  return (
    <div data-testid="card-wallet" style={{ display: 'grid', gap: compact ? 3 : 5 }}>
      {cards.map((k) => (
        <div key={k.id} data-card={k.last4} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
          <span style={{ fontWeight: k.is_default ? 600 : 400 }}>
            {k.type || 'Card'} ···{k.last4 || '????'}
            {k.expiry ? ` · exp ${k.expiry}` : ''}
            {k.mode === 'test' ? ' · TEST' : ''}
          </span>
          {k.is_default ? (
            <span style={{ fontSize: 12, color: 'var(--dp-success)', background: 'var(--dp-success-tint)', borderRadius: 999, padding: '1px 7px' }}>tuition</span>
          ) : (
            <>
              <button type="button" className="dp-btn" style={btn} disabled={!!busy} onClick={() => act('default', k)}>Use for tuition</button>
              {cards.length >= 2 && (
                <button type="button" className="dp-btn" style={{ ...btn, color: 'var(--dp-danger)' }} disabled={!!busy} onClick={() => act('delete', k)}>Remove</button>
              )}
            </>
          )}
        </div>
      ))}
      {msg && <div style={{ fontSize: 12, color: 'var(--dp-danger)' }}>{msg}</div>}
    </div>
  );
}
