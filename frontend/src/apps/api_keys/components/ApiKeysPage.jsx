import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi } from '../api/api_keys.api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Switch } from '@/shared/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/shared/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import {
  Alert, AlertDescription,
} from '@/shared/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Plus, Trash2, Copy, Key, AlertTriangle, Loader2, CheckCircle2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmtSmart } from '@/shared/lib/date';

function CreateKeyDialog({ open, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('read');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiKeysApi.create({
      name,
      scopes: scopes === 'admin' ? ['read', 'write', 'admin'] : scopes === 'write' ? ['read', 'write'] : ['read'],
      expires_at: expiresAt || null,
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setCreatedKey(data.raw_key);
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to create key'),
  });

  function copyKey() {
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('API key copied');
  }

  function handleClose() {
    setName('');
    setScopes('read');
    setExpiresAt('');
    setCreatedKey(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>API keys allow programmatic access to Stackless.</DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-sm font-medium">API key created successfully</p>
            </div>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Copy this key now — it won't be shown again.
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <Input value={createdKey} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copyKey} className="shrink-0">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label>Key Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Integration Key" className="mt-1" />
            </div>
            <div>
              <Label>Access Level</Label>
              <Select value={scopes} onValueChange={setScopes}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read Only</SelectItem>
                  <SelectItem value="write">Read + Write</SelectItem>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expires At <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="mt-1" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{createdKey ? 'Done' : 'Cancel'}</Button>
          {!createdKey && (
            <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Create Key
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SCOPE_COLORS = {
  read: 'secondary',
  write: 'default',
  admin: 'destructive',
};

const ALL_SCOPES = ['read', 'write', 'admin'];

function EditKeyRow({ apiKey, onClose, qc }) {
  const [name, setName] = useState(apiKey.name);
  const [scopes, setScopes] = useState(apiKey.scopes ?? []);

  const updateMut = useMutation({
    mutationFn: () => apiKeysApi.update(apiKey.id, { name, scopes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key updated');
      onClose();
    },
    onError: () => toast.error('Failed to update API key'),
  });

  function toggleScope(s) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  return (
    <TableRow className="bg-slate-50">
      <TableCell colSpan={7}>
        <div className="flex flex-wrap items-center gap-4 py-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 text-sm w-44"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Scopes</Label>
            <div className="flex gap-2">
              {ALL_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  <span className="text-xs">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 ml-auto">
            <Button
              size="sm"
              onClick={() => updateMut.mutate()}
              disabled={!name.trim() || scopes.length === 0 || updateMut.isPending}
              className="h-7 text-xs"
            >
              {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-7 text-xs">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ApiKeysPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
  });

  const revokeMut = useMutation({
    mutationFn: (keyId) => apiKeysApi.revoke(keyId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('Key revoked'); },
  });

  const toggleMut = useMutation({
    mutationFn: (keyId) => apiKeysApi.toggle(keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create API keys to access Stackless programmatically. Use the <code className="text-xs bg-muted px-1 rounded">Authorization: Bearer ffk_...</code> header.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />New API Key
        </Button>
      </div>

      {keys.length === 0 && !isLoading ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center">
          <Key className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No API keys yet</p>
          <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />Create API Key
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map(key => (
                <>
                  <TableRow key={key.id} className={!key.is_active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium text-sm">{key.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{key.key_prefix}…</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {key.scopes.map(s => (
                          <Badge key={s} variant={SCOPE_COLORS[s] || 'secondary'} className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {key.last_used_at ? fmtSmart(key.last_used_at).label : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {key.expires_at ? fmtSmart(key.expires_at).label : '—'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={key.is_active}
                        onCheckedChange={() => toggleMut.mutate(key.id)}
                        disabled={toggleMut.isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingKeyId(editingKeyId === key.id ? null : key.id)}
                          title="Edit key"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => revokeMut.mutate(key.id)}
                          disabled={revokeMut.isPending}
                          title="Revoke key"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingKeyId === key.id && (
                    <EditKeyRow
                      key={`edit-${key.id}`}
                      apiKey={key}
                      onClose={() => setEditingKeyId(null)}
                      qc={qc}
                    />
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateKeyDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
