import { useState, useRef } from "react";
import DOMPurify from "dompurify";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { portalApi } from "../api/portal.api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";

/**
 * Build a Zod validation schema from the portal field definitions.
 * Fields use: key (field name in DB), type, required, options, etc.
 */
function buildZodSchema(fields) {
  const shape = {};
  for (const field of fields) {
    let rule;

    switch (field.type) {
      case "number":
      case "currency":
        rule = z.coerce.number({ invalid_type_error: `${field.label} must be a number` });
        if (!field.required) rule = rule.optional();
        break;
      case "boolean":
        rule = z.boolean().default(false);
        break;
      case "email":
        rule = field.required
          ? z.string().email("Invalid email address").min(1, `${field.label} is required`)
          : z.string().email("Invalid email address").optional().or(z.literal(""));
        break;
      case "url":
        rule = field.required
          ? z.string().url("Invalid URL").min(1, `${field.label} is required`)
          : z.string().url("Invalid URL").optional().or(z.literal(""));
        break;
      case "date":
      case "datetime":
        rule = field.required
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
        break;
      case "multiselect":
      case "table_multiselect":
        rule = field.required
          ? z.array(z.string()).min(1, `${field.label} is required`)
          : z.array(z.string()).default([]);
        break;
      case "rating":
        rule = field.required ? z.number().min(1, `${field.label} is required`) : z.number().optional();
        break;
      case "file":
      case "attach_image":
      case "signature":
      case "geolocation":
        rule = field.required
          ? z.any().refine((v) => v != null && v !== "", `${field.label} is required`)
          : z.any().optional();
        break;
      case "section_break":
      case "column_break":
      case "page_break":
        // Layout-only, no validation
        rule = z.any().optional();
        break;
      default:
        rule = field.required
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
    }

    shape[field.key] = rule;
  }
  return z.object(shape);
}

