import { createFileRoute } from '@tanstack/react-router';
import { ApiKeysPage } from '@/apps/api_keys/components/ApiKeysPage';

export const Route = createFileRoute('/_authenticated/api-keys')({
  component: ApiKeysPage,
});
