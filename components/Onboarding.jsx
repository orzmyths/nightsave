"use client";
import React, { useState } from "react";
import LanguageStep from "./onboarding/LanguageStep";
import WelcomeStep from "./onboarding/WelcomeStep";
import AuthForm from "./onboarding/AuthForm";
import { useAuth } from "../lib/auth";
import { screen, wrap } from "../lib/ui/theme";

// step: "language" | "welcome" | "signup" | "login"
export default function Onboarding() {
  const [step, setStep] = useState("language");
  const { continueAsGuest } = useAuth();

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
