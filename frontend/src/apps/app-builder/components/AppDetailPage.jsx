import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Pencil, Workflow, Table2, LayoutDashboard } from "lucide-react";
import { schemaApi } from "../api/schema.api";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import AppDashboardPage from "./AppDashboardPage";
import ScheduledReportsPage from "./ScheduledReportsPage";
import PortalFormsPage from "./PortalFormsPage";
import { useAuthStore } from "@/shared/store/auth.store";

export function AppDetailPage() {
  const { appId } = useParams({ from: "/_authenticated/apps/$appId/" });
  const tenantId = useAuthStore((s) => s.user?.tenant_id);

  const { data: app, isLoading } = useQuery({
    queryKey: ["apps", appId],
    queryFn: () => schemaApi.getApp(appId),
  });

  const { data: models = [] } = useQuery({
    queryKey: ["apps", appId, "models"],
    queryFn: () => schemaApi.listModels(appId),
    enabled: !!appId,
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-foreground">{app?.name}</h2>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          icon={Pencil}
          title="Schema Builder"
          description="Design your data models and fields"
          to={`/apps/${appId}/builder`}
          buttonLabel="Open Builder"
        />
        <ActionCard
          icon={Table2}
          title="Records"
          description="View, create, edit and delete records"
          to={`/apps/${appId}/records`}
          buttonLabel="View Records"
        />
        <ActionCard
          icon={Workflow}
          title="Flow Designer"
          description="Build automation workflows"
          to={`/apps/${appId}/flow`}
          buttonLabel="Open Designer"
        />
      </div>

      {/* Models overview */}
      {models.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Models Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {models.length} model{models.length !== 1 ? "s" : ""} defined ·{" "}
              {models.reduce((sum, m) => sum + (m.fields?.length ?? 0), 0)}{" "}
              total fields
            </p>
          </CardContent>
        </Card>
      )}

      {/* Per-app Dashboard */}
      <AppDashboardPage appId={appId} models={models} />

      {/* Scheduled Reports */}
      <ScheduledReportsPage appId={appId} models={models} />

      {/* Portal Forms */}
      <PortalFormsPage appId={appId} models={models} tenantId={tenantId} />
    </div>
  );
}

function ActionCard({ icon: Icon, title, description, to, buttonLabel }) {
  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
      <div className="px-5 pb-5">
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to={to}>{buttonLabel}</Link>
        </Button>
      </div>
    </Card>
  );
}
