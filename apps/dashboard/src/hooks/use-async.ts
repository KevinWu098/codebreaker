import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../lib/api";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refresh: () => void;
}

interface Options {
  enabled?: boolean;
  pollMs?: number;
}

export const useAsync = <T>(
  fetcher: () => Promise<T>,
  _deps: readonly unknown[],
  options: Options = {}
): AsyncState<T> => {
  const { pollMs, enabled = true } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [_tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current()
      .then((value) => {
        if (cancelled) {
          return;
        }

        setData(value);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        const wrapped =
          err instanceof Error
            ? err
            : new Error(typeof err === "string" ? err : "Unknown error");

        setError(wrapped);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!(enabled && pollMs)) {
      return;
    }

    const interval = window.setInterval(refresh, pollMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, pollMs, refresh]);

  return { data, error, loading, refresh };
};

export const isUnauthorized = (error: Error | undefined): boolean =>
  error instanceof ApiClientError && error.status === 401;
