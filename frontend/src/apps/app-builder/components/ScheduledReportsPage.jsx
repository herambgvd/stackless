import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '../api/reports.api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Switch } from '@/shared/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/components/ui/dialog';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/shared/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Plus, MoreVertical, Pencil, Trash2, Send, Mail, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { fmtSmart } from '@/shared/lib/date';

const EMPTY = {
  name: '', model_slug: '', recipients: '', format: 'csv',
  schedule: 'daily', day_of_week: 0, day_of_month: 1,
};

function ReportFormDialog({ open, onClose, appId, models, editReport }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(editReport ? {
    name: editReport.name,
    model_slug: editReport.model_slug,
    recipients: editReport.recipients.join(', '),
    format: editReport.format,
    schedule: editReport.schedule,
    day_of_week: editReport.day_of_week ?? 0,
    day_of_month: editReport.day_of_month ?? 1,
  } : EMPTY);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        recipients: form.recipients.split(',').map(e => e.trim()).filter(Boolean),
        day_of_week: form.schedule === 'weekly' ? Number(form.day_of_week) : null,
        day_of_month: form.schedule === 'monthly' ? Number(form.day_of_month) : null,
      };
      return editReport
        ? reportsApi.update(appId, editReport.id, payload)
        : reportsApi.create(appId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', appId] });
      toast.success(editReport ? 'Report updated' : 'Report scheduled');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to save report'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editReport ? 'Edit Report' : 'New Scheduled Report'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Report Name</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Weekly Sales Summary" className="mt-1" />
          </div>
          <div>
            <Label>Model</Label>
            <Select value={form.model_slug} onValueChange={v => set('model_slug', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select model" /></SelectTrigger>
              <SelectContent>
                {models.map(m => <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Format</Label>
              <Select value={form.format} onValueChange={v => set('format', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Schedule</Label>
              <Select value={form.schedule} onValueChange={v => set('schedule', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily (8 AM UTC)</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.schedule === 'weekly' && (
            <div>
              <Label>Day of week</Label>
              <Select value={String(form.day_of_week)} onValueChange={v => set('day_of_week', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.schedule === 'monthly' && (
            <div>
              <Label>Day of month (1-28)</Label>
              <Input type="number" min="1" max="28" value={form.day_of_month} onChange={e => set('day_of_month', e.target.value)} className="mt-1" />
            </div>
          )}
          <div>
            <Label>Recipients <span className="text-muted-foreground text-xs">(comma-separated emails)</span></Label>
            <Input value={form.recipients} onChange={e => set('recipients', e.target.value)} placeholder="alice@co.com, bob@co.com" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.model_slug || !form.recipients || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editReport ? 'Update' : 'Create Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportCard({ report, appId, onEdit }) {
  const qc = useQueryClient();
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const deleteMut = useMutation({
    mutationFn: () => reportsApi.delete(appId, report.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports', appId] }); toast.success('Report deleted'); },
  });

  const sendNowMut = useMutation({
    mutationFn: () => reportsApi.sendNow(appId, report.id),
    onSuccess: () => toast.success('Report queued for sending'),
    onError: () => toast.error('Failed to queue report'),
  });

  const toggleMut = useMutation({
    mutationFn: () => reportsApi.update(appId, report.id, { is_active: !report.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', appId] }),
  });

  const scheduleLabel = report.schedule === 'daily' ? 'Daily'
    : report.schedule === 'weekly' ? `Weekly · ${DAYS[report.day_of_week ?? 0]}`
    : `Monthly · Day ${report.day_of_month ?? 1}`;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <CardTitle className="text-sm truncate">{report.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{report.model_slug} · {report.format.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={report.is_active} onCheckedChange={() => toggleMut.mutate()} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => sendNowMut.mutate()} disabled={sendNowMut.isPending}>
                <Send className="h-3.5 w-3.5 mr-2" />Send Now
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
      <CardContent className="pt-0 space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />{scheduleLabel}
        </div>
        <div className="flex flex-wrap gap-1">
          {report.recipients.map(r => (
            <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
          ))}
        </div>
        {report.last_sent_at && (
          <p className="text-xs text-muted-foreground">
            Last sent: {fmtSmart(report.last_sent_at).label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ScheduledReportsPage({ appId, models = [] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editReport, setEditReport] = useState(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports', appId],
    queryFn: () => reportsApi.list(appId),
    enabled: !!appId,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Scheduled Reports</h2>
          <p className="text-xs text-muted-foreground">Automatically email model data on a schedule</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />New Report
        </Button>
      </div>

      {reports.length === 0 && !isLoading ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center">
          <Mail className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No scheduled reports</p>
          <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />Create first report
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reports.map(r => (
            <ReportCard key={r.id} report={r} appId={appId} onEdit={() => setEditReport(r)} />
          ))}
        </div>
      )}

      {(showCreate || editReport) && (
        <ReportFormDialog
          open
          onClose={() => { setShowCreate(false); setEditReport(null); }}
          appId={appId}
          models={models}
          editReport={editReport}
        />
      )}
    </div>
  );
}
