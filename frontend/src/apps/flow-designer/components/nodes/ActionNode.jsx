import { Handle, Position } from "@xyflow/react";
import { PlayCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function ActionNode({ data, selected }) {
  return (
    <div
      className={cn(
        "min-w-[180px] rounded-xl border-2 bg-card shadow-sm transition-shadow",
        selected ? "border-primary shadow-md" : "border-blue-500/60 hover:shadow-md"
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !border-white !w-3 !h-3" />
      <div className="flex items-center gap-2 rounded-t-[10px] bg-blue-500/10 px-3 py-2 border-b border-blue-500/20">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500 text-white">
          <PlayCircle className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Action</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-foreground">{data.label}</p>
        {data.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{data.description}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !border-white !w-3 !h-3" />
    </div>
  );
}
