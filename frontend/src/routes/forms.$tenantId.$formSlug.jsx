import { createFileRoute } from '@tanstack/react-router';
import PublicFormPage from '@/apps/portal/components/PublicFormPage';

export const Route = createFileRoute('/forms/$tenantId/$formSlug')({
  component: function FormPage() {
    const { tenantId, formSlug } = Route.useParams();
    return <PublicFormPage tenantId={tenantId} formSlug={formSlug} />;
  },
});
