"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

const GUEST_FLAG = "nightsave_guest_mode";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  // where onboarding should open when we show it: null | "welcome" | "signup" | "login"
  const [authIntent, setAuthIntent] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      try { setIsGuest(localStorage.getItem(GUEST_FLAG) === "1"); } catch {}
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        setIsGuest(false);
        setAuthIntent(null);
        try { localStorage.removeItem(GUEST_FLAG); } catch {}
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const continueAsGuest = useCallback(() => {
    try { localStorage.setItem(GUEST_FLAG, "1"); } catch {}
    setAuthIntent(null);
    setIsGuest(true);
  }, []);

  // Leave guest mode to reach the auth flow. Guest LOCAL DATA is untouched;
  // only the guest-mode flag is cleared, so mode -> "none" -> onboarding shows.
  const leaveGuest = useCallback((intent = "welcome") => {
    try { localStorage.removeItem(GUEST_FLAG); } catch {}
    setAuthIntent(intent);
    setIsGuest(false);
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }, []);
  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    try { localStorage.removeItem(GUEST_FLAG); } catch {}
    setIsGuest(false);
    setAuthIntent(null);
  }, []);

  const mode = loading ? "loading" : session ? "signedIn" : isGuest ? "guest" : "none";

  return (
    <AuthContext.Provider
      value={{ session, isGuest, loading, mode, authIntent, setAuthIntent,
               continueAsGuest, leaveGuest, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
