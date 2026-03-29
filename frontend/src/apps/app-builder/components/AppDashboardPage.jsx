import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  FunnelChart, Funnel, LabelList,
} from 'recharts';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/shared/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Plus, MoreVertical, Pencil, Trash2, BarChart2, TrendingUp, PieChart as PieIcon, Hash, CalendarRange, X, Grid3X3, Filter, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { appDashboardApi } from '../api/app_dashboard.api';

const COLORS = ['#6366f1','#22d3ee','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

const WIDGET_ICONS = {
  kpi: Hash, bar: BarChart2, line: TrendingUp, pie: PieIcon, donut: PieIcon,
  heatmap: Grid3X3, funnel: Filter, report: Table2,
};

// ── Heatmap ────────────────────────────────────────────────────────────────────

function HeatmapWidget({ data, loading }) {
  if (loading) return <div className="h-32 animate-pulse bg-muted rounded" />;
  if (!data?.length) return <p className="text-sm text-muted-foreground text-center py-8">No data</p>;

  // Build a map of date → value for quick lookup
  const valueMap = Object.fromEntries(data.map((d) => [d.date, d.value]));
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  // Determine date range to display — last 15 weeks
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 14 * 7 - today.getDay()); // align to Sunday

  const weeks = [];
  for (let w = 0; w < 15; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + w * 7 + d);
      const iso = date.toISOString().slice(0, 10);
      week.push({ date: iso, value: valueMap[iso] ?? 0 });
    }
    weeks.push(week);
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['S','M','T','W','T','F','S'];

  function intensity(val) {
    if (val === 0) return 'bg-muted/40 dark:bg-muted/20';
    const pct = val / maxVal;
    if (pct < 0.25) return 'bg-indigo-200 dark:bg-indigo-900/60';
    if (pct < 0.5)  return 'bg-indigo-400 dark:bg-indigo-700';
    if (pct < 0.75) return 'bg-indigo-600 dark:bg-indigo-500';
    return 'bg-indigo-800 dark:bg-indigo-300';
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1">
          <div className="h-4" />
          {days.map((d, i) => (
            <div key={i} className="h-3 w-3 text-[9px] text-muted-foreground flex items-center">{d}</div>
          ))}
        </div>
        {/* Week columns */}
        {weeks.map((week, wi) => {
          const firstDay = week[0].date;
          const month = parseInt(firstDay.slice(5, 7), 10) - 1;
          const showMonth = wi === 0 || week.some((d) => d.date.slice(8, 10) === '01');
          return (
            <div key={wi} className="flex flex-col gap-0.5">
              <div className="h-4 text-[9px] text-muted-foreground">{showMonth ? months[month] : ''}</div>
              {week.map((day, di) => (
                <div
                  key={di}
                  title={`${day.date}: ${day.value}`}
                  className={`h-3 w-3 rounded-sm ${intensity(day.value)}`}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Funnel ─────────────────────────────────────────────────────────────────────

function FunnelWidget({ data, loading }) {
  if (loading) return <div className="h-48 animate-pulse bg-muted rounded" />;
  if (!data?.length) return <p className="text-sm text-muted-foreground text-center py-8">No data</p>;

  const total = data[0]?.value || 1;
  return (
    <div className="space-y-1.5">
      {data.map((item, i) => {
        const pct = Math.round((item.value / total) * 100);
        return (
          <div key={i} className="group">
            <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
              <span className="truncate font-medium">{item.label}</span>
              <span className="ml-2 shrink-0">{item.value.toLocaleString()} · {pct}%</span>
            </div>
            <div className="h-6 bg-muted/30 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                  opacity: 0.85,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── KPI ────────────────────────────────────────────────────────────────────────

function KpiWidget({ value, loading }) {
  if (loading) return <Skeleton className="h-16 w-32" />;
  return (
    <div className="text-4xl font-bold text-primary">
      {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
    </div>
  );
}

function ReportWidget({ data, loading, appId }) {
  const reportId = data?.report_id;
  const reportAppId = data?.app_id ?? appId;

  const { data: result, isLoading } = useQuery({
    queryKey: ['report-widget', reportId],
    queryFn: async () => {
      const { apiClient } = await import('@/shared/lib/api-client');
      const res = await apiClient.post(`/reports/apps/${reportAppId}/saved-reports/${reportId}/run`);
      return res.data;
    },
    enabled: !!reportId,
    staleTime: 60_000,
  });

  if (loading || isLoading) return <Skeleton className="h-48 w-full" />;
  if (!reportId) return <p className="text-sm text-muted-foreground text-center py-4">No report selected</p>;
  if (!result?.rows?.length) return <p className="text-sm text-muted-foreground text-center py-4">No data</p>;

  const rows = result.rows.slice(0, 20);
  const cols = result.columns?.length > 0
    ? result.columns
    : Object.keys(rows[0] || {}).filter(k => k !== '_id').map(k => ({ field: k, label: k }));

  return (
    <div className="overflow-x-auto max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            {cols.map(c => (
              <th key={c.field} className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">
                {c.label || c.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
              {cols.map(c => (
                <td key={c.field} className="py-1.5 px-2 truncate max-w-[120px]">
                  {String(row[c.field] ?? row.data?.[c.field] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.total_rows > 20 && (
        <p className="text-[10px] text-muted-foreground text-right px-2 py-1">
          Showing 20 of {result.total_rows} rows
        </p>
      )}
    </div>
  );
}

function ChartWidget({ type, data, loading, appId }) {
  if (type === 'heatmap') return <HeatmapWidget data={data} loading={loading} />;
  if (type === 'funnel')  return <FunnelWidget data={data} loading={loading} />;
  if (type === 'report')  return <ReportWidget data={data} loading={loading} appId={appId} />;

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data?.length) return <p className="text-sm text-muted-foreground text-center py-8">No data</p>;

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#6366f1" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (type === 'pie' || type === 'donut') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={type === 'donut' ? 55 : 0}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  return null;
}

function WidgetCard({ widget, dataEntry, onEdit, onDelete, appId }) {
  const Icon = WIDGET_ICONS[widget.widget_type] || Hash;
  const isKpi = widget.widget_type === 'kpi';
  const loading = dataEntry === undefined;

  return (
    <Card className={widget.col_span === 2 ? 'col-span-2' : ''}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm truncate">{widget.title}</CardTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" />Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {isKpi
          ? <KpiWidget value={dataEntry?.data} loading={loading} />
          : <ChartWidget type={widget.widget_type} data={dataEntry?.data} loading={loading} appId={appId} />
        }
        {widget.model_slug && widget.widget_type !== 'report' && (
          <p className="text-xs text-muted-foreground mt-2">
            {widget.model_slug} · {widget.aggregate_fn}
            {widget.aggregate_field ? ` of ${widget.aggregate_field}` : ' (count)'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const EMPTY_FORM = {
  title: '', widget_type: 'kpi', model_slug: '', aggregate_fn: 'count',
  aggregate_field: '', filter_field: '', filter_value: '', group_by_field: '',
  date_field: '', order: 0, col_span: 1, report_id: '',
};

function WidgetFormDialog({ open, onClose, appId, models, savedReports = [], editWidget }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(editWidget ? {
    title: editWidget.title, widget_type: editWidget.widget_type,
    model_slug: editWidget.model_slug, aggregate_fn: editWidget.aggregate_fn,
    aggregate_field: editWidget.aggregate_field || '',
    filter_field: editWidget.filter_field || '',
    filter_value: editWidget.filter_value || '',
    group_by_field: editWidget.group_by_field || '',
    date_field: editWidget.date_field || '',
    order: editWidget.order, col_span: editWidget.col_span,
    report_id: editWidget.report_id || '',
  } : EMPTY_FORM);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  const mutation = useMutation({
    mutationFn: () => editWidget
      ? appDashboardApi.updateWidget(appId, editWidget.id, form)
      : appDashboardApi.createWidget(appId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-dashboard', appId] });
      toast.success(editWidget ? 'Widget updated' : 'Widget created');
      onClose();
    },
    onError: () => toast.error('Failed to save widget'),
  });

  const selectedModel = models.find(m => m.slug === form.model_slug);
  const numericFields = selectedModel?.fields?.filter(f =>
    ['number', 'currency'].includes(f.type)
  ) || [];
  const allFields = selectedModel?.fields || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editWidget ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Widget title" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.widget_type} onValueChange={v => set('widget_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['kpi','bar','line','pie','donut','funnel','heatmap','report'].map(t => (
                    <SelectItem key={t} value={t}>{t === 'report' ? 'Report (table)' : t.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Width</Label>
              <Select value={String(form.col_span)} onValueChange={v => set('col_span', Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Half</SelectItem>
                  <SelectItem value="2">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.widget_type === 'report' ? (
            <div>
              <Label>Saved Report</Label>
              <Select value={form.report_id} onValueChange={v => set('report_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select a saved report" /></SelectTrigger>
                <SelectContent>
                  {savedReports.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Model</Label>
              <Select value={form.model_slug} onValueChange={v => set('model_slug', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select a model" /></SelectTrigger>
                <SelectContent>
                  {models.map(m => <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Aggregation</Label>
              <Select value={form.aggregate_fn} onValueChange={v => set('aggregate_fn', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['count','sum','avg','min','max'].map(fn => (
                    <SelectItem key={fn} value={fn}>{fn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.aggregate_fn !== 'count' && (
              <div>
                <Label>Field</Label>
                <Select value={form.aggregate_field} onValueChange={v => set('aggregate_field', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Pick field" /></SelectTrigger>
                  <SelectContent>
                    {numericFields.map(f => <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {form.widget_type !== 'kpi' && (
            <div>
              <Label>Group by field <span className="text-muted-foreground">(optional — groups by field value)</span></Label>
              <Select value={form.group_by_field || '__none__'} onValueChange={v => set('group_by_field', v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Monthly trend (default)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Monthly trend</SelectItem>
                  {allFields.filter(f => ['select','text','boolean','user_ref'].includes(f.type)).map(f => (
                    <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Filter field <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={form.filter_field || '__none__'} onValueChange={v => set('filter_field', v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No filter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No filter</SelectItem>
                  {allFields.map(f => <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Filter value</Label>
              <Input value={form.filter_value} onChange={e => set('filter_value', e.target.value)} placeholder="Value" className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.title || !form.model_slug || mutation.isPending}>
            {editWidget ? 'Update' : 'Add Widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 12 months', days: 365 },
];

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function subDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export default function AppDashboardPage({ appId, models = [] }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editWidget, setEditWidget] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [localOrder, setLocalOrder] = useState(null); // optimistic reorder
  const dragSrc = useRef(null);

  const applyPreset = useCallback((days) => {
    setDateFrom(toISODate(subDays(days)));
    setDateTo(toISODate(new Date()));
  }, []);

  const clearDates = useCallback(() => {
    setDateFrom('');
    setDateTo('');
  }, []);

  const { data: widgets = [], isLoading: wLoading } = useQuery({
    queryKey: ['app-dashboard', appId, 'widgets'],
    queryFn: () => appDashboardApi.listWidgets(appId),
    enabled: !!appId,
  });

  const { data: savedReports = [] } = useQuery({
    queryKey: ['saved-reports', appId],
    queryFn: async () => {
      const { apiClient } = await import('@/shared/lib/api-client');
      const res = await apiClient.get(`/reports/apps/${appId}/saved-reports`);
      return res.data ?? [];
    },
    enabled: !!appId,
  });

  const { data: chartData = [], isLoading: dLoading } = useQuery({
    queryKey: ['app-dashboard', appId, 'data', dateFrom, dateTo],
    queryFn: () => appDashboardApi.getDashboardData(appId, {
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
    }),
    enabled: !!appId && widgets.length > 0,
    refetchInterval: 60_000,
  });

  const dataMap = useMemo(() =>
    Object.fromEntries(chartData.map(d => [d.widget_id, d])),
    [chartData]
  );

  const deleteMutation = useMutation({
    mutationFn: (widgetId) => appDashboardApi.deleteWidget(appId, widgetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-dashboard', appId] });
      toast.success('Widget deleted');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids) => appDashboardApi.reorderWidgets(appId, ids),
    onSuccess: () => {
      setLocalOrder(null);
      qc.invalidateQueries({ queryKey: ['app-dashboard', appId, 'widgets'] });
    },
    onError: () => setLocalOrder(null),
  });

  const displayWidgets = localOrder ?? widgets;

  function handleDragStart(id) { dragSrc.current = id; }
  function handleDragOver(e, id) {
    e.preventDefault();
    if (!dragSrc.current || dragSrc.current === id) return;
    const base = localOrder ?? widgets;
    const srcIdx = base.findIndex(w => w.id === dragSrc.current);
    const dstIdx = base.findIndex(w => w.id === id);
    if (srcIdx === -1 || dstIdx === -1) return;
    const next = [...base];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(dstIdx, 0, moved);
    setLocalOrder(next);
  }
  function handleDrop() {
    if (localOrder) reorderMutation.mutate(localOrder.map(w => w.id));
    dragSrc.current = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Dashboard</h2>
          <p className="text-xs text-muted-foreground">Configurable analytics for this app</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick presets */}
          <div className="flex items-center gap-1">
            <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
            {DATE_PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  dateFrom === toISODate(subDays(p.days)) && dateTo === toISODate(new Date())
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Custom date inputs */}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-7 text-xs w-32"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-7 text-xs w-32"
              placeholder="To"
            />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearDates}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />Add Widget
          </Button>
        </div>
      </div>

      {wLoading ? (
        <div className="grid gap-4 grid-cols-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : widgets.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-20 text-center">
          <BarChart2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No widgets yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add KPIs and charts to visualize your data</p>
          <Button size="sm" className="mt-4" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />Add first widget
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2">
          {displayWidgets.map(w => (
            <div
              key={w.id}
              draggable
              onDragStart={() => handleDragStart(w.id)}
              onDragOver={(e) => handleDragOver(e, w.id)}
              onDrop={handleDrop}
              className={`transition-opacity ${dragSrc.current === w.id ? 'opacity-40' : ''}`}
            >
              <WidgetCard
                widget={w}
                dataEntry={dataMap[w.id]}
                onEdit={() => setEditWidget(w)}
                onDelete={() => deleteMutation.mutate(w.id)}
                appId={appId}
              />
            </div>
          ))}
        </div>
      )}

      {(showAdd || editWidget) && (
        <WidgetFormDialog
          open
          onClose={() => { setShowAdd(false); setEditWidget(null); }}
          appId={appId}
          models={models}
          savedReports={savedReports}
          editWidget={editWidget}
        />
      )}
    </div>
  );
}
