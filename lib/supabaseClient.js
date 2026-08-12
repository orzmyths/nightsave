import { createClient } from "@supabase/supabase-js";

// Public anon key + URL are safe to expose to the browser.
// RLS is what protects the data, not secrecy of the anon key.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
