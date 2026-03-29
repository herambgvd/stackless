import {
  Package,
  ClipboardList,
  Users,
  ShieldCheck,
  ShoppingBag,
  Navigation,
  FolderKanban,
  Receipt,
  CheckSquare,
  Database,
  Wallet,
  CalendarDays,
  Check,
} from "lucide-react";

const TEMPLATES_BY_TYPE = {
  manufacturing: [
    {
      id: "inventory-tracker",
      icon: <Package className="w-6 h-6" />,
      name: "Inventory Tracker",
      description: "Real-time stock levels, low-stock alerts, and reorder management.",
      popular: true,
    },
    {
      id: "production-orders",
      icon: <ClipboardList className="w-6 h-6" />,
      name: "Production Orders",
      description: "Schedule and track manufacturing runs from start to finish.",
    },
    {
      id: "supplier-management",
      icon: <Users className="w-6 h-6" />,
      name: "Supplier Management",
      description: "Centralize vendor contacts, contracts, and performance data.",
    },
    {
      id: "quality-control",
      icon: <ShieldCheck className="w-6 h-6" />,
      name: "Quality Control",
      description: "Inspection checklists, defect logging, and QC sign-offs.",
    },
  ],
  logistics: [
    {
      id: "order-management",
      icon: <ShoppingBag className="w-6 h-6" />,
      name: "Order Management",
      description: "End-to-end order lifecycle from placement to delivery.",
      popular: true,
    },
    {
      id: "shipment-tracker",
      icon: <Navigation className="w-6 h-6" />,
      name: "Shipment Tracker",
      description: "Live shipment status, carrier updates, and delivery confirmations.",
    },
    {
      id: "supplier-database",
      icon: <Database className="w-6 h-6" />,
      name: "Supplier Database",
      description: "Comprehensive supplier profiles with contact and terms info.",
    },
    {
      id: "route-planning",
      icon: <CalendarDays className="w-6 h-6" />,
      name: "Route Planning",
      description: "Optimize delivery routes and driver schedules.",
    },
  ],
  agency: [
    {
      id: "project-tracker",
      icon: <FolderKanban className="w-6 h-6" />,
      name: "Project Tracker",
      description: "Kanban boards, milestones, and delivery timelines for every project.",
      popular: true,
    },
    {
      id: "client-crm",
      icon: <Users className="w-6 h-6" />,
      name: "Client CRM",
      description: "Manage leads, deals, and client relationships in one place.",
    },
    {
      id: "invoice-manager",
      icon: <Receipt className="w-6 h-6" />,
      name: "Invoice Manager",
      description: "Create, send, and track invoices with payment status.",
    },
    {
      id: "team-tasks",
      icon: <CheckSquare className="w-6 h-6" />,
      name: "Team Tasks",
      description: "Assign tasks, set deadlines, and monitor team workload.",
    },
  ],
};

const DEFAULT_TEMPLATES = [
  {
    id: "task-manager",
    icon: <CheckSquare className="w-6 h-6" />,
    name: "Task Manager",
    description: "Organize, assign, and track tasks across your team.",
    popular: true,
  },
  {
    id: "customer-database",
    icon: <Database className="w-6 h-6" />,
    name: "Customer Database",
    description: "Store and manage customer profiles, contacts, and history.",
  },
  {
    id: "expense-tracker",
    icon: <Wallet className="w-6 h-6" />,
    name: "Expense Tracker",
    description: "Log, categorize, and approve business expenses.",
  },
  {
    id: "leave-requests",
    icon: <CalendarDays className="w-6 h-6" />,
    name: "Leave Requests",
    description: "Streamline time-off requests and team availability.",
  },
];

export function TemplatePickerStep({ businessType, value, onChange }) {
  const templates = TEMPLATES_BY_TYPE[businessType] ?? DEFAULT_TEMPLATES;

  return (
    <div className="px-4 py-2 animate-fade-in-up">
      <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">
        Pick a starting point
      </h2>
      <p className="text-slate-500 text-sm text-center mb-6">
        You can customize everything later.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {templates.map((tpl) => {
          const selected = value === tpl.id;
          return (
            <button
              key={tpl.id}
              onClick={() => onChange(tpl.id)}
              className={[
                "relative flex items-start gap-3 rounded-xl border-2 px-4 py-4 text-left transition-all duration-200 cursor-pointer",
                selected
                  ? "border-blue-600 bg-blue-50 shadow-md shadow-blue-100"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm",
              ].join(" ")}
            >
              {/* Popular badge */}
              {tpl.popular && (
                <span className="absolute top-2.5 right-3 bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
                  Popular
                </span>
              )}

              {/* Selected indicator */}
              {selected && (
                <span className="absolute bottom-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
              )}

              <span
                className={`mt-0.5 shrink-0 ${selected ? "text-blue-600" : "text-slate-400"} transition-colors duration-200`}
              >
                {tpl.icon}
              </span>

              <div className="min-w-0">
                <p
                  className={`font-semibold text-sm ${selected ? "text-blue-700" : "text-slate-800"}`}
                >
                  {tpl.name}
                </p>
                <p className="text-slate-500 text-xs mt-0.5 leading-snug line-clamp-2">
                  {tpl.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Start from scratch */}
      <div className="text-center">
        <button
          onClick={() => onChange(null)}
          className={[
            "text-sm font-medium underline underline-offset-2 transition-colors duration-150",
            value === null
              ? "text-blue-600"
              : "text-slate-400 hover:text-slate-600",
          ].join(" ")}
        >
          {value === null ? "Starting from scratch selected" : "Start from scratch instead"}
        </button>
      </div>
    </div>
  );
}
