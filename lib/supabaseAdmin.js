import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client using service role key (bypasses RLS)
let _client = null;

export function getSupabaseAdmin() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[Commander] SUPABASE_SERVICE_ROLE_KEY not set, falling back to anon key. Writes may fail due to RLS.');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}
