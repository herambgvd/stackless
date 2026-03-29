import {
  Factory,
  Truck,
  Briefcase,
  ShoppingCart,
  Stethoscope,
  Wrench,
  Check,
} from "lucide-react";

const BUSINESS_TYPES = [
  {
    id: "manufacturing",
    icon: <Factory className="w-6 h-6" />,
    label: "Manufacturing",
    description: "Track production, inventory & quality",
  },
  {
    id: "logistics",
    icon: <Truck className="w-6 h-6" />,
    label: "Logistics & Trading",
    description: "Manage orders, shipments & suppliers",
  },
  {
    id: "agency",
    icon: <Briefcase className="w-6 h-6" />,
    label: "Agency / Services",
    description: "Projects, clients & team workflows",
  },
  {
    id: "ecommerce",
    icon: <ShoppingCart className="w-6 h-6" />,
    label: "E-commerce",
    description: "Orders, customers & fulfillment",
  },
  {
    id: "healthcare",
    icon: <Stethoscope className="w-6 h-6" />,
    label: "Healthcare / Clinics",
    description: "Patient records & appointments",
  },
  {
    id: "other",
    icon: <Wrench className="w-6 h-6" />,
    label: "Other",
    description: "Custom setup for your needs",
  },
];

export function BusinessTypeStep({ value, onChange }) {
  return (
    <div className="px-4 py-2 animate-fade-in-up">
      <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">
        What best describes your business?
      </h2>
      <p className="text-slate-500 text-sm text-center mb-6">
        We&apos;ll suggest the right starting templates for you.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {BUSINESS_TYPES.map((type) => {
          const selected = value === type.id;
          return (
            <button
              key={type.id}
              onClick={() => onChange(type.id)}
              className={[
                "relative flex flex-col items-start gap-2 rounded-xl border-2 px-4 py-4 text-left transition-all duration-200 cursor-pointer",
                selected
                  ? "border-blue-600 bg-blue-50 shadow-md shadow-blue-100"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm",
              ].join(" ")}
            >
              {/* Selected checkmark */}
              {selected && (
                <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
              )}

              <span
                className={`${selected ? "text-blue-600" : "text-slate-500"} transition-colors duration-200`}
              >
                {type.icon}
              </span>

              <div>
                <p
                  className={`font-semibold text-sm leading-tight ${selected ? "text-blue-700" : "text-slate-800"}`}
                >
                  {type.label}
                </p>
                <p className="text-slate-500 text-xs mt-0.5 leading-snug">
                  {type.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
