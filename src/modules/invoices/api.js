import { supabase } from '../../supabaseClient';
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
  const [{ data: invoice }, { data: lines }, { data: payments }, { data: refunds }] = await Promise.all([
    supabase.from('invoice_summary').select('*').eq('id', id).single(),
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('position'),
    supabase.from('invoice_payments').select('*').eq('invoice_id', id).order('payment_date'),
    supabase.from('invoice_refunds').select('*').eq('invoice_id', id).order('refund_date'),
  ]);
  return { invoice, lines: lines || [], payments: payments || [], refunds: refunds || [] };
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

export async function queueEmail(type, recipient, payload) {
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
