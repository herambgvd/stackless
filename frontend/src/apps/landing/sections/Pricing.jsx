import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

const plans = [
  {
    name: "Free",
    badge: "bg-slate-100 text-slate-600",
    monthlyPrice: "$0",
    annualPrice: "$0",
    period: "/mo",
    description: "Perfect for individuals getting started.",
    features: [
      "3 apps",
      "500 records",
      "1 workflow",
      "2 users",
      "Community support",
    ],
    cta: "Get started free",
    ctaStyle:
      "border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
    ctaTo: "/register",
    highlighted: false,
    popular: false,
  },
  {
    name: "Starter",
    badge: "bg-blue-100 text-blue-700",
    monthlyPrice: "$29",
    annualPrice: "$23",
    period: "/mo",
    description: "For small teams ready to scale.",
    features: [
      "15 apps",
      "10,000 records",
      "10 workflows",
      "5 users",
      "Email support",
    ],
    cta: "Start free trial",
    ctaStyle:
      "border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
    ctaTo: "/register",
    highlighted: false,
    popular: false,
  },
  {
    name: "Growth",
    badge: "bg-purple-100 text-purple-700",
    monthlyPrice: "$79",
    annualPrice: "$63",
    period: "/mo",
    description: "For growing teams that need power.",
    features: [
      "Unlimited apps",
      "100,000 records",
      "Unlimited workflows",
      "25 users",
      "AI Builder included",
      "Priority support",
    ],
    cta: "Start free trial",
    ctaStyle: "bg-blue-600 hover:bg-blue-700 text-white",
    ctaTo: "/register",
    highlighted: true,
    popular: true,
  },
  {
    name: "Enterprise",
    badge: "bg-amber-100 text-amber-700",
    monthlyPrice: "Custom",
    annualPrice: "Custom",
    period: "",
    description: "For organizations with advanced needs.",
    features: [
      "Unlimited everything",
      "LDAP / SAML SSO",
      "Custom domain",
      "Dedicated SLA",
      "On-premise option",
    ],
    cta: "Contact sales",
    ctaStyle:
      "border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
    ctaTo: "/register",
    highlighted: false,
    popular: false,
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="w-full py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        {/* Heading */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
            Simple, predictable pricing
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto">
            Start free. Upgrade when you're ready. No hidden fees.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 mt-8 p-1 rounded-full bg-slate-100">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                !annual ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                annual ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Annual
              <span className="inline-block px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-200 ${
                plan.highlighted
                  ? "border-blue-500 border-2 shadow-xl scale-105 bg-white"
                  : "border-slate-200 bg-white hover:shadow-md"
              }`}
            >
              {/* Most Popular badge */}
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-block px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold shadow">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Plan name + badge */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-slate-900">{plan.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${plan.badge}`}>
                  {plan.name.toUpperCase()}
                </span>
              </div>

              {/* Price */}
              <div className="mb-1">
                <span className="text-4xl font-bold text-slate-900">
                  {annual ? plan.annualPrice : plan.monthlyPrice}
                </span>
                {plan.period && (
                  <span className="text-slate-500 text-sm ml-1">{plan.period}</span>
                )}
              </div>
              {annual && plan.name !== "Free" && plan.name !== "Enterprise" && (
                <p className="text-xs text-emerald-600 font-medium mb-3">billed annually</p>
              )}

              <p className="text-sm text-slate-500 mt-2 mb-5">{plan.description}</p>

              {/* CTA */}
              <Link
                to={plan.ctaTo}
                className={`w-full text-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-150 mb-6 block ${plan.ctaStyle}`}
              >
                {plan.cta}
              </Link>

              {/* Features */}
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
