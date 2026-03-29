import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '../api/integrations.api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Plug, Plus, Trash2, Edit2, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

const PROVIDER_COLORS = {
  slack: 'bg-purple-100 text-purple-700',
  whatsapp: 'bg-green-100 text-green-700',
  stripe: 'bg-blue-100 text-blue-700',
  google_sheets: 'bg-emerald-100 text-emerald-700',
  smtp: 'bg-gray-100 text-gray-700',
  sendgrid: 'bg-blue-100 text-blue-700',
};

function ProviderBadge({ provider }) {
  const colorClass = PROVIDER_COLORS[provider] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {provider}
    </span>
  );
}

export function IntegrationsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Step 1 = select provider, Step 2 = fill credentials
  const [step, setStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [formName, setFormName] = useState('');
  const [formCredentials, setFormCredentials] = useState({});

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => integrationsApi.list(),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['integrations-providers'],
    queryFn: () => integrationsApi.listProviders(),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => integrationsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Integration created');
      closeDialog();
    },
    onError: (e) => toast.error(e.message ?? 'Failed to create integration'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => integrationsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Integration updated');
      closeDialog();
    },
    onError: (e) => toast.error(e.message ?? 'Failed to update integration'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => integrationsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Integration deleted');
    },
    onError: (e) => toast.error(e.message ?? 'Failed to delete integration'),
  });

  const testMutation = useMutation({
    mutationFn: (id) => integrationsApi.test(id),
    onSuccess: (data) => {
      if (data.status === 'skipped') {
        toast.info(data.message);
      } else {
        toast.success('Connection test passed!');
      }
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message || 'Test failed'),
  });

  function openAdd() {
    setEditingItem(null);
    setStep(1);
    setSelectedProvider('');
    setFormName('');
    setFormCredentials({});
    setDialogOpen(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setSelectedProvider(item.provider);
    setFormName(item.name);
    // Start with empty credentials for security; user re-enters to update
    setFormCredentials({});
    setStep(2);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingItem(null);
    setStep(1);
    setSelectedProvider('');
    setFormName('');
    setFormCredentials({});
  }

  const selectedProviderMeta = providers.find((p) => p.provider === selectedProvider);

  function handleSubmit() {
    if (!formName.trim()) {
      toast.error('Please enter a name for this integration.');
      return;
    }
    if (editingItem) {
      const payload = { name: formName };
      if (Object.keys(formCredentials).length > 0) {
        payload.credentials = formCredentials;
      }
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      const providerMeta = providers.find((p) => p.provider === selectedProvider);
      createMutation.mutate({
        name: formName,
        provider: selectedProvider,
        credential_type: providerMeta?.credential_type ?? 'api_key',
        credentials: formCredentials,
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integration Hub</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect external services and use them as workflow steps.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Integration
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Plug className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium text-muted-foreground">No integrations yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
            Add your first integration to start using it in workflows.
          </p>
          <Button variant="outline" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Integration
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {integrations.map((item) => (
            <Card key={item.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <ProviderBadge provider={item.provider} />
                    <CardTitle className="text-sm font-semibold leading-tight">{item.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Test connection"
                      onClick={() => testMutation.mutate(item.id)}
                      disabled={testMutation.isPending}
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(item)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1.5">
                  {item.is_active ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Inactive</span>
                    </>
                  )}
                </div>
                {item.last_used_at && (
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Last used: {new Date(item.last_used_at).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Integration' : 'Add Integration'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1: Select Provider (add only) */}
            {!editingItem && step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.provider} value={p.provider}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. Production Slack"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Fill credential fields */}
            {(editingItem || step === 2) && (
              <div className="space-y-4">
                {/* Show provider + name when editing */}
                {editingItem && (
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                )}

                {selectedProviderMeta && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {editingItem
                        ? 'Leave credential fields blank to keep existing values.'
                        : `Enter credentials for ${selectedProviderMeta.name}.`}
                    </p>
                    {selectedProviderMeta.credential_fields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label>
                          {field.label}
                          {field.required && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                        <Input
                          type="password"
                          placeholder={field.required ? 'Required' : 'Optional'}
                          value={formCredentials[field.key] ?? ''}
                          onChange={(e) =>
                            setFormCredentials((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>

            {/* Step 1 → Step 2 for adding */}
            {!editingItem && step === 1 && (
              <Button
                onClick={() => setStep(2)}
                disabled={!selectedProvider || !formName.trim()}
              >
                Next
              </Button>
            )}

            {/* Submit on step 2 or when editing */}
            {(editingItem || step === 2) && (
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editingItem ? 'Save Changes' : 'Connect'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
