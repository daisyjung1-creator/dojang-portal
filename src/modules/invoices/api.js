import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { PAYMENT_METHODS } from '../../lib/invoiceUtils';
import { calcTotals, lineAmount } from '../../lib/invoiceUtils';

// Supabase returns at most 1000 rows per request; page through to get them all.
export async function fetchAll(makeQuery, pageSize = 1000) {
  let all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) return { data: all, error: null };
  }
}

export async function loadSettings() {
  const { data } = await supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle();
  return data || { business_name: '', gst_rate: 5, default_due_days: 0 };
}

export async function loadCustomers() {
  const { data } = await fetchAll(() => supabase.from('customers').select('*').order('name'));
  return data || [];
}

export async function loadItems() {
  const { data } = await supabase.from('fee_items').select('*').order('sort_order').order('name');
  return (data || []).filter((i) => i.active !== false);
}

export async function loadInvoiceFull(id) {
  const [{ data: invoice }, { data: lines }, { data: payments }, { data: refunds }, { data: credits }] = await Promise.all([
    supabase.from('invoice_summary').select('*').eq('id', id).single(),
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('position'),
    supabase.from('invoice_payments').select('*').eq('invoice_id', id).order('payment_date'),
    supabase.from('invoice_refunds').select('*').eq('invoice_id', id).order('refund_date'),
    supabase.from('credit_applications').select('*').eq('invoice_id', id).order('applied_date'),
  ]);
  if (invoice?.customer_id) {
    const { data: c } = await supabase.from('customers').select('payment_type, card_profile_code, card_profile_mode, card_last4, card_type').eq('id', invoice.customer_id).maybeSingle();
    invoice.payment_type = c?.payment_type || null;
    invoice.saved_card = c?.card_profile_code ? { mode: c.card_profile_mode, last4: c.card_last4, type: c.card_type } : null;
  }
  if (invoice) {
    const { data: t } = await supabase.from('invoices').select('pay_token').eq('id', invoice.id).maybeSingle();
    invoice.pay_token = t?.pay_token || null;
  }
  return { invoice, lines: lines || [], payments: payments || [], refunds: refunds || [], credits: credits || [] };
}

// Saves header + lines. Lines are replaced wholesale (simplest + safe: an
// invoice only has a handful of lines). Returns the saved invoice row.
export async function saveInvoice(form, lines, existingId) {
  const cleanLines = lines.filter((l) => (l.description || '').trim() || Number(l.unit_price));
  const totals = calcTotals(cleanLines, form.gst_rate);
  const header = {
    customer_id: form.customer_id || null,
    customer_name: form.customer_name,
    customer_email: form.customer_email || null,
    customer_address: form.customer_address || null,
    invoice_date: form.invoice_date,
    due_date: form.due_date || null,
    gst_rate: Number(form.gst_rate) || 0,
    notes: form.notes || null,
    subtotal: totals.subtotal,
    gst_amount: totals.gst,
    total: totals.total,
  };
  if (!existingId && form.invoice_number) header.invoice_number = Number(form.invoice_number);

  let invoice;
  if (existingId) {
    const { data, error } = await supabase.from('invoices').update(header).eq('id', existingId).select().single();
    if (error) throw error;
    invoice = data;
    const { error: delErr } = await supabase.from('invoice_lines').delete().eq('invoice_id', existingId);
    if (delErr) throw delErr;
  } else {
    const { data, error } = await supabase.from('invoices').insert(header).select().single();
    if (error) throw error;
    invoice = data;
  }

  if (cleanLines.length) {
    const rows = cleanLines.map((l, i) => ({
      invoice_id: invoice.id,
      position: i,
      fee_item_id: l.fee_item_id || null,
      student_id: l.student_id || null,
      // Tuition lines made from Billing remember which billing cycle they cover.
      cycle_start: l.cycle_start || null,
      line_kind: l.line_kind || null,
      item_name: l.item_name || null,
      description: l.description || '',
      quantity: Number(l.quantity) || 0,
      unit_price: Number(l.unit_price) || 0,
      taxable: !!l.taxable,
      amount: lineAmount(l),
    }));
    const { error } = await supabase.from('invoice_lines').insert(rows);
    if (error) throw error;
  }
  return invoice;
}

// Records a payment for the whole balance of each invoice (e.g. the
// pre-authorized credit card charge), optionally emailing receipts.
export async function payInvoicesInFull(invoices, method, paymentDate, emailReceipts) {
  const done = [];
  for (const inv of invoices) {
    const amount = Number(inv.balance);
    if (!(amount > 0)) continue;
    const { data, error } = await supabase
      .from('invoice_payments')
      .insert({ invoice_id: inv.id, customer_id: inv.customer_id || null, payment_date: paymentDate, method, amount })
      .select()
      .single();
    if (error) throw error;
    if (emailReceipts && inv.customer_email) await queueEmail('receipt', inv.customer_email, { payment_id: data.id });
    done.push(data);
  }
  return done;
}

