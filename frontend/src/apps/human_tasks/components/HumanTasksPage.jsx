import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { humanTasksApi } from '../api/human_tasks.api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/shared/components/ui/dialog';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/shared/components/ui/card';
import {
  ClipboardList, CheckCircle2, Clock, XCircle, Loader2, AlertCircle, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'bg-yellow-100 text-yellow-700', Icon: Clock },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700',   Icon: CheckCircle2 },
  expired:   { label: 'Expired',   color: 'bg-red-100 text-red-700',       Icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600',     Icon: XCircle },
};

// ── Task form dialog ──────────────────────────────────────────────────────────

function TaskFormDialog({ task, onClose }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState(
    Object.fromEntries(task.form_fields.map((f) => [f.name, f.default_value ?? ''])),
  );

  const completeMut = useMutation({
    mutationFn: () => humanTasksApi.complete(task.id, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['human-tasks'] });
      toast.success('Task completed!');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to complete task'),
  });

  function set(name, value) {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function renderField(field) {
    const value = formData[field.name] ?? '';
    if (field.type === 'select') {
      return (
        <Select value={value} onValueChange={(v) => set(field.name, v)}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === 'textarea') {
      return (
        <Textarea
          value={value}
          onChange={(e) => set(field.name, e.target.value)}
          placeholder={field.placeholder}
          className="min-h-[80px]"
        />
      );
    }
    if (field.type === 'boolean') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => set(field.name, e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">{field.label}</span>
        </label>
      );
    }
    return (
      <Input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => set(field.name, e.target.value)}
        placeholder={field.placeholder}
      />
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          {task.description && (
            <DialogDescription>{task.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {task.form_fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fields to fill — just confirm completion.
            </p>
          ) : (
            task.form_fields.map((field) => (
              <div key={field.name}>
                {field.type !== 'boolean' && (
                  <Label className="mb-1.5 block">
                    {field.label}
                    {field.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                )}
                {renderField(field)}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => completeMut.mutate()} disabled={completeMut.isPending}>
            {completeMut.isPending && (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            Complete Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reassign dialog ───────────────────────────────────────────────────────────

function ReassignDialog({ task, onClose }) {
  const qc = useQueryClient();
  const [assigneeId, setAssigneeId] = useState('');

  const reassignMut = useMutation({
    mutationFn: () => humanTasksApi.reassign(task.id, assigneeId.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['human-tasks'] });
      toast.success('Task reassigned');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to reassign task'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reassign Task</DialogTitle>
          <DialogDescription>
            Enter the user ID of the new assignee for &quot;{task.title}&quot;.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label className="mb-1.5 block">New Assignee User ID</Label>
          <Input
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            placeholder="User ID"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => reassignMut.mutate()}
            disabled={!assigneeId.trim() || reassignMut.isPending}
          >
            {reassignMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function HumanTasksPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedTask, setSelectedTask] = useState(null);
  const [reassignTask, setReassignTask] = useState(null);
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['human-tasks', statusFilter],
    queryFn: () => humanTasksApi.list(statusFilter),
    refetchInterval: 30_000,
  });

  const cancelMut = useMutation({
    mutationFn: (taskId) => humanTasksApi.cancel(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['human-tasks'] });
      toast.success('Task cancelled');
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to cancel task'),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Workflow steps waiting for your input
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No {statusFilter} tasks</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const { Icon } = cfg;
            const isOverdue =
              task.due_at &&
              new Date(task.due_at) < new Date() &&
              task.status === 'pending';

            return (
              <Card key={task.id} className={isOverdue ? 'border-destructive/50' : ''}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon
                      className={`h-5 w-5 mt-0.5 shrink-0 ${
                        task.status === 'pending'
                          ? 'text-yellow-600'
                          : task.status === 'completed'
                          ? 'text-green-600'
                          : 'text-muted-foreground'
                      }`}
                    />
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{task.title}</CardTitle>
                      {task.description && (
                        <CardDescription className="text-xs mt-0.5 line-clamp-2">
                          {task.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                    {isOverdue && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>
                      {task.form_fields.length} field
                      {task.form_fields.length !== 1 ? 's' : ''} to complete
                    </p>
                    {task.due_at && (
                      <p>Due: {new Date(task.due_at).toLocaleDateString()}</p>
                    )}
                    <p>Created: {new Date(task.created_at).toLocaleDateString()}</p>
                  </div>
                  {task.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReassignTask(task)}
                        title="Reassign task"
                      >
                        <UserCheck className="h-3.5 w-3.5 mr-1" />
                        Reassign
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelMut.mutate(task.id)}
                        disabled={cancelMut.isPending}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => setSelectedTask(task)}>
                        Complete Task
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedTask && (
        <TaskFormDialog task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
      {reassignTask && (
        <ReassignDialog task={reassignTask} onClose={() => setReassignTask(null)} />
      )}
    </div>
  );
}
