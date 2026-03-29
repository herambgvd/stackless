import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

// Tiny localStorage-backed auth store for portal users (separate from the main app auth)
export function getPortalToken(tenantId) {
  try { return localStorage.getItem(`portal_token_${tenantId}`); } catch { return null; }
}
export function setPortalToken(tenantId, token) {
  try { localStorage.setItem(`portal_token_${tenantId}`, token); } catch {}
}
export function clearPortalToken(tenantId) {
  try { localStorage.removeItem(`portal_token_${tenantId}`); } catch {}
}

export function CustomerPortalLoginPage() {
  const { tenantId } = useParams({ from: '/portal/$tenantId/login' });
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = mode === 'login'
        ? `/portal/public/${tenantId}/auth/login`
        : `/portal/public/${tenantId}/auth/register`;
      const res = await apiClient.post(endpoint, form);
      setPortalToken(tenantId, res.data.access_token);
      toast.success(mode === 'login' ? 'Logged in' : 'Account created');
      navigate({ to: `/portal/${tenantId}/my-submissions` });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6">
          <div>
            <h1 className="text-xl font-semibold">Customer Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === 'login' ? 'Sign in to view your submissions' : 'Create an account to track your submissions'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <Label>Full Name</Label>
                <Input
                  value={form.full_name}
                  onChange={e => set('full_name', e.target.value)}
                  placeholder="Your name"
                  className="mt-1"
                  required
                />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="you@example.com"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="••••••••"
                className="mt-1"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="text-center text-sm">
            {mode === 'login' ? (
              <span className="text-muted-foreground">
                Don't have an account?{' '}
                <button type="button" onClick={() => setMode('register')} className="text-primary underline-offset-2 hover:underline">
                  Sign up
                </button>
              </span>
            ) : (
              <span className="text-muted-foreground">
                Already have an account?{' '}
                <button type="button" onClick={() => setMode('login')} className="text-primary underline-offset-2 hover:underline">
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
