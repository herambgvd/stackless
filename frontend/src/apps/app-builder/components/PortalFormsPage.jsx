import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portalFormsApi } from '../api/portal_forms.api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Switch } from '@/shared/components/ui/switch';
import { Badge } from '@/shared/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/components/ui/dialog';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/shared/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
  Plus, MoreVertical, Pencil, Trash2, ExternalLink, Globe, EyeOff, Loader2, Copy, Mail, BarChart2, Code2,
} from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = {
  title: '', slug: '', description: '', model_slug: '',
  submit_button_text: 'Submit', success_message: 'Thank you! Your submission has been received.',
  steps: [], is_published: false,
  confirmation_email_enabled: false, confirmation_email_field: '',
  confirmation_email_subject: 'Thank you for your submission',
  confirmation_email_body: '<p>Hi,</p><p>Thank you for submitting <strong>{{ form_title }}</strong>. We have received your details and will get back to you shortly.</p>',
  // Branding
  logo_url: '', primary_color: '', background_color: '', font_family: '', custom_css: '',
};

function PortalFormDialog({ open, onClose, appId, models, editForm, tenantId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(editForm ? {
    title: editForm.title, slug: editForm.slug,
    description: editForm.description || '',
    model_slug: editForm.model_slug,
    submit_button_text: editForm.submit_button_text,
    success_message: editForm.success_message,
    steps: editForm.steps,
    is_published: editForm.is_published,
    confirmation_email_enabled: editForm.confirmation_email_enabled ?? false,
    confirmation_email_field: editForm.confirmation_email_field || '',
    confirmation_email_subject: editForm.confirmation_email_subject || 'Thank you for your submission',
    confirmation_email_body: editForm.confirmation_email_body || '',
    logo_url: editForm.logo_url || '',
    primary_color: editForm.primary_color || '',
    background_color: editForm.background_color || '',
    font_family: editForm.font_family || '',
    custom_css: editForm.custom_css || '',
  } : EMPTY_FORM);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Auto-generate slug from title
  function handleTitleChange(title) {
    set('title', title);
    if (!editForm) {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      set('slug', slug);
    }
  }

  const selectedModel = models.find(m => m.slug === form.model_slug);
  const modelFields = selectedModel?.fields?.filter(f => f.type !== 'formula') || [];

  // Steps management
  function addStep() {
    set('steps', [...form.steps, { title: `Step ${form.steps.length + 1}`, description: '', fields: [] }]);
  }
  function removeStep(i) {
    set('steps', form.steps.filter((_, idx) => idx !== i));
  }
  function updateStep(i, key, val) {
    const updated = form.steps.map((s, idx) => idx === i ? { ...s, [key]: val } : s);
    set('steps', updated);
  }
  function toggleFieldInStep(stepIdx, fieldName) {
    const step = form.steps[stepIdx];
    const hasField = step.fields.includes(fieldName);
    const newFields = hasField ? step.fields.filter(f => f !== fieldName) : [...step.fields, fieldName];
    updateStep(stepIdx, 'fields', newFields);
  }

  const mutation = useMutation({
    mutationFn: () => editForm
      ? portalFormsApi.update(appId, editForm.id, form)
      : portalFormsApi.create(appId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-forms', appId] });
      toast.success(editForm ? 'Form updated' : 'Form created');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to save form'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editForm ? 'Edit Portal Form' : 'New Portal Form'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Form Title</Label>
              <Input value={form.title} onChange={e => handleTitleChange(e.target.value)} placeholder="Contact Us" className="mt-1" />
            </div>
            <div>
              <Label>URL Slug</Label>
              <Input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="contact-us" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Public URL: /forms/{tenantId}/{form.slug || 'your-slug'}</p>
            </div>
            <div>
              <Label>Model (data destination)</Label>
              <Select value={form.model_slug} onValueChange={v => set('model_slug', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select model" /></SelectTrigger>
                <SelectContent>
                  {models.map(m => <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Tell us how we can help" className="mt-1 min-h-[60px]" />
            </div>
            <div>
              <Label>Submit Button Text</Label>
              <Input value={form.submit_button_text} onChange={e => set('submit_button_text', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Success Message</Label>
              <Input value={form.success_message} onChange={e => set('success_message', e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Steps builder */}
          {form.model_slug && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Form Steps</Label>
                <Button variant="outline" size="sm" onClick={addStep}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add Step
                </Button>
              </div>
              {form.steps.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No steps configured — all fields will be shown in a single step.
                </p>
              )}
              {form.steps.map((step, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground w-14">Step {i + 1}</span>
                    <Input
                      value={step.title}
                      onChange={e => updateStep(i, 'title', e.target.value)}
                      className="h-7 text-sm flex-1"
                      placeholder="Step title"
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStep(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={step.description || ''}
                    onChange={e => updateStep(i, 'description', e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Step description (optional)"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {modelFields.map(f => {
                      const selected = step.fields.includes(f.name);
                      return (
                        <button
                          key={f.name}
                          type="button"
                          onClick={() => toggleFieldInStep(i, f.name)}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                            selected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background border-border hover:border-primary/50'
                          }`}
                        >
                          {f.label || f.name}
                        </button>
                      );
                    })}
                  </div>
                  {step.fields.length === 0 && (
                    <p className="text-xs text-muted-foreground">Click fields above to add them to this step</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Publish toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={form.is_published} onCheckedChange={v => set('is_published', v)} id="publish-toggle" />
            <Label htmlFor="publish-toggle" className="cursor-pointer">
              {form.is_published ? 'Published (publicly accessible)' : 'Draft (not publicly accessible)'}
            </Label>
          </div>

          {/* Confirmation email */}
          <div className="space-y-3 border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.confirmation_email_enabled}
                onCheckedChange={v => set('confirmation_email_enabled', v)}
                id="conf-email-toggle"
              />
              <Label htmlFor="conf-email-toggle" className="cursor-pointer flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Send confirmation email to submitter
              </Label>
            </div>
            {form.confirmation_email_enabled && (
              <div className="space-y-3 pt-1">
                <div>
                  <Label className="text-xs">Email field</Label>
                  <Select value={form.confirmation_email_field} onValueChange={v => set('confirmation_email_field', v)}>
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue placeholder="Select email field from form" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelFields.filter(f => f.type === 'email' || f.name.toLowerCase().includes('email')).map(f => (
                        <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>
                      ))}
                      {modelFields.filter(f => f.type !== 'email' && !f.name.toLowerCase().includes('email')).map(f => (
                        <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">The field that contains the submitter's email address</p>
                </div>
                <div>
                  <Label className="text-xs">Email subject</Label>
                  <Input
                    value={form.confirmation_email_subject}
                    onChange={e => set('confirmation_email_subject', e.target.value)}
                    className="mt-1 h-8 text-xs"
                    placeholder="Thank you for your submission"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email body (HTML, Jinja2)</Label>
                  <Textarea
                    value={form.confirmation_email_body}
                    onChange={e => set('confirmation_email_body', e.target.value)}
                    className="mt-1 font-mono text-xs min-h-[100px]"
                    placeholder="<p>Hi,</p><p>Thank you for your submission!</p>"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Available variables: <code className="font-mono">{'{{ form_title }}'}</code>, <code className="font-mono">{'{{ data.field_name }}'}</code>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Branding */}
        <div className="space-y-3 pt-2 border-t mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branding</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Logo URL</Label>
              <Input value={form.logo_url} onChange={e => set('logo_url', e.target.value)} placeholder="https://…/logo.png" className="mt-1 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Font family</Label>
              <Input value={form.font_family} onChange={e => set('font_family', e.target.value)} placeholder="Inter" className="mt-1 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Primary colour</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <input type="color" value={form.primary_color || '#6366f1'} onChange={e => set('primary_color', e.target.value)} className="h-8 w-8 rounded border p-0.5 cursor-pointer" />
                <Input value={form.primary_color} onChange={e => set('primary_color', e.target.value)} placeholder="#6366f1" className="h-8 text-xs font-mono flex-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Background colour</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <input type="color" value={form.background_color || '#f9fafb'} onChange={e => set('background_color', e.target.value)} className="h-8 w-8 rounded border p-0.5 cursor-pointer" />
                <Input value={form.background_color} onChange={e => set('background_color', e.target.value)} placeholder="#f9fafb" className="h-8 text-xs font-mono flex-1" />
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs">Custom CSS <span className="text-muted-foreground">(injected into public form page)</span></Label>
            <Textarea value={form.custom_css} onChange={e => set('custom_css', e.target.value)} placeholder=".btn-submit { border-radius: 999px; }" className="mt-1 text-xs font-mono min-h-[60px]" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.title || !form.slug || !form.model_slug || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editForm ? 'Update Form' : 'Create Form'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmbedDialog({ open, onClose, publicUrl }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = `${origin}${publicUrl}`;
  const iframeCode = `<iframe\n  src="${fullUrl}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  allow="clipboard-write"\n  style="border:none;border-radius:8px;"\n></iframe>`;
  const scriptCode = `<div id="stackless-form"></div>\n<script>\n  (function() {\n    var el = document.getElementById('stackless-form');\n    var iframe = document.createElement('iframe');\n    iframe.src = "${fullUrl}";\n    iframe.style = "width:100%;height:600px;border:none;border-radius:8px;";\n    iframe.allow = "clipboard-write";\n    el.appendChild(iframe);\n    window.addEventListener('message', function(e) {\n      if (e.data && e.data.type === 'stackless:resize') {\n        iframe.style.height = e.data.height + 'px';\n      }\n    });\n  })();\n<\/script>`;

  function copyCode(code) {
    navigator.clipboard.writeText(code);
    toast.success('Copied to clipboard');
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Code2 className="h-4 w-4" />Embed Form</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">iframe embed</p>
              <button type="button" onClick={() => copyCode(iframeCode)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Copy className="h-3 w-3" />Copy
              </button>
            </div>
            <pre className="bg-muted rounded p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">{iframeCode}</pre>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">JavaScript embed (auto-resize)</p>
              <button type="button" onClick={() => copyCode(scriptCode)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Copy className="h-3 w-3" />Copy
              </button>
            </div>
            <pre className="bg-muted rounded p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">{scriptCode}</pre>
          </div>
          <p className="text-[10px] text-muted-foreground">Paste either snippet into any webpage. The JS embed listens for resize events from the form to dynamically adjust height.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormCard({ form, appId, tenantId, onEdit }) {
  const qc = useQueryClient();
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  const { data: analytics } = useQuery({
    queryKey: ['form-analytics', appId, form.id],
    queryFn: async () => {
      const { apiClient } = await import('@/shared/lib/api-client');
      const res = await apiClient.get(`/portal/apps/${appId}/portal-forms/${form.id}/analytics`);
      return res.data;
    },
    enabled: showAnalytics,
    staleTime: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: () => portalFormsApi.delete(appId, form.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-forms', appId] });
      toast.success('Form deleted');
    },
  });

  const toggleMut = useMutation({
    mutationFn: () => portalFormsApi.update(appId, form.id, { is_published: !form.is_published }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-forms', appId] }),
  });

  const publicUrl = `/forms/${tenantId}/${form.slug}`;

  function copyLink() {
    navigator.clipboard.writeText(window.location.origin + publicUrl);
    toast.success('Link copied to clipboard');
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div className="min-w-0">
          <CardTitle className="text-sm truncate">{form.title}</CardTitle>
          <CardDescription className="text-xs">{form.model_slug} · {form.steps.length || 1} step{form.steps.length !== 1 ? 's' : ''}</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          {form.is_published
            ? <Badge className="text-xs bg-green-100 text-green-700 border-green-200"><Globe className="h-3 w-3 mr-1" />Published</Badge>
            : <Badge variant="outline" className="text-xs"><EyeOff className="h-3 w-3 mr-1" />Draft</Badge>
          }
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {form.is_published && (
                <>
                  <DropdownMenuItem onClick={copyLink}>
                    <Copy className="h-3.5 w-3.5 mr-2" />Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={publicUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />Open form
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowEmbed(true)}>
                    <Code2 className="h-3.5 w-3.5 mr-2" />Embed code
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => toggleMut.mutate()}>
                {form.is_published ? <EyeOff className="h-3.5 w-3.5 mr-2" /> : <Globe className="h-3.5 w-3.5 mr-2" />}
                {form.is_published ? 'Unpublish' : 'Publish'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5 mr-2" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => deleteMut.mutate()} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-1 space-y-2">
        {form.description && <p className="text-xs text-muted-foreground line-clamp-2">{form.description}</p>}
        {form.is_published && (
          <p className="text-xs text-muted-foreground font-mono break-all">/forms/{tenantId}/{form.slug}</p>
        )}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAnalytics(s => !s)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            {showAnalytics ? 'Hide analytics' : 'Show analytics'}
          </button>
          {showAnalytics && analytics && (
            <div className="mt-2 p-3 bg-muted/40 rounded-lg space-y-2">
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                  <p className="text-lg font-semibold leading-tight">{analytics.total_submissions ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last 30 days</p>
                  <p className="text-lg font-semibold leading-tight">{analytics.recent_submissions ?? 0}</p>
                </div>
              </div>
              {analytics.trend?.length > 0 && (
                <div className="mt-1">
                  <p className="text-[10px] text-muted-foreground mb-1">Daily submissions (last 30 days)</p>
                  <div className="flex items-end gap-px h-10">
                    {analytics.trend.map((d, i) => {
                      const max = Math.max(...analytics.trend.map(x => x.count), 1);
                      const pct = (d.count / max) * 100;
                      return (
                        <div
                          key={i}
                          title={`${d.date}: ${d.count}`}
                          className="flex-1 bg-primary/70 rounded-sm min-h-[2px]"
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {showAnalytics && !analytics && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Loading analytics…
            </div>
          )}
        </div>
      </CardContent>
      {showEmbed && (
        <EmbedDialog open onClose={() => setShowEmbed(false)} publicUrl={publicUrl} />
      )}
    </Card>
  );
}

export default function PortalFormsPage({ appId, models = [], tenantId }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ['portal-forms', appId],
    queryFn: () => portalFormsApi.list(appId),
    enabled: !!appId,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Portal Forms</h2>
          <p className="text-xs text-muted-foreground">Public multi-step forms that collect data into your models</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />New Form
        </Button>
      </div>

      {forms.length === 0 && !isLoading ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center">
          <Globe className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No portal forms yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a public form to collect submissions</p>
          <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />Create first form
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {forms.map(f => (
            <FormCard key={f.id} form={f} appId={appId} tenantId={tenantId} onEdit={() => setEditForm(f)} />
          ))}
        </div>
      )}

      {(showCreate || editForm) && (
        <PortalFormDialog
          open
          onClose={() => { setShowCreate(false); setEditForm(null); }}
          appId={appId}
          models={models}
          editForm={editForm}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
