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
//   charge   { invoice_ids }                    → charge each family's saved card for the invoice balance (admin)
//   autobill {}                                 → daily automatic tuition (pg_cron): invoice + charge saved-card
//                                                  families whose billing date is today (once a day, live only)
//
// "pay" with auto: true (+ a second token rb_token) also creates a TD Recurring
// Billing account for the tuition on this invoice, so TD charges it every
// period from then on — the same way the dojang's existing recurring accounts work.
//
// "pay" with save_card: true saves the card as a Secure Payment Profile
// (card on file, first_recurring) so later tuition can be charged with "charge"
// (subsequent_recurring). Profiles need TD_PROFILES_PASSCODE / TD_TEST_PROFILES_PASSCODE.
//
// Secrets: TD_MERCHANT_ID, TD_PAYMENT_PASSCODE (live),
//          TD_TEST_MERCHANT_ID, TD_TEST_PAYMENT_PASSCODE (test).
// Which pair is used comes from invoice_settings.online_pay_mode. In test mode
// nothing is recorded in the portal (the invoice stays unpaid), so any real
// invoice's pay link can be tried safely with Worldline's test cards.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { proposeInvoices, invoiceHeader, calcTotals, lineAmount, addDaysISO } from './billing.js';

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

// Saved cards (Payment Profiles) are used for automatic tuition when the
// account's profiles passcode is set; otherwise TD Recurring Billing.
function profilesReady(mode: string) {
  return !!(Deno.env.get(mode === 'live' ? 'TD_PROFILES_PASSCODE' : 'TD_TEST_PROFILES_PASSCODE') || '').trim();
}

function profileAuth(mode: string) {
  const live = mode === 'live';
  const id = (Deno.env.get(live ? 'TD_MERCHANT_ID' : 'TD_TEST_MERCHANT_ID') || '').trim();
  const pass = (Deno.env.get(live ? 'TD_PROFILES_PASSCODE' : 'TD_TEST_PROFILES_PASSCODE') || '').trim();
  if (!id || !pass) throw new Error(`Saving cards isn't set up yet for the ${live ? 'live' : 'test'} account (Payment Profiles passcode missing).`);
  return 'Passcode ' + btoa(`${id}:${pass}`);
}

// Calls the gateway; tries the new Shift4 host first, then the legacy Bambora one.
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
        // Not JSON (e.g. an HTML 404 page): this host doesn't serve that path — try the next one.
        console.log('gateway non-json', base, path, res.status, text.slice(0, 120));
        lastErr = `${res.status} from ${base}${path}`;
        continue;
      }
      return { status: res.status, okHttp: res.ok, data };
    } catch (e) {
      console.log('gateway error', base, path, String(e));
      // Never re-send a payment or a new profile after a timeout: it may already have gone through.
      if (path === '/payments') throw new Error('The payment gateway did not answer in time. Please check TD Online Mart before trying again.');
      if (method === 'POST') throw Object.assign(new Error('timeout'), { timeout: true });
      lastErr = e; // network / DNS / timeout: try the next host
    }
  }
  throw new Error('Could not reach the payment gateway: ' + String(lastErr));
}
async function gateway(mode: string, body: Record<string, unknown>) {
  const r = await api('/payments', 'POST', creds(mode).auth, body);
  return { ok: r.okHttp && String(r.data.approved) === '1', status: r.status, data: r.data };
}
const errMsg = (d: any, dflt: string) => d?.message || d?.details?.[0]?.message || dflt;
const CARD_TYPE: Record<string, string> = { VI: 'Visa', MC: 'Mastercard', AM: 'Amex', NN: 'Discover' };

