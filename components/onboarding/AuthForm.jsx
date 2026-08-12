"use client";
import React, { useState } from "react";
import { useI18n } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";
import { T, card, input, btn, label } from "../../lib/ui/theme";

// mode: "signup" | "login"
export default function AuthForm({ mode, onBack }) {
  const { t } = useI18n();
  const { signUp, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const isSignup = mode === "signup";

  async function submit() {
    setErr(""); setInfo("");
    if (!email.trim() || !password) { setErr("Email and password required"); return; }
    setBusy(true);
    try {
      if (isSignup) {
        const res = await signUp(email.trim(), password);
        // If email confirmation is ON, there is no session yet.
        if (!res.session) setInfo("Check your email to confirm, then log in.");
        // If confirmation is OFF, onAuthStateChange will flip the app to signedIn.
      } else {
        await signIn(email.trim(), password);
        // onAuthStateChange handles the redirect.
      }
    } catch (e) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.mute, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>←</button>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 18 }}>
        {isSignup ? t("onboarding.signup") : t("onboarding.login")}
      </div>

      <div style={card()}>
        <div style={label()}>Email</div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" style={input()} />
        <div style={{ height: 12 }} />
        <div style={label()}>Password</div>
        <input value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          type="password" autoComplete={isSignup ? "new-password" : "current-password"} style={input()} />
        <div style={{ height: 18 }} />
        <button style={btn(T.jade, T.bg, busy)} disabled={busy} onClick={submit}>
          {busy ? "..." : isSignup ? t("onboarding.signup") : t("onboarding.login")}
        </button>
        {err && <div style={{ color: "#e08a8a", fontSize: 13, marginTop: 12 }}>{err}</div>}
        {info && <div style={{ color: T.jade, fontSize: 13, marginTop: 12 }}>{info}</div>}
      </div>
    </div>
  );
}
