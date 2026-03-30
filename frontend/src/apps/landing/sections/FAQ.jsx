import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    question: "Is Stackless really free to start?",
    answer:
      "Yes, our free plan includes 3 apps, 500 records, and 1 workflow — no credit card required. You can get started immediately and upgrade only when you need more capacity.",
  },
  {
    question: "How is this different from Airtable or Notion?",
    answer:
      "Stackless is built for operations automation. While Airtable and Notion are great for data, we add a full workflow engine, approval flows, AI builder, and team collaboration in one platform. We're designed to replace multiple tools, not just be another database.",
  },
  {
    question: "Do I need a developer to set up Stackless?",
    answer:
      "No. Stackless is designed for operations and business teams. If you can use a spreadsheet, you can build on Stackless. Our drag-and-drop interface means no coding knowledge is required at any stage.",
  },
  {
    question: "Can I migrate my existing data?",
    answer:
      "Yes, you can import CSV files and we support connections to popular tools. Our onboarding team helps with migrations on paid plans, ensuring a smooth transition from whatever you're using today.",
  },
  {
    question: "What happens when I hit my plan limits?",
    answer:
      "You'll get a notification at 80% usage with an option to upgrade. Your existing data is never deleted — you simply can't add more until you upgrade or free up space. We never hold your data hostage.",
  },
];

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 transition-colors duration-150"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-semibold text-slate-900 text-base pr-4">{question}</span>
        <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600">
          {open ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          open ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-5 text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
          {answer}
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  return (
    <section className="w-full py-24 bg-white">
      <div className="max-w-3xl mx-auto px-4">
        {/* Heading */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
            Frequently asked questions
          </h2>
        </div>

        {/* Accordion */}
        <div className="flex flex-col gap-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </section>
  );
}
