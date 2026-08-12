"use client";
import React, { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "../lib/auth";
import { I18nProvider } from "../lib/i18n";
import { getRepo } from "../lib/repo";

// When signed in, read the saved language from the cloud profile and feed it
// to I18nProvider as cloudLang (which overrides the local guess). Guests and
// pre-auth users fall back to browser detection + local storage.
function LangBridge({ children }) {
  const { session, mode } = useAuth();
  const [cloudLang, setCloudLang] = useState(undefined);

  useEffect(() => {
    let active = true;
    if (session) {
      getRepo(session).getProfile()
        .then((p) => { if (active) setCloudLang(p?.app_language || undefined); })
        .catch(() => {});
    } else {
      setCloudLang(undefined);
    }
    return () => { active = false; };
  }, [session]);

  return <I18nProvider cloudLang={cloudLang}>{children}</I18nProvider>;
}

export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <LangBridge>{children}</LangBridge>
    </AuthProvider>
  );
}
