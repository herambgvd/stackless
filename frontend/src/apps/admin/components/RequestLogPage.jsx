import { useState } from 'react';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { RefreshCw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const METHOD_COLORS = {
  GET: 'bg-blue-100 text-blue-700 border-blue-200',
  POST: 'bg-green-100 text-green-700 border-green-200',
  PUT: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  PATCH: 'bg-orange-100 text-orange-700 border-orange-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200',
};

function statusColor(code) {
  if (code < 300) return 'bg-green-100 text-green-700 border-green-200';
  if (code < 400) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (code < 500) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

function durationColor(ms) {
  if (ms < 100) return 'text-green-600';
  if (ms < 500) return 'text-yellow-600';
  return 'text-red-600';
}

export function RequestLogPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState('');
  const [pathContains, setPathContains] = useState('');
  const [hours, setHours] = useState('24');
  const pageSize = 50;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['request-logs', page, method, pathContains, hours],
    queryFn: async () => {
      const params = new URLSearchParams({ page, page_size: pageSize, hours });
      if (method) params.set('method', method);
      if (pathContains) params.set('path_contains', pathContains);
      const res = await apiClient.get(`/admin/request-logs?${params}`);
      return res.data;
    },
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/admin/request-logs?hours=${hours}`);
    },
    onSuccess: () => {
      toast.success('Old request logs cleared');
      qc.invalidateQueries({ queryKey: ['request-logs'] });
    },
    onError: () => toast.error('Failed to clear logs'),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Request Log</h2>
          <p className="text-xs text-muted-foreground">HTTP requests logged by the API server</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => { if (await confirm({ title: "Clear Logs", message: `Clear logs older than ${hours}h?`, confirmLabel: "Clear", variant: "destructive" })) clearMut.mutate(); }}
            disabled={clearMut.isPending}
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />Clear old logs
          </Button>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2 items-end">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Method</p>
          <Select value={method} onValueChange={v => { setMethod(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Path contains</p>
          <Input
            value={pathContains}
            onChange={e => setPathContains(e.target.value)}
            placeholder="/api/v1/..."
            className="h-8 text-xs w-52"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Time window</p>
          <Select value={hours} onValueChange={v => { setHours(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 1h</SelectItem>
              <SelectItem value="6">Last 6h</SelectItem>
              <SelectItem value="24">Last 24h</SelectItem>
              <SelectItem value="72">Last 3 days</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-8 text-xs">Search</Button>
      </form>

      <div className="text-xs text-muted-foreground">
        {total.toLocaleString()} request{total !== 1 ? 's' : ''} found
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-24">Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-24">Duration</TableHead>
              <TableHead className="w-32">IP</TableHead>
              <TableHead className="w-36">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">No logs found</TableCell>
              </TableRow>
            ) : items.map(r => (
              <TableRow key={r.id} className="text-xs font-mono">
                <TableCell>
                  <Badge className={`text-[10px] ${METHOD_COLORS[r.method] ?? 'bg-muted'}`}>{r.method}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs font-mono" title={r.path}>{r.path}</TableCell>
                <TableCell>
                  <Badge className={`text-[10px] ${statusColor(r.status_code)}`}>{r.status_code}</Badge>
                </TableCell>
                <TableCell className={`text-xs ${durationColor(r.duration_ms)}`}>
                  {r.duration_ms.toFixed(1)} ms
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.ip ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.requested_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
