import { createRootRouteWithContext } from "@tanstack/react-router";
// import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { AppShell } from "@/shared/components/layout/AppShell";

export const Route = createRootRouteWithContext()({
  component: () => (
    <>
      <AppShell />
      {/* {import.meta.env.DEV && <TanStackRouterDevtools />} */}
    </>
  ),
});
