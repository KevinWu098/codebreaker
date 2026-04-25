import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api";

const wrapError = (err: unknown, fallbackMessage: string): Error => {
  if (err instanceof Error) {
    return err;
  }

  if (typeof err === "string") {
    return new Error(err);
  }

  return new Error(fallbackMessage);
};

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refresh: () => void;
}

interface Options {
  /** Whether the hook should fetch at all. Defaults to true. */
  enabled?: boolean;
  /**
   * Stable invalidation key. Changing this string triggers a refetch (e.g.
   * encode the dependency tuple as a string).
   */
  key: string;
  /** Polling interval in milliseconds. */
  pollMs?: number | undefined;
}

export const useAsync = <T>(
  fetcher: () => Promise<T>,
  options: Options
): AsyncState<T> => {
  const { enabled = true, key, pollMs } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [tick, setTick] = useState(0);
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

    /*
     * Build a request id from the inputs so the catch path can include it
     * in the error message. Reading `key` and `tick` here keeps the
     * dependency array honest — they are deliberate re-run triggers.
     */
    const requestId = `${key}#${tick}`;

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

        setError(wrapError(err, `request ${requestId} failed`));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, key, tick]);

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
