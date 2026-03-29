import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,           // Always re-fetch on mount/invalidate
      gcTime: 1000 * 60 * 5, // Keep unused data in memory for 5 min
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error?.response?.status === 401) return false;
        if (error?.response?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});
