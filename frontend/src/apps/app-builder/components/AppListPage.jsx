import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  Grid3X3,
  Pencil,
  Sparkles,
  Trash2,
  MoreVertical,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { schemaApi } from "../api/schema.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { fmtSmart } from "@/shared/lib/date";

export function AppListPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: () => schemaApi.listApps(),
  });

  const create = useMutation({
    mutationFn: schemaApi.createApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps"] });
      qc.invalidateQueries({ queryKey: ["sidebar", "apps"] });
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      toast.success("App created");
    },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: schemaApi.deleteApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps"] });
      qc.invalidateQueries({ queryKey: ["sidebar", "apps"] });
      toast.success("App deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">My Apps</h2>
          <p className="text-sm text-muted-foreground">
            Build and manage your no-code applications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/ai-builder">
              <Sparkles className="h-4 w-4" /> Build with AI
            </Link>
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New App
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Grid3X3 className="h-14 w-14 text-muted-foreground/30 mb-4" />
          <h3 className="font-semibold text-foreground mb-1">No apps yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first no-code app to get started
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create App
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onDelete={() => del.mutate(app.id)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new app</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="app-name">App name *</Label>
              <Input
                id="app-name"
                placeholder="e.g. Customer Onboarding"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-desc">Description</Label>
              <Textarea
                id="app-desc"
                placeholder="What does this app do?"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate(form)}
              disabled={!form.name.trim() || create.isPending}
            >
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppCard({ app, onDelete }) {
  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardContent className="flex-1 p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-foreground truncate">{app.name}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/apps/$appId/builder" params={{ appId: app.id }}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit schema
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/apps/$appId/flow" params={{ appId: app.id }}>
                    <Workflow className="h-4 w-4 mr-2" /> Flow designer
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {app.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {app.description}
          </p>
        )}
      </CardContent>
      <CardFooter className="px-5 py-3 border-t text-xs text-muted-foreground">
          {(() => { const { label, title } = fmtSmart(app.updated_at); return <span title={title}>Updated {label}</span>; })()}
      </CardFooter>
    </Card>
  );
}
