"use client";
import React from "react";
import { useAuth } from "../lib/auth";
import Onboarding from "../components/Onboarding";
import PlaceholderHome from "../components/PlaceholderHome";
import { T, screen } from "../lib/ui/theme";

export default function Page() {
  const { mode } = useAuth();

  if (mode === "loading") {
    return (
      <div style={{ ...screen(), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: T.mute }}>🌙</div>
      </div>
    );
  }

  // signedIn or guest → home; none → onboarding
  if (mode === "signedIn" || mode === "guest") return <PlaceholderHome />;
  return <Onboarding />;
}
