import { Handle, Position } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function ConditionNode({ data, selected }) {
  return (
    <div
      className={cn(
        "min-w-[180px] rounded-xl border-2 bg-card shadow-sm transition-shadow",
        selected ? "border-primary shadow-md" : "border-amber-500/60 hover:shadow-md"
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !border-white !w-3 !h-3" />
      <div className="flex items-center gap-2 rounded-t-[10px] bg-amber-500/10 px-3 py-2 border-b border-amber-500/20">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-white">
          <GitBranch className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Condition</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-foreground">{data.label}</p>
        {data.condition && (
          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 block">{data.condition}</code>
        )}
      </div>
      {/* True / False outputs with labels */}
      <div className="flex justify-between px-3 pb-2 text-[10px] font-medium">
        <span className="text-green-600">✓ True</span>
        <span className="text-red-500">✗ False</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: "28%" }}
        className="!bg-green-500 !border-white !w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: "72%" }}
        className="!bg-red-500 !border-white !w-3 !h-3"
      />
    </div>
  );
}