export function DynamicForm({ fields = [], onSubmit, isSubmitting, appId }) {
  const zodSchema = buildZodSchema(fields);

  const defaultValues = Object.fromEntries(
    fields.map((f) => {
      if (f.type === "boolean") return [f.key, false];
      if (f.type === "multiselect" || f.type === "table_multiselect") return [f.key, []];
      if (f.type === "rating") return [f.key, 0];
      if (f.type === "geolocation") return [f.key, null];
      if (f.type === "file" || f.type === "attach_image" || f.type === "signature") return [f.key, null];
      return [f.key, ""];
    }),
  );

  const form = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {fields.map((field) => (
          <FormField
            key={field.id}
            control={form.control}
            name={field.key}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <FieldInput field={field} formField={formField} appId={appId} />
                </FormControl>
                {field.description && (
                  <FormDescription>{field.description}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Submit"}
        </Button>
      </form>
    </Form>
  );
}

function FieldInput({ field, formField, appId }) {
  const placeholder = field.placeholder ?? "";

  switch (field.type) {
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
            id={`switch-${field.key}`}
          />
          <Label
            htmlFor={`switch-${field.key}`}
            className="text-sm text-muted-foreground cursor-pointer"
          >
            {placeholder || "Yes"}
          </Label>
        </div>
      );

    case "select": {
      const options = field.options ?? [];
      return (
        <Select onValueChange={formField.onChange} value={formField.value ?? ""}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder || "Select an option…"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "multiselect": {
      const options = field.options ?? [];
      const selected = Array.isArray(formField.value) ? formField.value : [];
      return (
        <div className="space-y-1.5 rounded-md border border-input p-3">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">No options configured.</p>
          ) : (
            options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={selected.includes(opt)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      formField.onChange([...selected, opt]);
                    } else {
                      formField.onChange(selected.filter((v) => v !== opt));
                    }
                  }}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))
          )}
        </div>
      );
    }

    case "email":
      return (
        <Input type="email" placeholder={placeholder || "email@example.com"} {...formField} />
      );

    case "number":
      return (
        <Input type="number" placeholder={placeholder || "0"} {...formField} />
      );

    case "currency":
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {field.currency_symbol ?? "$"}
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

    case "date":
      return <Input type="date" {...formField} />;

    case "datetime":
      return <Input type="datetime-local" {...formField} />;

    case "url":
      return (
        <Input type="url" placeholder={placeholder || "https://"} {...formField} />
      );

    case "phone":
      return (
        <Input type="tel" placeholder={placeholder || "+1 (555) 000-0000"} {...formField} />
      );

    case "relation":
      return <RelationPickerField field={field} formField={formField} appId={appId} />;

    case "file":
      return <FileField field={field} formField={formField} appId={appId} />;

    case "attach_image":
      return <FileField field={field} formField={formField} appId={appId} accept="image/*" />;

    case "time":
      return <Input type="time" {...formField} />;

    case "duration":
      return <Input type="text" placeholder="HH:MM:SS" pattern="\d{2}:\d{2}:\d{2}" {...formField} />;

    case "color": {
      const colorVal = formField.value || "#000000";
      return (
        <div className="flex items-center gap-2">
          <Input type="color" value={colorVal} onChange={formField.onChange} className="w-12 h-9 p-1 cursor-pointer" />
          <Input type="text" value={colorVal} onChange={formField.onChange} className="flex-1" placeholder="#000000" />
        </div>
      );
    }

    case "rating": {
      const max = field.config?.max_stars ?? 5;
      const current = Number(formField.value) || 0;
      return (
        <div className="flex gap-1">
          {Array.from({ length: max }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => formField.onChange(i + 1 === current ? 0 : i + 1)}
              className={`text-xl ${i < current ? "text-yellow-400" : "text-muted-foreground/30"}`}
            >★</button>
          ))}
        </div>
      );
    }

    case "geolocation": {
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
            <Input type="number" step="any" min={-90} max={90} placeholder="e.g. 37.7749"
              value={geoVal.lat ?? ""}
              onChange={(e) => formField.onChange({ ...geoVal, lat: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </div>
          <div className="flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">Longitude</p>
            <Input type="number" step="any" min={-180} max={180} placeholder="e.g. -122.4194"
              value={geoVal.lng ?? ""}
              onChange={(e) => formField.onChange({ ...geoVal, lng: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </div>
        </div>
      );
    }

    case "barcode":
      return <Input type="text" placeholder="Scan or enter barcode…" {...formField} />;

    case "signature":
      return <PortalSignatureField formField={formField} />;

    case "html":
      // HTML fields render static content in the form, not an input
      return field.config?.html_content
        ? <div className="prose prose-sm text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(field.config.html_content) }} />
        : null;

    case "table_multiselect":
      return <TableMultiSelectField field={field} formField={formField} appId={appId} />;

    case "icon":
      return <Input type="text" placeholder="e.g. star, home, bell" className="font-mono text-sm" {...formField} />;

    case "json":
      return <Textarea rows={4} placeholder='{"key": "value"}' className="font-mono text-sm" {...formField} />;

    case "section_break":
      return (
        <div className="border-t border-border pt-2">
          {field.label && <p className="text-sm font-semibold text-foreground">{field.label}</p>}
          {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
      );

    case "column_break":
    case "page_break":
      return null;

    default:
      return <Input type="text" placeholder={placeholder} {...formField} />;
  }
}

function RelationPickerField({ field, formField, appId }) {
  const relatedSlug = field.related_model_slug;

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["portal-relation-records", appId, relatedSlug],
    queryFn: () => portalApi.listRecords(appId, relatedSlug),
    enabled: !!relatedSlug,
  });

  const getLabel = (rec) => {
    return String(rec.name ?? rec.title ?? rec.label ?? rec.email ?? Object.values(rec).find(v => typeof v === "string") ?? rec.id);
  };

  if (!relatedSlug) {
    return <Input type="text" placeholder="No related model configured" disabled />;
  }

  return (
    <Select onValueChange={formField.onChange} value={formField.value ?? ""}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading…" : `Select ${relatedSlug}…`} />
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <SelectItem value="__loading__" disabled>Loading records…</SelectItem>
        ) : records.length === 0 ? (
          <SelectItem value="__empty__" disabled>No records found</SelectItem>
        ) : (
          records.map((rec) => (
            <SelectItem key={rec.id} value={rec.id}>
              {getLabel(rec)}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function FileField({ field, formField, appId, accept }) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const meta = await portalApi.uploadFile(appId, file);
      setFileName(meta.filename);
      formField.onChange(meta);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Input
        type="file"
        accept={accept ?? field.config?.allowed_types}
        onChange={handleChange}
        disabled={uploading}
      />
      {uploading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
        </p>
      )}
      {fileName && !uploading && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> {fileName}
        </p>
      )}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}

function PortalSignatureField({ formField }) {
  const canvasRef = useRef(null);
  const [signed, setSigned] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPosRef = useRef(null);

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
    lastPosRef.current = pos;
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
    lastPosRef.current = pos;
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
        <span className="text-xs text-muted-foreground">{signed ? "✓ Signature captured" : "Draw your signature above"}</span>
        {signed && <button type="button" onClick={clear} className="text-xs text-destructive hover:underline">Clear</button>}
      </div>
    </div>
  );
}

function TableMultiSelectField({ field, formField, appId }) {
  const relatedSlug = field.related_model_slug ?? field.config?.related_model_slug;
  const displayField = field.config?.display_field ?? "name";
  const selected = Array.isArray(formField.value) ? formField.value : [];

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["portal-tms", appId, relatedSlug],
    queryFn: () => portalApi.listRecords(appId, relatedSlug),
    enabled: !!relatedSlug,
  });

  if (!relatedSlug) return <p className="text-xs text-muted-foreground">No related model configured.</p>;
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading options…</p>;

  return (
    <div className="space-y-1.5 rounded-md border border-input p-3 max-h-48 overflow-y-auto">
      {records.length === 0 ? (
        <p className="text-xs text-muted-foreground">No records found.</p>
      ) : (
        records.map((rec) => {
          const label = rec[displayField] ?? rec.name ?? rec.title ?? rec.id;
          const checked = selected.includes(rec.id);
          return (
            <label key={rec.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={checked}
                onChange={(e) =>
                  formField.onChange(
                    e.target.checked ? [...selected, rec.id] : selected.filter((id) => id !== rec.id),
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
