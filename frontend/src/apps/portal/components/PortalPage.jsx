import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { portalApi } from "../api/portal.api";
import { DynamicForm } from "./DynamicForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";

export function PortalPage() {
  const { appId } = useParams({ from: "/_authenticated/portal/$appId" });

  // Track submit state per model (keyed by model slug)
  const [submitted, setSubmitted] = useState({});      // { slug: { id, recordId } }
  const [activeModelSlug, setActiveModelSlug] = useState(null);

  const { data: appSchema, isLoading, error } = useQuery({
    queryKey: ["portal", "models", appId],
    queryFn: () => portalApi.getAppModels(appId),
  });

  // Set default active model once data loads
  if (appSchema?.models?.length && !activeModelSlug) {
    setActiveModelSlug(appSchema.models[0].slug);
  }

  const submit = useMutation({
    mutationFn: ({ data, modelSlug }) => portalApi.submitForm(appId, data, modelSlug),
    onSuccess: (res, { modelSlug }) => {
      setSubmitted((prev) => ({
        ...prev,
        [modelSlug]: { id: res.id, recordId: res.record_id },
      }));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Loading / error states ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 p-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-64 w-48 rounded-xl" />
          <Skeleton className="h-64 flex-1 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">App not found</h2>
        <p className="text-sm text-muted-foreground">
          This portal link may be invalid or the app has been removed.
        </p>
      </div>
    );
  }

  const models = appSchema?.models ?? [];
  const activeModel = models.find((m) => m.slug === activeModelSlug) ?? models[0] ?? null;
  const isSubmitted = activeModel ? !!submitted[activeModel.slug] : false;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* ── App header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">{appSchema?.app_name}</h1>
        <Badge className="bg-green-100 text-green-700 border-green-200">Open</Badge>
      </div>
      {appSchema?.description && (
        <p className="text-sm text-muted-foreground">{appSchema.description}</p>
      )}

      {models.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No models configured yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Go to the Schema Builder to add models and fields to this app.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* ── Two-column layout: model sidebar + form ──────────────── */
        <div className="flex gap-4 items-start">

          {/* ── Left: Model navigation ──────────────────────────────── */}
          <div className="w-52 shrink-0">
            <Card>
              <CardHeader className="px-3 py-3 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Models
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3 space-y-0.5">
                {models.map((model) => {
                  const done = !!submitted[model.slug];
                  const isActive = activeModelSlug === model.slug;
                  return (
                    <button
                      key={model.slug}
                      onClick={() => setActiveModelSlug(model.slug)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-muted text-foreground",
                      )}
                    >
                      <span className="truncate">{model.name}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <span
                            className={cn(
                              "text-xs",
                              isActive ? "text-primary-foreground/70" : "text-muted-foreground",
                            )}
                          >
                            {model.fields.length}f
                          </span>
                        )}
                        {isActive && !done && (
                          <ChevronRight className="h-3 w-3 opacity-70" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Active model form ─────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {activeModel && (
              isSubmitted ? (
                <SuccessCard
                  modelName={activeModel.name}
                  submissionId={submitted[activeModel.slug]?.id}
                  recordId={submitted[activeModel.slug]?.recordId}
                  onReset={() =>
                    setSubmitted((prev) => {
                      const next = { ...prev };
                      delete next[activeModel.slug];
                      return next;
                    })
                  }
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{activeModel.name}</CardTitle>
                    <CardDescription>
                      {activeModel.fields.filter((f) => f.required).length > 0
                        ? "Fields marked * are required"
                        : `Fill in the ${activeModel.name.toLowerCase()} details`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activeModel.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No fields configured for this model yet.
                      </p>
                    ) : (
                      <DynamicForm
                        fields={activeModel.fields}
                        appId={appId}
                        onSubmit={(data) =>
                          submit.mutate({ data, modelSlug: activeModel.slug })
                        }
                        isSubmitting={submit.isPending}
                      />
                    )}
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SuccessCard({ modelName, submissionId, recordId, onReset }) {
  return (
    <Card className="text-center">
      <CardContent className="pt-10 pb-10">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-1">{modelName} record added!</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Your response has been recorded successfully.
        </p>
        {recordId && (
          <p className="text-xs text-muted-foreground mb-1">
            Record ID:{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">{recordId}</code>
          </p>
        )}
        {submissionId && (
          <p className="text-xs text-muted-foreground">
            Submission ref:{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">{submissionId}</code>
          </p>
        )}
        <button
          onClick={onReset}
          className="mt-6 text-sm text-primary hover:underline"
        >
          Add another {modelName}
        </button>
      </CardContent>
    </Card>
  );
}