// Saves the one-time card token as a Secure Payment Profile; returns its code and card details.
async function saveProfile(mode: string, token: string, name: string, email: string, inv: any) {
  const auth = profileAuth(mode);
  // Our own profile code, so a slow/timed-out create can be checked afterwards.
  const ourCode = (String(inv.customer_id || '').replace(/-/g, '').slice(0, 24) + Date.now().toString(36)).slice(0, 32).toUpperCase();
  let r: any;
  try {
    r = await api('/profiles', 'POST', auth, {
      customer_code: ourCode,
      token: { name, code: token },
      billing: { name, email_address: email || undefined },
      comments: `${inv.customer_name || ''}`.slice(0, 100),
      validate: false,
    }, 45000);
  } catch (e: any) {
    if (!e?.timeout) throw e;
    // The gateway was slow: see whether the profile was created anyway.
    const chk = await api(`/profiles/${ourCode}`, 'GET', auth, undefined, 20000).catch(() => null);
    if (!chk?.okHttp) throw new Error('The card could not be saved (the payment gateway did not answer). Nothing was charged — please try again.');
    r = { okHttp: true, data: { customer_code: ourCode } };
  }
  const code = r.data?.customer_code;
  if (!r.okHttp || !code) {
    const m = errMsg(r.data, 'The card could not be saved.');
    throw new Error(/duplicate/i.test(m) ? 'This card is already saved with the Dojang. Please pay without saving it, or contact the Dojang to update your saved card.' : m);
  }
  let card: any = {};
  try {
    const c = await api(`/profiles/${code}/cards`, 'GET', auth);
    card = (c.data?.card || c.data?.cards || [])[0] || {};
  } catch (_e) { /* details are nice-to-have */ }
  const last4 = String(card.number || '').replace(/\D/g, '').slice(-4);
  const exp = card.expiry_month && card.expiry_year ? `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year).slice(-2)}` : '';
  return { code, last4, exp, type: CARD_TYPE[card.card_type] || card.card_type || '' };
}

// Records an approved charge on the invoice and emails the receipt.
async function recordPayment(s: any, inv: any, t: any, amount: number, note: string, toEmail?: string) {
  const methods: string[] = s.payment_methods || [];
  const cardName = CARD_METHOD[t.card?.card_type] || '';
  const method = note.startsWith('Saved card') && methods.includes('Pre-Authorized Credit Card') ? 'Pre-Authorized Credit Card' : cardName && methods.includes(cardName) ? cardName : 'Other';
  const { data: pay, error } = await admin
    .from('invoice_payments')
    .insert({
      invoice_id: inv.id,
      customer_id: inv.customer_id || null,
      payment_date: todayEdm(),
      method,
      amount,
      reference: `${note} ${t.card?.last_four ? '···' + t.card.last_four : ''} auth ${t.auth_code || ''}`.trim(),
      gateway_txn: String(t.id || ''),
      notes: note,
    })
    .select()
    .single();
  if (error) {
    console.error('record failed', inv.invoice_number, t.id, error);
    if (s.email) await admin.from('email_queue').insert({ type: 'broadcast', recipient_email: s.email, payload: { subject: `[Action needed] Card payment for invoice #${inv.invoice_number} was charged but not recorded`, message: `Transaction ${t.id}, amount ${amount}. Please record it by hand in the portal.\n\n${error.message}` } });
    return null;
  }
  const to = toEmail || inv.customer_email;
  if (to) await admin.from('email_queue').insert({ type: 'receipt', recipient_email: to, payload: { payment_id: pay.id } });
  return pay;
}

