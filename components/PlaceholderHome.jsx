"use client";
import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n, LOCALES } from "../lib/i18n";
import { getRepo } from "../lib/repo";
import { T, card, btn, label, screen, wrap } from "../lib/ui/theme";

// Temporary landing for Phase 2. The real 4-tab app arrives in Phase 3.
export default function PlaceholderHome() {
  const { session, isGuest, signOut } = useAuth();
  const { t, locale, changeLocale } = useI18n();
  const [saving, setSaving] = useState(false);

  async function pickLang(code) {
    changeLocale(code);
    if (session) {
      // signed-in language persists to the cloud profile
      setSaving(true);
      try { await getRepo(session).updateProfile({ app_language: code }); } catch {}
      setSaving(false);
    }
  }

  return (
    <div style={screen()}>
      <div style={wrap()}>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>🌙 {t("app.name")}</div>
        <div style={{ color: T.mute, fontSize: 14, marginBottom: 20 }}>Phase 2 — you're in ✓</div>

        <div style={card()}>
          <div style={label()}>Status</div>
          <div style={{ fontSize: 16, marginBottom: 4 }}>
            {isGuest ? "👤 Guest (local only)" : "🔐 Signed in"}
          </div>
          {session && (
            <div style={{ color: T.mute, fontSize: 14, wordBreak: "break-all" }}>
              {session.user.email}<br />uid {session.user.id}
            </div>
          )}
        </div>

        <div style={{ height: 16 }} />

        <div style={card()}>
          <div style={label()}>{t("profile.language")} {saving ? "· saving…" : ""}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {Object.entries(LOCALES).map(([code, { name }]) => (
              <button key={code} onClick={() => pickLang(code)}
                style={{
                  background: code === locale ? T.jade : T.surface2,
                  color: code === locale ? T.bg : T.text,
                  border: `1px solid ${T.line}`, borderRadius: 999, padding: "8px 14px",
                  fontSize: 14, cursor: "pointer",
                }}>
                {name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 24 }} />

        {isGuest ? (
          <div style={{ ...card(), textAlign: "center" }}>
            <div style={{ color: T.mute, fontSize: 14, lineHeight: 1.5 }}>{t("profile.createAccount")}</div>
          </div>
        ) : (
          <button style={btn("transparent", T.text)} onClick={signOut}>Log Out</button>
        )}
      </div>
    </div>
  );
}
