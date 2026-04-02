import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Workflow } from "lucide-react";
import { apiClient } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/store/auth.store";

import { WelcomeStep } from "./steps/WelcomeStep";
import { BusinessTypeStep } from "./steps/BusinessTypeStep";
import { TemplatePickerStep } from "./steps/TemplatePickerStep";
import { InviteTeamStep } from "./steps/InviteTeamStep";
import { LaunchStep } from "./steps/LaunchStep";

const TOTAL_STEPS = 5;

const STEP_LABELS = [
  "Welcome",
  "Business Type",
  "Template",
  "Team",
  "Launch",
];

// Inject wizard-specific keyframe animations into document once
const WIZARD_STYLES = `
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.6); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .animate-scale-in {
    animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .animate-fade-in-up {
    animation: fadeInUp 0.35s ease-out both;
  }
`;

function useInjectStyles(css) {
  useEffect(() => {
    if (document.getElementById("onboarding-wizard-styles")) return;
    const style = document.createElement("style");
    style.id = "onboarding-wizard-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }, [css]);
}

export function OnboardingWizard() {
  useInjectStyles(WIZARD_STYLES);

  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();

  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(undefined); // undefined = not yet chosen
  const [inviteEmails, setInviteEmails] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [animKey, setAnimKey] = useState(0); // forces re-mount of step content for animation

  const progressPct = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  // Advance animKey whenever step changes so CSS animation re-triggers
  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current !== step) {
      setAnimKey((k) => k + 1);
      prevStep.current = step;
    }
  }, [step]);

  function goNext() {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  }

  function goBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  // Step 2 guard: must pick a business type to continue
  function canContinue() {
    if (step === 2) return Boolean(businessType);
    return true;
  }

  async function handleSkipInvite() {
    goNext();
  }

  async function handleFinish() {
    setIsSubmitting(true);

    // 1. Send invites (best-effort, don't block)
    if (inviteEmails.length > 0) {
      const results = await Promise.allSettled(
        inviteEmails.map((email) =>
          apiClient.post("/auth/users/invite", { email, roles: ["member"] })
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      const succeeded = results.filter((r) => r.status === "fulfilled");
      if (succeeded.length > 0) {
        toast.success(`${succeeded.length} invitation(s) sent`);
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} invitation(s) failed`);
      }
    }

    // 2. Mark onboarding complete on backend
    try {
      await apiClient.post("/auth/onboarding-complete");
    } catch {
      // If this fails, still let the user through — don't block UX
      toast.error("Could not save onboarding status. You can re-run it from settings.");
    }

    // 3. Update user in auth store
    if (user) {
      setUser({ ...user, onboarding_completed: true });
    }

    // 4. Navigate to dashboard
    navigate({ to: "/dashboard" });
  }

  function renderStep() {
    switch (step) {
      case 1:
        return <WelcomeStep onNext={goNext} />;
      case 2:
        return (
          <BusinessTypeStep
            value={businessType}
            onChange={(val) => {
              setBusinessType(val);
              // Reset template if business type changes
              setSelectedTemplate(undefined);
            }}
          />
        );
      case 3:
        return (
          <TemplatePickerStep
            businessType={businessType}
            value={selectedTemplate ?? null}
            onChange={(val) => setSelectedTemplate(val)}
          />
        );
      case 4:
        return (
          <InviteTeamStep
            inviteEmails={inviteEmails}
            onChange={setInviteEmails}
            onSkip={handleSkipInvite}
          />
        );
      case 5:
        return (
          <LaunchStep
            businessType={businessType}
            selectedTemplate={selectedTemplate ?? null}
            inviteEmails={inviteEmails}
            onFinish={handleFinish}
            isLoading={isSubmitting}
          />
        );
      default:
        return null;
    }
  }

  const showBackButton = step > 1 && step < 5;
  const showContinueButton = step > 1 && step < 5;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Card */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
        {/* Card header */}
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-center justify-between mb-5">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Workflow className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 text-base tracking-tight">
                Stackless
              </span>
            </div>

            {/* Step indicator */}
            <span className="text-sm font-medium text-slate-400">
              Step{" "}
              <span className="text-slate-700 font-semibold">{step}</span>
              {" "}of{" "}
              <span className="text-slate-700 font-semibold">{TOTAL_STEPS}</span>
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-in-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Step label row */}
          <div className="flex justify-between mt-1.5 mb-4 px-0.5">
            {STEP_LABELS.map((label, idx) => {
              const stepNum = idx + 1;
              const isActive = stepNum === step;
              const isDone = stepNum < step;
              return (
                <span
                  key={label}
                  className={[
                    "text-[10px] font-semibold uppercase tracking-wide transition-colors duration-300",
                    isActive
                      ? "text-blue-600"
                      : isDone
                      ? "text-emerald-500"
                      : "text-slate-300",
                  ].join(" ")}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-slate-100" />

        {/* Step content — keyed to force re-mount + re-animate on step change */}
        <div className="px-6 py-8" key={animKey}>
          {renderStep()}
        </div>

        {/* Footer nav (not shown on step 1 or step 5) */}
        {(showBackButton || showContinueButton) && (
          <>
            <div className="h-px w-full bg-slate-100" />
            <div className="flex items-center justify-between px-6 py-4">
              {showBackButton ? (
                <button
                  onClick={goBack}
                  className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors duration-150 flex items-center gap-1.5"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Back
                </button>
              ) : (
                <div />
              )}

              {showContinueButton && (
                <button
                  onClick={goNext}
                  disabled={!canContinue()}
                  className={[
                    "inline-flex items-center gap-2 font-semibold text-sm px-6 py-2.5 rounded-xl transition-all duration-200",
                    canContinue()
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-100"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed",
                  ].join(" ")}
                >
                  Continue
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Fine print */}
      <p className="mt-5 text-xs text-slate-400 text-center">
        Stackless &mdash; No-code platform for modern businesses
      </p>
    </div>
  );
}