// Recurring Billing (TD charges the card itself on a schedule). Uses the
// legacy form API: process_transaction.asp with trnRecurring=1.
const RB_HOSTS = ['https://api.bam.shift4api.net', 'https://api.na.bambora.com'];
const mmddyyyy = (iso: string) => `${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(0, 4)}`;
async function createRecurring(mode: string, o: { token: string; amount: number; months: number; firstBilling: string; name: string; email?: string; order: string; comments?: string }) {
  const live = mode === 'live';
  const id = (Deno.env.get(live ? 'TD_MERCHANT_ID' : 'TD_TEST_MERCHANT_ID') || '').trim();
  const pass = (Deno.env.get(live ? 'TD_PAYMENT_PASSCODE' : 'TD_TEST_PAYMENT_PASSCODE') || '').trim();
  const form = new URLSearchParams({
    requestType: 'BACKEND',
    merchant_id: id,
    passcode: pass,
    trnType: 'P',
    trnOrderNumber: o.order.slice(0, 30),
    trnAmount: o.amount.toFixed(2),
    singleUseToken: o.token,
    trnCardOwner: o.name.slice(0, 64),
    ordName: o.name.slice(0, 64),
    ordEmailAddress: o.email || '',
    trnRecurring: '1',
    rbBillingPeriod: 'M',
    rbBillingIncrement: String(o.months),
    rbCharge: '0',
    rbFirstBilling: mmddyyyy(o.firstBilling),
    trnComments: (o.comments || '').slice(0, 200),
  });
  // Accounts with "Require hash validation" on: hashValue = SHA-1 of the
  // request string followed by the account's hash key (secret TD_HASH_KEY).
  const hashKey = (Deno.env.get(live ? 'TD_HASH_KEY' : 'TD_TEST_HASH_KEY') || '').trim();
  let bodyStr = form.toString();
  if (hashKey) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(bodyStr + hashKey));
    bodyStr += '&hashValue=' + [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  let lastErr: unknown = null;
  for (const host of RB_HOSTS) {
    try {
      const res = await fetch(`${host}/scripts/process_transaction.asp`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: bodyStr, signal: AbortSignal.timeout(45000) });
      const text = await res.text();
      if (!/trnApproved=|messageId=|rbAccountId=/i.test(text)) {
        console.log('rb non-api', host, res.status, text.slice(0, 160));
        lastErr = `${res.status} from ${host}`;
        continue;
      }
      const r = Object.fromEntries(new URLSearchParams(text.trim()));
      return r as Record<string, string>;
    } catch (e) {
      console.log('rb error', host, String(e));
      throw new Error('The payment gateway did not answer in time. Please check TD Online Mart (Recurring Billing) before trying again.');
    }
  }
  throw new Error('Could not reach Recurring Billing: ' + String(lastErr));
}

// Automatic tuition plan for an invoice: its tuition (+ family discount) lines
// with GST, repeating every plan period after the cycle this invoice covers.
async function tuitionPlan(inv: any) {
  const { data: lines } = await admin.from('invoice_lines').select('amount, taxable, line_kind, cycle_start, student_id').eq('invoice_id', inv.id);
  const t = (lines || []).filter((l: any) => l.line_kind === 'tuition' || l.line_kind === 'discount');
  const starts = t.map((l: any) => l.cycle_start).filter(Boolean).sort();
  if (!t.some((l: any) => l.line_kind === 'tuition') || !starts.length) return null;
  const ids = [...new Set(t.map((l: any) => l.student_id).filter(Boolean))];
  const { data: st } = ids.length ? await admin.from('students').select('plan').in('id', ids) : { data: [] };
  const months = (st || []).some((x: any) => /3/.test(String(x.plan || ''))) ? 3 : 1;
  const rate = Number(inv.gst_rate ?? 5) / 100;
  const amount = r2(t.reduce((n: number, l: any) => n + Number(l.amount) * (l.taxable ? 1 + rate : 1), 0));
  if (!(amount > 0)) return null;
  // Next charge: same day of month, `months` after the cycle start (clamped to month end).
  const [y, m, d] = String(starts[0]).slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  let first = target.toISOString().slice(0, 10);
  if (first <= todayEdm()) {
    const t2 = new Date(first + 'T00:00:00Z');
    t2.setUTCMonth(t2.getUTCMonth() + months);
    first = t2.toISOString().slice(0, 10);
  }
  return { amount, months, first };
}

// Automatic tuition is offered only to a new family (no payments yet and no
// recurring account), so existing TD recurring accounts are never duplicated.
// It is required when the family pays by pre-authorized credit card.
async function autoOffer(inv: any) {
  if (!inv.customer_id) return { plan: null, required: false };
  const [{ data: c }, { count }] = await Promise.all([
    admin.from('customers').select('payment_type, rb_account_id, card_profile_code, card_declined_at, card_last4').eq('id', inv.customer_id).maybeSingle(),
    admin.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('customer_id', inv.customer_id),
  ]);
  // Saved card was declined: offer to replace it with the card used now.
  if (c?.card_profile_code && c.card_declined_at) {
    const plan = await tuitionPlan(inv);
    return { plan: plan ? { ...plan, replace: c.card_last4 || 'saved' } : null, required: false };
  }
  if (c?.rb_account_id || c?.card_profile_code || (count || 0) > 0) return { plan: null, required: false };
  const plan = await tuitionPlan(inv);
  return { plan, required: !!plan && (c?.payment_type || 'preauth') === 'preauth' };
}

