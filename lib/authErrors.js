// Translate raw Supabase/Auth errors into NightSave translation keys.
// UI calls: t(authErrorKey(error)). Adding a language = adding keys, not code.
// Adding a newly-observed Supabase message = one line here.

export function authErrorKey(error) {
  const raw = (error?.message || String(error || "")).toLowerCase();

  if (raw.includes("invalid login credentials")) return "auth.error.invalidCredentials";
  if (raw.includes("email not confirmed")) return "auth.error.emailNotConfirmed";
  if (raw.includes("rate limit") || raw.includes("too many")) return "auth.error.rateLimit";
  if (raw.includes("already registered") || raw.includes("already exists") || raw.includes("user already"))
    return "auth.error.userExists";
  if (raw.includes("password") && (raw.includes("short") || raw.includes("at least") || raw.includes("6 characters") || raw.includes("weak")))
    return "auth.error.weakPassword";
  if (raw.includes("unable to validate email") || raw.includes("invalid email") || raw.includes("valid email"))
    return "auth.error.invalidEmail";

  return "auth.error.generic";
}
