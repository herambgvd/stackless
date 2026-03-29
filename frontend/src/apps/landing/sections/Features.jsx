import { Database, GitBranch, CheckSquare, Sparkles, BarChart3, Users } from "lucide-react";

const features = [
  {
    icon: Database,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "No-Code Data Builder",
    description:
      "Design tables, forms, and views without writing a single line of SQL.",
  },
  {
    icon: GitBranch,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    title: "Workflow Automation",
    description:
      "Automate repetitive tasks with visual drag-and-drop workflows.",
  },
  {
    icon: CheckSquare,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    title: "Approval Flows",
    description:
      "Multi-stage approvals with auto-escalation and SLA tracking.",
  },
  {
    icon: Sparkles,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    title: "AI App Builder",
    description:
      "Describe your app in plain English. Our AI builds the structure for you.",
  },
  {
    icon: BarChart3,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Real-Time Dashboards",
    description:
      "Custom KPI dashboards and charts that update live as data changes.",
  },
  {
    icon: Users,
    iconBg: "bg-pink-100",
    iconColor: "text-pink-600",
    title: "Team Collaboration",
    description:
      "Comments, @mentions, assignments, and desk chat — all in context.",
  },
];

export function Features() {
  return (
    <section id="features" className="w-full py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
            Everything you need, nothing you don't
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            One platform that replaces 5+ tools your team is struggling to connect.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200"
              >
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${feature.iconBg}`}
                >
                  <Icon className={`w-5 h-5 ${feature.iconColor}`} />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 text-base">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
