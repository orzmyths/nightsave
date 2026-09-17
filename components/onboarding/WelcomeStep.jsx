"use client";
import React from "react";
import { useI18n } from "../../lib/i18n";
import { T, btn } from "../../lib/ui/theme";

export default function WelcomeStep({ onLogin, onSignup, onGuest }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 46, marginBottom: 16 }}>🌙</div>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.3 }}>{t("onboarding.welcome.title")}</div>
        <div style={{ color: T.mute, fontSize: 15, marginTop: 12, lineHeight: 1.5 }}>{t("onboarding.welcome.subtitle")}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button style={btn(T.jade, T.bg)} onClick={onSignup}>{t("onboarding.signup")}</button>
        <button style={btn("transparent", T.text)} onClick={onLogin}>{t("onboarding.login")}</button>
        <button
          onClick={onGuest}
          style={{ background: "none", border: "none", color: T.mute, fontSize: 15, cursor: "pointer", padding: 8 }}
        >
          {t("onboarding.guest")}
        </button>
      </div>
    </div>
  );
}
