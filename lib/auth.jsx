"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

// Auth modes:
//   loading  — still resolving the initial session
//   signedIn — a real Supabase session exists
//   guest    — user tapped "Continue as Guest" (local-only)
//   none     — no session, not a guest yet → show onboarding

const GUEST_FLAG = "nightsave_guest_mode";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      try { setIsGuest(localStorage.getItem(GUEST_FLAG) === "1"); } catch {}
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        // a real session supersedes guest mode
        setIsGuest(false);
        try { localStorage.removeItem(GUEST_FLAG); } catch {}
      }
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const continueAsGuest = useCallback(() => {
    try { localStorage.setItem(GUEST_FLAG, "1"); } catch {}
    setIsGuest(true);
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
  }, []);

  const mode = loading ? "loading" : session ? "signedIn" : isGuest ? "guest" : "none";

  return (
    <AuthContext.Provider
      value={{ session, isGuest, loading, mode, continueAsGuest, signUp, signIn, signOut }}
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