export const DEFAULT_PREAUTH_NOTE =
  'Your account is set up for pre-authorized credit card payments. If you would like us to charge the amount due ({balance}) to the credit card on file, please reply to this email to approve, and we will process the payment and send you a receipt. If you would rather pay another way (cash, debit or e-transfer), just let us know.';

// Invoice emails to families on pre-authorized card payments get an extra
// paragraph asking them to reply if they'd like the card on file charged.
async function withPreauthNote(payload) {
  if (!payload?.invoice_id || payload.reminder || payload.message) return payload;
  const { data: inv } = await supabase.from('invoice_summary').select('customer_id, balance').eq('id', payload.invoice_id).maybeSingle();
  if (!inv?.customer_id || Number(inv.balance) <= 0.004) return payload;
  const [{ data: c }, { data: s }] = await Promise.all([
    supabase.from('customers').select('payment_type').eq('id', inv.customer_id).maybeSingle(),
    supabase.from('invoice_settings').select('email_message, preauth_note').eq('id', 1).maybeSingle(),
  ]);
  if ((c?.payment_type || 'preauth') !== 'preauth') return payload;
  const note = (s?.preauth_note ?? DEFAULT_PREAUTH_NOTE).trim();
  if (!note) return payload;
  const base = s?.email_message || 'Hi {customer},\n\nPlease find your invoice #{number} attached. Amount due: {balance}.\n\nThank you!';
  // Put the note before the sign-off when the template ends with one.
  const parts = base.split(/\n\s*\n/);
  const last = parts[parts.length - 1];
  const message = parts.length > 1 && last.length < 80 ? [...parts.slice(0, -1), note, last].join('\n\n') : `${base}\n\n${note}`;
  return { ...payload, message, preauth_note: true };
}

export async function queueEmail(type, recipient, payload) {
  if (type === 'invoice') payload = await withPreauthNote(payload);
  const { error } = await supabase.from('email_queue').insert({ type, recipient_email: recipient, payload });
  if (error) throw error;
}

export async function savePayment(form) {
  const row = {
    invoice_id: form.invoice_id || null,
    customer_id: form.customer_id || null,
    payment_date: form.payment_date,
    method: form.method,
    amount: Number(form.amount) || 0,
    reference: form.reference || null,
    notes: form.notes || null,
  };
  if (form.id) {
    const { data, error } = await supabase.from('invoice_payments').update(row).eq('id', form.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('invoice_payments').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function saveRefund(form) {
  const row = {
    invoice_id: form.invoice_id || null,
    payment_id: form.payment_id || null,
    customer_id: form.customer_id || null,
    refund_date: form.refund_date,
    method: form.method,
    amount: Number(form.amount) || 0,
    gst_amount: Number(form.gst_amount) || 0,
    reason: form.reason || null,
  };
  const q = form.id ? supabase.from('invoice_refunds').update(row).eq('id', form.id) : supabase.from('invoice_refunds').insert(row);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}

// Payment methods as set in Invoice Settings (falls back to the defaults).
let methodsCache = null;
export function usePaymentMethods() {
  const [methods, setMethods] = useState(methodsCache || PAYMENT_METHODS);
  useEffect(() => {
    supabase
      .from('invoice_settings')
      .select('payment_methods')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.payment_methods?.length) {
          methodsCache = data.payment_methods;
          setMethods(data.payment_methods);
        }
      });
  }, []);
  return methods;
}
export function clearPaymentMethodsCache() {
  methodsCache = null;
}

// Family account credit (from overpayments) available now.
export async function loadCredit(customerId) {
  if (!customerId) return 0;
  const { data } = await supabase.from('customer_credit').select('credit').eq('customer_id', customerId).maybeSingle();
  return Number(data?.credit || 0);
}

// Use the family's credit on an invoice (up to what's owed). Returns the amount used.
export async function applyCredit(invoiceId, amount = null) {
  const { data, error } = await supabase.rpc('apply_customer_credit', { p_invoice: invoiceId, p_amount: amount });
  if (error) throw error;
  return Number(data || 0);
}

// Charge families' saved cards (TD Online Mart) for these invoices' balances.
// Returns { mode, results: [{ id, number, customer, approved | declined | error, amount }] }.
export async function chargeSavedCards(invoiceIds) {
  const { data, error } = await supabase.functions.invoke('td-pay', { body: { action: 'charge', invoice_ids: invoiceIds } });
  if (error) {
    let m = error.message;
    try {
      m = (await error.context.json())?.error || m;
    } catch (_e) {
      /* keep */
    }
    throw new Error(m);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
