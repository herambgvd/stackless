import { createFileRoute } from "@tanstack/react-router";
import { LetterHeadsPage } from "@/apps/settings/components/LetterHeadsPage";

export const Route = createFileRoute("/_authenticated/settings/letter-heads")({
  component: LetterHeadsPage,
});
