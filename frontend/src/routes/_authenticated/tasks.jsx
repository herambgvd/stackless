import { createFileRoute } from '@tanstack/react-router';
import { HumanTasksPage } from '@/apps/human_tasks/components/HumanTasksPage';

export const Route = createFileRoute('/_authenticated/tasks')({
  component: HumanTasksPage,
});
