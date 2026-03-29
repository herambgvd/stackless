import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Grid3X3,
  Inbox,
  Users,
  Workflow,
  ArrowRight,
  Plus,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Star,
  Zap,
} from "lucide-react";
import { StatsCard } from "./StatsCard";
import { dashboardApi } from "../api/dashboard.api";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { fmtSmart } from "@/shared/lib/date";
import { useAuthStore } from "@/shared/store/auth.store";

const RUN_STATUS = {
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  failed:    { icon: XCircle,      color: "text-destructive", label: "Failed" },
  running:   { icon: Activity,     color: "text-blue-500",  label: "Running" },
  pending:   { icon: Clock,        color: "text-yellow-500", label: "Pending" },
  cancelled: { icon: XCircle,      color: "text-muted-foreground", label: "Cancelled" },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const firstName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: dashboardApi.getStats,
    staleTime: 60_000,
  });

  const { data: ws, isLoading: wsLoading } = useQuery({
    queryKey: ["dashboard", "workspace"],
    queryFn: dashboardApi.getWorkspace,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const recentApps = ws?.recent_apps ?? [];
  const myTasks = ws?.my_tasks ?? { count: 0, items: [] };
  const myApprovals = ws?.my_approvals ?? { count: 0, items: [] };
  const recentRuns = ws?.recent_runs ?? [];
  const favourites = ws?.favourites ?? [];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {getGreeting()}, {firstName} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button size="sm" asChild>
          <Link to="/apps" className="gap-1.5">
            <Plus className="h-4 w-4" /> New App
          </Link>
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Apps"
          value={stats?.total_apps ?? "—"}
          icon={Grid3X3}
          description="Published applications"
          loading={statsLoading}
        />
        <StatsCard
          title="Active Workflows"
          value={stats?.active_workflows ?? "—"}
          icon={Workflow}
          description="Running automations"
          loading={statsLoading}
        />
        <StatsCard
          title="My Tasks"
          value={myTasks.count ?? "—"}
          icon={ClipboardList}
          description="Pending your action"
          loading={wsLoading}
          highlight={myTasks.count > 0}
        />
        <StatsCard
          title="Pending Approvals"
          value={myApprovals.count ?? "—"}
          icon={Inbox}
          description="Awaiting your review"
          loading={statsLoading || wsLoading}
          highlight={myApprovals.count > 0}
        />
      </div>

      {/* Main grid: Recent Apps + Tasks/Approvals */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Apps (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-muted-foreground" /> Recent Apps
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/apps" className="flex items-center gap-1 text-xs">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {wsLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : recentApps.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Grid3X3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No apps yet</p>
                <Button size="sm" className="mt-3" asChild>
                  <Link to="/apps"><Plus className="h-4 w-4 mr-1" />Create your first app</Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {recentApps.map((app) => (
                  <Link
                    key={app.id}
                    to="/apps/$appId/records"
                    params={{ appId: app.id }}
                    className="group flex items-start gap-3 rounded-lg border p-3 hover:border-primary/50 hover:bg-accent/40 transition-all"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-sm font-bold"
                      style={{ backgroundColor: app.color || "#6366f1" }}
                    >
                      {app.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary">{app.name}</p>
                      {app.description && (
                        <p className="text-xs text-muted-foreground truncate">{app.description}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Tasks + Approvals (1 col) */}
        <div className="space-y-4">
          {/* My Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" /> My Tasks
                {myTasks.count > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0">{myTasks.count}</Badge>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tasks" className="text-xs flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {wsLoading ? (
                <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
              ) : myTasks.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">All caught up!</p>
              ) : (
                <div className="space-y-1">
                  {myTasks.items.map((task) => (
                    <Link
                      key={task.id}
                      to="/tasks"
                      className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{task.title}</p>
                        {task.due_at && (
                          <p className="text-[10px] text-muted-foreground">
                            Due {fmtSmart(task.due_at).label}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Approvals */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" /> Approvals
                {myApprovals.count > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0">{myApprovals.count}</Badge>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/approvals/inbox" className="text-xs flex items-center gap-1">
                  Inbox <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {wsLoading ? (
                <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
              ) : myApprovals.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No pending approvals</p>
              ) : (
                <div className="space-y-1">
                  {myApprovals.items.map((req) => (
                    <Link
                      key={req.id}
                      to="/approvals/inbox"
                      className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
                    >
                      <Inbox className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium font-mono truncate">{req.record_id.slice(-8)}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtSmart(req.created_at).label}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom row: Recent workflow runs + Pinned records */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent workflow activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" /> Recent Workflow Activity
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/workflows/runs" className="text-xs flex items-center gap-1">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {wsLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
            ) : recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-1">
                {recentRuns.map((run) => {
                  const cfg = RUN_STATUS[run.status] ?? RUN_STATUS.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={run.id} className="flex items-center gap-3 px-1 py-1.5 rounded hover:bg-muted/30">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground">{run.workflow_id.slice(-8)}</span>
                        {run.trigger_event && (
                          <span className="ml-2 text-xs text-muted-foreground">{run.trigger_event}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {fmtSmart(run.created_at).label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pinned / Favourite records */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-muted-foreground" /> Pinned Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wsLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
            ) : favourites.length === 0 ? (
              <div className="text-center py-4">
                <Star className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No pinned records</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Star records to pin them here for quick access
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {favourites.map((fav) => (
                  <Link
                    key={`${fav.app_id}-${fav.record_id}`}
                    to="/apps/$appId/$modelSlug/records/$recordId"
                    params={{ appId: fav.app_id, modelSlug: fav.model_slug, recordId: fav.record_id }}
                    className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/40 transition-colors group"
                  >
                    <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium font-mono truncate group-hover:text-primary">
                        {fav.model_slug} / {fav.record_id.slice(-8)}
                      </p>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
