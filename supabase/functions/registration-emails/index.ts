// Supabase Edge Function: registration-emails
//
// Called by a database trigger (migration 039) when a family submits the
// public /join form, with a body of { id } (the registration's id).
// It looks the registration up with the service role key, claims it
// (emailed_at) so it's only sent once, then emails:
//   · the family: thank-you + a PDF copy of the signed agreement
//   · the dojang (invoice settings email): a heads-up with the same PDF
// Calling it with an empty body sends any registration not emailed yet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { buildRegistrationPdf, registrationFamilyEmail, registrationSchoolEmail, registrationPdfName } from './registrationDocs.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_ADDRESS = Deno.env.get('RESEND_FROM_ADDRESS') || 'onboarding@resend.dev';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const splitEmails = (v: unknown) => String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

function textHtml(message: string, s: Record<string, any>) {
  const body = esc(message).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#111">$1</a>');
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#111;max-width:560px;font-size:14px;line-height:1.55">
  <div style="white-space:pre-line">${body}</div>
  <p style="font-size:12px;color:#999;margin-top:24px">${esc([s.business_name, s.phone, s.email].filter(Boolean).join(' · '))}</p>
</div>`;
}

async function sendEmail(toRaw: string, subject: string, html: string, extra: Record<string, unknown> = {}) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY secret is not set');
  const to = splitEmails(toRaw);
  if (!to.length) throw new Error('No valid recipient email: ' + toRaw);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html, ...extra }),
    });
    if (res.ok) return;
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Resend API error: ${res.status} ${text}`);
  }
}

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function processOne(id: string) {
  // Claim it: only one call can flip emailed_at from null.
  const { data: r } = await supabase.from('registrations').update({ emailed_at: new Date().toISOString() }).eq('id', id).is('emailed_at', null).select().maybeSingle();
  if (!r) return 'skipped';
  try {
    const { data: settings } = await supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle();
    const s = settings || {};
    const attachments = [{ filename: registrationPdfName(r), content: toBase64(await buildRegistrationPdf(r)) }];
    const fam = registrationFamilyEmail(r);
    const familyEmail = r.family?.email;
    if (familyEmail) await sendEmail(familyEmail, fam.subject, textHtml(fam.message, s), { attachments, ...(s.email ? { reply_to: s.email } : {}) });
    if (s.email) {
      const sch = registrationSchoolEmail(r);
      try {
        await sendEmail(s.email, sch.subject, textHtml(sch.message, s), { attachments, ...(familyEmail ? { reply_to: familyEmail } : {}) });
      } catch (e) {
        console.error('registration heads-up failed', e);
      }
    }
    await supabase.from('registrations').update({ email_error: null }).eq('id', id);
    return 'sent';
  } catch (err) {
    await supabase.from('registrations').update({ emailed_at: null, email_error: String(err).slice(0, 500) }).eq('id', id);
    throw err;
  }
}

Deno.serve(async (req) => {
  let body: any = {};
  try {
    body = await req.json();
  } catch (_e) {
    /* empty body = send everything not emailed yet */
  }
  const ids: string[] = [];
  if (body?.id) ids.push(String(body.id));
  else {
    const { data } = await supabase.from('registrations').select('id').is('emailed_at', null).order('created_at').limit(20);
    (data || []).forEach((x: any) => ids.push(x.id));
  }
  const results: Record<string, string> = {};
  const errors: string[] = [];
  for (const id of ids) {
    try {
      results[id] = await processOne(id);
    } catch (err) {
      console.error(id, err);
      errors.push(`${id}: ${err}`);
    }
  }
  return new Response(JSON.stringify({ results, errors }), { status: errors.length ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
});
