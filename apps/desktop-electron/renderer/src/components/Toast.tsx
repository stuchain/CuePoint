import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { reportToast } from "../reporting/reporting";
import "./Toast.css";

export type ToastVariant = "info" | "success" | "warning" | "error";

/** A button on a toast, such as "Undo": it runs once and dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ToastContextValue {
  push: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
}

/** A toast with an action stays long enough to be reached. */
const ACTION_TOAST_MS = 10000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, variant: ToastVariant = "info", action?: ToastAction) => {
    const id = crypto.randomUUID();
    // A step before an error report, by its kind: the words may carry a name (REPORT-06).
    if (variant === "error" || variant === "warning") reportToast(variant);
    setToasts((prev) => [...prev, { id, message, variant, action }]);
    window.setTimeout(() => dismiss(id), action ? ACTION_TOAST_MS : 4000);
  }, [dismiss]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="cp-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`cp-toast cp-toast--${toast.variant}`} role="status">
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="cp-toast__action"
                onClick={() => {
                  const run = toast.action?.onClick;
                  dismiss(toast.id);
                  run?.();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
