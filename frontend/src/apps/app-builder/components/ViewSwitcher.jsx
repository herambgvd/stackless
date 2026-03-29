import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { List, Columns, Calendar, Grid, Plus, Trash2, Pencil, Settings2, GanttChart, Map } from "lucide-react";
import { toast } from "sonner";
import { schemaApi } from "../api/schema.api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

const VIEW_ICONS = {
  list:     <List className="h-3.5 w-3.5" />,
  kanban:   <Columns className="h-3.5 w-3.5" />,
  calendar: <Calendar className="h-3.5 w-3.5" />,
  gallery:  <Grid className="h-3.5 w-3.5" />,
  gantt:    <GanttChart className="h-3.5 w-3.5" />,
  map:      <Map className="h-3.5 w-3.5" />,
};

const VIEW_LABELS = { list: "List", kanban: "Kanban", calendar: "Calendar", gallery: "Gallery", gantt: "Gantt", map: "Map" };

const DEFAULT_VIEW = {
  id: "__default__",
  name: "All Records",
  type: "list",
  filter_conditions: [],
  sort_field: "created_at",
  sort_dir: -1,
  visible_columns: [],
  group_by_field: null,
};

export function ViewSwitcher({ appId, modelSlug, model, activeViewId, onViewChange }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingView, setEditingView] = useState(null);

  const { data: views = [] } = useQuery({
    queryKey: ["views", appId, modelSlug],
    queryFn: () => schemaApi.listViews(appId, modelSlug),
    enabled: !!appId && !!modelSlug,
  });

  const deleteMut = useMutation({
    mutationFn: (viewId) => schemaApi.deleteView(appId, modelSlug, viewId),
    onSuccess: (_, viewId) => {
      qc.invalidateQueries({ queryKey: ["views", appId, modelSlug] });
      if (activeViewId === viewId) onViewChange(DEFAULT_VIEW);
      toast.success("View deleted");
    },
  });

  const allViews = [DEFAULT_VIEW, ...views];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {allViews.map(view => (
        <div key={view.id} className="flex items-center group">
          <button
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors",
              activeViewId === view.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            )}
            onClick={() => onViewChange(view)}
          >
            {VIEW_ICONS[view.type] ?? VIEW_ICONS.list}
            <span className="font-medium">{view.name}</span>
          </button>
          {view.id !== "__default__" && activeViewId === view.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-0.5 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                  <Settings2 className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem onClick={() => setEditingView(view)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit view
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deleteMut.mutate(view.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}

      <button
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        onClick={() => setShowCreate(true)}
      >
        <Plus className="h-3 w-3" /> Add view
      </button>

      {/* Create / Edit dialog */}
      <ViewFormDialog
        open={showCreate || !!editingView}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditingView(null); } }}
        initial={editingView}
        appId={appId}
        modelSlug={modelSlug}
        model={model}
        onSaved={(view) => {
          qc.invalidateQueries({ queryKey: ["views", appId, modelSlug] });
          onViewChange(view);
          setShowCreate(false);
          setEditingView(null);
        }}
      />
    </div>
  );
}

function ViewFormDialog({ open, onOpenChange, initial, appId, modelSlug, model, onSaved }) {
  const [form, setForm] = useState(() => initial ?? {
    name: "", type: "list", group_by_field: "", sort_field: "created_at", sort_dir: -1,
  });

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const saveMut = useMutation({
    mutationFn: (data) => initial
      ? schemaApi.updateView(appId, modelSlug, initial.id, data)
      : schemaApi.createView(appId, modelSlug, data),
    onSuccess: (saved) => { toast.success(initial ? "View updated" : "View created"); onSaved(saved); },
    onError: () => toast.error("Failed to save view"),
  });

  // Reset form when dialog opens
  function handleOpen(o) {
    if (o) setForm(initial ?? { name: "", type: "list", group_by_field: "", sort_field: "created_at", sort_dir: -1 });
    onOpenChange(o);
  }

  const selectFields = model?.fields?.filter(f => f.type === "select") ?? [];
  const dateFields = model?.fields?.filter(f => f.type === "date" || f.type === "datetime") ?? [];
  const needsGroupBy = form.type === "kanban" || form.type === "calendar";
  const groupOptions = form.type === "kanban" ? selectFields : dateFields;
  // gantt and map are self-configuring — no group_by needed

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit View" : "New View"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">View name</Label>
            <Input className="h-8 text-sm" value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Pipeline" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">View type</Label>
            <Select value={form.type} onValueChange={v => setF("type", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(VIEW_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsGroupBy && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Group by field{" "}
                {groupOptions.length === 0 && (
                  <span className="text-destructive">(no {form.type === "kanban" ? "SELECT" : "DATE"} fields found)</span>
                )}
              </Label>
              <Select value={form.group_by_field} onValueChange={v => setF("group_by_field", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select field" /></SelectTrigger>
                <SelectContent>
                  {groupOptions.map(f => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!form.name.trim() || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
