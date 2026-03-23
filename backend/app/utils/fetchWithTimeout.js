const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function formatTimeoutDuration(timeoutMs) {
  if (timeoutMs % 1000 === 0) {
    const seconds = timeoutMs / 1000;
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  return `${timeoutMs} ms`;
}

function createTimeoutError(timeoutMs) {
  const error = new Error(
    `Request timed out after ${formatTimeoutDuration(timeoutMs)}.`,
  );
  error.name = "TimeoutError";
  return error;
}

function createRequestSignal(timeoutMs, signal) {
  const shouldTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;

  if (!shouldTimeout && !signal) {
    return {
      signal: undefined,
      cleanup: () => {},
      didTimeout: () => false,
      timeoutError: null,
    };
  }

  const controller = new AbortController();
  const timeoutError = shouldTimeout ? createTimeoutError(timeoutMs) : null;
  let didTimeout = false;
  let timeoutId;

  const forwardAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(signal?.reason);
    }
  };

  if (shouldTimeout) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      if (!controller.signal.aborted) {
        controller.abort(timeoutError);
      }
    }, timeoutMs);
  }

  if (signal) {
    if (signal.aborted) {
      forwardAbort();
    } else {
      signal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (signal) {
        signal.removeEventListener("abort", forwardAbort);
      }
    },
    didTimeout: () => didTimeout,
    timeoutError,
  };
}

async function fetchWithTimeout(input, options = {}) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal,
    ...fetchOptions
  } = options;
  const requestSignal = createRequestSignal(timeoutMs, signal);

  try {
    return await fetch(input, {
      ...fetchOptions,
      signal: requestSignal.signal,
    });
  } catch (error) {
    if (requestSignal.didTimeout()) {
      throw requestSignal.timeoutError;
    }
    throw error;
  } finally {
    requestSignal.cleanup();
  }
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
};
