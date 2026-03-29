import { createFileRoute } from '@tanstack/react-router';
import { SecuritySettingsPage } from '@/apps/settings/components/SecuritySettingsPage';

export const Route = createFileRoute('/_authenticated/settings/security')({
  component: SecuritySettingsPage,
});
