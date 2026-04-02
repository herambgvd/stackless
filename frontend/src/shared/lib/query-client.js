import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,    // Data is fresh for 30 seconds — avoids redundant fetches
      gcTime: 1000 * 60 * 5,  // Keep unused data in memory for 5 min
      refetchOnWindowFocus: false, // Don't spam API on tab switch
      retry: (failureCount, error) => {
        if (error?.response?.status === 401) return false;
        if (error?.response?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});
