"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useI18n, LOCALES } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { useRepo } from "../lib/useRepo";
import { T, card, input, btn, label } from "../lib/ui/theme";

export default function Profile() {
  const { t, locale, changeLocale } = useI18n();
  const { session, isGuest, signOut, leaveGuest } = useAuth();
  const repo = useRepo();

  const [ready, setReady] = useState(false);
  const [nickname, setNickname] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [savedFlag, setSavedFlag] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await repo.getProfile();
      setNickname(p?.nickname || "");
      setCity(p?.default_city || "");
      setZip(p?.default_zip || "");
    } catch {}
    setReady(true);
  }, [repo]);

  useEffect(() => { load(); }, [load]);

  async function saveProfile() {
    try {
      await repo.updateProfile({ nickname: nickname.trim() || null, default_city: city.trim() || null, default_zip: zip.trim() || null });
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 1500);
    } catch {}
  }

  async function pickLang(code) {
    changeLocale(code);
    try { await repo.setAppLanguage(code); } catch {}
  }

  if (!ready) return <div style={{ minHeight: "40vh" }} />;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t("profile.title")}</div>

      <div style={card()}>
        <div style={label()}>{t("profile.nickname")}</div>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} style={input()} />
        <div style={{ height: 12 }} />
        <div style={label()}>{t("profile.defaultCity")}</div>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="San Jose" style={input()} />
        <div style={{ height: 12 }} />
        <div style={label()}>{t("profile.defaultZip")}</div>
        <input value={zip} onChange={(e) => setZip(e.target.value)} style={input()} />
        <div style={{ height: 16 }} />
        <button style={btn(T.jade, T.bg)} onClick={saveProfile}>{savedFlag ? t("profile.saved") : t("common.save")}</button>
      </div>

      <div style={{ height: 16 }} />

      <div style={card()}>
        <div style={label()}>{t("profile.language")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {Object.entries(LOCALES).map(([code, { name }]) => (
            <button key={code} onClick={() => pickLang(code)}
              style={{ background: code === locale ? T.jade : T.surface2, color: code === locale ? T.bg : T.text,
                border: `1px solid ${T.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 14, cursor: "pointer" }}>
              {name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div style={card()}>
        <div style={label()}>{t("profile.account")}</div>
        {session ? (
          <>
            <div style={{ color: T.mute, fontSize: 14, marginBottom: 14, wordBreak: "break-all" }}>{session.user.email}</div>
            <button style={btn("transparent", T.text)} onClick={signOut}>{t("profile.logout")}</button>
          </>
        ) : (
          <>
            <div style={{ color: T.mute, fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>{t("profile.createAccount")}</div>
            <button style={btn(T.jade, T.bg)} onClick={() => leaveGuest("signup")}>{t("auth.createAccount")}</button>
            <div style={{ height: 10 }} />
            <button style={btn("transparent", T.text)} onClick={() => leaveGuest("login")}>{t("auth.signIn")}</button>
          </>
        )}
      </div>
    </div>
  );
}
