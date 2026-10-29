// Supabase Edge Function: send-emails
//
// Called by database triggers (migration 006) whenever a row is inserted into
// `email_queue` or `welcome_queue`, with a body of { table, record: { id } }.
// Calling it with an empty body sends every queued email that hasn't gone out yet.
//
// The function never trusts what's in the request: it looks the queued row up
// by id with the service role key and only sends rows still marked unsent, so
// only something an admin queued in the portal can ever be emailed. Each row
// is claimed (sent = true) before sending, so it can't go out twice; if the
// send fails the claim is released so it can be retried.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY        — from resend.com
//   RESEND_FROM_ADDRESS   — e.g. "Edmonton Champion Hankook Taekwondo <noreply@yourdomain.com>"
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — provided automatically

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { buildInvoicePdf, invoiceEmailHtml, receiptEmail, refundEmail, fillTemplate } from './invoiceDocs.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_ADDRESS = Deno.env.get('RESEND_FROM_ADDRESS') || 'onboarding@resend.dev';

function tryoutConfirmationEmail(payload: any) {
  const { student_name, date, time, class_name } = payload || {};
  return {
    subject: `[Trial Booking Confirmed] ${student_name}`,
    html: `
      <p>Hi, this confirms ${student_name}'s trial class booking.</p>
      <ul>
        <li>Date: ${date || 'To be announced'}</li>
        <li>Time: ${time || 'To be announced'}</li>
        <li>Class: ${class_name || 'To be announced'}</li>
      </ul>
      <p>We look forward to seeing you. Feel free to reach out with any questions.</p>
    `,
  };
}

function welcomeEmail(studentName: string) {
  return {
    subject: `Welcome, ${studentName}!`,
    html: `
      <p>${studentName}'s registration is complete. Welcome to our dojang family!</p>
      <p>We'll follow up separately with schedule and attendance details.</p>
    `,
  };
}

async function sendEmail(to: string, subject: string, html: string, extra: Record<string, unknown> = {}) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY secret is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html, ...extra }),
  });
  if (!res.ok) throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
}

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function loadSettings() {
  const { data } = await supabase.from('invoice_settings').select('*').eq('id', 1).single();
  return data || {};
}

async function sendInvoice(record: any) {
  const invoiceId = record.payload?.invoice_id;
  const [{ data: inv }, { data: lines }, { data: payments }, { data: refunds }, s] = await Promise.all([
    supabase.from('invoices').select('*, customers(cc_email)').eq('id', invoiceId).single(),
    supabase.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('position'),
    supabase.from('invoice_payments').select('*').eq('invoice_id', invoiceId),
    supabase.from('invoice_refunds').select('*').eq('invoice_id', invoiceId),
    loadSettings(),
  ]);
  if (!inv) throw new Error('Invoice not found: ' + invoiceId);
  const paid = (payments || []).reduce((t: number, p: any) => t + Number(p.amount || 0), 0);
  const balance = Math.max(Number(inv.total) - paid, 0);
  const subject = fillTemplate(s.email_subject || 'Invoice #{number} from {business}', inv, s, balance);
  const message = fillTemplate(s.email_message || 'Please find your invoice attached.', inv, s, balance);
  const pdf = await buildInvoicePdf(inv, lines || [], payments || [], s, refunds || []);
  const extra: Record<string, unknown> = { attachments: [{ filename: `Invoice-${inv.invoice_number}.pdf`, content: toBase64(pdf) }] };
  if (inv.customers?.cc_email) extra.cc = inv.customers.cc_email;
  if (s.email) extra.reply_to = s.email;
  await sendEmail(record.recipient_email, subject, invoiceEmailHtml(inv, lines || [], s, message, balance), extra);
  await supabase.from('invoices').update({ emailed_at: new Date().toISOString() }).eq('id', invoiceId);
}

async function sendReceipt(record: any) {
  const paymentId = record.payload?.payment_id;
  const [{ data: p }, s] = await Promise.all([supabase.from('invoice_payments').select('*, invoices(*), customers(name)').eq('id', paymentId).single(), loadSettings()]);
  if (!p) throw new Error('Payment not found: ' + paymentId);
  const { subject, html } = receiptEmail(p, p.invoices, p.customers?.name || '', s);
  await sendEmail(record.recipient_email, subject, html, s.email ? { reply_to: s.email } : {});
  await supabase.from('invoice_payments').update({ emailed_at: new Date().toISOString() }).eq('id', paymentId);
}

async function sendRefund(record: any) {
  const refundId = record.payload?.refund_id;
  const [{ data: r }, s] = await Promise.all([supabase.from('invoice_refunds').select('*, invoices(*), customers(name)').eq('id', refundId).single(), loadSettings()]);
  if (!r) throw new Error('Refund not found: ' + refundId);
  const { subject, html } = refundEmail(r, r.invoices, r.customers?.name || '', s);
  await sendEmail(record.recipient_email, subject, html, s.email ? { reply_to: s.email } : {});
  await supabase.from('invoice_refunds').update({ emailed_at: new Date().toISOString() }).eq('id', refundId);
}

async function claim(table: string, id: string) {
  const { data } = await supabase.from(table).update({ sent: true }).eq('id', id).eq('sent', false).select().maybeSingle();
  return data;
}

async function release(table: string, id: string) {
  await supabase.from(table).update({ sent: false }).eq('id', id);
}

async function processEmailQueue(record: any) {
  if (record.type === 'tryout_confirmation') {
    const { subject, html } = tryoutConfirmationEmail(record.payload);
    await sendEmail(record.recipient_email, subject, html);
    if (record.payload?.tryout_id) {
      await supabase.from('tryouts').update({ confirmation_sent: true }).eq('id', record.payload.tryout_id);
    }
  } else if (record.type === 'invoice') {
    await sendInvoice(record);
  } else if (record.type === 'receipt') {
    await sendReceipt(record);
  } else if (record.type === 'refund') {
    await sendRefund(record);
  }
}

async function processWelcome(record: any) {
  const { subject, html } = welcomeEmail(record.student_name);
  await sendEmail(record.guardian_email, subject, html);
}

async function processOne(table: string, id: string) {
  const row = await claim(table, id);
  if (!row) return 'skipped';
  try {
    if (table === 'email_queue') await processEmailQueue(row);
    else await processWelcome(row);
    return 'sent';
  } catch (err) {
    await release(table, id);
    throw err;
  }
}

Deno.serve(async (req) => {
  let body: any = {};
  try {
    body = await req.json();
  } catch (_e) {
    /* empty body = send everything pending */
  }
  const results: Record<string, string> = {};
  const errors: string[] = [];
  const jobs: [string, string][] = [];
  if (body?.record?.id && (body.table === 'email_queue' || body.table === 'welcome_queue')) {
    jobs.push([body.table, body.record.id]);
  } else if (!body?.table) {
    for (const table of ['email_queue', 'welcome_queue']) {
      const { data } = await supabase.from(table).select('id').eq('sent', false).limit(50);
      (data || []).forEach((r: any) => jobs.push([table, r.id]));
    }
  }
  for (const [table, id] of jobs) {
    try {
      results[id] = await processOne(table, id);
    } catch (err) {
      console.error(table, id, err);
      errors.push(`${table} ${id}: ${err}`);
    }
  }
  return new Response(JSON.stringify({ results, errors }), { status: errors.length ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
});
