import { supabase } from "../supabaseClient";
import { createGuestRepo } from "./guestRepo";
import { createCloudRepo } from "./cloudRepo";

// Pick the right backend based on auth state. Screens call getRepo(session)
// and never care which one they get — the interface is identical.
export function getRepo(session) {
  if (session?.user) return createCloudRepo(supabase, session.user.id);
  return createGuestRepo();
}

// Guest → brand-new account migration.
// Call AFTER Sign Up succeeds and a session exists. Order matters:
// migrate first, and only clear local guest data once it succeeds.
export async function migrateGuestToAccount() {
  const guest = createGuestRepo();
  const payload = guest.exportPayload();

  const empty =
    payload.goals.length === 0 &&
    payload.decisions.length === 0 &&
    !payload.profile.city && !payload.profile.zip;
  if (empty) return { migrated: false };

  const { error } = await supabase.rpc("migrate_guest_data", { payload });
  if (error) throw error; // do NOT clear local data if this fails

  guest.clear();
  return { migrated: true };
}

export { createGuestRepo, createCloudRepo };
