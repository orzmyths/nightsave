import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client for application infrastructure tables
// (estimate_cache) that RLS deliberately locks out for anon/authenticated —
// this bypasses RLS, so it must NEVER be imported from client code and the
// key must NEVER be exposed via a NEXT_PUBLIC_ env var.
//
// Returns null when the service role key isn't configured, so callers can
// treat caching as an optional layer instead of a hard dependency.
let cached;

export function getSupabaseAdmin() {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
