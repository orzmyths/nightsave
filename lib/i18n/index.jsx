"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

import en from "./locales/en.json";
import zhHant from "./locales/zh-Hant.json";
import zhHans from "./locales/zh-Hans.json";
import es from "./locales/es.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";

export const LOCALES = {
  en: { name: "English", messages: en },
  "zh-Hant": { name: "繁體中文", messages: zhHant },
  "zh-Hans": { name: "简体中文", messages: zhHans },
  es: { name: "Español", messages: es },
  ja: { name: "日本語", messages: ja },
  ko: { name: "한국어", messages: ko },
};

const LOCAL_KEY = "nightsave_lang";
const FALLBACK = "en";

// Map a raw browser tag (e.g. "zh-TW", "es-MX") to one of our supported locales.
function detectFromBrowser() {
  if (typeof navigator === "undefined") return FALLBACK;
  const tags = navigator.languages || [navigator.language || FALLBACK];
  for (const raw of tags) {
    const t = raw.toLowerCase();
    if (t.startsWith("zh")) {
      if (t.includes("hant") || t.includes("tw") || t.includes("hk") || t.includes("mo")) return "zh-Hant";
      return "zh-Hans";
    }
    if (t.startsWith("es")) return "es";
    if (t.startsWith("ja")) return "ja";
    if (t.startsWith("ko")) return "ko";
    if (t.startsWith("en")) return "en";
  }
  return FALLBACK;
}

const I18nContext = createContext(null);

// Two-layer resolution:
//  - not logged in: browser detection, stored locally
//  - logged in: cloudLang (from profile) wins and overwrites local
export function I18nProvider({ children, cloudLang }) {
  const [locale, setLocale] = useState(FALLBACK);

  useEffect(() => {
    if (cloudLang && LOCALES[cloudLang]) {
      setLocale(cloudLang);
      try { localStorage.setItem(LOCAL_KEY, cloudLang); } catch {}
      return;
    }
    let stored = null;
    try { stored = localStorage.getItem(LOCAL_KEY); } catch {}
    setLocale(stored && LOCALES[stored] ? stored : detectFromBrowser());
  }, [cloudLang]);

  const changeLocale = useCallback((next) => {
    if (!LOCALES[next]) return;
    setLocale(next);
    try { localStorage.setItem(LOCAL_KEY, next); } catch {}
    // caller persists to cloud profile when logged in
  }, []);

  const t = useCallback(
    (key, vars) => {
      const msgs = LOCALES[locale]?.messages || LOCALES[FALLBACK].messages;
      let s = msgs[key] ?? LOCALES[FALLBACK].messages[key] ?? key;
      if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
      return s;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, changeLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
