import { CheckCircle2, ChevronDown, ChevronRight, Table2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";

const TYPE_COLORS = {
  text: "bg-blue-100 text-blue-700",
  number: "bg-purple-100 text-purple-700",
  email: "bg-pink-100 text-pink-700",
  phone: "bg-orange-100 text-orange-700",
  url: "bg-cyan-100 text-cyan-700",
  date: "bg-green-100 text-green-700",
  datetime: "bg-teal-100 text-teal-700",
  boolean: "bg-yellow-100 text-yellow-700",
  select: "bg-violet-100 text-violet-700",
  multiselect: "bg-indigo-100 text-indigo-700",
  textarea: "bg-blue-100 text-blue-700",
  rich_text: "bg-blue-100 text-blue-700",
  file: "bg-gray-100 text-gray-700",
  currency: "bg-emerald-100 text-emerald-700",
};

function ModelBlock({ model }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        <Table2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm flex-1">{model.name}</span>
        <span className="text-xs text-muted-foreground">{model.fields?.length ?? 0} fields</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="divide-y divide-border">
          {(model.fields ?? []).map((field) => (
            <div key={field.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${TYPE_COLORS[field.type] ?? "bg-muted text-muted-foreground"}`}>
                {field.type}
              </span>
              <span className="text-sm text-foreground flex-1">{field.label}</span>
              {field.is_required && (
                <span className="text-xs text-destructive font-medium">required</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlueprintPreviewPanel({ blueprint }) {
  if (!blueprint) return null;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          App Blueprint Ready
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="font-semibold text-foreground">{blueprint.name}</p>
          {blueprint.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{blueprint.description}</p>
          )}
        </div>
        <Separator />
        <div className="space-y-2">
          {(blueprint.models ?? []).map((model) => (
            <ModelBlock key={model.slug} model={model} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
