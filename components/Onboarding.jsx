"use client";
import React, { useState } from "react";
import LanguageStep from "./onboarding/LanguageStep";
import WelcomeStep from "./onboarding/WelcomeStep";
import AuthForm from "./onboarding/AuthForm";
import { useAuth } from "../lib/auth";
import { screen, wrap } from "../lib/ui/theme";

// step: "language" | "welcome" | "signup" | "login"
// If a guest left guest-mode to authenticate, authIntent tells us which step
// to open directly (skip language), so we don't force language selection again.
export default function Onboarding() {
  const { continueAsGuest, authIntent } = useAuth();
  const [step, setStep] = useState(authIntent || "language");

  return (
    <div style={screen()}>
      <div style={wrap()}>
        {step === "language" && <LanguageStep onNext={() => setStep("welcome")} />}
        {step === "welcome" && (
          <WelcomeStep
            onSignup={() => setStep("signup")}
            onLogin={() => setStep("login")}
            onGuest={continueAsGuest}
          />
        )}
        {step === "signup" && <AuthForm mode="signup" onBack={() => setStep("welcome")} />}
        {step === "login" && <AuthForm mode="login" onBack={() => setStep("welcome")} />}
      </div>
    </div>
  );
}
