import { trimTrailingSlash } from "@codebreaker/shared/lib/utils";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "codebreaker.connection";
const DEFAULT_BASE_URL = "http://localhost:8787";

export interface Connection {
  baseUrl: string;
  token: string;
}

const initial: Connection = (() => {
  if (typeof window === "undefined") {
    return { baseUrl: DEFAULT_BASE_URL, token: "" };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Connection>;

      return {
        baseUrl: parsed.baseUrl ?? DEFAULT_BASE_URL,
        token: parsed.token ?? "",
      };
    }
  } catch {
    // ignore
  }

  return { baseUrl: DEFAULT_BASE_URL, token: "" };
})();

let current = initial;
const listeners = new Set<() => void>();

const persist = (next: Connection): void => {
  current = next;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }

  for (const listener of listeners) {
    listener();
  }
};

export const connectionStore = {
  get: (): Connection => current,
  setBaseUrl: (baseUrl: string): void => {
    persist({ ...current, baseUrl: trimTrailingSlash(baseUrl) });
  },
  setToken: (token: string): void => {
    persist({ ...current, token });
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },
};

export const isAuthorized = (connection: Connection): boolean =>
  connection.token.length > 0;

export const useConnection = (): Connection =>
  useSyncExternalStore(
    connectionStore.subscribe,
    connectionStore.get,
    connectionStore.get
  );
