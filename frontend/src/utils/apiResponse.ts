export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getApiErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const maybeError = "error" in payload ? payload.error : null;
  if (typeof maybeError === "string" && maybeError.trim()) {
    return maybeError;
  }

  const maybeMessage = "message" in payload ? payload.message : null;
  if (typeof maybeMessage === "string" && maybeMessage.trim()) {
    return maybeMessage;
  }

  return fallback;
}

