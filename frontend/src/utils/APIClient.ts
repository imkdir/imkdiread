const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(
  /\/+$/,
  "",
);

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
export const AUTH_LOGOUT_EVENT = "auth:logout-required";

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

export const resolveApiUrl = (url: string) => {
  if (!apiBaseUrl || /^https?:\/\//.test(url) || url.startsWith("//")) {
    return url;
  }

  return url.startsWith("/") ? `${apiBaseUrl}${url}` : `${apiBaseUrl}/${url}`;
};

const shouldForceLogout = async (response: Response) => {
  if (response.status === 401) {
    return true;
  }

  if (response.status !== 403) {
    return false;
  }

  try {
    const data = (await response.clone().json()) as { error?: string };
    return data?.error === "Invalid or expired token.";
  } catch {
    return false;
  }
};

const formatTimeoutDuration = (timeoutMs: number) => {
  if (timeoutMs % 1000 === 0) {
    const seconds = timeoutMs / 1000;
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  return `${timeoutMs} ms`;
};

const createTimeoutError = (timeoutMs: number) => {
  const error = new Error(
    `Request timed out after ${formatTimeoutDuration(timeoutMs)}.`,
  );
  error.name = "TimeoutError";
  return error;
};

const createRequestSignal = (
  timeoutMs: number,
  signal: AbortSignal | null | undefined,
) => {
  const shouldTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;

  if (!shouldTimeout && !signal) {
    return {
      signal: undefined,
      cleanup: () => {},
      didTimeout: () => false,
      timeoutError: null as Error | null,
    };
  }

  const controller = new AbortController();
  const timeoutError = shouldTimeout ? createTimeoutError(timeoutMs) : null;
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const forwardAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(signal?.reason);
    }
  };

  if (shouldTimeout) {
    timeoutId = globalThis.setTimeout(() => {
      didTimeout = true;
      if (!controller.signal.aborted) {
        controller.abort(timeoutError ?? undefined);
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
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      if (signal) {
        signal.removeEventListener("abort", forwardAbort);
      }
    },
    didTimeout: () => didTimeout,
    timeoutError,
  };
};

const notifyForcedLogout = () => {
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
};

export const request = async (url: string, options: RequestOptions = {}) => {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal,
    ...fetchOptions
  } = options;

  const token = localStorage.getItem("token");
  const headers = new Headers(fetchOptions.headers || {});
  const isFormData =
    typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const requestSignal = createRequestSignal(timeoutMs, signal);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    !isFormData &&
    fetchOptions.body !== undefined &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(url), {
      ...fetchOptions,
      headers,
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

  if (await shouldForceLogout(response)) {
    console.warn("Session expired or unauthorized.");
    notifyForcedLogout();
  }

  return response;
};
