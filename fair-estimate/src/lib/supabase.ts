import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Supabase URL and anon key are required');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase URL and service role key are required');
    }
    _supabaseAdmin = createClient(url, key);
  }
  return _supabaseAdmin;
}

// Convenience exports - lazy initialized
export const supabase = {
  get from() { return getSupabase().from.bind(getSupabase()); },
  get auth() { return getSupabase().auth; },
  get storage() { return getSupabase().storage; },
};

export const supabaseAdmin = {
  get from() { return getSupabaseAdmin().from.bind(getSupabaseAdmin()); },
  get auth() { return getSupabaseAdmin().auth; },
  get storage() { return getSupabaseAdmin().storage; },
};
