import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { workflowTemplatesApi } from '../api/workflow_templates.api';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/shared/components/ui/dialog';
import { toast } from 'sonner';
import {
  Zap, ArrowRight, Loader2,
  Mail, MessageSquare, AlertTriangle, Archive,
  CheckCircle, TrendingUp, Users, Webhook,
} from 'lucide-react';

// Map icon name string → Lucide component
const ICON_MAP = {
  Mail, MessageSquare, AlertTriangle, Archive,
  CheckCircle, TrendingUp, Users, Webhook, Zap,
};

const CATEGORY_LABELS = {
  all: 'All',
  notifications: 'Notifications',
  integrations: 'Integrations',
  operations: 'Operations',
  approvals: 'Approvals',
  onboarding: 'Onboarding',
};

const TRIGGER_LABELS = {
  record_event: 'Record Event',
  schedule: 'Scheduled',
  webhook: 'Webhook',
  manual: 'Manual',
  approval_event: 'Approval Event',
};

export default function WorkflowTemplatesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState('all');
  const [preview, setPreview] = useState(null);
  const [installing, setInstalling] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: () => workflowTemplatesApi.list(),
  });

  const installMutation = useMutation({
    mutationFn: ({ templateId }) => workflowTemplatesApi.install(templateId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      toast.success(`Workflow "${data.name}" installed! Review and enable it in the workflow editor.`);
      setPreview(null);
      setInstalling(null);
      // Navigate to workflows list
      navigate({ to: '/workflows/runs' });
    },
    onError: (err) => {
      toast.error('Installation failed: ' + (err.response?.data?.detail || err.message));
      setInstalling(null);
    },
  });

  const categories = ['all', ...new Set(templates.map(t => t.category))];
  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category === activeCategory);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Workflow Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Start with a pre-built automation template. Install and customize it for your needs.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <Button
            key={cat}
            variant={activeCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat)}
          >
            {CATEGORY_LABELS[cat] || cat}
          </Button>
        ))}
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(tpl => {
            const Icon = ICON_MAP[tpl.icon] || Zap;
            const isInstalling = installing === tpl.id && installMutation.isPending;
            return (
              <div key={tpl.id} className="border rounded-xl p-5 bg-card hover:border-primary/50 hover:shadow-sm transition-all flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: tpl.color + '20', color: tpl.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">{tpl.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{tpl.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">{TRIGGER_LABELS[tpl.trigger_type] || tpl.trigger_type}</Badge>
                  <span>{tpl.step_count} step{tpl.step_count !== 1 ? 's' : ''}</span>
                </div>

                <div className="flex flex-wrap gap-1 mb-4">
                  {tpl.tags?.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>

                <div className="flex gap-2 mt-auto">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setPreview(tpl)}>
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={isInstalling}
                    onClick={() => {
                      setInstalling(tpl.id);
                      installMutation.mutate({ templateId: tpl.id });
                    }}
                  >
                    {isInstalling
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <>Install <ArrowRight className="h-3.5 w-3.5 ml-1" /></>
                    }
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview dialog */}
      {preview && (
        <Dialog open onOpenChange={() => setPreview(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{preview.name}</DialogTitle>
              <DialogDescription>{preview.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Trigger</p>
                <Badge variant="outline">{TRIGGER_LABELS[preview.trigger_type] || preview.trigger_type}</Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{preview.step_count} Steps</p>
                <div className="space-y-2">
                  {Array.from({ length: preview.step_count }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">{i + 1}</div>
                      <span className="text-muted-foreground">Step {i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
                After installing, the workflow will be created in <strong>Draft</strong> mode. Review and configure it, then activate when ready.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
              <Button
                onClick={() => {
                  setPreview(null);
                  setInstalling(preview.id);
                  installMutation.mutate({ templateId: preview.id });
                }}
                disabled={installMutation.isPending}
              >
                Install Template <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
