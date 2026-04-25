const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 2000;

interface DurableObjectError extends Error {
  readonly overloaded?: boolean;
  readonly retryable?: boolean;
}

const isDurableObjectRetryable = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const doError = error as DurableObjectError;

  if (doError.overloaded === true) {
    return false;
  }

  return doError.retryable === true;
};

export const withDORetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isDurableObjectRetryable(error) || attempt >= maxRetries) {
        throw error;
      }

      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }
};
