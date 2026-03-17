import { useCallback, useEffect, useRef, useState } from "react";

import { TOAST_EVENT, type ToastPayload } from "../utils/toast";
import { AppIcon } from "./AppIcon";

import "./ToastViewport.css";

interface ActiveToast extends ToastPayload {
  isLeaving: boolean;
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timeoutIdsRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timeoutId = timeoutIdsRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(id);
    }

    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, isLeaving: true } : toast,
      ),
    );

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 220);
  }, []);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const payload = customEvent.detail;
      if (!payload) return;

      setToasts((current) => [
        ...current,
        {
          ...payload,
          isLeaving: false,
        },
      ]);

      if (!payload.persistent) {
        const timeoutId = window.setTimeout(() => {
          dismissToast(payload.id);
        }, payload.durationMs);

        timeoutIdsRef.current.set(payload.id, timeoutId);
      }
    };

    window.addEventListener(TOAST_EVENT, handleToast as EventListener);
    return () => {
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIdsRef.current.clear();
      window.removeEventListener(TOAST_EVENT, handleToast as EventListener);
    };
  }, [dismissToast]);

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone} toast--${toast.variant} ${toast.isLeaving ? "toast--leaving" : ""}`}
        >
          <div className="toast__content">
            <div className="toast__header">
              <span className="toast__message">{toast.message}</span>
              <button
                type="button"
                className="toast__close"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast.id)}
              >
                <AppIcon name="close" width={14} height={14} />
              </button>
            </div>
            {toast.actionLabel && toast.onAction && (
              <div className="toast__actions toast__actions--stacked">
                <button
                  type="button"
                  className={`toast__action ${toast.variant === "destructive-confirm" ? "toast__action--destructive" : ""}`}
                  onClick={() => {
                    toast.onAction?.();
                    dismissToast(toast.id);
                  }}
                >
                  {toast.actionLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
