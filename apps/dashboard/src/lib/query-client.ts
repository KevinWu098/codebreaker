import { QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@/lib/api";

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (failureCount >= 2) {
          return false;
        }

        if (error instanceof ApiClientError) {
          return RETRYABLE_STATUSES.has(error.status);
        }

        return true;
      },
      staleTime: 2 * 1000,
    },
  },
});
