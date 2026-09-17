"use client";
import React, { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "../lib/auth";
import { I18nProvider } from "../lib/i18n";
import { getRepo } from "../lib/repo";

const LOCAL_LANG_KEY = "nightsave_lang";

// Language resolution across auth:
//  - not signed in: browser detect + local storage (handled inside I18nProvider)
//  - signed in:
//      * if the cloud profile already has a non-default language → cloud wins
//      * if the profile is still at default 'en' but the user picked a language
//        during onboarding (local differs) → push local up once, and use it
//    This fixes profiles.app_language staying 'en' after an onboarding choice,
//    while never clobbering a language the user deliberately set in the cloud.
function LangBridge({ children }) {
  const { session } = useAuth();
  const [cloudLang, setCloudLang] = useState(undefined);

  useEffect(() => {
    let active = true;
    if (!session) { setCloudLang(undefined); return; }

    (async () => {
      try {
        const repo = getRepo(session);
        const profile = await repo.getProfile();
        const cloud = profile?.app_language;
        let local = null;
        try { local = localStorage.getItem(LOCAL_LANG_KEY); } catch {}

        if (cloud && cloud !== "en") {
          if (active) setCloudLang(cloud);           // cloud authoritative
        } else if (local && local !== "en") {
          try { await repo.setAppLanguage(local); } catch {} // retry-safe
          if (active) setCloudLang(local);           // carry onboarding choice up
        } else if (active) {
          setCloudLang(cloud || "en");
        }
      } catch {
        if (active) setCloudLang(undefined);
      }
    })();

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