// Charges a family's saved card for one invoice's balance (records + receipt in live mode).
async function chargeOne(s: any, mode: string, id: string) {
  const { data: inv } = await admin.from('invoice_summary').select('*').eq('id', id).maybeSingle();
  if (!inv || inv.voided) return { id, error: 'Invoice not found' };
  const balance = r2(inv.balance);
  if (!(balance > 0.004)) return { id, number: inv.invoice_number, skipped: 'already paid' };
  const { data: c } = await admin.from('customers').select('id, name, card_profile_code, card_profile_mode, card_series_id, card_declined_at').eq('id', inv.customer_id).maybeSingle();
  if (!c?.card_profile_code || c.card_profile_mode !== mode) return { id, number: inv.invoice_number, customer: inv.customer_name, error: 'No saved card' };
  let r;
  try {
    r = await gateway(mode, {
      order_number: `INV${inv.invoice_number}-${Date.now().toString(36)}`.slice(0, 30),
      amount: balance,
      payment_method: 'payment_profile',
      payment_profile: { customer_code: c.card_profile_code, card_id: 1, complete: true },
      card_on_file: c.card_series_id ? { type: 'subsequent_recurring', series_id: Number(c.card_series_id) || c.card_series_id } : { type: 'subsequent_recurring' },
      comments: `Invoice #${inv.invoice_number} (tuition)`,
    });
  } catch (e) {
    return { id, number: inv.invoice_number, customer: inv.customer_name, error: String((e as Error).message || e) };
  }
  if (!r.ok) {
    const msg = errMsg(r.data, 'Declined');
    await admin.from('customers').update({ card_declined_at: new Date().toISOString(), card_decline_message: msg.slice(0, 300), card_declined_invoice_id: id, card_decline_emailed_at: null, card_decline_reminded_at: null }).eq('id', c.id);
    return { id, number: inv.invoice_number, customer: inv.customer_name, declined: msg };
  }
  const t = r.data;
  if (c.card_declined_at) await admin.from('customers').update({ card_declined_at: null, card_decline_message: null, card_declined_invoice_id: null, card_decline_emailed_at: null, card_decline_reminded_at: null }).eq('id', c.id);
  if (mode === 'test') return { id, number: inv.invoice_number, customer: inv.customer_name, approved: true, test: true, amount: balance };
  const pay = await recordPayment(s, inv, t, balance, 'Saved card (automatic tuition)');
  return { id, number: inv.invoice_number, customer: inv.customer_name, approved: true, recorded: !!pay, amount: balance };
}

