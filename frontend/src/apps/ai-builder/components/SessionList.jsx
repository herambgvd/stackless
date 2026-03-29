import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmtSmart } from "@/shared/lib/date";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { aiApi } from "../api/ai.api";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

const STATUS_BADGE = {
  active: { label: "Active", variant: "secondary" },
  blueprint_ready: { label: "Blueprint Ready", variant: "default" },
  materialised: { label: "App Created", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export function SessionList({ selectedId, onSelect, onNew }) {
  const qc = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["ai-sessions"],
    queryFn: aiApi.listSessions,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => aiApi.deleteSession(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["ai-sessions"] });
      if (selectedId === id) onNew();
      toast.success("Session deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Button onClick={onNew} className="w-full gap-2" variant="outline" size="sm">
          <Plus className="h-4 w-4" /> New Conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          : sessions.length === 0
            ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Start a new conversation above</p>
              </div>
            )
            : sessions.map((s) => {
              const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.active;
              const isSelected = s.session_id === selectedId;
              return (
                <button
                  key={s.session_id}
                  onClick={() => onSelect(s.session_id)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2.5 group transition-colors",
                    isSelected ? "bg-primary/10 text-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-medium line-clamp-1 flex-1">{s.title || "Untitled"}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0 -mt-0.5"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.session_id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={badge.variant} className="text-xs h-4 px-1">{badge.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {(() => { const { label, title } = fmtSmart(s.updated_at); return <span title={title}>{label}</span>; })()}
                    </span>
                  </div>
                </button>
              );
            })
        }
      </div>
    </div>
  );
}
