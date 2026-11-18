// Supabase Edge Function: td-pay
//
// Online card payments through TD Online Mart (Worldline / Shift4 gateway).
// The card number never reaches us: the public pay page collects it in
// Worldline's Custom Checkout fields, which return a one-time token; this
// function charges that token for the invoice's balance, records the payment
// and emails the receipt.
//
// Actions (POST JSON { action, ... }):
//   invoice  { pay_token }                     → invoice summary for the pay page (public)
//   pay      { pay_token, token, name, email }  → charge the balance (public)
//   selftest {}                                → $1.00 Worldline test-card charge on the TEST account (no real money)
//
// Secrets: TD_MERCHANT_ID, TD_PAYMENT_PASSCODE (live),
//          TD_TEST_MERCHANT_ID, TD_TEST_PAYMENT_PASSCODE (test).
// Which pair is used comes from invoice_settings.online_pay_mode. In test mode
// nothing is recorded in the portal (the invoice stays unpaid), so any real
// invoice's pay link can be tried safely with Worldline's test cards.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const API_BASES = ['https://api.bam.shift4api.net/v1', 'https://api.na.bambora.com/v1'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
const todayEdm = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
const CARD_METHOD: Record<string, string> = { VI: 'Visa', MC: 'Mastercard', AM: 'American Express', NN: 'Discover' };

function creds(mode: string) {
  const live = mode === 'live';
  const id = Deno.env.get(live ? 'TD_MERCHANT_ID' : 'TD_TEST_MERCHANT_ID') || '';
  const pass = Deno.env.get(live ? 'TD_PAYMENT_PASSCODE' : 'TD_TEST_PAYMENT_PASSCODE') || '';
  if (!id || !pass) throw new Error(`The ${live ? 'live' : 'test'} TD merchant ID / payment passcode secrets are not set`);
  return { id: id.trim(), auth: 'Passcode ' + btoa(`${id.trim()}:${pass.trim()}`) };
}

