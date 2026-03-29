import { createFileRoute } from '@tanstack/react-router';
import { CustomerPortalLoginPage } from '@/apps/portal/components/CustomerPortalLoginPage';

export const Route = createFileRoute('/portal/$tenantId/login')({
  component: CustomerPortalLoginPage,
});
