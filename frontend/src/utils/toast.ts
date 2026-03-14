export type ToastTone = "info" | "success" | "error";

export interface ToastPayload {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

export interface ShowToastOptions {
  tone?: ToastTone;
  durationMs?: number;
}

export const TOAST_EVENT = "imkdiread:toast";

export function showToast(
  message: string,
  { tone = "info", durationMs = 3200 }: ShowToastOptions = {},
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<ToastPayload>(TOAST_EVENT, {
      detail: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        tone,
        durationMs,
      },
    }),
  );
}

