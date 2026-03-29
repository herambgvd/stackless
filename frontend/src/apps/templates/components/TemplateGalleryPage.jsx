import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { templatesApi } from '../api/templates.api';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/shared/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, ArrowRight, Database, Layers } from 'lucide-react';

const CATEGORY_LABELS = {
  all: 'All',
  sales: 'Sales & CRM',
  operations: 'Operations',
  productivity: 'Productivity',
  hr: 'HR & People',
  finance: 'Finance',
  support: 'Support',
};

const ICON_COLORS = {
  '#6366f1': 'bg-indigo-100 text-indigo-600',
  '#10b981': 'bg-emerald-100 text-emerald-600',
  '#f59e0b': 'bg-amber-100 text-amber-600',
  '#8b5cf6': 'bg-violet-100 text-violet-600',
  '#22d3ee': 'bg-cyan-100 text-cyan-600',
  '#ef4444': 'bg-red-100 text-red-600',
};

function getColorClass(color) {
  return ICON_COLORS[color] || 'bg-gray-100 text-gray-600';
}

export function TemplateGalleryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState('all');
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [instantiating, setInstantiating] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  });

  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category === activeCategory);

  const instantiateMutation = useMutation({
    mutationFn: (templateId) => templatesApi.instantiate(templateId),
    onSuccess: (app) => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      toast.success(`App "${app.name}" created successfully!`);
      setPreviewTemplate(null);
      navigate({ to: '/apps/$appId', params: { appId: app.id } });
    },
    onError: (err) => {
      toast.error('Failed to create app: ' + (err.response?.data?.detail || err.message));
      setInstantiating(null);
    },
  });

  const categories = ['all', ...new Set(templates.map(t => t.category))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Template Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Start with a pre-built app template and customize it to fit your business.
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
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onPreview={() => setPreviewTemplate(template)}
              onUse={() => {
                setInstantiating(template.id);
                instantiateMutation.mutate(template.id);
              }}
              isLoading={instantiating === template.id && instantiateMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Preview dialog */}
      {previewTemplate && (
        <TemplatePreviewDialog
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onUse={() => {
            setPreviewTemplate(null);
            setInstantiating(previewTemplate.id);
            instantiateMutation.mutate(previewTemplate.id);
          }}
          isLoading={instantiating === previewTemplate.id && instantiateMutation.isPending}
        />
      )}
    </div>
  );
}

function TemplateCard({ template, onPreview, onUse, isLoading }) {
  const colorClass = getColorClass(template.color);
  return (
    <div className="border rounded-xl p-5 bg-card hover:border-primary/50 hover:shadow-sm transition-all group flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0 ${colorClass}`}>
          {template.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{template.name}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{template.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
        <span className="flex items-center gap-1"><Database className="h-3 w-3" />{template.model_count} models</span>
        <span className="flex items-center gap-1"><Layers className="h-3 w-3" />
          {template.models.reduce((s, m) => s + m.field_count, 0)} fields
        </span>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {template.tags?.map(tag => (
          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
        ))}
      </div>

      <div className="flex gap-2 mt-auto">
        <Button variant="outline" size="sm" className="flex-1" onClick={onPreview}>
          Preview
        </Button>
        <Button size="sm" className="flex-1" onClick={onUse} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Use template <ArrowRight className="h-3.5 w-3.5 ml-1" /></>}
        </Button>
      </div>
    </div>
  );
}

function TemplatePreviewDialog({ template, onClose, onUse, isLoading }) {
  const colorClass = getColorClass(template.color);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-2xl font-bold ${colorClass}`}>
              {template.name.charAt(0)}
            </div>
            <div>
              <DialogTitle>{template.name}</DialogTitle>
              <DialogDescription>{template.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Includes {template.model_count} models</p>
          {template.models?.map(model => (
            <div key={model.slug} className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">{model.name}</h4>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground">{model.field_count} fields</span>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onUse} disabled={isLoading}>
            {isLoading
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating...</>
              : <>Use this template <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
