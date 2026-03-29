import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { schemaApi } from "@/apps/app-builder/api/schema.api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Settings2, Check, X } from "lucide-react";
import { toast } from "sonner";

const FIELD_TYPE_COLORS = {
  text: "bg-blue-100 text-blue-700",
  number: "bg-purple-100 text-purple-700",
  select: "bg-yellow-100 text-yellow-700",
  boolean: "bg-green-100 text-green-700",
  date: "bg-orange-100 text-orange-700",
  relation: "bg-pink-100 text-pink-700",
};

function FieldPropertyRow({ field, appId, modelId }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // { key: string, value: any }

  const updateMut = useMutation({
    mutationFn: (data) => schemaApi.updateField(appId, modelId, field.name, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      toast.success(`Updated '${field.label || field.name}'`);
      setEditing(null);
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to update"),
  });

  function commit(key, value) {
    updateMut.mutate({ [key]: value });
  }

  function startEdit(key, value) {
    setEditing({ key, value });
  }

  function cancelEdit() {
    setEditing(null);
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">{field.name}</TableCell>
      <TableCell>
        {editing?.key === "label" ? (
          <div className="flex items-center gap-1">
            <Input
              className="h-6 text-xs w-40"
              value={editing.value}
              onChange={(e) => setEditing((ed) => ({ ...ed, value: e.target.value }))}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") commit("label", editing.value);
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => commit("label", editing.value)}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <span
            className="text-sm cursor-pointer hover:text-primary hover:underline"
            onClick={() => startEdit("label", field.label || field.name)}
          >
            {field.label || field.name}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          className={`text-[10px] px-1.5 py-0 ${FIELD_TYPE_COLORS[field.type] ?? "bg-muted text-muted-foreground"}`}
        >
          {field.type}
        </Badge>
      </TableCell>
      <TableCell>
        <Switch
          checked={!!field.is_required}
          onCheckedChange={(v) => commit("is_required", v)}
          disabled={updateMut.isPending}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={!!field.read_only}
          onCheckedChange={(v) => commit("read_only", v)}
          disabled={updateMut.isPending}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={!!field.is_hidden}
          onCheckedChange={(v) => commit("is_hidden", v)}
          disabled={updateMut.isPending}
        />
      </TableCell>
      <TableCell>
        {editing?.key === "placeholder" ? (
          <div className="flex items-center gap-1">
            <Input
              className="h-6 text-xs w-40"
              value={editing.value}
              onChange={(e) => setEditing((ed) => ({ ...ed, value: e.target.value }))}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") commit("config", { ...field.config, placeholder: editing.value });
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => commit("config", { ...field.config, placeholder: editing.value })}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <span
            className="text-xs text-muted-foreground cursor-pointer hover:text-foreground italic"
            onClick={() => startEdit("placeholder", field.config?.placeholder || "")}
          >
            {field.config?.placeholder || "—"}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function PropertySetterPage() {
  const [selectedApp, setSelectedApp] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ["apps-list"],
    queryFn: schemaApi.listApps,
  });

  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ["apps", selectedApp, "models"],
    queryFn: () => schemaApi.listModels(selectedApp),
    enabled: !!selectedApp,
  });

  const model = models.find((m) => m.id === selectedModel || m.slug === selectedModel);
  const fields = model?.fields ?? [];

  function handleAppChange(appId) {
    setSelectedApp(appId);
    setSelectedModel("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">Property Setter</h1>
          <p className="text-sm text-muted-foreground">
            Override field properties (label, required, read-only, hidden) on any model.
          </p>
        </div>
      </div>

      {/* Model selector */}
      <div className="flex items-end gap-4">
        <div>
          <Label className="text-xs mb-1 block">App</Label>
          <Select value={selectedApp} onValueChange={handleAppChange}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select app…" />
            </SelectTrigger>
            <SelectContent>
              {apps.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Model</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={!selectedApp}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select model…" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fields table */}
      {!selectedModel ? (
        <div className="border-2 border-dashed rounded-xl py-14 text-center">
          <Settings2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Select an app and model to view its field properties</p>
        </div>
      ) : modelsLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : fields.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">This model has no fields.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Field Name</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-24 text-center">Required</TableHead>
                <TableHead className="w-24 text-center">Read Only</TableHead>
                <TableHead className="w-24 text-center">Hidden</TableHead>
                <TableHead>Placeholder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <FieldPropertyRow
                  key={field.name}
                  field={field}
                  appId={selectedApp}
                  modelId={model.id}
                />
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground px-4 py-2 border-t">
            Click any label or placeholder cell to edit it inline. Toggle switches to change boolean properties.
          </p>
        </div>
      )}
    </div>
  );
}
