export function LogoBar() {
  const companies = [
    "Buildmart",
    "NexaFlow",
    "TradePilot",
    "OperaSync",
    "SwiftOps",
    "PeakLogix",
  ];

  return (
    <section className="w-full py-12 bg-slate-50 border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center mb-8">
          Trusted by teams at
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-60">
          {companies.map((name) => (
            <span key={name} className="font-bold text-lg text-slate-400 select-none">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