// POST /payments; tries the new Shift4 host first, then the legacy Bambora one.
async function gateway(mode: string, body: Record<string, unknown>) {
  const { auth } = creds(mode);
  let lastErr: unknown = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}/payments`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && String(data.approved) === '1', status: res.status, data };
    } catch (e) {
      lastErr = e; // network / DNS: try the next host
    }
  }
  throw new Error('Could not reach the payment gateway: ' + String(lastErr));
}

async function loadSettings() {
  const { data } = await admin.from('invoice_settings').select('business_name, email, online_pay, online_pay_mode, payment_methods').eq('id', 1).maybeSingle();
  return data || {};
}

async function invoiceByToken(payToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(payToken || ''))) return null;
  const { data: inv } = await admin.from('invoices').select('id').eq('pay_token', payToken).maybeSingle();
  if (!inv) return null;
  const { data } = await admin.from('invoice_summary').select('*').eq('id', inv.id).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const s: any = await loadSettings();
    const mode = s.online_pay_mode === 'live' ? 'live' : 'test';

    if (b.action === 'selftest') {
      // Always the TEST account with Worldline's approved test Visa — never a real charge.
      const r = await gateway('test', {
        order_number: 'TEST-' + Date.now().toString(36),
        amount: 1.0,
        payment_method: 'card',
        card: { name: 'Portal Test', number: '4030000010001234', expiry_month: '12', expiry_year: '30', cvd: '123', complete: true },
      });
      return json({ ok: r.ok, status: r.status, message: r.data?.message || r.data?.details?.[0]?.message || '', id: r.data?.id || null, live_secrets_set: !!(Deno.env.get('TD_MERCHANT_ID') && Deno.env.get('TD_PAYMENT_PASSCODE')), test_profiles_secret_set: !!Deno.env.get('TD_TEST_PROFILES_PASSCODE') });
    }

    if (b.action === 'invoice' || b.action === 'pay') {
      const inv: any = await invoiceByToken(b.pay_token);
      if (!inv || inv.voided) return json({ error: 'This payment link is not valid. Please contact the Dojang.' }, 404);
      const { data: lines } = await admin.from('invoice_lines').select('item_name, description, quantity, amount').eq('invoice_id', inv.id).order('position');
      const balance = r2(inv.balance);
      const summary = {
        business: s.business_name || 'Champion Hankook Taekwondo',
        number: inv.invoice_number,
        date: inv.invoice_date,
        customer: inv.customer_name,
        email: inv.customer_email || '',
        total: r2(inv.total),
        gst: r2(inv.gst_amount),
        balance,
        lines: (lines || []).map((l: any) => ({ name: l.item_name || l.description, description: l.item_name && l.item_name !== l.description ? l.description : '', quantity: Number(l.quantity), amount: r2(l.amount) })),
        enabled: !!s.online_pay,
        mode,
      };
      if (b.action === 'invoice') return json(summary);

      // ── pay ──
      if (!s.online_pay) return json({ error: 'Online payment is not turned on. Please contact the Dojang.' }, 400);
      if (!(balance > 0.004)) return json({ error: 'This invoice is already paid. Thank you!', paid: true }, 400);
      const token = String(b.token || '');
      if (!token) return json({ error: 'Card details are missing.' }, 400);
      const name = String(b.name || inv.customer_name || '').slice(0, 64);
      const r = await gateway(mode, {
        order_number: `INV${inv.invoice_number}-${Date.now().toString(36)}`.slice(0, 30),
        amount: balance,
        payment_method: 'token',
        token: { code: token, name, complete: true },
        billing: { name, email_address: String(b.email || inv.customer_email || '').split(/[,;\s]/)[0] || undefined },
        comments: `Invoice #${inv.invoice_number}`,
      });
      if (!r.ok) {
        const msg = r.data?.message || r.data?.details?.[0]?.message || 'The card was declined.';
        console.log('declined', inv.invoice_number, r.status, JSON.stringify(r.data).slice(0, 300));
        return json({ error: `Payment not approved: ${msg}` }, 402);
      }
      const t = r.data;
      // Test mode: the charge went to the TD test account only — don't touch the real books.
      if (mode === 'test') return json({ ok: true, approved: true, recorded: false, test: true, transaction: t.id, amount: balance, card: t.card?.last_four || '', mode });
      const methods: string[] = s.payment_methods || [];
      const cardName = CARD_METHOD[t.card?.card_type] || '';
      const method = cardName && methods.includes(cardName) ? cardName : 'Other';
      const { data: pay, error } = await admin
        .from('invoice_payments')
        .insert({
          invoice_id: inv.id,
          customer_id: inv.customer_id || null,
          payment_date: todayEdm(),
          method,
          amount: balance,
          reference: `Online ${t.card?.last_four ? '···' + t.card.last_four : ''} auth ${t.auth_code || ''}`.trim(),
          gateway_txn: String(t.id || ''),
          notes: 'Paid online (Pay now)',
        })
        .select()
        .single();
      if (error) {
        // The card was charged but we couldn't record it — tell the dojang loudly.
        console.error('record failed', inv.invoice_number, t.id, error);
        if (s.email) await admin.from('email_queue').insert({ type: 'broadcast', recipient_email: s.email, payload: { subject: `[Action needed] Online payment for invoice #${inv.invoice_number} was charged but not recorded`, message: `Transaction ${t.id}, amount ${balance}. Please record it by hand in the portal.\n\n${error.message}` } });
        return json({ ok: true, approved: true, recorded: false, transaction: t.id, amount: balance });
      }
      const to = inv.customer_email || b.email;
      if (to) await admin.from('email_queue').insert({ type: 'receipt', recipient_email: to, payload: { payment_id: pay.id } });
      return json({ ok: true, approved: true, recorded: true, receipt: pay.receipt_number, amount: balance, card: t.card?.last_four || '', mode });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err).slice(0, 300) }, 500);
  }
});
