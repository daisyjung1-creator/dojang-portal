// Supabase Edge Function: card-wallet
//
// A family's saved cards (TD Payment Profiles). One is the auto-pay card —
// it lives in customers.card_* as before, so automatic tuition (td-pay) keeps
// charging it unchanged. Who can use this:
//   * the family, with their card link token (/card/<token>, also opened from
//     the parent portal): { card_token, … }
//   * the admin (signed in): { customer_id, … }
//
// POST { action: 'list' }                         → cards, auto-pay first
// POST { action: 'add', token, name, consent }    → save a new card (no charge);
//                                                    it becomes the auto-pay card
// POST { action: 'default', card_id }             → make this the auto-pay card
// POST { action: 'delete', card_id }              → remove a card from TD — only
//      when the family has 2+ cards, and never the auto-pay card
//
// Secrets: TD_MERCHANT_ID / TD_TEST_MERCHANT_ID and TD_PROFILES_PASSCODE /
// TD_TEST_PROFILES_PASSCODE (same as td-pay).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const API_BASES = ['https://api.bam.shift4api.net/v1', 'https://api.na.bambora.com/v1'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const CARD_TYPE: Record<string, string> = { VI: 'Visa', MC: 'Mastercard', AM: 'Amex', NN: 'Discover' };
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function profilesReady(mode: string) {
  return !!(Deno.env.get(mode === 'live' ? 'TD_PROFILES_PASSCODE' : 'TD_TEST_PROFILES_PASSCODE') || '').trim();
}
function profileAuth(mode: string) {
  const live = mode === 'live';
  const id = (Deno.env.get(live ? 'TD_MERCHANT_ID' : 'TD_TEST_MERCHANT_ID') || '').trim();
  const pass = (Deno.env.get(live ? 'TD_PROFILES_PASSCODE' : 'TD_TEST_PROFILES_PASSCODE') || '').trim();
  if (!id || !pass) throw new Error(`Saving cards isn't set up yet for the ${live ? 'live' : 'test'} account.`);
  return 'Passcode ' + btoa(`${id}:${pass}`);
}

// Same gateway call as td-pay: new Shift4 host first, then the legacy one.
async function api(path: string, method: string, auth: string, body?: Record<string, unknown>, timeoutMs = 20000) {
  let lastErr: unknown = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (_e) {
        lastErr = `${res.status} from ${base}${path}`;
        continue;
      }
      return { status: res.status, okHttp: res.ok, data };
    } catch (e) {
      if (method === 'POST') throw Object.assign(new Error('timeout'), { timeout: true });
      lastErr = e;
    }
  }
  throw new Error('Could not reach the payment gateway: ' + String(lastErr));
}
const errMsg = (d: any, dflt: string) => d?.message || d?.details?.[0]?.message || dflt;

async function saveProfile(mode: string, token: string, name: string, email: string, c: any) {
  const auth = profileAuth(mode);
  const { data: kids } = await admin.from('students').select('name, status').eq('customer_id', c.id);
  const names: string[] = (kids || []).filter((k: any) => k.status !== 'withdrawn').map((k: any) => String(k.name || '').trim()).filter(Boolean);
  const stamp = Date.now().toString(36).toUpperCase();
  const base = (names[0] || c.name || 'FAMILY').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ourCode = (base.slice(0, 32 - stamp.length) + stamp).slice(0, 32);
  const comments = `${names.length ? `Students: ${names.join(', ')} · ` : ''}Portal family: ${c.name || ''}`.slice(0, 250);
  let r: any;
  try {
    r = await api('/profiles', 'POST', auth, { customer_code: ourCode, token: { name, code: token }, billing: { name, email_address: email || undefined }, comments, validate: false }, 45000);
  } catch (e: any) {
    if (!e?.timeout) throw e;
    const chk = await api(`/profiles/${ourCode}`, 'GET', auth, undefined, 20000).catch(() => null);
    if (!chk?.okHttp) throw new Error('The card could not be saved (the payment gateway did not answer). Nothing was charged — please try again.');
    r = { okHttp: true, data: { customer_code: ourCode } };
  }
  const code = r.data?.customer_code;
  if (!r.okHttp || !code) {
    const m = errMsg(r.data, 'The card could not be saved.');
    throw new Error(/duplicate/i.test(m) ? 'This card is already saved. Choose it below, or add a different card.' : m);
  }
  let card: any = {};
  try {
    const cc = await api(`/profiles/${code}/cards`, 'GET', auth);
    card = (cc.data?.card || cc.data?.cards || [])[0] || {};
  } catch (_e) { /* nice-to-have */ }
  const last4 = String(card.number || '').replace(/\D/g, '').slice(-4);
  const exp = card.expiry_month && card.expiry_year ? `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year).slice(-2)}` : '';
  return { code, last4, exp, type: CARD_TYPE[card.card_type] || card.card_type || '' };
}

