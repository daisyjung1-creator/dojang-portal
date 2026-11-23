import { createClient } from '@supabase/supabase-js';
import { IS_DEMO } from './demo/isDemo';
import { createMockClient } from './demo/mockSupabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!IS_DEMO && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('Supabase environment variables are not set. Check your .env file.');
}

// /demo: fake data in the browser only — never the real database.
export const supabase = IS_DEMO ? createMockClient() : createClient(supabaseUrl, supabaseAnonKey);
