import { useEffect, useSyncExternalStore } from "react";

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "codebreaker.theme";
const QUERY = "(prefers-color-scheme: dark)";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  auto: "light",
  dark: "auto",
  light: "dark",
};

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "auto" || value === "light" || value === "dark";

const readStoredMode = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "auto";
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(value) ? value : "auto";
  } catch {
    return "auto";
  }
};

let mode: ThemeMode = readStoredMode();
const listeners = new Set<() => void>();

const resolveMode = (next: ThemeMode): ResolvedTheme => {
  if (next !== "auto") {
    return next;
  }

  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia(QUERY).matches ? "dark" : "light";
};

const applyTheme = (resolved: ResolvedTheme): void => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute("data-theme", resolved);
};

const notify = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const themeStore = {
  cycle: (): void => {
    themeStore.set(NEXT_MODE[mode]);
  },
  get: (): ThemeMode => mode,
  resolved: (): ResolvedTheme => resolveMode(mode),
  set: (next: ThemeMode): void => {
    mode = next;

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }

    applyTheme(resolveMode(next));
    notify();
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useThemeMode = (): ThemeMode =>
  useSyncExternalStore(
    themeStore.subscribe,
    themeStore.get,
    () => "auto" as ThemeMode
  );

export const useThemeSync = (): void => {
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const handler = (): void => {
      if (mode === "auto") {
        applyTheme(resolveMode(mode));
        notify();
      }
    };

    media.addEventListener("change", handler);
    applyTheme(resolveMode(mode));

    return () => {
      media.removeEventListener("change", handler);
    };
  }, []);
};