async function deleteProfile(code: string, mode: string) {
  try {
    const d = await api(`/profiles/${code}`, 'DELETE', profileAuth(mode === 'live' ? 'live' : 'test'));
    return d.okHttp || d.status === 404;
  } catch (_e) {
    return false;
  }
}

async function isAdminCaller(req: Request) {
  const caller = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
  const { data } = await caller.rpc('is_admin');
  return data === true;
}

const cardOut = (x: any) => ({ id: x.id, last4: x.last4, expiry: x.expiry, type: x.card_type, mode: x.profile_mode, saved_at: x.saved_at, is_default: x.is_default });

async function listCards(customerId: string) {
  const { data } = await admin.from('customer_cards').select('*').eq('customer_id', customerId).is('removed_at', null).order('is_default', { ascending: false }).order('saved_at', { ascending: false });
  return data || [];
}

// Make a wallet card the auto-pay card: copy it into customers.card_* (the
// trigger then flags it as the default in the wallet).
async function makeDefault(c: any, card: any, extra: Record<string, unknown> = {}) {
  await admin
    .from('customers')
    .update({
      card_profile_code: card.profile_code,
      card_profile_mode: card.profile_mode,
      card_series_id: null,
      card_last4: card.last4,
      card_expiry: card.expiry,
      card_type: card.card_type,
      card_saved_at: card.saved_at || new Date().toISOString(),
      card_consent: card.consent,
      card_declined_at: null,
      card_decline_message: null,
      card_declined_invoice_id: null,
      card_decline_emailed_at: null,
      card_decline_reminded_at: null,
      ...extra,
    })
    .eq('id', c.id);
}

