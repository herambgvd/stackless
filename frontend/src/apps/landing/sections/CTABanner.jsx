import { Link } from "@tanstack/react-router";

export function CTABanner() {
  return (
    <section className="w-full py-24 bg-blue-600">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-4xl font-bold text-white tracking-tight">
          Ready to automate your operations?
        </h2>
        <p className="mt-4 text-lg text-blue-100 max-w-xl mx-auto">
          Join 500+ businesses running smarter on FlowForge.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-white hover:bg-slate-50 text-blue-600 font-semibold text-base transition-colors duration-150 shadow-sm"
          >
            Get started free
            <span aria-hidden="true">→</span>
          </Link>
          <a
            href="mailto:sales@flowforge.io"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-transparent border border-white/40 hover:border-white/70 hover:bg-white/5 text-white font-semibold text-base transition-colors duration-150"
          >
            Talk to us
          </a>
        </div>

        {/* Fine print */}
        <p className="mt-6 text-sm text-blue-200">
          No credit card required · Free forever plan · Setup in 5 minutes
        </p>
      </div>
    </section>
  );
}
