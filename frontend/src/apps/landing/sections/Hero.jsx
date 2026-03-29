import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Table2,
  GitBranch,
  Bell,
  Settings,
  TrendingUp,
  Users,
  FileText,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

function ProductMockup() {
  return (
    <div className="w-full max-w-xl ml-auto rounded-2xl border border-slate-200 shadow-2xl overflow-hidden bg-white">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 border-b border-slate-200">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <div className="flex-1 mx-4 bg-white rounded-md px-3 py-1 text-xs text-slate-400 border border-slate-200 font-mono">
          app.flowforge.io/dashboard
        </div>
      </div>

      {/* App layout */}
      <div className="flex h-72">
        {/* Sidebar */}
        <div className="w-44 bg-slate-900 flex flex-col py-3 px-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-2 mb-4">
            <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">F</span>
            </div>
            <span className="text-white text-xs font-semibold">FlowForge</span>
          </div>
          {[
            { icon: LayoutDashboard, label: "Dashboard", active: true },
            { icon: Table2, label: "Data Builder" },
            { icon: GitBranch, label: "Workflows" },
            { icon: Users, label: "Team" },
            { icon: FileText, label: "Reports" },
          ].map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5 ${
                active ? "bg-blue-600" : "hover:bg-slate-800"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : "text-slate-400"}`} />
              <span className={`text-xs ${active ? "text-white font-medium" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 bg-slate-50 p-3 overflow-hidden">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "Total Records", value: "12,480", color: "bg-blue-50", text: "text-blue-700", border: "border-blue-100" },
              { label: "Active Flows", value: "34", color: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
              { label: "Pending", value: "7", color: "bg-orange-50", text: "text-orange-700", border: "border-orange-100" },
            ].map((card) => (
              <div
                key={card.label}
                className={`rounded-lg border ${card.border} ${card.color} p-2`}
              >
                <div className={`text-base font-bold ${card.text}`}>{card.value}</div>
                <div className="text-slate-500 text-xs leading-tight mt-0.5">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-700">Recent Orders</span>
              <span className="text-xs text-blue-600 font-medium cursor-pointer">View all</span>
            </div>
            {[
              { id: "#1042", customer: "BuildMart Inc.", status: "Approved", color: "bg-emerald-100 text-emerald-700" },
              { id: "#1041", customer: "NexaFlow Ltd.", status: "Pending", color: "bg-yellow-100 text-yellow-700" },
              { id: "#1040", customer: "TradePilot Co.", status: "Approved", color: "bg-emerald-100 text-emerald-700" },
              { id: "#1039", customer: "OperaSync", status: "In Review", color: "bg-blue-100 text-blue-700" },
            ].map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between px-3 py-1.5 border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
                <span className="text-xs font-mono text-slate-500">{row.id}</span>
                <span className="text-xs text-slate-700 font-medium flex-1 ml-3">{row.customer}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.color}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="w-full bg-white py-20 md:py-28 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
          {/* Left column — text */}
          <div className="w-full md:w-[55%] flex flex-col">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-slate-100 text-sm text-slate-600 font-medium mb-6">
              <span className="text-blue-500">✦</span>
              Trusted by 500+ businesses
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-6xl font-bold text-slate-900 leading-[1.1] tracking-tight">
              Run your business
              <br />
              on{" "}
              <span className="bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
                one platform
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-5 text-xl text-slate-600 max-w-lg leading-relaxed">
              Replace your CRM, project tracker, and automation tools with one no-code platform
              built for growing teams.
            </p>

            {/* Micro-badges */}
            <div className="flex flex-wrap items-center gap-4 mt-5">
              {["No credit card", "14-day free trial", "Cancel anytime"].map((badge) => (
                <span key={badge} className="flex items-center gap-1.5 text-sm text-slate-500">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  {badge}
                </span>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-base transition-colors duration-150 shadow-sm"
              >
                Start for free
                <span aria-hidden="true">→</span>
              </Link>
              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector("#how-it-works")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-base transition-colors duration-150"
              >
                See how it works
              </a>
            </div>
          </div>

          {/* Right column — product mockup */}
          <div className="w-full md:w-[45%] hidden md:flex items-center justify-end">
            <ProductMockup />
          </div>
        </div>

        {/* Stat numbers */}
        <div className="border-t border-slate-100 mt-16 pt-12 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { value: "10,000+", label: "records automated" },
            { value: "500+", label: "teams onboard" },
            { value: "4.9★", label: "average rating" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-slate-900">{stat.value}</span>
              <span className="text-sm text-slate-500">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