async function tellDojang(s: any, subject: string, message: string) {
  if (s?.email) await admin.from('email_queue').insert({ type: 'broadcast', recipient_email: s.email, payload: { subject, message } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const { data: s } = await admin.from('invoice_settings').select('email, online_pay, online_pay_mode').eq('id', 1).maybeSingle();
    const mode = s?.online_pay_mode === 'live' ? 'live' : 'test';

    // Whose cards?
    let c: any = null;
    let byAdmin = false;
    if (b.card_token) {
      if (!/^[0-9a-f-]{36}$/i.test(String(b.card_token))) return json({ error: 'This link is not valid. Please contact the Dojang.' }, 404);
      const { data } = await admin.from('customers').select('*').eq('card_link_token', b.card_token).maybeSingle();
      if (!data || data.active === false) return json({ error: 'This link is not valid. Please contact the Dojang.' }, 404);
      c = data;
    } else if (b.customer_id) {
      if (!(await isAdminCaller(req))) return json({ error: 'Admins only' }, 403);
      const { data } = await admin.from('customers').select('*').eq('id', b.customer_id).maybeSingle();
      if (!data) return json({ error: 'Family not found' }, 404);
      c = data;
      byAdmin = true;
    } else return json({ error: 'Missing family' }, 400);

    const cards = await listCards(c.id);
    const result = async () => ({ cards: (await listCards(c.id)).map(cardOut), enabled: !!s?.online_pay && profilesReady(mode), mode });

    if (b.action === 'list') return json(await result());

    if (b.action === 'add') {
      if (!s?.online_pay || !profilesReady(mode)) return json({ error: 'Saving a card online is not available right now. Please contact the Dojang.' }, 400);
      const token = String(b.token || '');
      if (!token) return json({ error: 'Card details are missing.' }, 400);
      // same brake as the pay page: many failed tries → pause
      const { count } = await admin.from('pay_attempts').select('id', { count: 'exact', head: true }).eq('invoice_id', c.id).gte('created_at', ago(3600e3));
      if ((count || 0) >= 5) return json({ error: 'Too many unsuccessful attempts. Please try again in an hour or contact the Dojang.' }, 429);
      const name = String(b.name || c.name || '').slice(0, 64);
      let saved: any;
      try {
        saved = await saveProfile(mode, token, name, String(c.email || '').split(/[,;\s]/)[0] || '', c);
      } catch (e) {
        await admin.from('pay_attempts').insert({ invoice_id: c.id, message: ('Card not saved: ' + String((e as Error).message || e)).slice(0, 300) });
        return json({ error: String((e as Error).message || e) }, 400);
      }
      const consent = `${String(b.consent || '').slice(0, 1800)} — agreed online by ${name} on ${new Date().toISOString()}`;
      const { data: row } = await admin
        .from('customer_cards')
        .insert({ customer_id: c.id, profile_code: saved.code, profile_mode: mode, last4: saved.last4 || null, expiry: saved.exp || null, card_type: saved.type || null, saved_at: new Date().toISOString(), consent })
        .select()
        .single();
      const legacy = !c.card_profile_code && !c.rb_account_id;
      await makeDefault(c, row, { card_legacy_rb_pending: legacy || !!c.card_legacy_rb_pending, ...(mode === 'live' ? { payment_type: 'preauth' } : {}) });
      await tellDojang(
        s,
        `Card added — ${c.name}`,
        `${c.name} added a card (${saved.type || 'card'} ending ${saved.last4 || '????'}); it is now their card for automatic tuition.${c.card_profile_code ? ` Their other saved card (${c.card_type || 'card'} ending ${c.card_last4 || '????'}) is kept and can be chosen again.` : ''} Nothing was charged.${legacy ? `\n\nBefore their next billing date, close their old Recurring Billing account in TD Online Mart so they aren't charged twice, then tick "Old TD Recurring Billing is closed" on the family in the portal (Customers). Automatic charges start only after that.` : ''}`
      );
      return json({ ok: true, saved: { last4: saved.last4, type: saved.type }, ...(await result()) });
    }

    const card = cards.find((x: any) => x.id === b.card_id);
    if (!card) return json({ error: 'Card not found.' }, 404);

    if (b.action === 'default') {
      if (!card.is_default) {
        await makeDefault(c, card);
        if (!byAdmin) await tellDojang(s, `Auto-pay card changed — ${c.name}`, `${c.name} chose ${card.card_type || 'card'} ending ${card.last4 || '????'} for automatic tuition.`);
      }
      return json({ ok: true, ...(await result()) });
    }

    if (b.action === 'delete') {
      if (cards.length < 2) return json({ error: 'This is the only saved card, so it can’t be removed. Add another card first.' }, 400);
      if (card.is_default) return json({ error: 'This is the card used for tuition. Choose another card for tuition first, then remove this one.' }, 400);
      if (!(await deleteProfile(card.profile_code, card.profile_mode || mode))) return json({ error: 'The card could not be removed right now. Please try again.' }, 400);
      await admin.from('customer_cards').update({ removed_at: new Date().toISOString(), is_default: false }).eq('id', card.id);
      if (!byAdmin) await tellDojang(s, `Card removed — ${c.name}`, `${c.name} removed a saved card (${card.card_type || 'card'} ending ${card.last4 || '????'}). Their card for tuition is unchanged.`);
      return json({ ok: true, ...(await result()) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
