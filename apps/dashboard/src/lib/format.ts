import { formatDistanceToNowStrict, intervalToDuration } from "date-fns";

const RELATIVE_OPTIONS = { addSuffix: true } as const;

export const formatRelativeTime = (input: string | number | Date): string => {
  const value = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(value.getTime())) {
    return "—";
  }

  return formatDistanceToNowStrict(value, RELATIVE_OPTIONS);
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }

  const {
    hours = 0,
    minutes = 0,
    seconds = 0,
  } = intervalToDuration({
    end: ms,
    start: 0,
  });

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
};

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-US").format(value);

export const formatRepo = (
  owner: string | null,
  name: string | null
): string => {
  if (owner) {
    return `${owner}/${name ?? ""}`;
  }

  return name ?? "—";
};
