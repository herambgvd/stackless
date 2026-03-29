import { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

const DRAG_TYPE = "FIELD";

export function FormCanvas({
  modelName,
  fields,
  selectedFieldId,
  onSelectField,
  onRemoveField,
  onMoveField,
}) {
  if (fields.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 text-center p-8">
        <p className="text-sm font-medium text-muted-foreground">
          {modelName ? `No fields in "${modelName}" yet` : "Drop fields here"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Click a field type from the left panel to add it
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      {/* Model name header */}
      {modelName && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {modelName} &nbsp;·&nbsp; {fields.length} field{fields.length !== 1 ? "s" : ""}
        </p>
      )}

      {fields.map((field, index) => (
        <FieldRow
          key={field.id}
          field={field}
          index={index}
          isSelected={selectedFieldId === field.id}
          onSelect={() => onSelectField(field.id)}
          onRemove={() => onRemoveField(field.id)}
          onMove={onMoveField}
        />
      ))}
    </div>
  );
}

function FieldRow({ field, index, isSelected, onSelect, onRemove, onMove }) {
  const ref = useRef(null);

  const [, drop] = useDrop({
    accept: DRAG_TYPE,
    hover(item) {
      if (item.index !== index) {
        onMove(item.index, index);
        item.index = index;
      }
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: DRAG_TYPE,
    item: () => ({ id: field.id, index }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all select-none",
        isDragging ? "opacity-40" : "",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/30 hover:bg-accent/50",
      )}
    >
      {/* Drag handle */}
      <div className="cursor-grab text-muted-foreground hover:text-foreground shrink-0">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Label + name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{field.label}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{field.name}</p>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant="outline" className="text-xs capitalize">
          {field.type}
        </Badge>
        {field.is_required && (
          <Badge variant="destructive" className="text-xs">
            Required
          </Badge>
        )}
        {field.type === "relation" && field.config?.related_model_slug && (
          <Badge variant="secondary" className="text-xs">
            → {field.config.related_model_slug}
          </Badge>
        )}
      </div>

      {/* Delete */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
