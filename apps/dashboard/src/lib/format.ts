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

export const truncateId = (value: string, head = 8, tail = 4): string => {
  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
};

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-US").format(value);
