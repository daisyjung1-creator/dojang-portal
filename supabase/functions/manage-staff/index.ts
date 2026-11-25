// Supabase Edge Function: manage-staff
//
// Staff logins for the portal (e.g. the front-desk iPad). Only a signed-in
// admin can call it. Body: { action, ... }
//   list                               → { users: [{ id, email, name, role, last_sign_in_at, created_at }] }
//   create   { email, password, name } → new login with the 'staff' role
//   password { id, password }          → set a new password (staff logins only)
//   rename   { id, name }
//   delete   { id }                    → staff logins only
// Admin accounts can't be changed or deleted from here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function roleOf(id: string) {
  const { data } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
  return data?.role || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    const caller = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin } = await caller.rpc('is_admin');
    if (isAdmin !== true) return json({ error: 'Admins only' }, 403);

    const b = await req.json().catch(() => ({}));
    const action = String(b.action || 'list');

    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      const { data: profiles } = await admin.from('profiles').select('id, name, role');
      const byId = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
      const users = data.users.map((u: any) => ({
        id: u.id,
        email: u.email,
        name: byId[u.id]?.name || u.user_metadata?.name || '',
        role: byId[u.id]?.role || 'staff',
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at,
      }));
      return json({ users });
    }

    if (action === 'create') {
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      const name = String(b.name || '').trim();
      if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email (it is the login name).' }, 400);
      if (password.length < 8) return json({ error: 'The password needs at least 8 characters.' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      if (error) return json({ error: error.message }, 400);
      // The signup trigger makes a 'staff' profile; make sure the name is on it.
      await admin.from('profiles').upsert({ id: data.user.id, name: name || null, role: 'staff' }, { onConflict: 'id' });
      return json({ ok: true, id: data.user.id });
    }

    const id = String(b.id || '');
    if (!id) return json({ error: 'Missing id' }, 400);
    const role = await roleOf(id);

    if (action === 'rename') {
      const { error } = await admin.from('profiles').update({ name: String(b.name || '').trim() || null }).eq('id', id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    if (role !== 'staff') return json({ error: 'Only staff logins can be changed here.' }, 400);

    if (action === 'password') {
      const password = String(b.password || '');
      if (password.length < 8) return json({ error: 'The password needs at least 8 characters.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    if (action === 'delete') {
      const { error } = await admin.auth.admin.deleteUser(id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
