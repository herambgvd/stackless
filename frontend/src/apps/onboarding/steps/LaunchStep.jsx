import { CheckCircle2, LayoutGrid, PlayCircle, BookOpen, Check } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

const BUSINESS_LABELS = {
  manufacturing: "Manufacturing",
  logistics: "Logistics & Trading",
  agency: "Agency / Services",
  ecommerce: "E-commerce",
  healthcare: "Healthcare / Clinics",
  other: "Other",
};

export function LaunchStep({ businessType, selectedTemplate, inviteEmails, onFinish, isLoading }) {
  const navigate = useNavigate();

  function handleComingSoon(label) {
    toast.info(`${label} coming soon!`);
  }

  const templateSummary =
    selectedTemplate
      ? selectedTemplate
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "Starting from scratch";

  const inviteSummary =
    inviteEmails.length > 0
      ? `${inviteEmails.length} invite${inviteEmails.length > 1 ? "s" : ""} sent`
      : "Just you for now";

  const summaryItems = [
    {
      label: "Business type",
      value: BUSINESS_LABELS[businessType] ?? businessType ?? "Not selected",
    },
    {
      label: "Starting template",
      value: templateSummary,
    },
    {
      label: "Team invites",
      value: inviteSummary,
    },
  ];

  return (
    <div className="px-4 py-2 animate-fade-in-up">
      {/* Hero */}
      <div className="flex flex-col items-center mb-6">
        <div className="mb-4 animate-scale-in">
          <CheckCircle2
            className="w-16 h-16 text-emerald-500 drop-shadow"
            strokeWidth={1.5}
          />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">
          Your workspace is ready!
        </h2>
        <p className="text-slate-500 text-sm text-center max-w-sm">
          Here&apos;s what we&apos;ve set up for you based on your choices.
        </p>
      </div>

      {/* Summary card */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 mb-6 space-y-3">
        {summaryItems.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Check className="w-3 h-3 text-emerald-600" strokeWidth={3} />
            </span>
            <span className="text-sm text-slate-500 min-w-[120px]">{label}</span>
            <span className="text-sm font-semibold text-slate-800">{value}</span>
          </div>
        ))}
      </div>

      {/* What's next action cards */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
        What&apos;s next
      </p>
      <div className="space-y-2 mb-6">
        <button
          onClick={() => navigate({ to: "/apps" })}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border-2 border-blue-600 rounded-xl hover:bg-blue-50 transition-all duration-150 text-left group"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 group-hover:bg-blue-700 transition-colors duration-150">
            <LayoutGrid className="w-4 h-4 text-white" />
          </span>
          <div>
            <p className="text-sm font-semibold text-blue-700">Explore your app</p>
            <p className="text-xs text-slate-400">Jump in and see your workspace</p>
          </div>
          <svg
            className="w-4 h-4 text-blue-400 ml-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={() => handleComingSoon("2-min tour")}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all duration-150 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <PlayCircle className="w-4 h-4 text-slate-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-700">Watch a 2-min tour</p>
            <p className="text-xs text-slate-400">See how Stackless works</p>
          </div>
          <svg
            className="w-4 h-4 text-slate-300 ml-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={() => handleComingSoon("Documentation")}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all duration-150 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <BookOpen className="w-4 h-4 text-slate-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-700">View documentation</p>
            <p className="text-xs text-slate-400">In-depth guides and references</p>
          </div>
          <svg
            className="w-4 h-4 text-slate-300 ml-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Final CTA */}
      <button
        onClick={onFinish}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-semibold text-base px-8 py-3.5 rounded-xl shadow-md shadow-blue-200 transition-all duration-200"
      >
        {isLoading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            Setting up...
          </>
        ) : (
          <>
            Go to Dashboard
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
