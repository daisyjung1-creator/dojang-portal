import { createClient } from '@supabase/supabase-js';

// The staff clock-in app (fabulous-sfogliatella-8fd433.netlify.app) keeps its
// records in its own Supabase project ("Team Hankook"). The payroll page only
// reads names and clock-in/out times from it — never passwords.
const URL = 'https://ugpickotpmmofarxoaoc.supabase.co';
const KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncGlja290cG1tb2ZhcnhvYW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzYwMzgsImV4cCI6MjEwMjY1MjAzOH0.lYNJqlLJt0Pp1nnW3BCMT91ZuptfEeMhE1WRF03ocCY';

let client = null;
function db() {
  if (!client) client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'attendance-app' } });
  return client;
}

export async function loadStaff() {
  const { data, error } = await db().from('employees').select('id, name').order('name');
  if (error) throw error;
  return data || [];
}

// Clock records between two dates (inclusive), by the record's work date.
export async function loadShifts(from, to) {
  const { data, error } = await db().from('entries').select('id, employee_id, date, clock_in, clock_out').gte('date', from).lte('date', to).order('clock_in');
  if (error) throw error;
  return data || [];
}
