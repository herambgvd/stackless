import { useState, useCallback, useEffect, useRef } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { ChildTableEditor } from "./ChildTableEditor";
import { useParams, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { buildZodSchema, buildDefaultValues } from "@/shared/lib/schema-utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  History,
  MessageSquare,
  Play,
  Send,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  XCircle,
  FilePen,
  UserCheck,
  Copy,
  Lock,
  Unlock,
  Share2,
  Link,
  Mail,
  Printer,
  ChevronDown,
  Star,
  Tag,
  X,
  Users,
  Paperclip,
  Download,
  GitBranch,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { schemaApi } from "../api/schema.api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Separator } from "@/shared/components/ui/separator";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
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
} from "@/shared/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { cn } from "@/shared/lib/utils";
import { fmtSmart } from "@/shared/lib/date";
import RecordActivityFeed from "./RecordActivityFeed";
import FileUploadField from "./FileUploadField";
import { usersApi } from "@/apps/admin/users/api/users.api";
import { workflowApi } from "@/apps/flow-designer/api/workflow.api";
import { approvalsApi } from "@/apps/approvals/api/approvals.api";
import { useAuthStore } from "@/shared/store/auth.store";
import { printFormatsApi } from "../api/print-formats.api";

// ── Depends On evaluator ────────────────────────────────────────────────────

function evaluateDependsOn(dep, watchValues) {
  if (!dep || !dep.field) return true; // no condition — always show
  const fieldVal = watchValues?.[dep.field];
  const condVal = dep.value ?? "";
  switch (dep.operator ?? "equals") {
    case "equals":       return String(fieldVal ?? "") === String(condVal);
    case "not_equals":   return String(fieldVal ?? "") !== String(condVal);
    case "contains":     return String(fieldVal ?? "").includes(String(condVal));
    case "is_set":       return fieldVal !== null && fieldVal !== undefined && fieldVal !== "";
    case "is_not_set":   return fieldVal === null || fieldVal === undefined || fieldVal === "";
    default:             return true;
  }
}

// buildZodSchema and buildDefaultValues imported from @/shared/lib/schema-utils
// Filter out read-only/hidden/computed fields before passing to these functions
function getEditableFields(fields) {
  return fields.filter(
    (f) => !f.read_only && !f.config?.read_only && !f.is_hidden && f.type !== "formula" && f.type !== "rollup"
  );
}

// ── Relation dropdown ─────────────────────────────────────────────────────────

