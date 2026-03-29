import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

export function StatsCard({ title, value, icon: Icon, description, trend, loading, className, highlight }) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("hover:shadow-md transition-shadow", highlight && "border-amber-400/60 bg-amber-50/30 dark:bg-amber-900/10", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {Icon && (
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary", highlight && "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400")}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        {trend !== undefined && (
          <p className={cn("text-xs mt-1 font-medium", trend >= 0 ? "text-green-600" : "text-destructive")}>
            {trend >= 0 ? "+" : ""}{trend}% from last month
          </p>
        )}
      </CardContent>
    </Card>
  );
}
