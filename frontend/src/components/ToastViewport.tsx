import { useEffect, useState } from "react";

import { TOAST_EVENT, type ToastPayload } from "../utils/toast";

import "./ToastViewport.css";

interface ActiveToast extends ToastPayload {
  isLeaving: boolean;
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

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

      window.setTimeout(() => {
        setToasts((current) =>
          current.map((toast) =>
            toast.id === payload.id ? { ...toast, isLeaving: true } : toast,
          ),
        );

        window.setTimeout(() => {
          setToasts((current) =>
            current.filter((toast) => toast.id !== payload.id),
          );
        }, 220);
      }, payload.durationMs);
    };

    window.addEventListener(TOAST_EVENT, handleToast as EventListener);
    return () =>
      window.removeEventListener(TOAST_EVENT, handleToast as EventListener);
  }, []);

  if (!toasts.length) {
    return null;
  }

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone} ${toast.isLeaving ? "toast--leaving" : ""}`}
        >
          <span className="toast__message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

