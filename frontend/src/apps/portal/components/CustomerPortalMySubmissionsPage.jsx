import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { LogOut, ChevronLeft, ChevronRight, FileText, ExternalLink } from 'lucide-react';
import { getPortalToken, clearPortalToken } from './CustomerPortalLoginPage';
import { toast } from 'sonner';

const STATUS_COLORS = {
  submitted: 'bg-blue-100 text-blue-700 border-blue-200',
  processing: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

export function CustomerPortalMySubmissionsPage() {
  const { tenantId } = useParams({ from: '/portal/$tenantId/my-submissions' });
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const token = getPortalToken(tenantId);

  useEffect(() => {
    if (!token) {
      navigate({ to: `/portal/${tenantId}/login` });
    }
  }, [token]);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-my-submissions', tenantId, page],
    queryFn: async () => {
      const res = await apiClient.get(
        `/portal/public/${tenantId}/my-submissions?page=${page}&page_size=${pageSize}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return res.data;
    },
    enabled: !!token,
    onError: (err) => {
      if (err.response?.status === 401) {
        clearPortalToken(tenantId);
        navigate({ to: `/portal/${tenantId}/login` });
      }
    },
  });

  const { data: me } = useQuery({
    queryKey: ['portal-me', tenantId],
    queryFn: async () => {
      const res = await apiClient.get(`/portal/public/${tenantId}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token,
  });

  function logout() {
    clearPortalToken(tenantId);
    toast.success('Logged out');
    navigate({ to: `/portal/${tenantId}/login` });
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (!token) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">My Submissions</h1>
          {me && <p className="text-xs text-muted-foreground">{me.full_name} · {me.email}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-1.5" />Sign out
        </Button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="text-sm text-muted-foreground">
          {total} submission{total !== 1 ? 's' : ''}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-xl">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No submissions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your form submissions will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(s => (
              <div key={s.id} className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{s.model_slug || 'Submission'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
                  </div>
                  <Badge className={`text-xs ${STATUS_COLORS[s.status] ?? 'bg-muted'}`}>{s.status}</Badge>
                </div>
                {s.data && Object.keys(s.data).length > 0 && (
                  <div className="grid gap-1.5 text-xs">
                    {Object.entries(s.data)
                      .filter(([k]) => !k.startsWith('_'))
                      .slice(0, 6)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-muted-foreground capitalize min-w-[100px]">{k.replace(/_/g, ' ')}</span>
                          <span className="font-medium truncate">{String(v ?? '—')}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
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
    </div>
  );
}
