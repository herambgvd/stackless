import { createFileRoute } from '@tanstack/react-router';
import { CustomerPortalMySubmissionsPage } from '@/apps/portal/components/CustomerPortalMySubmissionsPage';

export const Route = createFileRoute('/portal/$tenantId/my-submissions')({
  component: CustomerPortalMySubmissionsPage,
});
