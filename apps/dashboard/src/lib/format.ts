export const formatRelativeTime = (input: string | number | Date): string => {
  const value = input instanceof Date ? input : new Date(input);
  const diffMs = Date.now() - value.getTime();

  if (Number.isNaN(diffMs)) {
    return "—";
  }

  const seconds = Math.round(diffMs / 1000);

  if (seconds < 5) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  return `${days}d ago`;
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}m ${remainingSeconds}s`;
};

export const truncateId = (value: string, head = 8, tail = 4): string => {
  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
};

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-US").format(value);
