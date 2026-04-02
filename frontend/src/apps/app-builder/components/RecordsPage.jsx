import { useState, useCallback, useRef, useMemo, memo } from "react";
import ImportDialog from "./ImportDialog";
import { CustomFieldsModal } from "./CustomFieldsModal";
import FileUploadField from "./FileUploadField";
import { ChildTableEditor } from "./ChildTableEditor";
import { GlobalSearch } from "./GlobalSearch";
import { useAuthStore } from "@/shared/store/auth.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { buildZodSchema, buildDefaultValues } from "@/shared/lib/schema-utils";
import {
  Plus,
  Trash2,
  Pencil,
  TableProperties,
  X,
  Check,
  Loader2,
  Search,
  RefreshCw,
  Hash,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  Play,
  Send,
  Download,
  Upload,
  CheckSquare,
  Square,
  History,
  Columns2,
  Save,
  MapPin,
  GanttChart,
  Map,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { fmtDate, fmtSmart } from "@/shared/lib/date";
import { schemaApi } from "../api/schema.api";
import { apiClient } from "@/shared/lib/api-client";
import { ViewSwitcher } from "./ViewSwitcher";
import { KanbanView } from "./KanbanView";
import { CalendarView } from "./CalendarView";
import { GanttView } from "./GanttView";
import { MapView } from "./MapView";
import { workflowApi } from "@/apps/flow-designer/api/workflow.api";
import { approvalsApi } from "@/apps/approvals/api/approvals.api";
import { usersApi } from "@/apps/admin/users/api/users.api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { cn } from "@/shared/lib/utils";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/tabs";
import RecordActivityFeed from "./RecordActivityFeed";

// buildZodSchema and buildDefaultValues imported from @/shared/lib/schema-utils

// ─── Relation dropdown (with cascade detection) ───────────────────────────────

function RelationDropdown({
  field,
  formField,
  appId,
  allModels,
  currentFields,
  watchValues,
}) {
  const relatedSlug = field.config?.related_model_slug;
  const targetAppId = field.config?.target_app_id || appId;  // cross-app support
  const relatedModel = allModels.find((m) => m.slug === relatedSlug);

  // Detect cascade: does the related model have a relation field pointing to a model
  // that is ALSO a relation field in the current model's form?
  // Only works for same-app relations (cross-app cascade not supported yet)
  const cascade = (() => {
    if (!relatedModel) return null;
    for (const relField of relatedModel.fields) {
      if (relField.type !== "relation") continue;
      const parentSlug = relField.config?.related_model_slug;
      if (!parentSlug) continue;
      const parentField = currentFields.find(
        (f) =>
          f.type === "relation" && f.config?.related_model_slug === parentSlug,
      );
      if (!parentField) continue;
      const parentValue = watchValues?.[parentField.name];
      if (parentValue) {
        return { filterField: relField.name, filterValue: parentValue };
      }
    }
    return null;
  })();

  const { data: relRecords = [], isLoading } = useQuery({
    queryKey: ["relation-records", targetAppId, relatedSlug, cascade?.filterValue],
    queryFn: () =>
      schemaApi.listRelationRecords(appId, relatedSlug, { ...(cascade ?? {}), targetAppId }),
    enabled: !!relatedSlug,
  });

  // For cross-app relations relatedModel may be null (different app) — use config display_field
  const configDisplayField = field.config?.display_field;
  const displayField =
    relatedModel?.fields?.find((f) => f.name === (configDisplayField || "name")) ??
    relatedModel?.fields?.find((f) => ["text", "email", "phone"].includes(f.type)) ??
    null;

  const getLabel = (rec) => {
    if (configDisplayField && rec[configDisplayField] != null) return String(rec[configDisplayField]);
    if (displayField) return String(rec[displayField.name] ?? rec.id);
    return String(rec.name ?? rec.title ?? rec.label ?? rec.id);
  };

  if (!relatedSlug) {
    return (
      <Input type="text" placeholder="No related model configured" disabled />
    );
  }

  return (
    <Select onValueChange={formField.onChange} value={formField.value ?? ""}>
      <SelectTrigger>
        <SelectValue
          placeholder={
            isLoading
              ? "Loading…"
              : cascade && !cascade.filterValue
                ? `Select ${allModels.find((m) => m.slug === cascade?.parentSlug)?.name ?? "parent"} first`
                : `Select ${relatedModel?.name ?? relatedSlug}…`
          }
        />
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <SelectItem value="__loading__" disabled>
            Loading records…
          </SelectItem>
        ) : relRecords.length === 0 ? (
          <SelectItem value="__empty__" disabled>
            {cascade ? "No matching records" : "No records found"}
          </SelectItem>
        ) : (
          relRecords.map((rec) => (
            <SelectItem key={rec.id} value={rec.id}>
              {getLabel(rec)}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

// ─── Field input router ────────────────────────────────────────────────────────

function UserRefDropdown({ formField }) {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => usersApi.listUsers(),
  });

  return (
    <Select onValueChange={formField.onChange} value={formField.value ?? ""}>
      <SelectTrigger>
        <SelectValue
          placeholder={isLoading ? "Loading users…" : "Select user…"}
        />
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.full_name} ({u.email})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Signature canvas field ────────────────────────────────────────────────────

function SignatureField({ formField }) {
  const canvasRef = useRef(null);
  const [signed, setSigned] = useState(!!formField.value && formField.value !== "");
  const [isDrawing, setIsDrawing] = useState(false);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    return {
      x: (touch ? touch.clientX : e.clientX) - rect.left,
      y: (touch ? touch.clientY : e.clientY) - rect.top,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && pos) { ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !pos) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setSigned(true);
  };

  const endDraw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    if (canvasRef.current) formField.onChange(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
    formField.onChange("");
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded border border-input bg-white overflow-hidden" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className="w-full cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!signed && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/50">
            Sign here
          </p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {signed ? "✓ Signature captured" : "Draw your signature above"}
        </span>
        {signed && (
          <button type="button" onClick={clear} className="text-xs text-destructive hover:underline">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function RecordFieldInput({
  field,
  formField,
  appId,
  modelSlug,
  recordId,
  allModels,
  currentFields,
  watchValues,
}) {
  const placeholder = field.config?.placeholder ?? "";

  // Read-only / computed fields — show value as plain text
  if (field.config?.read_only || field.type === "formula" || field.type === "rollup") {
    return (
      <div className="flex items-center min-h-9 px-3 py-2 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
        {String(formField.value ?? "—")}
        <Badge variant="outline" className="ml-auto text-[10px]">read only</Badge>
      </div>
    );
  }

  switch (field.type) {
    case "relation":
      return (
        <RelationDropdown
          field={field}
          formField={formField}
          appId={appId}
          allModels={allModels}
          currentFields={currentFields}
          watchValues={watchValues}
        />
      );

    case "user_ref":
      return <UserRefDropdown formField={formField} />;

    case "file":
      return (
        <FileUploadField
          appId={appId}
          modelSlug={modelSlug}
          recordId={recordId}
          fieldName={field.name}
          value={formField.value}
          onChange={formField.onChange}
        />
      );

    case "rich_text":
      return (
        <Textarea
          placeholder={placeholder || "Enter text…"}
          rows={4}
          {...formField}
        />
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2 pt-1">
          <Switch
            checked={!!formField.value}
            onCheckedChange={formField.onChange}
            id={`sw-${field.name}`}
          />
          <Label
            htmlFor={`sw-${field.name}`}
            className="text-sm text-muted-foreground cursor-pointer"
          >
            {placeholder || "Yes"}
          </Label>
        </div>
      );

    case "select": {
      const opts = field.config?.options ?? [];
      return (
        <Select
          onValueChange={formField.onChange}
          value={formField.value ?? ""}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder || "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {opts.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "multiselect": {
      const opts = field.config?.options ?? [];
      const selected = Array.isArray(formField.value) ? formField.value : [];
      return (
        <div className="space-y-1.5 rounded-md border border-input p-3">
          {opts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No options configured.
            </p>
          ) : (
            opts.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={selected.includes(opt)}
                  onChange={(e) =>
                    formField.onChange(
                      e.target.checked
                        ? [...selected, opt]
                        : selected.filter((v) => v !== opt),
                    )
                  }
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))
          )}
        </div>
      );
    }

    case "number":
      return (
        <Input type="number" placeholder={placeholder || "0"} {...formField} />
      );

    case "currency":
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {field.config?.currency_symbol ?? "$"}
          </span>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            className="pl-7"
            {...formField}
          />
        </div>
      );

    case "email":
      return (
        <Input
          type="email"
          placeholder={placeholder || "email@example.com"}
          {...formField}
        />
      );

    case "url":
      return (
        <Input
          type="url"
          placeholder={placeholder || "https://"}
          {...formField}
        />
      );

    case "phone":
      return (
        <Input
          type="tel"
          placeholder={placeholder || "+1 (555) 000-0000"}
          {...formField}
        />
      );

    case "date":
      return <Input type="date" {...formField} />;

    case "datetime":
      return <Input type="datetime-local" {...formField} />;

    case "child_table":
      return (
        <ChildTableEditor
          field={field}
          value={Array.isArray(formField.value) ? formField.value : []}
          onChange={formField.onChange}
        />
      );

    case "time":
      return <Input type="time" {...formField} />;

    case "duration":
      // store as string like "HH:MM:SS"
      return <Input type="text" placeholder="HH:MM:SS" pattern="\d{2}:\d{2}:\d{2}" {...formField} />;

    case "color": {
      const colorVal = formField.value || "#000000";
      return (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={colorVal}
            onChange={formField.onChange}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            type="text"
            value={colorVal}
            onChange={formField.onChange}
            className="flex-1"
            placeholder="#000000"
          />
        </div>
      );
    }

    case "rating": {
      const max = field.max_rating ?? 5;
      const current = Number(formField.value) || 0;
      return (
        <div className="flex gap-1">
          {Array.from({ length: max }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => formField.onChange(i + 1 === current ? 0 : i + 1)}
              className={`text-xl ${i < current ? "text-yellow-400" : "text-muted-foreground/30"}`}
            >
              ★
            </button>
          ))}
        </div>
      );
    }

    case "geolocation": {
      // store as object {lat, lng}
      const geoVal = (() => {
        try {
          if (!formField.value) return { lat: "", lng: "" };
          if (typeof formField.value === "object") return formField.value;
          return JSON.parse(formField.value);
        } catch { return { lat: "", lng: "" }; }
      })();
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">Latitude</p>
            <Input
              type="number"
              step="any"
              min={-90}
              max={90}
              placeholder="e.g. 37.7749"
              value={geoVal.lat ?? ""}
              onChange={(e) => formField.onChange({ ...geoVal, lat: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </div>
          <div className="flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">Longitude</p>
            <Input
              type="number"
              step="any"
              min={-180}
              max={180}
              placeholder="e.g. -122.4194"
              value={geoVal.lng ?? ""}
              onChange={(e) => formField.onChange({ ...geoVal, lng: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </div>
        </div>
      );
    }

    case "dynamic_link": {
      const linkedModelSlug = field.config?.linked_model ?? "";
      const currentDocId = typeof formField.value === "object" ? (formField.value?.id ?? "") : String(formField.value ?? "");
      const { data: dynRecords = [], isLoading: dynLoading } = useQuery({
        queryKey: ["dynamic-link-records", appId, linkedModelSlug],
        queryFn: () => schemaApi.listRelationRecords(appId, linkedModelSlug, {}),
        enabled: !!linkedModelSlug,
      });
      if (!linkedModelSlug) {
        return <Input type="text" placeholder="No linked model configured" disabled />;
      }
      return (
        <Select
          value={currentDocId}
          onValueChange={(v) => formField.onChange(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={dynLoading ? "Loading…" : `Select ${linkedModelSlug} record…`} />
          </SelectTrigger>
          <SelectContent>
            {dynLoading ? (
              <SelectItem value="__loading__" disabled>Loading…</SelectItem>
            ) : dynRecords.length === 0 ? (
              <SelectItem value="__empty__" disabled>No records found</SelectItem>
            ) : (
              dynRecords.map((rec) => (
                <SelectItem key={rec.id} value={rec.id}>
                  {rec.name ?? rec.title ?? rec.label ?? rec.id}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      );
    }

    case "barcode":
      return <Input type="text" placeholder="Scan or enter barcode" {...formField} />;

    case "signature":
      return <SignatureField formField={formField} />;

    case "html":
      return <Textarea {...formField} rows={6} placeholder="<p>HTML content…</p>" />;

    case "attach_image":
      return (
        <FileUploadField
          appId={appId}
          modelSlug={modelSlug}
          recordId={recordId}
          fieldName={field.name}
          value={formField.value}
          onChange={formField.onChange}
          accept="image/*"
        />
      );

    case "table_multiselect": {
      const tmsSlug = field.config?.related_model_slug;
      const tmsDisplay = field.config?.display_field ?? "name";
      const tmsSelected = Array.isArray(formField.value) ? formField.value : [];
      const { data: tmsRecords = [], isLoading: tmsLoading } = useQuery({
        queryKey: ["tms-records", appId, tmsSlug],
        queryFn: () => schemaApi.listRelationRecords(appId, tmsSlug, {}),
        enabled: !!tmsSlug,
      });
      if (!tmsSlug) {
        return <p className="text-xs text-muted-foreground">No related model configured.</p>;
      }
      if (tmsLoading) {
        return <p className="text-xs text-muted-foreground">Loading records…</p>;
      }
      return (
        <div className="space-y-1.5 rounded-md border border-input p-3 max-h-48 overflow-y-auto">
          {tmsRecords.length === 0 ? (
            <p className="text-xs text-muted-foreground">No records found.</p>
          ) : (
            tmsRecords.map((rec) => {
              const label = rec[tmsDisplay] ?? rec.name ?? rec.title ?? rec.id;
              const checked = tmsSelected.includes(rec.id);
              return (
                <label key={rec.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={checked}
                    onChange={(e) =>
                      formField.onChange(
                        e.target.checked
                          ? [...tmsSelected, rec.id]
                          : tmsSelected.filter((id) => id !== rec.id),
                      )
                    }
                  />
                  <span className="text-sm">{String(label)}</span>
                </label>
              );
            })
          )}
        </div>
      );
    }

    case "icon": {
      const iconName = formField.value ?? "";
      return (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="e.g. star, home, bell"
            value={iconName}
            onChange={formField.onChange}
            className="flex-1 font-mono text-sm"
          />
          {iconName && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-input bg-muted text-xs text-muted-foreground">
              {iconName.slice(0, 2)}
            </div>
          )}
        </div>
      );
    }

    case "section_break":
    case "column_break":
    case "page_break":
      // Layout fields are not inputs — render nothing here
      return null;

    default:
      return <Input type="text" placeholder={placeholder} {...formField} />;
  }
}

// ─── Conditional field expression evaluator ───────────────────────────────────
// Safe evaluator: only supports "doc.field op literal" comparisons.
// Uses actual field values — never embeds user data into executable code.

function evalDepends(expr, docValues) {
  if (!expr) return true;
  try {
    const match = expr.trim().match(
      /^doc\.(\w+)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/
    );
    if (!match) return true; // Unknown format — show field

    const [, fieldName, op, rawRhs] = match;
    const lhs = docValues[fieldName];

    // Parse right-hand side literal safely (no eval)
    const rhs = rawRhs.trim();
    let rhsValue;
    if (rhs === "null" || rhs === "undefined") rhsValue = null;
    else if (rhs === "true") rhsValue = true;
    else if (rhs === "false") rhsValue = false;
    else if (/^-?\d+(\.\d+)?$/.test(rhs)) rhsValue = Number(rhs);
    else if (/^["'](.*)["']$/.test(rhs)) rhsValue = rhs.slice(1, -1);
    else return true; // Unrecognised value — show field

    switch (op) {
      case "===": case "==":  return lhs === rhsValue;
      case "!==": case "!=":  return lhs !== rhsValue;
      case ">":               return Number(lhs) > Number(rhsValue);
      case "<":               return Number(lhs) < Number(rhsValue);
      case ">=":              return Number(lhs) >= Number(rhsValue);
      case "<=":              return Number(lhs) <= Number(rhsValue);
      default:                return true;
    }
  } catch {
    return true; // on error, show field
  }
}

// ─── Record form dialog ────────────────────────────────────────────────────────

function RecordFormDialog({
  open,
  onClose,
  fields,
  onSave,
  isSaving,
  editRecord,
  appId,
  modelSlug,
  allModels,
  currentUserId,
}) {
  const zodSchema = buildZodSchema(fields);
  const form = useForm({
    resolver: zodResolver(zodSchema),
    values: buildDefaultValues(fields, editRecord),
  });

  // Watch all form values for cascading dropdowns and conditional logic
  const watchValues = useWatch({ control: form.control });

  // recordId is null when creating a new record
  const recordId = editRecord?.id ?? null;
  const isEditing = !!editRecord;

  // fetch_from: when a relation field has fetch_from config, auto-fill target field
  // fetch_from format: "RelatedModelSlug.field_name"
  const handleFetchFrom = useCallback(
    async (changedFieldName, selectedId) => {
      const changedField = fields.find((f) => f.name === changedFieldName);
      if (!changedField || changedField.type !== "relation") return;
      // Find fields that have fetch_from pointing to this relation
      for (const f of fields) {
        const fetchFrom = f.fetch_from ?? f.config?.fetch_from;
        if (!fetchFrom) continue;
        const [relatedSlug, sourceFieldName] = fetchFrom.split(".");
        if (!relatedSlug || !sourceFieldName) continue;
        // Check if the related model slug matches the changed field's related_model_slug
        const relatedModelSlug = changedField.config?.related_model_slug;
        if (relatedModelSlug !== relatedSlug) continue;
        if (!selectedId) continue;
        try {
          const rec = await apiClient.get(
            `/schema/apps/${appId}/${relatedSlug}/records/${selectedId}`,
          );
          const fetchedValue = rec.data?.[sourceFieldName] ?? rec[sourceFieldName];
          if (fetchedValue !== undefined) {
            form.setValue(f.name, fetchedValue);
          }
        } catch {
          // ignore fetch errors silently
        }
      }
    },
    [fields, appId, form],
  );

  const renderFormFields = () => {
    const elements = [];
    let inSection = false;

    for (const field of fields) {
      // Conditional visibility
      const isVisible = evalDepends(
        field.depends_on ?? field.config?.depends_on,
        watchValues,
      );
      if (!isVisible) continue;

      // Layout breaks
      if (field.type === "section_break") {
        elements.push(
          <div key={field.name} className="col-span-full">
            <hr className="my-4" />
            {field.label && (
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                {field.label}
              </h3>
            )}
          </div>,
        );
        inSection = true;
        continue;
      }

      if (field.type === "column_break") {
        // Insert a spacer that forces a new grid column
        elements.push(
          <div key={field.name} className="col-span-full md:col-span-1 hidden md:block" />,
        );
        continue;
      }

      if (field.type === "page_break") {
        elements.push(
          <div key={field.name} className="col-span-full">
            <hr className="my-6 border-2 border-dashed border-border" />
            {field.label && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                {field.label}
              </p>
            )}
          </div>,
        );
        continue;
      }

      // Dynamic required / read-only based on conditions
      const isRequired =
        field.is_required ||
        (field.mandatory_depends_on &&
          evalDepends(field.mandatory_depends_on, watchValues));
      const isReadOnly =
        field.read_only ||
        (field.read_only_depends_on &&
          evalDepends(field.read_only_depends_on, watchValues));

      elements.push(
        <FormField
          key={field.name}
          control={form.control}
          name={field.name}
          render={({ field: formField }) => {
            // Wrap onChange for relation fields to trigger fetch_from
            const wrappedOnChange =
              field.type === "relation"
                ? (val) => {
                    formField.onChange(val);
                    handleFetchFrom(field.name, val);
                  }
                : formField.onChange;

            return (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {isRequired && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </FormLabel>
                <FormControl>
                  <RecordFieldInput
                    field={field}
                    formField={{ ...formField, onChange: wrappedOnChange }}
                    appId={appId}
                    modelSlug={modelSlug}
                    recordId={recordId}
                    allModels={allModels}
                    currentFields={fields}
                    watchValues={watchValues}
                    readOnly={isReadOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />,
      );
    }
    return elements;
  };

  const fieldsForm = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 py-1">
        {renderFormFields()}
        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editRecord ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={
          isEditing
            ? "max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            : "max-w-lg max-h-[85vh] overflow-y-auto"
        }
      >
        <DialogHeader>
          <DialogTitle>
            {editRecord ? "Edit Record" : "Create Record"}
          </DialogTitle>
        </DialogHeader>
        {isEditing ? (
          <Tabs
            defaultValue="fields"
            className="flex flex-col flex-1 overflow-hidden"
          >
            <TabsList className="w-full justify-start shrink-0">
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent
              value="fields"
              className="flex-1 overflow-y-auto mt-0 pt-2"
            >
              {fieldsForm}
            </TabsContent>
            <TabsContent
              value="activity"
              className="flex-1 overflow-hidden mt-0 pt-2"
            >
              <div className="h-full overflow-y-auto">
                <RecordActivityFeed
                  appId={appId}
                  modelSlug={modelSlug}
                  recordId={recordId}
                  currentUserId={currentUserId}
                />
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          fieldsForm
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Cell value formatter ──────────────────────────────────────────────────────

function CellValue({ value, field, allModels, record }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/40 text-xs">—</span>;
  }

  if (field.type === "boolean") {
    return value ? (
      <Badge variant="outline" className="text-xs px-1.5 py-0 text-green-700 border-green-300 bg-green-50">
        Yes
      </Badge>
    ) : (
      <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
        No
      </Badge>
    );
  }

  if (field.type === "rating") {
    const stars = Number(value) || 0;
    return (
      <span className="text-sm">
        {Array.from({ length: stars }, (_, i) => (
          <span key={i} className="text-yellow-400">★</span>
        ))}
        {stars === 0 && <span className="text-muted-foreground/40 text-xs">—</span>}
      </span>
    );
  }

  if (field.type === "color") {
    const hex = typeof value === "string" && value ? value : "#000000";
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span
          className="inline-block w-4 h-4 rounded border border-border"
          style={{ backgroundColor: hex }}
        />
        {hex}
      </span>
    );
  }

  if (field.type === "geolocation") {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (parsed?.lat !== undefined && parsed?.lng !== undefined) {
        return (
          <span className="inline-flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            {Number(parsed.lat).toFixed(4)}, {Number(parsed.lng).toFixed(4)}
          </span>
        );
      }
    } catch {
      // fall through to default
    }
  }

  if (field.type === "signature") {
    const hasSig = value && value !== "" && value !== "__signed__";
    return hasSig || value === "__signed__" ? (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" />
        Signed
      </span>
    ) : (
      <span className="text-muted-foreground/40 text-xs">—</span>
    );
  }

  if (field.type === "table_multiselect") {
    const ids = Array.isArray(value) ? value : [];
    if (ids.length === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {ids.length} selected
      </span>
    );
  }

  if (field.type === "icon") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
        {String(value)}
      </span>
    );
  }

  if (field.type === "attach_image") {
    if (typeof value === "object" && value?.url) {
      return (
        <img
          src={value.url}
          alt="attachment"
          className="h-8 w-8 rounded object-cover border border-border"
        />
      );
    }
    return <span className="text-xs text-muted-foreground">Image</span>;
  }

  if (field.type === "time" || field.type === "duration") {
    return <span className="text-xs font-mono">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <Badge key={i} variant="secondary" className="text-xs px-1.5 py-0">
            {v}
          </Badge>
        ))}
      </div>
    );
  }

  if (field.type === "child_table") {
    const rows = Array.isArray(value) ? value : [];
    return (
      <span className="text-xs text-muted-foreground">
        {rows.length === 0 ? "—" : `${rows.length} row${rows.length !== 1 ? "s" : ""}`}
      </span>
    );
  }

  if (field.type === "relation") {
    const relatedSlug = field.config?.related_model_slug;
    const relatedModel = allModels.find((m) => m.slug === relatedSlug);

    // Check if we have populated relation data from backend
    const populatedKey = `__${field.name}__`;
    const populatedData = record?.[populatedKey];
    const displayValue =
      populatedData?.display || String(value).slice(0, 8) + "…";

    return (
      <span className="inline-flex items-center gap-1 text-xs">
        {/* <span className="text-muted-foreground">
          {relatedModel?.name ?? relatedSlug}:
        </span> */}
        <span className="font-medium">{displayValue}</span>
      </span>
    );
  }

  if (field.type === "file") {
    const filename = typeof value === "object" ? value?.filename : value;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span>📎</span>
        <span className="truncate max-w-[120px]">{filename || "file"}</span>
      </span>
    );
  }

  if (field.type === "date") {
    return (
      <span className="text-xs" title={value}>
        {fmtDate(value)}
      </span>
    );
  }
  if (field.type === "datetime") {
    const { label, title } = fmtSmart(value);
    return (
      <span className="text-xs" title={title}>
        {label}
      </span>
    );
  }

  // Auto-detect ISO timestamp strings (created_at / updated_at from system)
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const { label, title } = fmtSmart(value);
    return (
      <span className="text-xs text-muted-foreground" title={title}>
        {label}
      </span>
    );
  }

  const str = String(value);
  return (
    <span className="text-sm" title={str.length > 40 ? str : undefined}>
      {str.length > 40 ? str.slice(0, 38) + "…" : str}
    </span>
  );
}

// ─── Records table ─────────────────────────────────────────────────────────────

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field)
    return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
  return sortDir === 1 ? (
    <ArrowUp className="h-3 w-3 ml-1 text-primary" />
  ) : (
    <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  );
}

function InlineCellEditor({ value, onSave, onCancel }) {
  const [val, setVal] = useState(String(value ?? ""));
  return (
    <div className="flex items-center gap-1 -mx-1">
      <Input
        autoFocus
        className="h-6 text-xs px-1.5 py-0"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(val);
          if (e.key === "Escape") onCancel();
        }}
      />
      <button
        type="button"
        onClick={() => onSave(val)}
        className="text-green-600 hover:text-green-700"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const RecordRow = memo(function RecordRow({
  record,
  idx,
  isSelected,
  hasNamingSeries,
  displayFields,
  editingCell,
  setEditingCell,
  onInlineSave,
  allModels,
  onEdit,
  onDelete,
  onTriggerWorkflow,
  onSubmitApproval,
  onViewAudit,
  onSelectId,
}) {
  return (
    <tr
      className={cn(
        "group transition-colors hover:bg-muted/30",
        isSelected
          ? "bg-primary/5"
          : idx % 2 === 0
            ? "bg-background"
            : "bg-muted/10",
      )}
    >
      <td className="py-3 pl-4 pr-2">
        <button
          type="button"
          onClick={() => onSelectId(record.id)}
          className="text-muted-foreground hover:text-foreground"
        >
          {isSelected ? (
            <CheckSquare className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
      </td>
      {hasNamingSeries && (
        <td className="py-3 px-4">
          <span className="font-mono text-xs font-semibold text-primary bg-primary/5 px-1.5 py-0.5 rounded">
            {record._name ?? "—"}
          </span>
        </td>
      )}
      {displayFields.map((f) => {
        const isEditing =
          editingCell?.recordId === record.id &&
          editingCell?.fieldName === f.name;
        const isInlineEditable = ![
          "relation",
          "multiselect",
          "boolean",
          "file",
          "formula",
          "user_ref",
          "child_table",
          "rich_text",
        ].includes(f.type);
        return (
          <td
            key={f.name}
            className={cn(
              "py-3 px-4 max-w-[220px]",
              isInlineEditable && "cursor-pointer",
            )}
            onDoubleClick={() =>
              isInlineEditable &&
              setEditingCell({
                recordId: record.id,
                fieldName: f.name,
              })
            }
            title={
              isInlineEditable ? "Double-click to edit" : undefined
            }
          >
            {isEditing ? (
              <InlineCellEditor
                value={record[f.name]}
                onSave={(val) => {
                  onInlineSave(record, f.name, val);
                  setEditingCell(null);
                }}
                onCancel={() => setEditingCell(null)}
              />
            ) : (
              <CellValue
                value={record[f.name]}
                field={f}
                allModels={allModels}
                record={record}
              />
            )}
          </td>
        );
      })}
      <td className="py-3 px-4">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
            onClick={() => onEdit(record)}
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-amber-500/10 hover:text-amber-600"
            onClick={() => onTriggerWorkflow(record)}
            title="Trigger Workflow"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-blue-500/10 hover:text-blue-600"
            onClick={() => onSubmitApproval(record)}
            title="Submit for Approval"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-muted hover:text-foreground"
            onClick={() => onViewAudit(record)}
            title="Audit History"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(record)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
});

function RecordsTable({
  records,
  fields,
  onEdit,
  onDelete,
  onTriggerWorkflow,
  onSubmitApproval,
  onViewAudit,
  onInlineSave,
  allModels,
  sortField,
  sortDir,
  onSort,
  selectedIds,
  onSelectId,
  onSelectAll,
}) {
  const [editingCell, setEditingCell] = useState(null); // { recordId, fieldName }
  const displayFields = useMemo(() => fields.slice(0, 5), [fields]);
  // Show _name column first if any record has one (naming series)
  const hasNamingSeries = useMemo(() => records.some((r) => r._name), [records]);
  const allSelected = useMemo(
    () => records.length > 0 && records.every((r) => selectedIds.has(r.id)),
    [records, selectedIds],
  );
  const someSelected = useMemo(
    () => !allSelected && records.some((r) => selectedIds.has(r.id)),
    [allSelected, records, selectedIds],
  );

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <TableProperties className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-semibold text-foreground">No records yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Click "New Record" to add the first entry
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full text-sm min-w-[500px]">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="py-2.5 pl-4 pr-2 w-8">
              <button
                type="button"
                onClick={() =>
                  onSelectAll(allSelected ? [] : records.map((r) => r.id))
                }
                className="text-muted-foreground hover:text-foreground"
                title={allSelected ? "Deselect all" : "Select all"}
              >
                {allSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-primary" />
                ) : someSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-primary/50" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
              </button>
            </th>
            {hasNamingSeries && (
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                ID
              </th>
            )}
            {displayFields.map((f) => (
              <th
                key={f.name}
                className={cn(
                  "text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap",
                  f.is_sortable &&
                    "cursor-pointer hover:text-foreground select-none",
                )}
                onClick={() => f.is_sortable && onSort(f.name)}
              >
                <span className="inline-flex items-center">
                  {f.label}
                  {f.is_sortable && (
                    <SortIcon
                      field={f.name}
                      sortField={sortField}
                      sortDir={sortDir}
                    />
                  )}
                </span>
              </th>
            ))}
            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {records.map((record, idx) => (
            <RecordRow
              key={record.id}
              record={record}
              idx={idx}
              isSelected={selectedIds.has(record.id)}
              hasNamingSeries={hasNamingSeries}
              displayFields={displayFields}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              onInlineSave={onInlineSave}
              allModels={allModels}
              onEdit={onEdit}
              onDelete={onDelete}
              onTriggerWorkflow={onTriggerWorkflow}
              onSubmitApproval={onSubmitApproval}
              onViewAudit={onViewAudit}
              onSelectId={onSelectId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function exportToCsv(records, fields, modelName) {
  const headers = fields.map((f) => f.label ?? f.name);
  const rows = records.map((rec) =>
    fields.map((f) => {
      const v = rec[f.name];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join(";");
      return String(v).replace(/"/g, '""');
    }),
  );
  const csvLines = [headers, ...rows].map((row) =>
    row.map((cell) => `"${cell}"`).join(","),
  );
  const blob = new Blob([csvLines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${modelName}-export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvText(text, fields) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split(",")
    .map((h) => h.replace(/^"|"$/g, "").trim());
  const fieldByLabel = Object.fromEntries(
    fields.map((f) => [f.label ?? f.name, f.name]),
  );
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+)/g) ?? [];
    const record = {};
    headers.forEach((h, i) => {
      const fieldName = fieldByLabel[h] ?? h;
      const raw = (values[i] ?? "").replace(/^"|"$/g, "");
      record[fieldName] = raw;
    });
    return record;
  });
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ total, fields, isFetching, onRefresh }) {
  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Hash className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground">{total}</span>
        {total === 1 ? "record" : "records"}
      </span>
      <span className="flex items-center gap-1.5">
        <TableProperties className="h-3.5 w-3.5" />
        {fields.length} {fields.length === 1 ? "field" : "fields"}
      </span>
      {isFetching && (
        <span className="flex items-center gap-1 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
        </span>
      )}
      <button
        onClick={onRefresh}
        className="ml-auto flex items-center gap-1 text-xs hover:text-foreground transition-colors"
        title="Refresh"
      >
        <RefreshCw className="h-3 w-3" />
        Refresh
      </button>
    </div>
  );
}

// ─── Quick Entry Dialog ───────────────────────────────────────────────────────

function QuickEntryDialog({ open, onOpenChange, model, appId, allModels, onSubmit, isPending }) {
  // Only show required fields (and non-layout types)
  const layoutTypes = new Set(["section_break", "column_break", "page_break", "html"]);
  const requiredFields = (model.fields ?? []).filter(
    (f) => f.is_required && !layoutTypes.has(f.type),
  );
  // If no required fields, fall back to first 5 non-layout fields
  const fieldsToShow = requiredFields.length > 0
    ? requiredFields
    : (model.fields ?? []).filter((f) => !layoutTypes.has(f.type)).slice(0, 5);

  const schema = buildZodSchema(fieldsToShow);
  const defaultValues = buildDefaultValues(fieldsToShow);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const watchValues = useWatch({ control: form.control });

  // Reset form when dialog opens
  const handleOpenChange = (v) => {
    if (!v) form.reset(defaultValues);
    onOpenChange(v);
  };

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Entry — {model.name}</DialogTitle>
        </DialogHeader>
        {fieldsToShow.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No fields defined for this model.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {fieldsToShow.map((field) => (
                <FormField
                  key={field.name}
                  control={form.control}
                  name={field.name}
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>
                        {field.label ?? field.name}
                        {field.is_required && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <RecordFieldInput
                          field={field}
                          formField={formField}
                          appId={appId}
                          modelSlug={model.slug}
                          recordId={null}
                          allModels={allModels}
                          currentFields={fieldsToShow}
                          watchValues={watchValues}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} className="gap-1.5">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create {model.name}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main RecordsPage ─────────────────────────────────────────────────────────

export function RecordsPage() {
  const { appId } = useParams({ from: "/_authenticated/apps/$appId/records" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const searchParams = useSearch({ from: "/_authenticated/apps/$appId/records" });
  const activeModelSlug = searchParams.model || null;
  const [activeView, setActiveView] = useState({
    id: "__default__",
    type: "list",
    filter_conditions: [],
    sort_field: "created_at",
    sort_dir: -1,
    visible_columns: [],
    group_by_field: null,
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState(-1);
  // Multi-condition filters: [{field, operator, value}]
  const [filterConditions, setFilterConditions] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState([]); // [] = all visible
  const [workflowTarget, setWorkflowTarget] = useState(null); // { record, selectedWorkflowId }
  const [approvalTarget, setApprovalTarget] = useState(null); // { record, selectedFlowId }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [auditRecord, setAuditRecord] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const fixtureInputRef = useRef(null);
  const PAGE_SIZE = 50;

  const { tokens, user: authUser } = useAuthStore();

  // Load all models
  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ["apps", appId, "models"],
    queryFn: () => schemaApi.listModels(appId),
    enabled: !!appId,
  });

  if (models.length && !activeModelSlug) {
    navigate({ search: { model: models[0].slug }, replace: true });
  }

  const activeModel = models.find((m) => m.slug === activeModelSlug) ?? null;

  // Single DocType: redirect directly to the single record form
  if (activeModel?.is_single && activeModelSlug) {
    navigate({ to: `/apps/${appId}/${activeModelSlug}/records/single` });
    return null;
  }

  // Workflows for trigger dialog
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows", appId],
    queryFn: () => workflowApi.listWorkflows(appId),
    enabled: !!workflowTarget,
  });

  // Approval flows for approval dialog
  const { data: approvalFlows = [] } = useQuery({
    queryKey: ["approval-flows"],
    queryFn: () => approvalsApi.listFlows(),
    enabled: !!approvalTarget,
  });

  // Audit log for selected record
  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ["record-audit", appId, activeModelSlug, auditRecord?.id],
    queryFn: () =>
      schemaApi.getRecordAudit(appId, activeModelSlug, auditRecord.id),
    enabled: !!auditRecord,
  });

  // Active filters — only include conditions with both field + value set
  const activeFilters = useMemo(() => filterConditions.filter((c) => c.field && (c.value !== "" || ["is_empty", "is_not_empty"].includes(c.operator))), [filterConditions]);

  // Load records — search + filters all go to backend
  const {
    data: recordsPage,
    isLoading: recordsLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      "apps",
      appId,
      "records",
      activeModelSlug,
      page,
      sortField,
      sortDir,
      JSON.stringify(activeFilters),
      searchText,
    ],
    queryFn: () =>
      schemaApi.listRecords(appId, activeModelSlug, {
        page,
        page_size: PAGE_SIZE,
        sort_field: sortField,
        sort_dir: sortDir,
        filters: activeFilters.length > 0 ? activeFilters : undefined,
        search: searchText.trim() || undefined,
      }),
    enabled: !!activeModelSlug,
  });

  const records = recordsPage?.items ?? [];
  const total = recordsPage?.total ?? 0;
  const hasMore = recordsPage?.has_more ?? false;

  // Sort handler — toggle direction if same field, else reset to desc
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === -1 ? 1 : -1));
    } else {
      setSortField(field);
      setSortDir(-1);
    }
    setPage(1);
  };

  // Create
  const createMut = useMutation({
    mutationFn: async (data) => {
      // Strip _pending file fields before sending to create endpoint
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(
          ([, v]) => !(v && typeof v === "object" && v._pending),
        ),
      );
      const record = await schemaApi.createRecord(
        appId,
        activeModelSlug,
        cleanData,
      );

      // Upload any pending file fields now that we have a record id
      const newRecordId = record.id ?? record._id;
      const pendingFields = Object.entries(data).filter(
        ([, v]) => v && typeof v === "object" && v._pending,
      );
      for (const [fieldName, fileMeta] of pendingFields) {
        try {
          const formData = new FormData();
          formData.append("file", fileMeta._file);
          await apiClient.post(
            `/schema/apps/${appId}/${activeModelSlug}/records/${newRecordId}/files/${fieldName}`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
        } catch (err) {
          toast.error(`File upload for '${fieldName}' failed: ${err.message}`);
        }
      }

      return record;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({
        queryKey: ["apps", appId, "records", activeModelSlug],
      });
      toast.success("Record created");
      // Navigate to the new record's detail page
      navigate({ to: `/apps/${appId}/${activeModelSlug}/records/${saved.id}` });
    },
    onError: (e) => toast.error(e.message),
  });

  // Quick Entry — create without navigating away
  const quickCreateMut = useMutation({
    mutationFn: async (data) => {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(
          ([, v]) => !(v && typeof v === "object" && v._pending),
        ),
      );
      return schemaApi.createRecord(appId, activeModelSlug, cleanData);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["apps", appId, "records", activeModelSlug],
      });
      setQuickEntryOpen(false);
      toast.success("Record created");
    },
    onError: (e) => toast.error(e.message),
  });

  // Update (still used by inline cell editing)
  const updateMut = useMutation({
    mutationFn: ({ id, data }) =>
      schemaApi.updateRecord(appId, activeModelSlug, id, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["apps", appId, "records", activeModelSlug],
      });
      toast.success("Record updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Delete
  const deleteMut = useMutation({
    mutationFn: (id) => schemaApi.deleteRecord(appId, activeModelSlug, id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["apps", appId, "records", activeModelSlug],
      });
      setDeleteTarget(null);
      toast.success("Record deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Trigger workflow
  const triggerWorkflowMut = useMutation({
    mutationFn: ({ workflowId, record }) =>
      workflowApi.triggerWorkflow(workflowId, { record_id: record.id }),
    onSuccess: () => {
      setWorkflowTarget(null);
      toast.success("Workflow triggered");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to trigger workflow"),
  });

  // Submit for approval
  const submitApprovalMut = useMutation({
    mutationFn: ({ flowId, record }) =>
      approvalsApi.createRequest({
        flow_id: flowId,
        model_id: activeModel?.id ?? "",
        record_id: record.id,
      }),
    onSuccess: () => {
      setApprovalTarget(null);
      toast.success("Submitted for approval");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to submit for approval"),
  });

  // Bulk delete
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await schemaApi.deleteRecord(appId, activeModelSlug, id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["apps", appId, "records", activeModelSlug],
      });
      setSelectedIds(new Set());
      toast.success("Records deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Bulk update
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditFields, setBulkEditFields] = useState([]); // [{fieldName, value}]

  const bulkUpdateMut = useMutation({
    mutationFn: ({ ids, data }) =>
      schemaApi.bulkUpdateRecords(appId, activeModelSlug, ids, data),
    onSuccess: (result) => {
      qc.invalidateQueries({
        queryKey: ["apps", appId, "records", activeModelSlug],
      });
      setBulkEditOpen(false);
      setBulkEditFields([]);
      setSelectedIds(new Set());
      toast.success(
        `Updated ${result.updated} record${result.updated !== 1 ? "s" : ""}${result.errors > 0 ? `, ${result.errors} failed` : ""}`,
      );
    },
    onError: (e) => toast.error(e?.response?.data?.detail || e.message),
  });

  const handleViewChange = useCallback((view) => {
    setActiveView(view);
    setFilterConditions(view.filter_conditions ?? []);
    setSortField(view.sort_field ?? "created_at");
    setSortDir(view.sort_dir ?? -1);
    setVisibleColumns(view.visible_columns ?? []);
    setPage(1);
  }, []);

  const saveViewMut = useMutation({
    mutationFn: () =>
      schemaApi.updateView(appId, activeModelSlug, activeView.id, {
        filter_conditions: filterConditions,
        sort_field: sortField,
        sort_dir: sortDir,
        visible_columns: visibleColumns,
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["views", appId, activeModelSlug] });
      setActiveView(updated);
      toast.success("View saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const switchModel = (slug) => {
    navigate({ search: { model: slug } });
    setActiveView({
      id: "__default__",
      type: "list",
      filter_conditions: [],
      sort_field: "created_at",
      sort_dir: -1,
      visible_columns: [],
      group_by_field: null,
    });
    setFilterConditions([]);
    setSortField("created_at");
    setSortDir(-1);
    setVisibleColumns([]);
    setPage(1);
    setSearchText("");
    setFilterField("");
    setFilterValue("");
    setSelectedIds(new Set());
  };

  const handleSelectId = useCallback(function handleSelectId(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(function handleSelectAll(ids) {
    setSelectedIds(new Set(ids));
  }, []);

  const handleInlineSave = useCallback(function handleInlineSave(record, fieldName, newValue) {
    updateMut.mutate({ id: record.id, data: { [fieldName]: newValue } });
  }, [updateMut]);

  async function handleFixtureImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post(
        `/schema/apps/${appId}/${activeModelSlug}/records/fixtures`,
        fd,
        { params: { on_conflict: 'skip' }, headers: { 'Content-Type': 'multipart/form-data' } },
      );
      const data = res.data;
      toast.success(`Fixtures imported: ${data.imported} new, ${data.updated} updated, ${data.skipped} skipped`);
      qc.invalidateQueries({ queryKey: ['records', appId, activeModelSlug] });
    } catch (err) {
      toast.error('Fixture import failed: ' + err.message);
    }
  }

  const handleExport = useCallback(async function handleExport(format) {
    try {
      const endpoint =
        format === "fixtures"
          ? `/schema/apps/${appId}/${activeModelSlug}/records/fixtures`
          : format === "pdf"
          ? `/schema/apps/${appId}/${activeModelSlug}/records/report.pdf`
          : `/schema/apps/${appId}/${activeModelSlug}/records/export`;
      const params = format === "fixtures" || format === "pdf" ? {} : { format };
      const res = await apiClient.get(endpoint, { params, responseType: "blob" });
      const blob = new Blob([res.data]);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download =
        format === "pdf"
          ? `${activeModelSlug}_report.pdf`
          : format === "fixtures"
          ? `${activeModelSlug}_fixtures.json`
          : `${activeModelSlug}.${format}`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      toast.error("Export failed: " + (err.response?.data?.detail || err.message));
    }
  }, [appId, activeModelSlug]);

  function handleCsvImport(e) {
    const file = e.target.files?.[0];
    if (!file || !activeModel) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rows = parseCsvText(ev.target.result, activeModel.fields);
      let ok = 0;
      for (const row of rows) {
        try {
          await schemaApi.createRecord(appId, activeModelSlug, row);
          ok++;
        } catch {
          // skip failed rows
        }
      }
      qc.invalidateQueries({
        queryKey: ["apps", appId, "records", activeModelSlug],
      });
      toast.success(`Imported ${ok} of ${rows.length} records`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const filterableFields = useMemo(() =>
    activeModel?.fields?.filter((f) => f.is_filterable) ?? [], [activeModel?.fields]);

  if (modelsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          <Skeleton className="h-96 w-52 rounded-xl" />
          <Skeleton className="h-96 flex-1 rounded-xl" />
        </div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <TableProperties className="h-9 w-9 text-muted-foreground/40" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">No models yet</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Go to the Schema Builder to define your data models first, then come
          back here to manage records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h2 className="text-xl font-bold text-foreground">Records</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage data across {models.length}{" "}
            {models.length === 1 ? "model" : "models"}
          </p>
        </div>
        {/* Global cross-model search */}
        <GlobalSearch appId={appId} />
        {activeModel && (
          <div className="flex items-center gap-2">
            {(authUser?.is_superuser || authUser?.roles?.includes("admin") || authUser?.roles?.includes("builder")) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowCustomFields(true)}
              >
                <Settings2 className="h-3.5 w-3.5" /> Customize
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowImport(true)}
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Export
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                  Export as Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  PDF Report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport("fixtures")}>
                  Export Fixtures (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fixtureInputRef.current?.click()}>
                  Import Fixtures (JSON)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickEntryOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Quick Entry
            </Button>
            <Button
              size="sm"
              onClick={() => {
                navigate({ to: `/apps/${appId}/${activeModelSlug}/records/new` });
              }}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New {activeModel.name}
            </Button>
          </div>
        )}
      </div>

      {/* Horizontal model tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border">
        {[...models]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((model) => {
            const isActive = activeModelSlug === model.slug;
            return (
              <button
                key={model.slug}
                onClick={() => switchModel(model.slug)}
                className={cn(
                  "px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                {model.name}
                <span
                  className={cn(
                    "ml-1.5 text-xs",
                    isActive ? "text-primary/70" : "text-muted-foreground/60",
                  )}
                >
                  {model.fields.length}f
                </span>
              </button>
            );
          })}
      </div>

      {/* Records view */}
      <div>
        {activeModel && (
          <Card className="overflow-hidden">
            {/* Card header with search */}
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    {activeModel.name}
                  </CardTitle>
                  {activeModel.fields.length > 5 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Showing {Math.min(5, activeModel.fields.length)} of{" "}
                      {activeModel.fields.length} columns
                    </p>
                  )}
                </div>
              </div>

              {/* View switcher */}
              <div className="mt-2 mb-1">
                <ViewSwitcher
                  appId={appId}
                  modelSlug={activeModelSlug}
                  model={activeModel}
                  activeViewId={activeView.id}
                  onViewChange={handleViewChange}
                />
              </div>

              {/* Stats + Search row */}
              <div className="flex items-center gap-3 mt-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder={`Search ${activeModel.name.toLowerCase()}s…`}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                  {searchText && (
                    <button
                      onClick={() => setSearchText("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {filterableFields.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeFilters.length > 0 ? "default" : "outline"}
                    className="h-8 gap-1.5"
                    onClick={() => setFilterOpen((v) => !v)}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {activeFilters.length > 0 ? `Filtered (${activeFilters.length})` : "Filter"}
                  </Button>
                )}
                {/* Column visibility toggle */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant={visibleColumns.length > 0 ? "default" : "outline"}
                      className="h-8 gap-1.5"
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                      Columns{visibleColumns.length > 0 ? ` (${visibleColumns.length})` : ""}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-xs">Show / hide columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {activeModel.fields.map((f) => (
                      <DropdownMenuCheckboxItem
                        key={f.name}
                        checked={visibleColumns.length === 0 || visibleColumns.includes(f.name)}
                        onCheckedChange={(checked) => {
                          if (visibleColumns.length === 0) {
                            // currently "all visible" — hiding one means listing all-but-this
                            if (!checked) {
                              setVisibleColumns(activeModel.fields.map(ff => ff.name).filter(n => n !== f.name));
                            }
                          } else {
                            setVisibleColumns((prev) =>
                              checked ? [...prev, f.name] : prev.filter((n) => n !== f.name)
                            );
                          }
                        }}
                      >
                        {f.label || f.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {visibleColumns.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setVisibleColumns([])}>
                          Show all columns
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Save current view state */}
                {activeView.id !== "__default__" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => saveViewMut.mutate()}
                    disabled={saveViewMut.isPending}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saveViewMut.isPending ? "Saving…" : "Save view"}
                  </Button>
                )}
                <StatsBar
                  total={total}
                  fields={activeModel.fields}
                  isFetching={isFetching}
                  onRefresh={refetch}
                />
              </div>

              {/* Multi-condition filter panel */}
              {filterOpen && filterableFields.length > 0 && (
                <div className="mt-2 p-3 bg-muted/40 rounded-lg border border-border space-y-2">
                  {filterConditions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No filters. Add one below.</p>
                  )}
                  {filterConditions.map((cond, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {i > 0 && (
                        <span className="text-xs text-muted-foreground w-8 text-center shrink-0">AND</span>
                      )}
                      {i === 0 && <span className="w-8 shrink-0" />}
                      <Select
                        value={cond.field}
                        onValueChange={(v) => {
                          const next = [...filterConditions];
                          next[i] = { ...cond, field: v, value: "" };
                          setFilterConditions(next);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue placeholder="Field…" />
                        </SelectTrigger>
                        <SelectContent>
                          {filterableFields.map((f) => (
                            <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={cond.operator || "equals"}
                        onValueChange={(v) => {
                          const next = [...filterConditions];
                          next[i] = { ...cond, operator: v };
                          setFilterConditions(next);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">equals</SelectItem>
                          <SelectItem value="not_equals">not equals</SelectItem>
                          <SelectItem value="contains">contains</SelectItem>
                          <SelectItem value="not_contains">not contains</SelectItem>
                          <SelectItem value="starts_with">starts with</SelectItem>
                          <SelectItem value="ends_with">ends with</SelectItem>
                          <SelectItem value="gt">greater than</SelectItem>
                          <SelectItem value="gte">greater or equal</SelectItem>
                          <SelectItem value="lt">less than</SelectItem>
                          <SelectItem value="lte">less or equal</SelectItem>
                          <SelectItem value="in">is one of (comma)</SelectItem>
                          <SelectItem value="not_in">is not one of (comma)</SelectItem>
                          <SelectItem value="is_empty">is empty</SelectItem>
                          <SelectItem value="is_not_empty">is not empty</SelectItem>
                        </SelectContent>
                      </Select>
                      {!["is_empty", "is_not_empty"].includes(cond.operator) && (
                        <Input
                          className="h-7 text-xs flex-1"
                          placeholder="Value…"
                          value={cond.value ?? ""}
                          onChange={(e) => {
                            const next = [...filterConditions];
                            next[i] = { ...cond, value: e.target.value };
                            setFilterConditions(next);
                            setPage(1);
                          }}
                        />
                      )}
                      <button
                        onClick={() => {
                          setFilterConditions(filterConditions.filter((_, j) => j !== i));
                          setPage(1);
                        }}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs gap-1"
                      onClick={() => {
                        setFilterConditions([...filterConditions, { field: filterableFields[0]?.name ?? "", operator: "equals", value: "" }]);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Add condition
                    </Button>
                    {filterConditions.length > 0 && (
                      <button
                        onClick={() => { setFilterConditions([]); setPage(1); }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="px-6 pt-0 pb-4">
              {recordsLoading ? (
                <div className="space-y-2 py-6">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Bulk action bar */}
                  {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 py-2 px-4 bg-primary/5 border border-primary/20 rounded-lg mb-2">
                      <span className="text-sm font-medium text-primary">
                        {selectedIds.size} selected
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1"
                        onClick={() => {
                          setBulkEditFields([{ fieldName: "", value: "" }]);
                          setBulkEditOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit selected
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 gap-1"
                        disabled={bulkDeleteMut.isPending}
                        onClick={() => bulkDeleteMut.mutate([...selectedIds])}
                      >
                        {bulkDeleteMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete selected
                      </Button>
                      <button
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                  {activeView.type === "kanban" ? (
                    <KanbanView
                      records={records}
                      model={activeModel}
                      view={activeView}
                      appId={appId}
                      onRecordClick={(r) => navigate({ to: `/apps/${appId}/${activeModelSlug}/records/${r.id}` })}
                      onRefresh={refetch}
                    />
                  ) : activeView.type === "calendar" ? (
                    <CalendarView
                      records={records}
                      model={activeModel}
                      view={activeView}
                      onRecordClick={(r) => navigate({ to: `/apps/${appId}/${activeModelSlug}/records/${r.id}` })}
                    />
                  ) : activeView.type === "gantt" ? (
                    <GanttView
                      records={records}
                      fields={activeModel.fields}
                      appId={appId}
                      modelSlug={activeModelSlug}
                    />
                  ) : activeView.type === "map" ? (
                    <MapView
                      records={records}
                      fields={activeModel.fields}
                    />
                  ) : activeModel?.is_tree ? (
                    <TreeView
                      records={records}
                      model={activeModel}
                      appId={appId}
                      modelSlug={activeModelSlug}
                      onRecordClick={(r) => navigate({ to: `/apps/${appId}/${activeModelSlug}/records/${r.id}` })}
                    />
                  ) : (
                    <RecordsTable
                      records={records}
                      fields={visibleColumns.length > 0
                        ? activeModel.fields.filter(f => visibleColumns.includes(f.name))
                        : activeModel.fields}
                      onEdit={(r) => navigate({ to: `/apps/${appId}/${activeModelSlug}/records/${r.id}` })}
                      onDelete={setDeleteTarget}
                      onTriggerWorkflow={(r) =>
                        setWorkflowTarget({ record: r, selectedWorkflowId: "" })
                      }
                      onSubmitApproval={(r) =>
                        setApprovalTarget({ record: r, selectedFlowId: "" })
                      }
                      onViewAudit={setAuditRecord}
                      onInlineSave={handleInlineSave}
                      allModels={models}
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      selectedIds={selectedIds}
                      onSelectId={handleSelectId}
                      onSelectAll={handleSelectAll}
                    />
                  )}

                  {/* Pagination */}
                  {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                      <p className="text-xs text-muted-foreground">
                        Page {page} · {Math.min(page * PAGE_SIZE, total)} of{" "}
                        {total} records
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={page === 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={!hasMore}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          <ChevronRightIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Trigger Workflow dialog */}
      <Dialog
        open={!!workflowTarget}
        onOpenChange={(v) => !v && setWorkflowTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Trigger Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Select a workflow to run for this record.
            </p>
            <Select
              value={workflowTarget?.selectedWorkflowId ?? ""}
              onValueChange={(v) =>
                setWorkflowTarget((t) => ({ ...t, selectedWorkflowId: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select workflow…" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((wf) => (
                  <SelectItem key={wf.id} value={wf.id}>
                    {wf.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkflowTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !workflowTarget?.selectedWorkflowId ||
                triggerWorkflowMut.isPending
              }
              onClick={() =>
                triggerWorkflowMut.mutate({
                  workflowId: workflowTarget.selectedWorkflowId,
                  record: workflowTarget.record,
                })
              }
            >
              {triggerWorkflowMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Trigger"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit for Approval dialog */}
      <Dialog
        open={!!approvalTarget}
        onOpenChange={(v) => !v && setApprovalTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Submit for Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Select an approval flow for this record.
            </p>
            <Select
              value={approvalTarget?.selectedFlowId ?? ""}
              onValueChange={(v) =>
                setApprovalTarget((t) => ({ ...t, selectedFlowId: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select approval flow…" />
              </SelectTrigger>
              <SelectContent>
                {approvalFlows.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !approvalTarget?.selectedFlowId || submitApprovalMut.isPending
              }
              onClick={() =>
                submitApprovalMut.mutate({
                  flowId: approvalTarget.selectedFlowId,
                  record: approvalTarget.record,
                })
              }
            >
              {submitApprovalMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit History dialog */}
      <Dialog
        open={!!auditRecord}
        onOpenChange={(v) => !v && setAuditRecord(null)}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit History</DialogTitle>
          </DialogHeader>
          {auditLoading ? (
            <div className="space-y-2 py-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No audit events yet.
            </p>
          ) : (
            <div className="space-y-3 py-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="border border-border rounded-lg p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs capitalize",
                        log.action === "create" &&
                          "border-green-500/30 text-green-600",
                        log.action === "update" &&
                          "border-blue-500/30 text-blue-600",
                        log.action === "delete" &&
                          "border-red-500/30 text-red-600",
                      )}
                    >
                      {log.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {fmtSmart(log.created_at).label}
                    </span>
                  </div>
                  {log.user_id && (
                    <p className="text-xs text-muted-foreground">
                      By:{" "}
                      <code className="bg-muted px-1 rounded">
                        {log.user_id.slice(0, 8)}…
                      </code>
                    </p>
                  )}
                  {Object.keys(log.changes).length > 0 && (
                    <div className="space-y-1">
                      {Object.entries(log.changes).map(([field, change]) => (
                        <div key={field} className="text-xs">
                          <span className="font-medium">{field}:</span>{" "}
                          {change.from !== undefined && (
                            <span className="text-red-500 line-through mr-1">
                              {String(change.from ?? "")}
                            </span>
                          )}
                          {change.to !== undefined && (
                            <span className="text-green-600">
                              {String(change.to ?? "")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Entry dialog */}
      {activeModel && (
        <QuickEntryDialog
          open={quickEntryOpen}
          onOpenChange={setQuickEntryOpen}
          model={activeModel}
          appId={appId}
          allModels={models}
          onSubmit={(data) => quickCreateMut.mutate(data)}
          isPending={quickCreateMut.isPending}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this record?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The record will be permanently
            removed.
          </p>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditOpen} onOpenChange={(v) => { if (!v) { setBulkEditOpen(false); setBulkEditFields([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {selectedIds.size} record{selectedIds.size !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Only the fields you add below will be updated. Other fields stay unchanged.
            </p>
            {bulkEditFields.map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Field</Label>
                  <Select
                    value={row.fieldName}
                    onValueChange={(v) => {
                      const next = [...bulkEditFields];
                      next[i] = { fieldName: v, value: "" };
                      setBulkEditFields(next);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select field…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(activeModel?.fields ?? [])
                        .filter((f) => !["formula", "rollup", "file"].includes(f.type))
                        .map((f) => (
                          <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">New value</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="value"
                    value={row.value}
                    onChange={(e) => {
                      const next = [...bulkEditFields];
                      next[i] = { ...next[i], value: e.target.value };
                      setBulkEditFields(next);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="mb-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => setBulkEditFields(bulkEditFields.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setBulkEditFields([...bulkEditFields, { fieldName: "", value: "" }])}
            >
              <Plus className="h-3 w-3 mr-1" />Add field
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkEditOpen(false); setBulkEditFields([]); }}>Cancel</Button>
            <Button
              disabled={
                bulkEditFields.length === 0 ||
                bulkEditFields.some((r) => !r.fieldName) ||
                bulkUpdateMut.isPending
              }
              onClick={() => {
                const data = Object.fromEntries(bulkEditFields.map((r) => [r.fieldName, r.value]));
                bulkUpdateMut.mutate({ ids: [...selectedIds], data });
              }}
            >
              {bulkUpdateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Update ${selectedIds.size} record${selectedIds.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden fixture import file input */}
      <input
        ref={fixtureInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFixtureImport}
      />

      {activeModel && (
        <ImportDialog
          open={showImport}
          onClose={() => setShowImport(false)}
          appId={appId}
          modelSlug={activeModelSlug}
          fields={activeModel.fields}
          onSuccess={() => {
            qc.invalidateQueries({
              queryKey: ["apps", appId, "records", activeModelSlug],
            });
            toast.success("Import complete");
          }}
        />
      )}
      {activeModel && showCustomFields && (
        <CustomFieldsModal
          open={showCustomFields}
          onClose={() => setShowCustomFields(false)}
          appId={appId}
          model={activeModel}
        />
      )}
    </div>
  );
}

function TreeView({ records, model, appId, modelSlug, onRecordClick }) {
  const parentField = model.parent_field || "parent";
  const [expanded, setExpanded] = useState({});

  const displayField =
    model.fields?.find((f) => f.type === "text" || f.name === "name")?.name ||
    "name";

  const buildChildren = (parentId) =>
    records.filter((r) => {
      const val = r[parentField];
      if (parentId === null) return !val || val === "";
      return val === parentId || val === String(parentId);
    });

  const toggleExpand = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  function TreeNode({ record, depth }) {
    const children = buildChildren(record.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded[record.id];

    return (
      <div>
        <div
          className="flex items-center gap-1 py-2 rounded-md hover:bg-muted/50 group"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <button
            type="button"
            className="h-5 w-5 shrink-0 flex items-center justify-center text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(record.id);
            }}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="h-3.5 w-3.5 block" />
            )}
          </button>
          <button
            type="button"
            className="text-sm text-left flex-1 truncate hover:text-primary"
            onClick={() => onRecordClick(record)}
          >
            {record[displayField] || record.name || `#${String(record.id).slice(-8)}`}
          </button>
          {record._docstatus !== undefined && (
            <Badge
              variant="outline"
              className={
                record._docstatus === 1
                  ? "border-green-500/30 text-green-600 text-xs"
                  : record._docstatus === 2
                  ? "border-red-500/30 text-red-600 text-xs"
                  : "text-xs"
              }
            >
              {record._docstatus === 1
                ? "Submitted"
                : record._docstatus === 2
                ? "Cancelled"
                : "Draft"}
            </Badge>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {children.map((child) => (
              <TreeNode key={child.id} record={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const roots = buildChildren(null);
  const displayRoots = roots.length > 0 ? roots : records;

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No records yet.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg divide-y divide-border bg-background">
      {displayRoots.map((r) => (
        <TreeNode key={r.id} record={r} depth={0} />
      ))}
    </div>
  );
}
