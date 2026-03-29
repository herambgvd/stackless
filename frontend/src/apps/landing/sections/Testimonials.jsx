const testimonials = [
  {
    quote:
      "We replaced Airtable, Zapier, and a custom spreadsheet nightmare with FlowForge in one weekend. The automation alone saves us 20 hours a week.",
    author: "Ravi Mehta",
    role: "Operations Director",
    company: "BuildMart",
    initials: "RM",
    avatarBg: "bg-blue-500",
  },
  {
    quote:
      "Finally a tool that doesn't require a developer to set up. Our logistics team built their entire order tracking system without writing one line of code.",
    author: "Sarah Chen",
    role: "COO",
    company: "TradePilot",
    initials: "SC",
    avatarBg: "bg-purple-500",
  },
  {
    quote:
      "The approval flows alone were worth switching. We went from email chains to structured multi-stage approvals in 2 hours.",
    author: "Marcus Osei",
    role: "Process Manager",
    company: "OperaSync",
    initials: "MO",
    avatarBg: "bg-emerald-500",
  },
];

function StarRating() {
  return (
    <div className="flex gap-0.5 mb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="text-amber-400 text-base leading-none">
          ★
        </span>
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="w-full py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
            Loved by operations teams
          </h2>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.author}
              className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col"
            >
              <StarRating />
              <p className="text-slate-700 text-base leading-relaxed italic flex-1">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-3 mt-6">
                <div
                  className={`w-10 h-10 rounded-full ${t.avatarBg} flex items-center justify-center flex-shrink-0`}
                >
                  <span className="text-white text-sm font-semibold">{t.initials}</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{t.author}</div>
                  <div className="text-xs text-slate-500">
                    {t.role} @ {t.company}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