// Daily automatic tuition: same rules as the Billing page's pre-authorized
// run, for families with a saved card. Billing dates from the last 3 days are
// included (in case a run was missed), never ones before the card was saved.
async function autoBill(_s: any, mode: string, today: string, dry = false): Promise<any> {
  const { data: settings } = await admin.from('invoice_settings').select('*').eq('id', 1).single();
  const { data: custs } = await admin.from('customers').select('*').not('card_profile_code', 'is', null).eq('card_profile_mode', mode);
  const cards = (custs || []).filter((c: any) => c.payment_type !== 'manual');
  if (!cards.length) return dry ? [] : { charged: [], problems: [] };
  const { data: students } = await admin.from('students').select('*').in('customer_id', cards.map((c: any) => c.id));
  const st = students || [];
  const { data: lines } = st.length
    ? await admin.from('invoice_lines').select('student_id, cycle_start, line_kind, amount, invoices!inner(voided)').in('student_id', st.map((x: any) => x.id)).gte('cycle_start', addDaysISO(today, -400))
    : { data: [] };
  const live = (lines || []).filter((l: any) => !l.invoices?.voided);
  const invoiced = new Set(live.filter((l: any) => l.line_kind === 'tuition').map((l: any) => `${l.student_id}|${l.cycle_start}`));
  const used: Record<string, number> = {};
  live.filter((l: any) => l.line_kind === 'subsidy').forEach((l: any) => {
    const x = st.find((y: any) => y.id === l.student_id);
    if (!x || (x.subsidy_start_date && l.cycle_start < x.subsidy_start_date)) return;
    used[l.student_id] = (used[l.student_id] || 0) - Number(l.amount || 0);
  });
  const stu = st.map((x: any) => (used[x.id] ? { ...x, _subsidyUsed: used[x.id] } : x));
  // First automatic charge at least a week after the card was saved (the first cycle was paid online).
  const firstAuto: Record<string, string> = Object.fromEntries(cards.map((c: any) => [c.id, addDaysISO(new Date(c.card_saved_at || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' }), 7)]));
  const props = proposeInvoices({ students: stu, customers: cards, invoicedCycles: invoiced, today, settings })
    .filter((p: any) => p.customer && p.due_date >= addDaysISO(today, -3) && p.due_date <= today && p.due_date >= firstAuto[p.customer.id]);
  if (dry) return props;
  const charged: any[] = [];
  const problems: any[] = [];
  for (const p of props) {
    try {
      const h = invoiceHeader(p, settings, today);
      const clean = p.lines.filter((l: any) => (l.description || '').trim() || Number(l.unit_price));
      const tot = calcTotals(clean, h.gst_rate);
      const { data: inv, error } = await admin
        .from('invoices')
        .insert({ ...h, customer_email: h.customer_email || null, customer_address: h.customer_address || null, notes: 'Automatic tuition (saved card)', subtotal: tot.subtotal, gst_amount: tot.gst, total: tot.total })
        .select()
        .single();
      if (error) throw error;
      const { error: le } = await admin.from('invoice_lines').insert(
        clean.map((l: any, i: number) => ({ invoice_id: inv.id, position: i, student_id: l.student_id || null, cycle_start: l.cycle_start || null, line_kind: l.line_kind || null, item_name: l.item_name || null, description: l.description || '', quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, taxable: !!l.taxable, amount: lineAmount(l) }))
      );
      if (le) throw le;
      const refee = [...new Set(clean.filter((l: any) => l.line_kind === 'reregistration').map((l: any) => l.student_id))];
      if (refee.length) await admin.from('students').update({ reregistration_fee_due: false }).in('id', refee);
      const { data: credit } = await admin.rpc('apply_customer_credit', { p_invoice: inv.id, p_amount: null });
      if (r2(tot.total - Number(credit || 0)) <= 0.004) {
        charged.push({ customer: p.customer.name, number: inv.invoice_number, amount: 0, credit: Number(credit || 0) });
        continue;
      }
      const res: any = await chargeOne(_s, mode, inv.id);
      if (res.approved) charged.push({ customer: p.customer.name, number: inv.invoice_number, amount: res.amount });
      else problems.push({ customer: p.customer.name, number: inv.invoice_number, declined: res.declined, error: res.error });
    } catch (e: any) {
      problems.push({ customer: p.customer?.name || '?', error: String(e?.message || e).slice(0, 300) });
    }
  }
  return { charged, problems };
}

async function isAdminCaller(req: Request) {
  const caller = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
  const { data } = await caller.rpc('is_admin');
  return data === true;
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
        // A different test number can be passed (still the TEST account — never real money).
        card: { name: 'Portal Test', number: /^\d{13,19}$/.test(String(b.number || '')) ? String(b.number) : '4030000010001234', expiry_month: '12', expiry_year: '30', cvd: '123', complete: true },
      });
      return json({ card_type: r.data?.card?.card_type || null, ok: r.ok, status: r.status, message: r.data?.message || r.data?.details?.[0]?.message || '', id: r.data?.id || null, live_secrets_set: !!(Deno.env.get('TD_MERCHANT_ID') && Deno.env.get('TD_PAYMENT_PASSCODE')), test_profiles_secret_set: !!Deno.env.get('TD_TEST_PROFILES_PASSCODE'), live_profiles_secret_set: profilesReady('live') });
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
      const offer = await autoOffer(inv);
      (summary as any).auto = offer.plan;
      (summary as any).auto_required = offer.required;
      (summary as any).auto_method = profilesReady(mode) ? 'card' : 'rb';
      if (b.action === 'invoice') return json(summary);

      // ── pay ──
      if (!s.online_pay) return json({ error: 'Online payment is not turned on. Please contact the Dojang.' }, 400);
      if (!(balance > 0.004)) return json({ error: 'This invoice is already paid. Thank you!', paid: true }, 400);
      const token = String(b.token || '');
      if (!token) return json({ error: 'Card details are missing.' }, 400);
      const useProfile = !!offer.plan && !!b.auto && profilesReady(mode);
      if (offer.required && !(b.auto && (useProfile || b.rb_token))) return json({ error: 'Please tick "Pay tuition automatically with this card" — pre-authorized card memberships are charged automatically.' }, 400);
      const name = String(b.name || inv.customer_name || '').slice(0, 64);
      const email = String(b.email || inv.customer_email || '').split(/[,;\s]/)[0] || '';
      const orderNo = `INV${inv.invoice_number}-${Date.now().toString(36)}`.slice(0, 30);
      let saved: any = null;
      let r;
      if ((b.save_card || useProfile) && inv.customer_id) {
        // Save the card first, then make this payment the first one of the card-on-file series.
        try {
          saved = await saveProfile(mode, token, name, email, inv);
        } catch (e) {
          return json({ error: String((e as Error).message || e) }, 400);
        }
        r = await gateway(mode, {
          order_number: orderNo,
          amount: balance,
          payment_method: 'payment_profile',
          payment_profile: { customer_code: saved.code, card_id: 1, complete: true },
          card_on_file: { type: 'first_recurring' },
          comments: `Invoice #${inv.invoice_number}`,
        });
      } else {
        r = await gateway(mode, {
          order_number: orderNo,
          amount: balance,
          payment_method: 'token',
          token: { code: token, name, complete: true },
          billing: { name, email_address: email || undefined },
          comments: `Invoice #${inv.invoice_number}`,
        });
      }
      if (!r.ok) {
        const msg = r.data?.message || r.data?.details?.[0]?.message || 'The card was declined.';
        console.log('declined', inv.invoice_number, r.status, JSON.stringify(r.data).slice(0, 300));
        return json({ error: `Payment not approved: ${msg}` }, 402);
      }
      const t = r.data;
      // Automatic tuition: create a TD Recurring Billing account with the second token.
      let auto: any = null;
      if (saved && useProfile) auto = { ...offer.plan, saved: true };
      else if (b.auto && b.rb_token && offer.plan) {
        const plan = offer.plan;
        if (plan) {
          try {
            const rb = await createRecurring(mode, { token: String(b.rb_token), amount: plan.amount, months: plan.months, firstBilling: plan.first, name, email, order: `RB${inv.invoice_number}-${Date.now().toString(36)}`, comments: `${inv.customer_name} tuition (portal)` });
            if (rb.trnApproved === '1' && rb.rbAccountId) {
              auto = { ...plan, account: rb.rbAccountId };
              await admin
                .from('customers')
                .update({
                  rb_account_id: rb.rbAccountId,
                  rb_mode: mode,
                  rb_amount: plan.amount,
                  rb_months: plan.months,
                  rb_first_billing: plan.first,
                  rb_card_last4: t.card?.last_four || null,
                  rb_created_at: new Date().toISOString(),
                  rb_consent: String(b.consent || '').slice(0, 2000) || null,
                  ...(mode === 'live' ? { payment_type: 'preauth' } : {}),
                })
                .eq('id', inv.customer_id);
            } else {
              auto = { error: rb.messageText || 'Automatic payments could not be set up.' };
            }
          } catch (e) {
            auto = { error: String((e as Error).message || e) };
          }
          if (auto?.error && s.email) await admin.from('email_queue').insert({ type: 'broadcast', recipient_email: s.email, payload: { subject: `[Action needed] Automatic tuition not set up — ${inv.customer_name}`, message: `${inv.customer_name} paid invoice #${inv.invoice_number} online and asked for automatic tuition, but the TD Recurring Billing account could not be created: ${auto.error}\n\nPlease set it up in TD Online Mart or ask the family to save their card again.` } });
        }
      }
      if (saved) {
        // Remember the saved card on the family (both modes, tagged with the mode).
        await admin
          .from('customers')
          .update({
            card_profile_code: saved.code,
            card_profile_mode: mode,
            card_series_id: t.card_on_file?.series_id ? String(t.card_on_file.series_id) : null,
            card_last4: saved.last4 || t.card?.last_four || null,
            card_expiry: saved.exp || null,
            card_type: saved.type || CARD_TYPE[t.card?.card_type] || null,
            card_saved_at: new Date().toISOString(),
            card_consent: String(b.consent || '').slice(0, 2000) || null,
            card_declined_at: null,
            card_decline_message: null,
            card_declined_invoice_id: null,
            card_decline_emailed_at: null,
            card_decline_reminded_at: null,
            ...(mode === 'live' ? { payment_type: 'preauth' } : {}),
          })
          .eq('id', inv.customer_id);
      }
      // Test mode: the charge went to the TD test account only — don't touch the real books.
      if (mode === 'test') return json({ ok: true, approved: true, recorded: false, test: true, saved: !!saved, auto, transaction: t.id, amount: balance, card: t.card?.last_four || '', mode });
      const pay = await recordPayment(s, inv, t, balance, saved ? 'Paid online, card saved for tuition' : 'Paid online (Pay now)', b.email);
      if (!pay) return json({ ok: true, approved: true, recorded: false, transaction: t.id, amount: balance });
      return json({ ok: true, approved: true, recorded: true, saved: !!saved, auto, receipt: pay.receipt_number, amount: balance, card: t.card?.last_four || '', mode });
    }

    if (b.action === 'charge') {
      if (!(await isAdminCaller(req))) return json({ error: 'Admins only' }, 403);
      const ids: string[] = Array.isArray(b.invoice_ids) ? b.invoice_ids.slice(0, 100) : [];
      const results: any[] = [];
      for (const id of ids) results.push(await chargeOne(s, mode, id));
      return json({ mode, results });
    }

    if (b.action === 'autobill') {
      // Dry run: what today's run would invoice (counts only, nothing created or charged).
      if (b.dry) {
        const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? String(b.date) : todayEdm();
        const props = await autoBill(s, mode, day, true);
        return json({ mode, date: day, would_invoice: props.map((p: any) => ({ due: p.due_date, students: p.students.length, total: p.totals.total })) });
      }
      if (!s.online_pay || mode !== 'live') return json({ skipped: 'Online payments are not live.' });
      const today = todayEdm();
      // Once a day: the row is the lock, so a second call (or a retry) does nothing.
      const { error: lockErr } = await admin.from('auto_billing_runs').insert({ run_date: today });
      if (lockErr) return json({ skipped: 'Already ran today.' });
      let out: any;
      try {
        out = await autoBill(s, mode, today);
      } catch (e) {
        out = { error: String((e as Error).message || e).slice(0, 500), charged: [], problems: [] };
      }
      await admin.from('auto_billing_runs').update({ finished_at: new Date().toISOString(), results: out }).eq('run_date', today);
      const problems = [...(out.problems || []), ...(out.error ? [{ customer: 'Automatic tuition run', error: out.error }] : [])];
      if (problems.length && s.email) {
        await admin.from('email_queue').insert({
          type: 'broadcast',
          recipient_email: s.email,
          payload: {
            subject: `[Action needed] Automatic tuition ${today}: ${problems.length} not charged`,
            message: `Charged: ${(out.charged || []).length}\n\nNot charged (the invoices stay unpaid in the portal):\n${problems.map((x: any) => `- ${x.customer}${x.number ? ` (invoice #${x.number})` : ''}: ${x.declined || x.error}`).join('\n')}`,
          },
        });
      }
      return json(out);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err).slice(0, 300) }, 500);
  }
});
