import { CheckCircle2, Zap, Bot, BarChart3 } from "lucide-react";
import { useAuthStore } from "@/shared/store/auth.store";

const benefits = [
  {
    icon: <Zap className="w-5 h-5 text-orange-500" />,
    text: "Build your first app in minutes",
  },
  {
    icon: <Bot className="w-5 h-5 text-blue-500" />,
    text: "Automate workflows without code",
  },
  {
    icon: <BarChart3 className="w-5 h-5 text-emerald-500" />,
    text: "Track everything in one place",
  },
];

export function WelcomeStep({ onNext }) {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="flex flex-col items-center text-center px-4 py-6 animate-fade-in-up">
      {/* Animated checkmark */}
      <div className="mb-6 animate-scale-in">
        <CheckCircle2 className="w-20 h-20 text-emerald-500 drop-shadow-md" strokeWidth={1.5} />
      </div>

      {/* Headline */}
      <h1 className="text-3xl font-bold text-slate-900 mb-3 leading-tight">
        Welcome to FlowForge, {firstName}! 🎉
      </h1>

      {/* Subtext */}
      <p className="text-slate-500 text-base mb-8 max-w-md leading-relaxed">
        You&apos;re 3 minutes away from automating your business. Let&apos;s set
        things up so you can hit the ground running.
      </p>

      {/* Benefit bullets */}
      <ul className="w-full max-w-sm space-y-3 mb-10 text-left">
        {benefits.map(({ icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3"
          >
            <span className="shrink-0">{icon}</span>
            <span className="text-slate-700 font-medium text-sm">{text}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-base px-8 py-3 rounded-xl shadow-md shadow-blue-200 transition-all duration-200"
      >
        Let&apos;s get started
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
