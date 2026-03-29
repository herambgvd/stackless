import { useState, useRef } from 'react';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Download, Upload, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function DatabaseBackupPage() {
  const confirm = useConfirm();
  const fileInputRef = useRef(null);
  const [restoreResult, setRestoreResult] = useState(null);

  const backupMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/admin/backup/create', null, {
        responseType: 'blob',
      });
      return res;
    },
    onSuccess: (res) => {
      // Derive filename from Content-Disposition or fallback
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : 'backup.gz';
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/gzip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Backup failed'),
  });

  const restoreMut = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post('/admin/backup/restore', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setRestoreResult({ success: true, message: data.message });
      toast.success('Database restored');
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Restore failed';
      setRestoreResult({ success: false, message: msg });
      toast.error(msg);
    },
  });

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await confirm({ title: "Restore Database", message: "WARNING: This will DROP and recreate collections. All current data will be replaced. Continue?", confirmLabel: "Restore", variant: "destructive" });
    if (!ok) {
      e.target.value = '';
      return;
    }
    restoreMut.mutate(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold">Database Backup & Restore</h2>
        <p className="text-xs text-muted-foreground">Create and restore MongoDB database backups using mongodump/mongorestore</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Backup */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Create Backup
            </CardTitle>
            <CardDescription className="text-xs">
              Download a gzip-compressed mongodump archive of the entire database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => backupMut.mutate()}
              disabled={backupMut.isPending}
              className="w-full"
            >
              {backupMut.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Dumping…</>
                : <><Download className="h-4 w-4 mr-2" />Download Backup</>
              }
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2">
              Requires <code className="font-mono">mongodump</code> to be installed on the server.
            </p>
          </CardContent>
        </Card>

        {/* Restore */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4 text-destructive" />
              Restore Backup
            </CardTitle>
            <CardDescription className="text-xs">
              Upload a mongodump .gz archive to restore. <span className="text-destructive font-medium">This drops existing collections.</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/20 rounded text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>All current data will be <strong>permanently replaced</strong>. There is no undo.</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gz,.archive"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="destructive"
              onClick={() => fileInputRef.current?.click()}
              disabled={restoreMut.isPending}
              className="w-full"
            >
              {restoreMut.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restoring…</>
                : <><Upload className="h-4 w-4 mr-2" />Upload & Restore</>
              }
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Result */}
      {restoreResult && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
          restoreResult.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {restoreResult.success
            ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          }
          <span>{restoreResult.message}</span>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1 p-4 bg-muted/40 rounded-lg">
        <p className="font-medium">Notes</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Backups include all collections for the configured database</li>
          <li>Files are compressed with gzip — keep them in a secure location</li>
          <li>Restore requires <code className="font-mono">mongorestore</code> on the server PATH</li>
          <li>After restore, restart the application to clear any in-memory caches</li>
        </ul>
      </div>
    </div>
  );
}
