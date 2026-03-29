import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "@/apps/calendar/CalendarPage";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});
