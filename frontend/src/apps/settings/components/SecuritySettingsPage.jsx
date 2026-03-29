import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/shared/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/shared/components/ui/dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Shield, ShieldCheck, ShieldOff, Copy, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// ── API helpers ────────────────────────────────────────────────────────────────

const twoFaApi = {
  status: () => apiClient.get('/auth/me/2fa/status').then(r => r.data),
  setup: () => apiClient.post('/auth/me/2fa/setup').then(r => r.data),
  confirm: (totp_code) => apiClient.post('/auth/me/2fa/confirm', { totp_code }),
  disable: (payload) => apiClient.post('/auth/me/2fa/disable', payload),
};

// ── Setup dialog ──────────────────────────────────────────────────────────────

function TwoFASetupDialog({ onClose }) {
  const qc = useQueryClient();
  const [step, setStep] = useState('loading'); // loading | scan | backup | confirm | done
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const setupMut = useMutation({
    mutationFn: twoFaApi.setup,
    onSuccess: (data) => {
      setSetupData(data);
      setStep('scan');
    },
    onError: () => toast.error('Failed to generate 2FA secret'),
  });

  const confirmMut = useMutation({
    mutationFn: () => twoFaApi.confirm(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      toast.success('Two-factor authentication enabled!');
      onClose();
    },
    onError: () => toast.error('Invalid code — check your authenticator app'),
  });

  // Kick off setup immediately on mount
  useEffect(() => { setupMut.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function copySecret() {
    navigator.clipboard.writeText(setupData?.secret || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enable Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Add an extra layer of security to your account.
          </DialogDescription>
        </DialogHeader>

        {setupMut.isPending && (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === 'scan' && setupData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>

            <div className="flex justify-center rounded-lg border bg-white p-4">
              <img
                src={setupData.qr_code_url}
                alt="Scan with your authenticator app"
                className="h-48 w-48"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Or enter the secret manually</Label>
              <div className="flex gap-2">
                <Input value={setupData.secret} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="sm" onClick={copySecret}>
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={() => setStep('backup')}>
              I've scanned the code →
            </Button>
          </div>
        )}

        {step === 'backup' && setupData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Save these backup codes somewhere safe. Each can be used once if you lose your authenticator.
            </p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-sm bg-muted rounded-lg p-3">
              {setupData.backup_codes.map((c, i) => (
                <span key={i} className="text-center py-0.5">{c}</span>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const text = setupData.backup_codes.join('\n');
                navigator.clipboard.writeText(text);
                toast.success('Backup codes copied');
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy all codes
            </Button>
            <Button className="w-full" onClick={() => setStep('confirm')}>
              I've saved my codes →
            </Button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app to confirm setup.
            </p>
            <div className="space-y-1.5">
              <Label>Verification Code</Label>
              <Input
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-xl tracking-widest font-mono"
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && code.length === 6 && confirmMut.mutate()}
              />
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => confirmMut.mutate()}
              disabled={code.length < 6 || confirmMut.isPending}
            >
              {confirmMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Activate 2FA
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Disable dialog ────────────────────────────────────────────────────────────

function TwoFADisableDialog({ onClose }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const disableMut = useMutation({
    mutationFn: () => twoFaApi.disable({ password, totp_code: code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      toast.success('Two-factor authentication disabled.');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to disable 2FA'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
          <DialogDescription>Enter your password and a valid authenticator code.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Authenticator Code</Label>
            <Input
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-widest font-mono"
              maxLength={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => disableMut.mutate()}
            disabled={!password || code.length < 6 || disableMut.isPending}
          >
            {disableMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Disable 2FA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SecuritySettingsPage() {
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: twoFaApi.status,
  });

  const enabled = status?.enabled ?? false;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account security and authentication settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {enabled
                ? <ShieldCheck className="h-6 w-6 text-green-600" />
                : <Shield className="h-6 w-6 text-muted-foreground" />}
              <div>
                <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Protect your account with a time-based one-time password (TOTP).
                </CardDescription>
              </div>
            </div>
            <Badge
              className={enabled
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'}>
              {enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-8 flex items-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : enabled ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                Your account is protected. Use your authenticator app to generate codes when signing in.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => setShowDisable(true)}
              >
                <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                Disable
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                Two-factor authentication is not enabled. Enable it to add an extra layer of security.
              </p>
              <Button size="sm" onClick={() => setShowSetup(true)}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                Enable 2FA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {showSetup && <TwoFASetupDialog onClose={() => setShowSetup(false)} />}
      {showDisable && <TwoFADisableDialog onClose={() => setShowDisable(false)} />}
    </div>
  );
}