function RelationDropdown({ field, formField, appId, allModels, currentFields, watchValues, onFetchFrom }) {
  const relatedSlug = field.config?.related_model_slug;
  const targetAppId = field.config?.target_app_id || appId;  // cross-app support
  const relatedModel = allModels.find((m) => m.slug === relatedSlug);

  const cascade = (() => {
    if (!relatedModel) return null;
    for (const relField of relatedModel.fields) {
      if (relField.type !== "relation") continue;
      const parentSlug = relField.config?.related_model_slug;
      if (!parentSlug) continue;
      const parentField = currentFields.find(
        (f) => f.type === "relation" && f.config?.related_model_slug === parentSlug,
      );
      if (!parentField) continue;
      const parentValue = watchValues?.[parentField.name];
      if (parentValue) return { filterField: relField.name, filterValue: parentValue };
    }
    return null;
  })();

  const { data: relRecords = [], isLoading } = useQuery({
    queryKey: ["relation-records", targetAppId, relatedSlug, cascade?.filterValue],
    queryFn: () => schemaApi.listRelationRecords(appId, relatedSlug, { ...(cascade ?? {}), targetAppId }),
    enabled: !!relatedSlug,
  });

  // For cross-app relations, relatedModel may not be in allModels (different app)
  // Fall back to display_field config or smart label from first text field in record
  const configDisplayField = field.config?.display_field;
  const displayField =
    relatedModel?.fields?.find((f) => f.name === (configDisplayField || "name")) ??
    relatedModel?.fields?.find((f) => ["text", "email", "phone"].includes(f.type)) ??
    null;
  const getLabel = (rec) => {
    if (configDisplayField && rec[configDisplayField] != null) return String(rec[configDisplayField]);
    if (displayField) return String(rec[displayField.name] ?? rec.id);
    // Cross-app: try common label fields then fall back to id
    return String(rec.name ?? rec.title ?? rec.label ?? rec.id);
  };

  const handleChange = (newId) => {
    formField.onChange(newId);
    // Fetch From: auto-populate mapped fields from the linked record
    const fetchMappings = field.config?.fetch_from ?? [];
    if (fetchMappings.length > 0 && newId && onFetchFrom) {
      const linked = relRecords.find((r) => r.id === newId);
      if (linked) {
        const patches = {};
        for (const mapping of fetchMappings) {
          if (mapping.source_field && mapping.target_field && linked[mapping.source_field] !== undefined) {
            patches[mapping.target_field] = linked[mapping.source_field];
          }
        }
        if (Object.keys(patches).length > 0) onFetchFrom(patches);
      }
    }
  };

  // Find label for the current value (even before relRecords loads)
  const currentRec = relRecords.find((r) => r.id === formField.value);
  const currentLabel = currentRec ? getLabel(currentRec) : null;

  return (
    <Select onValueChange={handleChange} value={formField.value ?? ""}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading…" : `Select ${relatedModel?.name ?? relatedSlug}…`}>
          {formField.value && (currentLabel || (isLoading ? "Loading…" : formField.value))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <>
            {/* Keep current value visible while loading other options */}
            {formField.value && (
              <SelectItem value={formField.value}>{currentLabel || formField.value}</SelectItem>
            )}
            <SelectItem value="__loading__" disabled>Loading records…</SelectItem>
          </>
        ) : relRecords.length === 0 ? (
          <SelectItem value="__empty__" disabled>No records found</SelectItem>
        ) : (
          relRecords.map((rec) => (
            <SelectItem key={rec.id} value={rec.id}>{getLabel(rec)}</SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function UserRefDropdown({ formField }) {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => usersApi.listUsers(),
  });
  return (
    <Select onValueChange={formField.onChange} value={formField.value ?? ""}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading users…" : "Select user…"} />
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Field input router ────────────────────────────────────────────────────────

function RecordFieldInput({ field, formField, appId, modelSlug, recordId, allModels, currentFields, watchValues, onFetchFrom }) {
  const placeholder = field.config?.placeholder ?? "";

  if (field.read_only || field.config?.read_only || field.type === "formula" || field.type === "rollup") {
    return (
      <div className="flex items-center gap-2 min-h-9 px-3 py-2 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
        {String(formField.value ?? "—")}
        <Badge variant="outline" className="ml-auto text-[10px]">computed</Badge>
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
          onFetchFrom={onFetchFrom}
        />
      );
    case "user_ref":
      return <UserRefDropdown formField={formField} />;
    case "boolean":
      return (
        <div className="flex items-center gap-2 h-9">
          <Switch checked={!!formField.value} onCheckedChange={formField.onChange} />
          <span className="text-sm text-muted-foreground">
            {formField.value ? "Yes" : "No"}
          </span>
        </div>
      );
    case "select": {
      const opts = field.config?.options ?? [];
      return (
        <Select onValueChange={formField.onChange} value={formField.value ?? ""}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder || "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    case "multiselect": {
      const opts = field.config?.options ?? [];
      const selected = Array.isArray(formField.value) ? formField.value : [];
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5 min-h-9 p-2 rounded-md border border-input bg-background">
            {selected.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => formField.onChange(selected.filter((s) => s !== v))}
                  className="hover:text-destructive"
                >×</button>
              </Badge>
            ))}
          </div>
          <Select
            onValueChange={(v) => {
              if (!selected.includes(v)) formField.onChange([...selected, v]);
            }}
            value=""
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Add option…" />
            </SelectTrigger>
            <SelectContent>
              {opts.filter((o) => !selected.includes(o)).map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case "rich_text":
      return (
        <Textarea
          {...formField}
          value={formField.value ?? ""}
          placeholder={placeholder}
          rows={4}
          className="resize-y"
        />
      );
    case "date":
      return <Input type="date" {...formField} value={formField.value ?? ""} />;
    case "datetime":
      return <Input type="datetime-local" {...formField} value={formField.value ?? ""} />;
    case "number":
      return (
        <Input
          type="number"
          {...formField}
          value={formField.value ?? ""}
          placeholder={placeholder}
          step={field.config?.step ?? "any"}
          min={field.config?.min}
          max={field.config?.max}
        />
      );
    case "currency":
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {field.config?.currency_symbol ?? "$"}
          </span>
          <Input
            type="number"
            {...formField}
            value={formField.value ?? ""}
            className="pl-7"
            placeholder={placeholder}
            step={field.config?.step ?? "0.01"}
            min={field.config?.min}
            max={field.config?.max}
          />
        </div>
      );
    case "email":
      return <Input type="email" {...formField} value={formField.value ?? ""} placeholder={placeholder} />;
    case "url":
      return <Input type="url" {...formField} value={formField.value ?? ""} placeholder={placeholder} />;
    case "phone":
      return <Input type="tel" {...formField} value={formField.value ?? ""} placeholder={placeholder} />;
    case "file":
      return (
        <FileUploadField
          field={field}
          value={formField.value}
          onChange={formField.onChange}
          appId={appId}
          modelSlug={modelSlug}
          recordId={recordId}
        />
      );
    case "json":
      return (
        <Textarea
          value={
            formField.value != null
              ? (typeof formField.value === "string"
                  ? formField.value
                  : JSON.stringify(formField.value, null, 2))
              : ""
          }
          onChange={(e) => {
            try { formField.onChange(e.target.value ? JSON.parse(e.target.value) : null); }
            catch { formField.onChange(e.target.value); }
          }}
          placeholder={'{"key": "value"}'}
          rows={5}
          className="font-mono text-sm resize-y"
        />
      );
    case "child_table":
      return (
        <ChildTableEditor
          field={field}
          value={Array.isArray(formField.value) ? formField.value : []}
          onChange={formField.onChange}
        />
      );
    default:
      return <Input {...formField} value={formField.value ?? ""} placeholder={placeholder} />;
  }
}

// ── Audit log section ─────────────────────────────────────────────────────────

function AuditLogTab({ appId, modelSlug, recordId }) {
  const qc = useQueryClient();
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["record-audit", appId, modelSlug, recordId],
    queryFn: () => schemaApi.getRecordAudit(appId, modelSlug, recordId),
    enabled: !!recordId,
  });

  const restoreMut = useMutation({
    mutationFn: (auditLogId) =>
      import("@/shared/lib/api-client").then(({ apiClient }) =>
        apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/restore/${auditLogId}`)
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "record", modelSlug, recordId] });
      qc.invalidateQueries({ queryKey: ["record-audit", appId, modelSlug, recordId] });
      toast.success("Record restored to selected version");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  if (isLoading) return <div className="py-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (logs.length === 0) return <p className="text-sm text-muted-foreground py-4">No audit history yet.</p>;

  const actionColor = {
    create: "text-green-600",
    update: "text-blue-600",
    delete: "text-red-600",
    submit: "text-emerald-600",
    cancel: "text-orange-600",
    amend: "text-violet-600",
  };

  return (
    <div className="space-y-3 py-2">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 text-sm border-l-2 border-border pl-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("font-medium capitalize", actionColor[log.action] ?? "text-foreground")}>
                {log.action}
              </span>
              <span className="text-xs text-muted-foreground">{fmtSmart(log.created_at).label}</span>
              {log.snapshot && (
                <button
                  onClick={async () => {
                    if (await confirm({ title: "Restore Version", message: "Restore record to this version?", confirmLabel: "Restore" })) {
                      restoreMut.mutate(log.id);
                    }
                  }}
                  disabled={restoreMut.isPending}
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 transition-colors"
                >
                  {restoreMut.isPending ? "Restoring…" : "Restore"}
                </button>
              )}
            </div>
            {log.changes && Object.keys(log.changes).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {Object.entries(log.changes).map(([field, change]) => (
                  <div key={field} className="text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">{field}</span>
                    {change?.from !== undefined && (
                      <span> {JSON.stringify(change.from)} → {JSON.stringify(change.to)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Attachments tab ───────────────────────────────────────────────────────────

function AttachmentsTab({ appId, modelSlug, recordId }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["attachments", appId, modelSlug, recordId],
    queryFn: () => schemaApi.listAttachments(appId, modelSlug, recordId),
    enabled: !!recordId,
  });

  const uploadMut = useMutation({
    mutationFn: (file) => schemaApi.uploadAttachment(appId, modelSlug, recordId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", appId, modelSlug, recordId] });
      toast.success("File attached");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => schemaApi.deleteAttachment(appId, modelSlug, recordId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", appId, modelSlug, recordId] });
      toast.success("Attachment removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDownload = async (attachment) => {
    try {
      const { url, filename } = await schemaApi.getAttachmentUrl(appId, modelSlug, recordId, attachment.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.click();
    } catch {
      toast.error("Could not download file");
    }
  };

  const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMut.mutate(file);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-1.5 h-8 text-xs"
        onClick={() => fileRef.current?.click()}
        disabled={uploadMut.isPending}
      >
        {uploadMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {uploadMut.isPending ? "Uploading…" : "Attach file"}
      </Button>

      {isLoading && <Skeleton className="h-10 w-full" />}
      {!isLoading && attachments.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No attachments yet.</p>
      )}
      <div className="space-y-1.5">
        {attachments.map((att) => (
          <div
            key={att.id}
            className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs"
          >
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{att.filename}</p>
              <p className="text-muted-foreground">{fmtSize(att.size)}</p>
            </div>
            <button
              onClick={() => handleDownload(att)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => deleteMut.mutate(att.id)}
              disabled={deleteMut.isPending}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Related Documents ─────────────────────────────────────────────────────────

function RelatedDocumentsTab({ appId, modelSlug, recordId, models, onNavigate }) {
  // Find all models that have a relation field pointing to this model
  const relatedModels = models.filter(
    (m) =>
      m.slug !== modelSlug &&
      (m.fields ?? []).some(
        (f) => f.type === "relation" && f.config?.related_model_slug === modelSlug,
      ),
  );

  if (relatedModels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No other models link to this one.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {relatedModels.map((m) => {
        const linkFields = (m.fields ?? []).filter(
          (f) => f.type === "relation" && f.config?.related_model_slug === modelSlug,
        );
        return (
          <RelatedModelSection
            key={m.slug}
            appId={appId}
            model={m}
            linkFields={linkFields}
            recordId={recordId}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
}

function RelatedModelSection({ appId, model, linkFields, recordId, onNavigate }) {
  // Fetch records from related model filtered by the link field = current recordId
  const filter = linkFields.length > 0
    ? [{ field: linkFields[0].name, operator: "equals", value: recordId }]
    : [];

  const { data: page, isLoading } = useQuery({
    queryKey: ["related-docs", appId, model.slug, recordId],
    queryFn: () =>
      schemaApi.listRecords(appId, model.slug, {
        page: 1,
        page_size: 20,
        filters: filter,
      }),
    enabled: filter.length > 0,
  });

  const items = page?.items ?? [];

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {model.name} ({isLoading ? "…" : items.length})
      </p>
      {isLoading && <Skeleton className="h-8 w-full" />}
      {!isLoading && items.length === 0 && (
        <p className="text-xs text-muted-foreground pl-1">No linked records.</p>
      )}
      <div className="space-y-1">
        {items.map((r) => {
          const label =
            r._name ?? r.name ?? r.title ?? r.label ?? `#${String(r.id).slice(-6)}`;
          return (
            <button
              key={r.id}
              onClick={() => onNavigate(model.slug, r.id)}
              className="w-full text-left rounded-md px-2.5 py-1.5 text-xs hover:bg-accent transition-colors border border-border flex items-center gap-2"
            >
              <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RecordDetailPage() {
  const confirm = useConfirm();
  const { appId, modelSlug, recordId } = useParams({
    from: "/_authenticated/apps/$appId/$modelSlug/records/$recordId",
  });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isSingle = recordId === "single";
  const isNew = recordId === "new";

  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUserId, setShareUserId] = useState("");
  const [sharePermission, setSharePermission] = useState("read");
  const [newTagInput, setNewTagInput] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const currentUser = useAuthStore((s) => s.user);

  // ── Fetch model definition ────────────────────────────────────────────────
  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ["apps", appId, "models"],
    queryFn: () => schemaApi.listModels(appId),
    enabled: !!appId,
  });
  const activeModel = models.find((m) => m.slug === modelSlug) ?? null;
  const editableFields = getEditableFields((activeModel?.fields ?? []).filter(
    (f) => !f.config?.hidden,
  ));

  // ── Single DocType: fetch (or prepare) the single record ─────────────────
  const { data: singlePage, isLoading: singleLoading } = useQuery({
    queryKey: ["apps", appId, "records", modelSlug, "single"],
    queryFn: () => schemaApi.listRecords(appId, modelSlug, { page: 1, page_size: 1 }),
    enabled: isSingle && !!modelSlug,
  });
  const singleRecord = singlePage?.items?.[0] ?? null;
  const resolvedRecordId = isSingle ? (singleRecord?.id ?? null) : recordId;
  const resolvedIsNew = isNew || (isSingle && !singleRecord);

  // ── Fetch existing record (not for "new") ─────────────────────────────────
  const { data: record, isLoading: recordLoading } = useQuery({
    queryKey: ["apps", appId, "record", modelSlug, resolvedRecordId],
    queryFn: () => schemaApi.getRecord(appId, modelSlug, resolvedRecordId),
    enabled: !resolvedIsNew && !!resolvedRecordId && !!modelSlug && !isSingle,
  });
  const activeRecord = isSingle ? singleRecord : record;

  // ── Neighbour record IDs (prev/next) ─────────────────────────────────────
  const { data: neighbourPage } = useQuery({
    queryKey: ["apps", appId, "records", modelSlug, "neighbour-ids"],
    queryFn: () => schemaApi.listRecords(appId, modelSlug, { page: 1, page_size: 200, sort_field: "created_at", sort_dir: -1 }),
    enabled: !resolvedIsNew && !!modelSlug && !isSingle,
  });
  const allIds = (neighbourPage?.items ?? []).map((r) => r.id);
  const currentIdx = allIds.indexOf(resolvedRecordId);
  const prevId = currentIdx > 0 ? allIds[currentIdx - 1] : null;
  const nextId = currentIdx < allIds.length - 1 ? allIds[currentIdx + 1] : null;

  // ── Users list (for assignment dropdown) ─────────────────────────────────
  const { data: tenantUsers = [] } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => usersApi.listUsers(),
    enabled: !resolvedIsNew,
  });

  // ── Workflows & approval flows ────────────────────────────────────────────
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows", appId],
    queryFn: () => workflowApi.listWorkflows(appId),
    enabled: workflowDialogOpen,
  });
  const { data: approvalFlows = [] } = useQuery({
    queryKey: ["approval-flows"],
    queryFn: () => approvalsApi.listFlows(),
    enabled: approvalDialogOpen,
  });

  const { data: printFormats = [] } = useQuery({
    queryKey: ["print-formats", appId, modelSlug],
    queryFn: () => printFormatsApi.list(appId, modelSlug),
    enabled: !resolvedIsNew,
  });

  // ── Tags ──────────────────────────────────────────────────────────────────
  const { data: recordTags = [], refetch: refetchTags } = useQuery({
    queryKey: ["record-tags", appId, modelSlug, resolvedRecordId],
    queryFn: () => schemaApi.listTags(appId, modelSlug, resolvedRecordId),
    enabled: !resolvedIsNew && !!resolvedRecordId,
  });
  const addTagMut = useMutation({
    mutationFn: (tag) => schemaApi.addTag(appId, modelSlug, resolvedRecordId, tag),
    onSuccess: () => { refetchTags(); setNewTagInput(""); },
    onError: (e) => toast.error(e.message),
  });
  const removeTagMut = useMutation({
    mutationFn: (tag) => schemaApi.removeTag(appId, modelSlug, resolvedRecordId, tag),
    onSuccess: () => refetchTags(),
    onError: (e) => toast.error(e.message),
  });

  // ── Favourite ─────────────────────────────────────────────────────────────
  const { data: favStatus, refetch: refetchFav } = useQuery({
    queryKey: ["record-fav", appId, modelSlug, resolvedRecordId],
    queryFn: () => schemaApi.getFavouriteStatus(appId, modelSlug, resolvedRecordId),
    enabled: !resolvedIsNew && !!resolvedRecordId,
  });
  const isFavourite = favStatus?.is_favourite ?? false;
  const toggleFavMut = useMutation({
    mutationFn: () =>
      isFavourite
        ? schemaApi.removeFavourite(appId, modelSlug, resolvedRecordId)
        : schemaApi.addFavourite(appId, modelSlug, resolvedRecordId),
    onSuccess: () => refetchFav(),
    onError: (e) => toast.error(e.message),
  });

  // ── Sharing ───────────────────────────────────────────────────────────────
  const { data: recordShares = [], refetch: refetchShares } = useQuery({
    queryKey: ["record-shares", appId, modelSlug, resolvedRecordId],
    queryFn: () => schemaApi.listShares(appId, modelSlug, resolvedRecordId),
    enabled: shareDialogOpen && !resolvedIsNew && !!resolvedRecordId,
  });
  const addShareMut = useMutation({
    mutationFn: () => schemaApi.shareRecord(appId, modelSlug, resolvedRecordId, shareUserId, sharePermission),
    onSuccess: () => { refetchShares(); setShareUserId(""); },
    onError: (e) => toast.error(e.message),
  });
  const removeShareMut = useMutation({
    mutationFn: (shareId) => schemaApi.removeShare(appId, modelSlug, resolvedRecordId, shareId),
    onSuccess: () => refetchShares(),
    onError: (e) => toast.error(e.message),
  });

  // ── Workflow state transition ─────────────────────────────────────────────
  const workflowTransitionMut = useMutation({
    mutationFn: (toState) => schemaApi.workflowTransition(appId, modelSlug, resolvedRecordId, toState),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "records", modelSlug, resolvedRecordId] });
      toast.success(`State changed to "${data.record?._workflow_state ?? ""}"`);
    },
    onError: (e) => toast.error(e.response?.data?.detail ?? e.message ?? "Transition failed"),
  });

  // Derived: current workflow state info
  const modelWorkflowStates = activeModel?.workflow_states ?? [];
  const currentWorkflowState = activeRecord?._workflow_state ?? null;
  const currentStateObj = modelWorkflowStates.find((s) => s.name === currentWorkflowState) ?? null;
  const availableTransitions = currentStateObj?.transitions ?? [];

  // ── Form ─────────────────────────────────────────────────────────────────
  const zodSchema = activeModel ? buildZodSchema(editableFields) : z.object({});
  const form = useForm({
    resolver: zodResolver(zodSchema),
    values: activeModel ? buildDefaultValues(editableFields, (isSingle ? singleRecord : record) ?? null) : {},
  });
  const watchValues = form.watch();

  // ── Auto-save draft to localStorage ─────────────────────────────────────
  const draftKey = `ff_draft_${appId}_${modelSlug}`;
  const draftRestored = useRef(false);

  // Restore draft only when creating a new record
  useEffect(() => {
    if (!resolvedIsNew || draftRestored.current || !activeModel) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.entries(parsed).forEach(([name, value]) => {
          form.setValue(name, value);
        });
      }
    } catch { /* ignore */ }
    draftRestored.current = true;
  }, [resolvedIsNew, activeModel, draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist draft on every form change (new records only)
  useEffect(() => {
    if (!resolvedIsNew) return;
    const values = form.getValues();
    const hasDraftData = Object.values(values).some((v) => v !== "" && v !== null && v !== undefined && v !== false);
    if (hasDraftData) {
      try { localStorage.setItem(draftKey, JSON.stringify(values)); } catch { /* ignore */ }
    }
  }, [resolvedIsNew, draftKey, form]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async (data) => {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => !(v && typeof v === "object" && v._pending)),
      );
      if (resolvedIsNew) {
        return schemaApi.createRecord(appId, modelSlug, cleanData);
      }
      return schemaApi.updateRecord(appId, modelSlug, resolvedRecordId, cleanData);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "records", modelSlug] });
      if (resolvedIsNew) {
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
        toast.success("Record created");
        // For single doctype, stay on the /single route; for regular, navigate to the new record
        if (isSingle) {
          qc.invalidateQueries({ queryKey: ["apps", appId, "records", modelSlug, "single"] });
        } else {
          navigate({ to: `/apps/${appId}/${modelSlug}/records/${saved.id}` });
        }
      } else {
        qc.invalidateQueries({ queryKey: ["apps", appId, "record", modelSlug, resolvedRecordId] });
        toast.success("Saved");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Docstatus mutations (Submit / Cancel / Amend) ─────────────────────────
  const docstatus = activeRecord?._docstatus ?? 0; // 0=Draft, 1=Submitted, 2=Cancelled
  const isSubmittable = activeModel?.is_submittable && !resolvedIsNew;

  const submitMut = useMutation({
    mutationFn: () => schemaApi.submitRecord(appId, modelSlug, resolvedRecordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "record", modelSlug, resolvedRecordId] });
      toast.success("Record submitted");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });
  const cancelDocMut = useMutation({
    mutationFn: () => schemaApi.cancelRecord(appId, modelSlug, resolvedRecordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "record", modelSlug, resolvedRecordId] });
      toast.success("Record cancelled");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });
  const amendMut = useMutation({
    mutationFn: () => schemaApi.amendRecord(appId, modelSlug, resolvedRecordId),
    onSuccess: (newRecord) => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "records", modelSlug] });
      toast.success("Amendment created");
      navigate({ to: `/apps/${appId}/${modelSlug}/records/${newRecord.id}` });
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  // ── Lock / Unlock mutations ───────────────────────────────────────────────
  const isLocked = !!activeRecord?._is_locked;
  const lockMut = useMutation({
    mutationFn: () => isLocked
      ? schemaApi.unlockRecord(appId, modelSlug, resolvedRecordId)
      : schemaApi.lockRecord(appId, modelSlug, resolvedRecordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "record", modelSlug, resolvedRecordId] });
      toast.success(isLocked ? "Record unlocked" : "Record locked");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Duplicate mutation ────────────────────────────────────────────────────
  const duplicateMut = useMutation({
    mutationFn: () => schemaApi.duplicateRecord(appId, modelSlug, resolvedRecordId),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "records", modelSlug] });
      toast.success("Record duplicated");
      navigate({ to: `/apps/${appId}/${modelSlug}/records/${copy.id}` });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Assign mutation ───────────────────────────────────────────────────────
  const assignMut = useMutation({
    mutationFn: ({ userId, note, dueDate }) =>
      schemaApi.assignRecord(appId, modelSlug, resolvedRecordId, userId || null, note, dueDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "record", modelSlug, resolvedRecordId] });
      setAssignDialogOpen(false);
      toast.success("Assignment updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Delete mutation ───────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: () => schemaApi.deleteRecord(appId, modelSlug, resolvedRecordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "records", modelSlug] });
      toast.success("Record deleted");
      navigate({ to: `/apps/${appId}/records`, search: { model: modelSlug } });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Trigger workflow ──────────────────────────────────────────────────────
  const triggerWorkflowMut = useMutation({
    mutationFn: () =>
      workflowApi.triggerWorkflow(selectedWorkflowId, {
        record_id: resolvedRecordId,
        model_slug: modelSlug,
        app_id: appId,
      }),
    onSuccess: () => { setWorkflowDialogOpen(false); toast.success("Workflow triggered"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Submit for approval ───────────────────────────────────────────────────
  const submitApprovalMut = useMutation({
    mutationFn: () =>
      approvalsApi.createRequest({
        flow_id: selectedFlowId,
        model_id: activeModel?.id,
        record_id: resolvedRecordId,
        metadata: {},
      }),
    onSuccess: () => { setApprovalDialogOpen(false); toast.success("Submitted for approval"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Send email ────────────────────────────────────────────────────────────
  const sendEmailMut = useMutation({
    mutationFn: () =>
      import("@/shared/lib/api-client").then(({ apiClient }) =>
        apiClient.post("/notifications/send", {
          channel: "email",
          recipient: emailTo.trim(),
          subject: emailSubject.trim(),
          body: emailBody.trim(),
          context: { record_id: recordId, model_slug: modelSlug, app_id: appId },
        })
      ),
    onSuccess: () => {
      setEmailDialogOpen(false);
      setEmailTo("");
      setEmailSubject("");
      setEmailBody("");
      toast.success("Email sent");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Loading states ────────────────────────────────────────────────────────
  if (modelsLoading || (!resolvedIsNew && recordLoading) || (isSingle && singleLoading)) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!activeModel) {
    return <div className="p-6 text-sm text-muted-foreground">Model "{modelSlug}" not found.</div>;
  }

  const recordTitle = isSingle
    ? activeModel.name
    : activeRecord
      ? (activeRecord._name || activeRecord.name || activeRecord.title || activeRecord.label || `#${resolvedRecordId?.slice(-6) ?? ""}`)
      : `New ${activeModel.name}`;

  // Group fields into sections of up to 2 per row for "wide" fields, 1 for others
  const fieldGroups = editableFields.reduce((acc, f) => {
    const wide = ["rich_text", "json", "multiselect", "file"].includes(f.type);
    acc.push({ field: f, wide });
    return acc;
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate({ to: `/apps/${appId}/records`, search: { model: modelSlug } })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <span className="hover:text-foreground cursor-pointer truncate max-w-[120px]"
              onClick={() => navigate({ to: `/apps/${appId}/records`, search: { model: modelSlug } })}>
              Records
            </span>
            <span>/</span>
            <span className="hover:text-foreground cursor-pointer"
              onClick={() => navigate({ to: `/apps/${appId}/records`, search: { model: modelSlug } })}>
              {activeModel.name}
            </span>
            <span>/</span>
            <span className="text-foreground font-medium truncate max-w-[200px]">{recordTitle}</span>
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Prev / Next navigation */}
          {!resolvedIsNew && (
            <div className="flex items-center gap-1 mr-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!prevId}
                onClick={() => navigate({ to: `/apps/${appId}/${modelSlug}/records/${prevId}` })}
                title="Previous record"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentIdx + 1} / {allIds.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!nextId}
                onClick={() => navigate({ to: `/apps/${appId}/${modelSlug}/records/${nextId}` })}
                title="Next record"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {!resolvedIsNew && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setWorkflowDialogOpen(true)}
              >
                <Play className="h-3.5 w-3.5" /> Workflow
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setApprovalDialogOpen(true)}
              >
                <Send className="h-3.5 w-3.5" /> Approval
              </Button>
              {/* Email */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                title="Send email"
                onClick={() => {
                  setEmailSubject(`Re: ${recordTitle}`);
                  setEmailBody(`Record: ${window.location.href}\n\n`);
                  setEmailDialogOpen(true);
                }}
              >
                <Mail className="h-3.5 w-3.5" />
              </Button>
              {/* Print */}
              {printFormats.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5" title="Print record">
                      <Printer className="h-3.5 w-3.5" />
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {printFormats.map((pf) => (
                      <DropdownMenuItem
                        key={pf.id}
                        onClick={() => window.open(printFormatsApi.renderUrl(appId, modelSlug, recordId, pf.id), "_blank")}
                      >
                        <Printer className="h-3.5 w-3.5 mr-2" />
                        {pf.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* Workflow state badge + transitions */}
              {!resolvedIsNew && modelWorkflowStates.length > 0 && (
                <>
                  {currentStateObj ? (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border"
                      style={{
                        backgroundColor: (currentStateObj.color ?? "#64748b") + "1a",
                        borderColor: (currentStateObj.color ?? "#64748b") + "55",
                        color: currentStateObj.color ?? "#64748b",
                      }}
                    >
                      {currentStateObj.label || currentStateObj.name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No state</span>
                  )}
                  {availableTransitions.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 h-7 px-2" disabled={workflowTransitionMut.isPending}>
                          <GitBranch className="h-3.5 w-3.5" />
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {availableTransitions.map((tr) => {
                          const targetState = modelWorkflowStates.find((s) => s.name === tr.to);
                          return (
                            <DropdownMenuItem
                              key={tr.to}
                              onClick={() => workflowTransitionMut.mutate(tr.to)}
                            >
                              <span
                                className="h-2 w-2 rounded-full mr-2 shrink-0"
                                style={{ background: targetState?.color ?? "#64748b" }}
                              />
                              {tr.label || tr.to}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {modelWorkflowStates.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs text-muted-foreground">
                          Set state
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {modelWorkflowStates.map((s) => (
                          <DropdownMenuItem
                            key={s.name}
                            onClick={() => workflowTransitionMut.mutate(s.name)}
                            disabled={s.name === currentWorkflowState}
                          >
                            <span
                              className="h-2 w-2 rounded-full mr-2 shrink-0"
                              style={{ background: s.color ?? "#64748b" }}
                            />
                            {s.label || s.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
              {/* Favourite */}
              <Button
                variant="outline"
                size="sm"
                title={isFavourite ? "Remove from favourites" : "Add to favourites"}
                className={`gap-1.5 ${isFavourite ? "text-amber-500 border-amber-300" : ""}`}
                onClick={() => toggleFavMut.mutate()}
                disabled={toggleFavMut.isPending}
              >
                <Star className={`h-3.5 w-3.5 ${isFavourite ? "fill-amber-400" : ""}`} />
              </Button>
              {/* Share */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                title="Share record"
                onClick={() => setShareDialogOpen(true)}
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
              {/* Copy link */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                title="Copy link to this record"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                    .then(() => toast.success("Link copied to clipboard"))
                    .catch(() => toast.error("Failed to copy link"));
                }}
              >
                <Link className="h-3.5 w-3.5" />
              </Button>
              {/* Lock / Unlock */}
              <Button
                variant="outline"
                size="sm"
                className={`gap-1.5 ${isLocked ? "text-amber-600 border-amber-300 hover:bg-amber-50" : ""}`}
                onClick={() => lockMut.mutate()}
                disabled={lockMut.isPending}
                title={isLocked ? "Unlock record" : "Lock record"}
              >
                {lockMut.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />
                }
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => duplicateMut.mutate()}
                disabled={duplicateMut.isPending}
                title="Duplicate record"
              >
                {duplicateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {/* ── Docstatus badge + actions ───────────────────────────────── */}
          {isSubmittable && (
            <>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                docstatus === 1
                  ? "bg-green-50 text-green-700 border-green-200"
                  : docstatus === 2
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-yellow-50 text-yellow-700 border-yellow-200"
              }`}>
                {docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : "Cancelled"}
              </span>

              {docstatus === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => submitMut.mutate()}
                  disabled={submitMut.isPending}
                >
                  {submitMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Submit
                </Button>
              )}
              {docstatus === 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => cancelDocMut.mutate()}
                  disabled={cancelDocMut.isPending}
                >
                  {cancelDocMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Cancel
                </Button>
              )}
              {docstatus === 2 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => amendMut.mutate()}
                  disabled={amendMut.isPending}
                >
                  {amendMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePen className="h-3.5 w-3.5" />}
                  Amend
                </Button>
              )}
            </>
          )}

          <Button
            size="sm"
            className="gap-1.5"
            onClick={form.handleSubmit((data) => saveMut.mutate(data))}
            disabled={saveMut.isPending || (isSubmittable && docstatus === 1) || isLocked}
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {resolvedIsNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      {/* ── Two-column body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: form fields */}
        <ScrollArea className="flex-1 min-w-0">
          <div className="p-6 max-w-2xl mx-auto">
            <Form {...form}>
              {isLocked && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <Lock className="h-4 w-4 shrink-0" />
                  This record is locked. Unlock it to make changes.
                </div>
              )}
              {activeRecord?._amended_from && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-700">
                  <FilePen className="h-4 w-4 shrink-0" />
                  <span>Amendment of</span>
                  <button
                    type="button"
                    className="font-mono text-xs underline hover:text-violet-900"
                    onClick={() => navigate({ to: `/apps/${appId}/${modelSlug}/records/${activeRecord._amended_from}` })}
                  >
                    #{String(activeRecord._amended_from).slice(-8)}
                  </button>
                </div>
              )}
              {docstatus === 2 && activeRecord?._amended_by && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-700">
                  <FilePen className="h-4 w-4 shrink-0" />
                  <span>Amended by</span>
                  <button
                    type="button"
                    className="font-mono text-xs underline hover:text-violet-900"
                    onClick={() => navigate({ to: `/apps/${appId}/${modelSlug}/records/${activeRecord._amended_by}` })}
                  >
                    #{String(activeRecord._amended_by).slice(-8)}
                  </button>
                </div>
              )}
              {resolvedIsNew && draftRestored.current && (() => {
                try { return !!localStorage.getItem(draftKey); } catch { return false; }
              })() && (
                <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  <span>Draft restored from your last session.</span>
                  <button
                    type="button"
                    className="text-xs underline shrink-0"
                    onClick={() => {
                      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
                      form.reset(buildDefaultValues(editableFields, null));
                    }}
                  >
                    Clear draft
                  </button>
                </div>
              )}
              <form className="space-y-1" onSubmit={form.handleSubmit((data) => saveMut.mutate(data))}>
                {/* Computed / read-only fields shown at top as info badges */}
                {editableFields.filter((f) => f.type === "formula" || f.type === "rollup" || f.read_only || f.config?.read_only).length > 0 && (
                  <Card className="mb-4">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Computed fields</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        {editableFields
                          .filter((f) => f.type === "formula" || f.type === "rollup" || f.read_only || f.config?.read_only)
                          .map((f) => (
                            <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-muted-foreground text-xs">{f.label}</span>
                              <span className="font-medium text-foreground">{String(activeRecord?.[f.name] ?? "—")}</span>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Editable fields */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {fieldGroups
                    .filter((fg) => fg.field.type !== "formula" && fg.field.type !== "rollup" && !fg.field.read_only && !fg.field.config?.read_only && !fg.field.is_hidden)
                    .filter((fg) => evaluateDependsOn(fg.field.config?.depends_on, watchValues))
                    .map(({ field, wide }) => (
                      <div key={field.name} className={cn(wide ? "col-span-2" : "col-span-1")}>
                        <FormField
                          control={form.control}
                          name={field.name}
                          render={({ field: formField }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium">
                                {field.label}
                                {field.is_required && <span className="text-destructive ml-0.5">*</span>}
                              </FormLabel>
                              <FormControl>
                                <RecordFieldInput
                                  field={field}
                                  formField={formField}
                                  appId={appId}
                                  modelSlug={modelSlug}
                                  recordId={resolvedIsNew ? null : resolvedRecordId}
                                  allModels={models}
                                  currentFields={editableFields}
                                  watchValues={watchValues}
                                  onFetchFrom={(patches) => {
                                    Object.entries(patches).forEach(([name, value]) => {
                                      form.setValue(name, value, { shouldDirty: true });
                                    });
                                  }}
                                />
                              </FormControl>
                              {field.config?.description && (
                                <p className="text-xs text-muted-foreground">{field.config.description}</p>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                </div>
              </form>
            </Form>
          </div>
        </ScrollArea>

        {/* Right: sidebar tabs */}
        <div className="w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
          <Tabs defaultValue="activity" className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="w-full rounded-none border-b border-border h-10 bg-transparent shrink-0 px-2 gap-1">
              <TabsTrigger value="activity" className="text-xs gap-1.5 flex-1">
                <MessageSquare className="h-3.5 w-3.5" /> Activity
              </TabsTrigger>
              {!resolvedIsNew && (
                <TabsTrigger value="audit" className="text-xs gap-1.5 flex-1">
                  <History className="h-3.5 w-3.5" /> Audit
                </TabsTrigger>
              )}
              {!resolvedIsNew && (
                <TabsTrigger value="tags" className="text-xs gap-1.5 flex-1">
                  <Tag className="h-3.5 w-3.5" /> Tags
                </TabsTrigger>
              )}
              {!resolvedIsNew && (
                <TabsTrigger value="links" className="text-xs gap-1.5 flex-1">
                  <Link className="h-3.5 w-3.5" /> Links
                </TabsTrigger>
              )}
              {!resolvedIsNew && (
                <TabsTrigger value="files" className="text-xs gap-1.5 flex-1">
                  <Paperclip className="h-3.5 w-3.5" /> Files
                </TabsTrigger>
              )}
              <TabsTrigger value="meta" className="text-xs gap-1.5 flex-1">
                <ExternalLink className="h-3.5 w-3.5" /> Info
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              {/* Activity feed */}
              <TabsContent value="activity" className="mt-0 p-4">
                {resolvedIsNew ? (
                  <p className="text-sm text-muted-foreground">Save the record first to view activity.</p>
                ) : (
                  <RecordActivityFeed
                    appId={appId}
                    modelSlug={modelSlug}
                    recordId={resolvedRecordId}
                    currentUserId={currentUser?.id}
                    tenantUsers={tenantUsers}
                  />
                )}
              </TabsContent>

              {/* Audit log */}
              {!resolvedIsNew && (
                <TabsContent value="audit" className="mt-0 p-4">
                  <AuditLogTab appId={appId} modelSlug={modelSlug} recordId={resolvedRecordId} />
                </TabsContent>
              )}

              {/* Tags */}
              {!resolvedIsNew && (
                <TabsContent value="tags" className="mt-0 p-4">
                  <div className="space-y-3">
                    {/* Existing tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {recordTags.length === 0 && (
                        <p className="text-xs text-muted-foreground">No tags yet.</p>
                      )}
                      {recordTags.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
                        >
                          {t.tag}
                          <button
                            onClick={() => removeTagMut.mutate(t.tag)}
                            disabled={removeTagMut.isPending}
                            className="ml-0.5 hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    {/* Add tag input */}
                    <div className="flex gap-1.5">
                      <Input
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        placeholder="Add tag…"
                        className="h-7 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newTagInput.trim()) {
                            e.preventDefault();
                            addTagMut.mutate(newTagInput.trim());
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={!newTagInput.trim() || addTagMut.isPending}
                        onClick={() => addTagMut.mutate(newTagInput.trim())}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* File attachments */}
              {!resolvedIsNew && (
                <TabsContent value="files" className="mt-0 p-4">
                  <AttachmentsTab appId={appId} modelSlug={modelSlug} recordId={resolvedRecordId} />
                </TabsContent>
              )}

              {/* Related / Linked documents */}
              {!resolvedIsNew && (
                <TabsContent value="links" className="mt-0 p-4">
                  <RelatedDocumentsTab
                    appId={appId}
                    modelSlug={modelSlug}
                    recordId={recordId}
                    models={models}
                    onNavigate={(slug, id) =>
                      navigate({ to: `/apps/${appId}/${slug}/records/${id}` })
                    }
                  />
                </TabsContent>
              )}

              {/* Record meta info */}
              <TabsContent value="meta" className="mt-0 p-4">
                <div className="space-y-3 text-sm">
                  {record?.id && (
                    <MetaRow label="ID">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono break-all">{record.id}</code>
                    </MetaRow>
                  )}
                  {record?.created_at && (
                    <MetaRow label="Created">{fmtSmart(record.created_at).label}</MetaRow>
                  )}
                  {record?.updated_at && (
                    <MetaRow label="Updated">{fmtSmart(record.updated_at).label}</MetaRow>
                  )}
                  {record?._owner && (
                    <MetaRow label="Owner">
                      <span className="text-xs text-muted-foreground font-mono">
                        {tenantUsers.find((u) => u.id === record._owner)?.full_name ?? record._owner}
                      </span>
                    </MetaRow>
                  )}
                  <Separator />
                  {/* Assign To */}
                  {!resolvedIsNew && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <UserCheck className="h-3.5 w-3.5" />
                          Assigned to
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            setAssignUserId(activeRecord?._assigned_to ?? "");
                            setAssignNote(activeRecord?._assign_note ?? "");
                            setAssignDueDate(activeRecord?._assign_due_date ?? "");
                            setAssignDialogOpen(true);
                          }}
                        >
                          {activeRecord?._assigned_to ? "Edit" : "Assign"}
                        </Button>
                      </div>
                      {activeRecord?._assigned_to ? (
                        <div className="space-y-1">
                          <p className="text-xs text-foreground font-medium">
                            {tenantUsers.find((u) => u.id === activeRecord._assigned_to)?.full_name ||
                              tenantUsers.find((u) => u.id === activeRecord._assigned_to)?.email ||
                              activeRecord._assigned_to.slice(0, 8)}
                          </p>
                          {activeRecord._assign_due_date && (
                            <p className="text-xs text-muted-foreground">
                              Due: {activeRecord._assign_due_date}
                            </p>
                          )}
                          {activeRecord._assign_note && (
                            <p className="text-xs text-muted-foreground italic truncate">
                              "{activeRecord._assign_note}"
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Unassigned</p>
                      )}
                    </div>
                  )}
                  <Separator />
                  <MetaRow label="Model"><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{modelSlug}</code></MetaRow>
                  <MetaRow label="Fields">{activeModel.fields.length}</MetaRow>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* ── Workflow trigger dialog ──────────────────────────────────────────── */}
      <Dialog open={workflowDialogOpen} onOpenChange={setWorkflowDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Trigger Workflow</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
              <SelectTrigger><SelectValue placeholder="Select workflow…" /></SelectTrigger>
              <SelectContent>
                {workflows.map((wf) => <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkflowDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => triggerWorkflowMut.mutate()} disabled={!selectedWorkflowId || triggerWorkflowMut.isPending}>
              {triggerWorkflowMut.isPending ? "Triggering…" : "Trigger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approval submit dialog ───────────────────────────────────────────── */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Submit for Approval</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
              <SelectTrigger><SelectValue placeholder="Select approval flow…" /></SelectTrigger>
              <SelectContent>
                {approvalFlows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => submitApprovalMut.mutate()} disabled={!selectedFlowId || submitApprovalMut.isPending}>
              {submitApprovalMut.isPending ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send Email dialog ────────────────────────────────────────────────── */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send Email</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="min-h-[120px] text-sm"
                placeholder="Email body…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendEmailMut.mutate()}
              disabled={!emailTo.trim() || !emailSubject.trim() || sendEmailMut.isPending}
            >
              {sendEmailMut.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</>
                : <><Mail className="h-3.5 w-3.5 mr-1.5" />Send</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Share dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Share2 className="h-4 w-4" />Share Record</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current shares */}
            {recordShares.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shared with</p>
                <div className="space-y-1.5">
                  {recordShares.map((s) => {
                    const u = tenantUsers.find((u) => u.id === s.shared_with_user_id);
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{u?.full_name ?? u?.email ?? s.shared_with_user_id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{s.permission}</Badge>
                          <button
                            onClick={() => removeShareMut.mutate(s.id)}
                            disabled={removeShareMut.isPending}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Add share */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add user</p>
              <Select value={shareUserId} onValueChange={setShareUserId}>
                <SelectTrigger><SelectValue placeholder="Select a user…" /></SelectTrigger>
                <SelectContent>
                  {tenantUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Select value={sharePermission} onValueChange={setSharePermission}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="write">Write</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="flex-1"
                  disabled={!shareUserId || addShareMut.isPending}
                  onClick={() => addShareMut.mutate()}
                >
                  {addShareMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign dialog ────────────────────────────────────────────────────── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Record</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Assign to</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger><SelectValue placeholder="Select a user…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassign__">— Unassign —</SelectItem>
                  {tenantUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due date (optional)</Label>
              <Input
                type="date"
                className="h-8 text-sm"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                placeholder="Add a note for the assignee…"
                rows={3}
                className="text-sm resize-none"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={assignMut.isPending}
              onClick={() =>
                assignMut.mutate({
                  userId: assignUserId === "__unassign__" ? null : assignUserId,
                  note: assignNote,
                  dueDate: assignDueDate,
                })
              }
            >
              {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ────────────────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete this record?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}
