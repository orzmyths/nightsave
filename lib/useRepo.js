"use client";
import { useMemo } from "react";
import { useAuth } from "./auth";
import { getRepo } from "./repo";

// The one hook the real NightSave Home should use. It returns guestRepo or
// cloudRepo depending on auth state — the Home never has to know which.
//   const repo = useRepo();
//   await repo.recordDecision({ ... });
export function useRepo() {
  const { session } = useAuth();
  return useMemo(() => getRepo(session), [session]);
}
