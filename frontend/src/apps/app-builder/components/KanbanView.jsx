import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { schemaApi } from "../api/schema.api";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";

// Column colour palette (cycling)
const COL_COLOURS = [
  "border-l-slate-400",
  "border-l-blue-400",
  "border-l-amber-400",
  "border-l-green-500",
  "border-l-purple-400",
  "border-l-rose-400",
  "border-l-cyan-400",
];

export function KanbanView({ records, model, view, appId, onRecordClick, onRefresh }) {
  const qc = useQueryClient();
  const groupField = view?.group_by_field || model?.fields?.find(f => f.type === "select")?.name;
  const groupFieldDef = model?.fields?.find(f => f.name === groupField);

  // Build columns from field options or distinct values
  const options = groupFieldDef?.config?.options ?? [];
  const valuesFromRecords = [...new Set(records.map(r => r[groupField]).filter(Boolean))];
  const allColumns = options.length > 0 ? options : valuesFromRecords;
  const noGroupRecords = records.filter(r => !r[groupField]);

  const updateMut = useMutation({
    mutationFn: ({ recordId, newVal }) =>
      schemaApi.updateRecord(appId, model.slug, recordId, { [groupField]: newVal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records", appId, model.slug] });
      onRefresh?.();
    },
    onError: () => toast.error("Failed to update"),
  });

  function handleDrop(e, colValue) {
    const recordId = e.dataTransfer.getData("recordId");
    if (!recordId || !groupField) return;
    updateMut.mutate({ recordId, newVal: colValue });
  }

  if (!groupField) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Kanban requires a SELECT field. Set "Group by" in view settings.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 min-h-[400px]">
      {allColumns.map((col, idx) => {
        const colRecords = records.filter(r => r[groupField] === col);
        return (
          <KanbanColumn
            key={col}
            title={col}
            records={colRecords}
            colorClass={COL_COLOURS[idx % COL_COLOURS.length]}
            onDrop={(e) => handleDrop(e, col)}
            onRecordClick={onRecordClick}
            model={model}
          />
        );
      })}
      {noGroupRecords.length > 0 && (
        <KanbanColumn
          title="No Value"
          records={noGroupRecords}
          colorClass="border-l-muted-foreground/30"
          onDrop={(e) => handleDrop(e, "")}
          onRecordClick={onRecordClick}
          model={model}
        />
      )}
    </div>
  );
}

function KanbanColumn({ title, records, colorClass, onDrop, onRecordClick, model }) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={cn(
        "flex-shrink-0 w-64 flex flex-col rounded-xl border border-border bg-muted/30 transition-colors",
        over && "bg-muted/60"
      )}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); onDrop(e); }}
    >
      {/* Column header */}
      <div className={cn("flex items-center justify-between px-3 py-2.5 border-b border-border border-l-4 rounded-t-xl", colorClass)}>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <Badge variant="secondary" className="text-xs h-5 min-w-[1.25rem] justify-center">
          {records.length}
        </Badge>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
        {records.map((rec) => (
          <KanbanCard
            key={rec.id}
            record={rec}
            model={model}
            onClick={() => onRecordClick?.(rec)}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ record, model, onClick }) {
  // Show first 3 non-group fields as card preview
  const previewFields = model?.fields?.slice(0, 3) ?? [];

  return (
    <div
      className="bg-card rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all select-none"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("recordId", record.id)}
      onClick={onClick}
    >
      {previewFields.map(f => {
        const val = record[f.name];
        if (!val && val !== 0) return null;
        return (
          <div key={f.name} className="text-xs text-muted-foreground truncate leading-5">
            <span className="font-medium text-foreground/70">{f.label}: </span>
            {String(val)}
          </div>
        );
      })}
      {previewFields.length === 0 && (
        <div className="text-xs text-muted-foreground">{record.id?.slice(-8)}</div>
      )}
    </div>
  );
}
