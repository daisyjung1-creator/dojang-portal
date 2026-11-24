// Supabase Edge Function: parent-portal
//
// POST { action: 'invite', customer_id, origin }      (admin only)
//   Creates a parent login for every email on the family (if it doesn't have
//   one yet) and emails each a link to set their password.
// POST { action: 'reset', email, origin }              (anyone)
//   Emails a parent a new "set your password" link. Always answers ok, so it
//   can't be used to find out which emails have a login.
// POST { action: 'set_password', password }   (parent, from the emailed link)
//   Sets the password for the login in the Authorization header (the one the
//   emailed link just signed in), on the server — so it never depends on what
//   the browser has stored (e.g. an admin signed in in another tab).
// POST { action: 'absence', student_id, date, class_name, note }   (parent)
// POST { action: 'message', subject, message }                      (parent)
//   Run the checked database functions as the parent (so a parent can only
//   act for their own children), then email the dojang; replying to that
//   email goes straight to the parent.
//
// Emails go out through Resend (RESEND_API_KEY / RESEND_FROM_ADDRESS, the
// same secrets send-emails uses).
//
// The link is <origin>/parent?token_hash=…&type=recovery — the parent page
// signs in with that token and asks for a new password. The login is linked
// to the family through app_metadata (only the server can set it), which the
// new-user trigger turns into a 'parent' profile for that family.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const DEFAULT_ORIGIN = 'https://dojang-portal.netlify.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const splitEmails = (v: unknown) =>
  [...new Set(String(v || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];

// Only our own sites may be used in the link (the main site, its Netlify
// previews / branch sites, or a local test copy).
function safeOrigin(o: unknown) {
  try {
    const u = new URL(String(o || ''));
    const ok = (u.protocol === 'https:' && /(^|--)dojang-portal\.netlify\.app$/.test(u.hostname)) || (u.protocol === 'http:' && u.hostname === 'localhost');
    return ok ? u.origin : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

async function findUser(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function settings() {
  const { data } = await admin.from('invoice_settings').select('business_name, email').eq('id', 1).single();
  return data || {};
}

async function linkFor(email: string, origin: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (error) throw error;
  const hashed = data.properties?.hashed_token;
  if (!hashed) throw new Error('No link token returned');
  return `${origin}/parent?token_hash=${encodeURIComponent(hashed)}&type=recovery`;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Plain text → simple HTML; a line that is only a link becomes a button.
function html(message: string, business: string) {
  const blocks = message.replace(/\r/g, '').trim().split(/\n\s*\n/).map((b) => {
    const line = b.trim();
    if (/^https?:\/\/\S+$/.test(line))
      return `<p style="margin:18px 0"><a href="${esc(line)}" style="background:#BE1C21;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:bold;display:inline-block">Set my password</a></p><p style="font-size:12px;color:#6B6F66;word-break:break-all">${esc(line)}</p>`;
    return `<p style="margin:0 0 14px">${esc(b).replace(/\n/g, '<br>')}</p>`;
  });
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#20241F;max-width:560px;margin:0 auto;padding:20px">
<div style="font-size:17px;font-weight:bold;margin-bottom:16px">${esc(business)}</div>${blocks.join('')}</div>`;
}

async function sendMail(to: string, subject: string, message: string, business: string, replyTo?: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_ADDRESS');
  if (!key || !from) throw new Error('Email is not set up (Resend secrets missing).');
  const body: Record<string, unknown> = { from, to: [to], subject, html: html(message, business), text: message };
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Email failed: ${r.status} ${await r.text()}`);
}

// The caller's login, from the Authorization header.
async function callerUser(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user || null;
}

// A client that acts as the caller (their login), so database checks apply.
const asCaller = (req: Request) =>
  createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });

function inviteText(family: string, kids: string[], email: string, link: string, origin: string, business: string) {
  const names = kids.length <= 1 ? kids[0] || 'your child' : kids.slice(0, -1).join(', ') + ' and ' + kids[kids.length - 1];
  return `Hello ${family},

You can now follow ${names} at ${business} online in our parent portal.

Click below to set your password:

${link}

After that, sign in any time at ${origin}/parent with this email address (${email}).

In the parent portal you can:
- see each child's classes, belt progress and attendance
- let us know if your child will be absent
- sign up for camps, tournaments and other events, and pay online
- view your billing and download past invoices and receipts
- update the card used for tuition
- email the dojang

If the link has expired, click "Forgot password?" on the sign-in page to get a new one.

Best regards,
Master Daisy`;
}

function resetText(link: string, origin: string) {
  return `Hello,

Click below to set a new password for your parent portal:

${link}

Then sign in at ${origin}/parent with this email address. If you didn't ask for this, you can ignore this email.

Best regards,
Master Daisy`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const origin = safeOrigin(body.origin);
  const s = await settings();
  const business = s.business_name || 'our dojang';

  try {
    if (body.action === 'invite') {
      const { data: isAdmin } = await asCaller(req).rpc('is_admin');
      if (!isAdmin) return json({ error: 'Only the admin can send invites.' }, 403);

      const { data: fam } = await admin.from('customers').select('id, name, email').eq('id', body.customer_id).single();
      if (!fam) return json({ error: 'Family not found.' }, 404);
      const emails = splitEmails(fam.email);
      if (!emails.length) return json({ error: 'This family has no email address.' }, 400);
      const { data: kids } = await admin.from('students').select('name, status').eq('customer_id', fam.id);
      const kidNames = (kids || []).filter((k: any) => (k.status || 'active') !== 'withdrawn').map((k: any) => String(k.name).split(' ')[0]);

      const sent: string[] = [];
      const skipped: { email: string; reason: string }[] = [];
      for (const email of emails) {
        let user = await findUser(email);
        if (!user) {
          const { data, error } = await admin.auth.admin.createUser({
            email,
            email_confirm: true,
            app_metadata: { portal_role: 'parent', customer_id: fam.id },
            user_metadata: { name: fam.name },
          });
          if (error) {
            skipped.push({ email, reason: error.message });
            continue;
          }
          user = data.user;
        }
        let { data: prof } = await admin.from('profiles').select('role, customer_id').eq('id', user!.id).maybeSingle();
        // A login this function created is a parent login. (When the login is
        // created, the new-user trigger can run before the parent details are
        // attached and label it 'staff' — fix that here. app_metadata can only
        // be set by the server, so this never touches a real staff login.)
        const ours = user!.app_metadata?.portal_role === 'parent' && !user!.last_sign_in_at;
        if (prof && prof.role === 'staff' && ours) {
          await admin.from('profiles').update({ role: 'parent', customer_id: fam.id }).eq('id', user!.id);
          prof = { role: 'parent', customer_id: fam.id };
        }
        if (prof && prof.role !== 'parent') {
          skipped.push({ email, reason: `already a ${prof.role} login — use a different email for the parent portal` });
          continue;
        }
        if (prof && prof.customer_id && prof.customer_id !== fam.id) {
          skipped.push({ email, reason: 'already linked to another family' });
          continue;
        }
        if (!prof) await admin.from('profiles').insert({ id: user!.id, name: fam.name, role: 'parent', customer_id: fam.id });
        else if (!prof.customer_id) await admin.from('profiles').update({ customer_id: fam.id }).eq('id', user!.id);
        await admin.auth.admin.updateUserById(user!.id, { app_metadata: { portal_role: 'parent', customer_id: fam.id } });

        const link = await linkFor(email, origin);
        await sendMail(email, `Your parent portal at ${business}`, inviteText(fam.name, kidNames, email, link, origin, business), business, s.email || undefined);
        sent.push(email);
      }
      if (sent.length) await admin.from('customers').update({ portal_invited_at: new Date().toISOString() }).eq('id', fam.id);
      return json({ sent, skipped });
    }

    if (body.action === 'reset') {
      const email = splitEmails(body.email)[0];
      if (!email) return json({ ok: true });
      const user = await findUser(email);
      if (user) {
        const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
        // at most one reset email every 5 minutes per address
        const last = Date.parse(String(user.app_metadata?.reset_sent_at || '')) || 0;
        if (prof?.role === 'parent' && Date.now() - last > 5 * 60 * 1000) {
          await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, reset_sent_at: new Date().toISOString() } });
          const link = await linkFor(email, origin);
          await sendMail(email, `Set your parent portal password — ${business}`, resetText(link, origin), business, s.email || undefined);
        }
      }
      return json({ ok: true });
    }

    if (body.action === 'set_password') {
      const u = await callerUser(req);
      if (!u) return json({ error: 'This link has expired. Click "Forgot password?" to get a new one.' }, 401);
      const { data: prof } = await admin.from('profiles').select('role').eq('id', u.id).maybeSingle();
      if (prof?.role !== 'parent') return json({ error: 'This is not a parent portal login.' }, 403);
      const pw = String(body.password || '');
      if (pw.length < 8) return json({ error: 'Use at least 8 characters.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(u.id, { password: pw });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, email: u.email });
    }

    if (body.action === 'absence' || body.action === 'message') {
      const caller = asCaller(req);
      const u = await callerUser(req);
      const who = u?.email || '';
      if (!who) return json({ error: 'Please sign in again.' }, 401);
      if (body.action === 'absence') {
        const { data, error } = await caller.rpc('parent_absence', { p_student: body.student_id, p_date: body.date, p_class: body.class_name || null, p_note: body.note || null });
        if (error) return json({ error: error.message }, 400);
        if (data?.dojang_email) {
          const day = new Date(String(body.date) + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
          const msg = `Parent portal — absence notice\n\n${data.student} will be absent on ${day}${body.class_name ? ` (${body.class_name})` : ''}.${body.note ? `\n\nNote from the parent: ${String(body.note).slice(0, 500)}` : ''}\n\nSent by ${data.family} (${who}). Reply to this email to answer them.`;
          await sendMail(data.dojang_email, `Absence: ${data.student} — ${day}`, msg, business, who);
        }
        return json({ ok: true });
      }
      const { data, error } = await caller.rpc('parent_log_message', { p_subject: body.subject || '', p_message: body.message || '' });
      if (error) return json({ error: error.message }, 400);
      if (!data?.dojang_email) return json({ error: 'The dojang email is not set up yet.' }, 400);
      const subject = `[Parent portal] ${String(body.subject || '').trim().slice(0, 120) || 'Message from ' + data.family}`;
      await sendMail(data.dojang_email, subject, `${String(body.message).trim().slice(0, 4000)}\n\n— ${data.family} (${who}), sent from the parent portal. Reply to this email to answer them.`, business, who);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
