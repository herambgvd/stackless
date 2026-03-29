import { Navbar } from "./sections/Navbar";
import { Hero } from "./sections/Hero";
import { LogoBar } from "./sections/LogoBar";
import { Features } from "./sections/Features";
import { HowItWorks } from "./sections/HowItWorks";
import { Pricing } from "./sections/Pricing";
import { Testimonials } from "./sections/Testimonials";
import { FAQ } from "./sections/FAQ";
import { CTABanner } from "./sections/CTABanner";
import { Footer } from "./sections/Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar />
      <Hero />
      <LogoBar />
      <Features />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <FAQ />
      <CTABanner />
      <Footer />
    </div>
  );
}
