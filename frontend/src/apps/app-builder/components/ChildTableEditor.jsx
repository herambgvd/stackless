/**
 * ChildTableEditor
 *
 * Renders an inline editable table for CHILD_TABLE fields.
 * Each row is an object whose keys match the child_fields config.
 *
 * Props:
 *   field       – FieldDefinition (type === "child_table")
 *   value       – array of row objects (current value)
 *   onChange    – (rows: object[]) => void
 *   readOnly    – boolean (disable editing)
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";

function makeEmptyRow(childFields) {
  return Object.fromEntries(childFields.map((f) => [f.name, f.type === "boolean" ? false : ""]));
}

export function ChildTableEditor({ field, value = [], onChange, readOnly = false }) {
  const childFields = field.config?.child_fields ?? [];
  const [editingCell, setEditingCell] = useState(null); // { rowIdx, colName }

  function addRow() {
    onChange([...value, makeEmptyRow(childFields)]);
  }

  function removeRow(idx) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function updateCell(rowIdx, colName, cellValue) {
    const next = value.map((row, i) =>
      i === rowIdx ? { ...row, [colName]: cellValue } : row
    );
    onChange(next);
  }

  if (childFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No columns defined. Configure columns in the Schema Builder.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {childFields.map((col) => (
                <th
                  key={col.name}
                  className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {col.label || col.name}
                  {col.is_required && <span className="text-destructive ml-0.5">*</span>}
                </th>
              ))}
              {!readOnly && (
                <th className="w-8 px-2 py-2" />
              )}
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td
                  colSpan={childFields.length + (readOnly ? 0 : 1)}
                  className="px-3 py-4 text-center text-xs text-muted-foreground/60 italic"
                >
                  No rows yet{!readOnly && " — click Add Row to start"}
                </td>
              </tr>
            ) : (
              value.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={cn(
                    "border-b border-border last:border-0",
                    rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  {childFields.map((col) => (
                    <td key={col.name} className="px-2 py-1">
                      {readOnly ? (
                        <span className="text-sm">
                          {col.type === "boolean"
                            ? row[col.name] ? "✓" : "—"
                            : String(row[col.name] ?? "")}
                        </span>
                      ) : (
                        <CellEditor
                          col={col}
                          value={row[col.name]}
                          onChange={(v) => updateCell(rowIdx, col.name, v)}
                        />
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIdx)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={addRow}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Row
        </Button>
      )}
    </div>
  );
}

// ── Cell editor by type ────────────────────────────────────────────────────────

function CellEditor({ col, value, onChange }) {
  const baseClass = "h-7 text-sm px-2 py-1 w-full min-w-[80px]";

  switch (col.type) {
    case "boolean":
      return (
        <Switch
          checked={!!value}
          onCheckedChange={onChange}
          className="h-4 w-7"
        />
      );

    case "select": {
      const options = col.options ?? [];
      return (
        <select
          className={cn(baseClass, "rounded-md border border-input bg-background")}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    case "number":
    case "currency":
      return (
        <Input
          type="number"
          className={baseClass}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "date":
      return (
        <Input
          type="date"
          className={baseClass}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return (
        <Input
          className={baseClass}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
