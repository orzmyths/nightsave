"use client";
import React, { useState } from "react";
import Home from "./home/Home";
import Goals from "./Goals";
import History from "./History";
import Profile from "./Profile";
import { useI18n } from "../lib/i18n";
import { T, screen, wrap } from "../lib/ui/theme";

const TABS = [
  { key: "home", icon: "🌙", label: "nav.home" },
  { key: "goals", icon: "🎯", label: "nav.goals" },
  { key: "history", icon: "📊", label: "nav.history" },
  { key: "profile", icon: "👤", label: "nav.profile" },
];

export default function AppShell() {
  const { t } = useI18n();
  const [tab, setTab] = useState("home");

  return (
    <div style={screen()}>
      <div style={{ ...wrap(), paddingBottom: 90 }}>
        {/* Home stays mounted across tab switches so an in-progress search/estimate/
            decision survives visiting Goals/History/Profile. It's only hidden, not
            unmounted — see Home's `active` prop for the refresh-on-return behavior. */}
        <div style={{ display: tab === "home" ? "block" : "none" }}>
          <Home active={tab === "home"} onNavigate={setTab} />
        </div>
        {tab !== "home" && (
          <div key={tab} style={{ animation: "ns-fade 240ms ease" }}>
            {tab === "goals" && <Goals />}
            {tab === "history" && <History />}
            {tab === "profile" && <Profile />}
          </div>
        )}
        <style>{`@keyframes ns-fade{from{opacity:0}to{opacity:1}}`}</style>
      </div>

      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: T.surface,
        borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "center",
      }}>
        <div style={{ display: "flex", width: "100%", maxWidth: 440 }}>
          {TABS.map((tb) => {
            const active = tab === tb.key;
            return (
              <button key={tb.key} onClick={() => setTab(tb.key)}
                style={{
                  flex: 1, background: "none", border: "none", cursor: "pointer",
                  padding: "12px 0 18px", color: active ? T.jade : T.mute,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}>
                <span style={{ fontSize: 20, opacity: active ? 1 : 0.6 }}>{tb.icon}</span>
                <span style={{ fontSize: 11 }}>{t(tb.label)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
