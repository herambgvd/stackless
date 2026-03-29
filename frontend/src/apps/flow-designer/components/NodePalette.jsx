import {
  Zap,
  Clock,
  Webhook,
  Bell,
  Mail,
  Globe,
  GitBranch,
  Database,
  Edit3,
  Variable,
  RotateCw,
  CheckSquare,
  Timer,
  GitMerge,
  Play,
  ClipboardList,
  MessageSquare,
  CreditCard,
} from "lucide-react";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { cn } from "@/shared/lib/utils";

const NODE_TYPES = [
  {
    category: "Triggers",
    color: "green",
    items: [
      { type: "trigger", subtype: "manual",    label: "Manual",         icon: Play },
      { type: "trigger", subtype: "on_create", label: "Record Created", icon: Database },
      { type: "trigger", subtype: "on_update", label: "Record Updated", icon: Edit3 },
      { type: "trigger", subtype: "on_delete", label: "Record Deleted", icon: Database },
      { type: "trigger", subtype: "schedule",  label: "Schedule (cron)", icon: Clock },
      { type: "trigger", subtype: "webhook",   label: "Webhook",        icon: Webhook },
    ],
  },
  {
    category: "Actions",
    color: "blue",
    items: [
      { type: "action", subtype: "set_variable",     label: "Set Variable",     icon: Variable },
      { type: "action", subtype: "create_record",    label: "Create Record",    icon: Database },
      { type: "action", subtype: "update_record",    label: "Update Record",    icon: Edit3 },
      { type: "action", subtype: "send_notification",label: "Send Notification",icon: Bell },
      { type: "action", subtype: "http_request",     label: "HTTP Request",     icon: Globe },
      { type: "action", subtype: "trigger_approval", label: "Trigger Approval", icon: CheckSquare },
      { type: "action", subtype: "wait_delay",       label: "Wait / Delay",     icon: Timer },
      { type: "action", subtype: "loop",             label: "Loop",             icon: RotateCw },
      { type: "action", subtype: "sub_workflow",     label: "Sub-workflow",     icon: GitMerge },
      { type: "action", subtype: "human_task",             label: "Human Task",       icon: ClipboardList },
      { type: "action", subtype: "slack_message",           label: "Slack Message",     icon: MessageSquare },
      { type: "action", subtype: "send_email",              label: "Send Email (SMTP)", icon: Mail },
      { type: "action", subtype: "whatsapp_send",           label: "WhatsApp",          icon: MessageSquare },
      { type: "action", subtype: "stripe_create_payment",   label: "Stripe Payment",    icon: CreditCard },
      { type: "action", subtype: "google_sheets_append",    label: "Google Sheets",     icon: Globe },
    ],
  },
  {
    category: "Logic",
    color: "amber",
    items: [
      { type: "condition", subtype: "conditional_branch", label: "If / Else", icon: GitBranch },
    ],
  },
];

const colorMap = {
  green: "bg-green-500/10 text-green-700 border-green-500/20",
  blue: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/20",
};

const iconColorMap = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
};

export function NodePalette({ onAddNode }) {
  const handleDragStart = (e, node) => {
    e.dataTransfer.setData("application/flowforge-node", JSON.stringify(node));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node Library</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {NODE_TYPES.map(({ category, color, items }) => (
            <div key={category} className="mb-3">
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">{category}</p>
              <div className="space-y-1">
                {items.map((node) => (
                  <div
                    key={`${node.type}-${node.subtype}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, node)}
                    onClick={() => onAddNode?.(node)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all",
                      colorMap[color]
                    )}
                  >
                    <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white", iconColorMap[color])}>
                      <node.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-medium">{node.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
