/**
 * CustomFieldsModal
 *
 * Lets builders add, edit, and delete fields on a model without opening the
 * full Schema Builder.  It communicates with the per-field CRUD endpoints:
 *   POST   /schema/apps/{appId}/models/{modelId}/fields
 *   PUT    /schema/apps/{appId}/models/{modelId}/fields/{name}
 *   DELETE /schema/apps/{appId}/models/{modelId}/fields/{name}
 */
import { useState, useRef } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Pencil, Trash2, Plus, Check, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { schemaApi } from "../api/schema.api";

const FIELD_TYPES = [
  "text", "number", "date", "datetime", "select", "multiselect",
  "boolean", "currency", "email", "url", "phone", "rich_text",
  "file", "user_ref", "rating", "color",
];

const TYPE_COLORS = {
  text: "bg-blue-100 text-blue-700",
  number: "bg-emerald-100 text-emerald-700",
  date: "bg-purple-100 text-purple-700",
  datetime: "bg-purple-100 text-purple-700",
  select: "bg-amber-100 text-amber-700",
  multiselect: "bg-amber-100 text-amber-700",
  boolean: "bg-teal-100 text-teal-700",
  currency: "bg-green-100 text-green-700",
  email: "bg-cyan-100 text-cyan-700",
  url: "bg-sky-100 text-sky-700",
  phone: "bg-indigo-100 text-indigo-700",
  rich_text: "bg-pink-100 text-pink-700",
  file: "bg-orange-100 text-orange-700",
  user_ref: "bg-violet-100 text-violet-700",
  rating: "bg-yellow-100 text-yellow-700",
  color: "bg-rose-100 text-rose-700",
};

function toSnakeCase(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "field";
}

const EMPTY_FIELD = {
  name: "", label: "", type: "text",
  is_required: false, is_searchable: false,
};

function FieldRow({ field, onEdit, onDelete, deleting, onDragStart, onDragOver, onDrop, dragging }) {
  const colorClass = TYPE_COLORS[field.type] || "bg-muted text-muted-foreground";
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 group transition-colors ${dragging ? 'opacity-50' : ''}`}
      draggable
      onDragStart={() => onDragStart(field.name)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(field.name); }}
      onDrop={() => onDrop(field.name)}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{field.label}</span>
          {field.is_required && (
            <span className="text-xs text-destructive font-bold">*</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground font-mono">{field.name}</span>
      </div>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${colorClass}`}>
        {field.type}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(field)}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={() => onDelete(field.name)}
          disabled={deleting === field.name}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function FieldForm({ initial, onSave, onCancel, saving, isNew }) {
  const [form, setForm] = useState(initial);
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  const handleLabelChange = (e) => {
    const label = e.target.value;
    if (isNew) {
      set("name", toSnakeCase(label));
    }
    set("label", label);
  };

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Label</Label>
          <Input
            value={form.label}
            onChange={handleLabelChange}
            placeholder="Field Label"
            className="mt-1 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Field name <span className="text-muted-foreground">(auto)</span></Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="field_name"
            className="mt-1 h-8 text-sm font-mono"
            readOnly={!isNew}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Type</Label>
        <Select value={form.type} onValueChange={(v) => set("type", v)}>
          <SelectTrigger className="mt-1 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Switch
            checked={form.is_required}
            onCheckedChange={(v) => set("is_required", v)}
            className="scale-90"
          />
          Required
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Switch
            checked={form.is_searchable}
            onCheckedChange={(v) => set("is_searchable", v)}
            className="scale-90"
          />
          Searchable
        </label>
      </div>
      {/* Select options for select/multiselect */}
      {(form.type === "select" || form.type === "multiselect") && (
        <div>
          <Label className="text-xs">Options <span className="text-muted-foreground">(comma-separated)</span></Label>
          <Input
            value={(form.config?.options ?? []).join(", ")}
            onChange={(e) =>
              set("config", {
                ...form.config,
                options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="Option A, Option B, Option C"
            className="mt-1 h-8 text-sm"
          />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={saving || !form.label || !form.name}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {isNew ? "Add Field" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function CustomFieldsModal({ open, onClose, appId, model }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editField, setEditField] = useState(null); // field being edited
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [localFields, setLocalFields] = useState(null); // override for drag reorder
  const dragSrc = useRef(null);

  const invalidate = () => {
    setLocalFields(null);
    qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
  };

  const addMut = useMutation({
    mutationFn: (data) => schemaApi.addField(appId, model.id, data),
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      toast.success("Field added");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ name, data }) => schemaApi.updateField(appId, model.id, name, data),
    onSuccess: () => {
      invalidate();
      setEditField(null);
      toast.success("Field updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: (names) => schemaApi.reorderFields(appId, model.id, names),
    onSuccess: () => { invalidate(); toast.success("Field order saved"); },
    onError: (e) => toast.error(e.message),
  });

  function handleDragStart(name) { dragSrc.current = name; }
  function handleDragOver(name) {
    if (!dragSrc.current || dragSrc.current === name) return;
    const src = dragSrc.current;
    const base = localFields ?? model.fields ?? [];
    const idx = base.findIndex(f => f.name === name);
    const srcIdx = base.findIndex(f => f.name === src);
    if (idx === -1 || srcIdx === -1) return;
    const next = [...base];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(idx, 0, moved);
    setLocalFields(next);
  }
  function handleDrop() {
    if (localFields) {
      reorderMut.mutate(localFields.map(f => f.name));
    }
    dragSrc.current = null;
  }

  const handleDelete = async (fieldName) => {
    if (!await confirm({ title: "Delete Field", message: `Delete field "${fieldName}"? This does not remove existing data from records.`, confirmLabel: "Delete", variant: "destructive" })) return;
    setDeleting(fieldName);
    try {
      await schemaApi.deleteField(appId, model.id, fieldName);
      invalidate();
      toast.success("Field deleted");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const fields = localFields ?? model?.fields ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Customize Fields
            <span className="text-sm font-normal text-muted-foreground">— {model?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {fields.length === 0 && !showAdd && (
            <p className="text-sm text-muted-foreground text-center py-6">No fields yet</p>
          )}
          {fields.map((field) =>
            editField?.name === field.name ? (
              <FieldForm
                key={field.name}
                initial={{ ...editField, config: editField.config ?? {} }}
                onSave={(data) => updateMut.mutate({ name: field.name, data })}
                onCancel={() => setEditField(null)}
                saving={updateMut.isPending}
                isNew={false}
              />
            ) : (
              <FieldRow
                key={field.name}
                field={field}
                onEdit={setEditField}
                onDelete={handleDelete}
                deleting={deleting}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                dragging={dragSrc.current === field.name}
              />
            )
          )}
          {showAdd && (
            <FieldForm
              initial={{ ...EMPTY_FIELD, config: {} }}
              onSave={(data) => addMut.mutate(data)}
              onCancel={() => setShowAdd(false)}
              saving={addMut.isPending}
              isNew
            />
          )}
        </div>

        <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setShowAdd(true); setEditField(null); }}
            disabled={showAdd}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
