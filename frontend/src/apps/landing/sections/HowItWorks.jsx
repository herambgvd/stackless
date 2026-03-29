import { Database, GitBranch, UserPlus } from "lucide-react";

const steps = [
  {
    number: "1",
    icon: Database,
    title: "Build your data model",
    description:
      "Design tables and fields with our drag-and-drop builder. Add formulas, relations, and file uploads.",
  },
  {
    number: "2",
    icon: GitBranch,
    title: "Set up automations",
    description:
      "Connect workflows to your data. Auto-send emails, trigger approvals, or call external APIs.",
  },
  {
    number: "3",
    icon: UserPlus,
    title: "Invite your team",
    description:
      "Add teammates with role-based access. Share forms with customers via public portal.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="w-full py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
            Up and running in 3 steps
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto">
            No training required. Most teams are operational within a day.
          </p>
        </div>

        {/* Steps */}
        <div className="relative flex flex-col md:flex-row items-start gap-8 md:gap-0">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="flex flex-col items-center text-center flex-1 relative">
                {/* Dashed connector line between steps (desktop only) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[calc(50%+2.5rem)] right-[calc(-50%+2.5rem)] border-t-2 border-dashed border-slate-300 z-0" />
                )}

                {/* Number circle */}
                <div className="relative z-10 flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-lg shadow-sm mb-4 flex-shrink-0">
                  {step.number}
                </div>

                {/* Icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 mb-4">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>

                {/* Content */}
                <div className="px-4">
                  <h3 className="font-semibold text-slate-900 text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
