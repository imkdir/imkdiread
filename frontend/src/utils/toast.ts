export type ToastTone = "info" | "success" | "error";
export type ToastVariant = "default" | "destructive-confirm";

export interface ToastPayload {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
  variant: ToastVariant;
  persistent: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ShowToastOptions {
  tone?: ToastTone;
  durationMs?: number;
  variant?: ToastVariant;
  persistent?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export const TOAST_EVENT = "imkdiread:toast";

export function showToast(
  message: string,
  {
    tone = "info",
    durationMs = 3200,
    variant = "default",
    persistent = false,
    actionLabel,
    onAction,
  }: ShowToastOptions = {},
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<ToastPayload>(TOAST_EVENT, {
      detail: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        tone,
        durationMs,
        variant,
        persistent,
        actionLabel,
        onAction,
      },
    }),
  );
}
