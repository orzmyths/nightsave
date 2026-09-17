"use client";
import React from "react";
import { LOCALES, useI18n } from "../../lib/i18n";
import { T, card } from "../../lib/ui/theme";

export default function LanguageStep({ onNext }) {
  const { locale, changeLocale } = useI18n();

  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>🌙 NightSave</div>
      <div style={{ color: T.mute, fontSize: 14, marginBottom: 20 }}>Language · 語言 · 言語 · 언어</div>

      <div style={{ ...card(), padding: 8 }}>
        {Object.entries(LOCALES).map(([code, { name }], i) => {
          const active = code === locale;
          return (
            <button
              key={code}
              onClick={() => changeLocale(code)}
              style={{
                width: "100%", textAlign: "left", background: active ? T.surface2 : "transparent",
                border: "none", borderRadius: 12, padding: "14px 14px", color: T.text,
                fontSize: 16, cursor: "pointer",
                borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span>{name}</span>
              {active && <span style={{ color: T.jade }}>✓</span>}
            </button>
          );
        })}
      </div>

      <div style={{ height: 18 }} />
      <button
        onClick={onNext}
        style={{ width: "100%", background: T.jade, color: T.bg, border: "none", borderRadius: 13, padding: 15, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
      >
        →
      </button>
    </div>
  );
}
