import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { reportToast } from "../reporting/reporting";
import { usePresence } from "../tokens/usePresence";
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
  /** Dismissed; it leaves the screen once its exit has played (or at once, with none to play). */
  closing?: boolean;
}

interface ToastContextValue {
  push: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
}

/** A toast with an action stays long enough to be reached. */
const ACTION_TOAST_MS = 10000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // Each toast's timer, cleared when the provider goes, so none fires on a
  // page (or a test's document) that is no longer there.
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
  }, []);
  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, variant: ToastVariant = "info", action?: ToastAction) => {
    const id = crypto.randomUUID();
    // A step before an error report, by its kind: the words may carry a name (REPORT-06).
    if (variant === "error" || variant === "warning") reportToast(variant);
    setToasts((prev) => [...prev, { id, message, variant, action }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      dismiss(id);
    }, action ? ACTION_TOAST_MS : 4000);
    timers.current.add(timer);
  }, [dismiss]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="cp-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onGone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onGone,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
  onGone: (id: string) => void;
}) {
  const presence = usePresence<HTMLDivElement>(!toast.closing);
  // Gone once it has been dismissed and has left: a leaving toast takes no clicks (inert).
  useEffect(() => {
    if (toast.closing && !presence.present) onGone(toast.id);
  }, [toast.closing, toast.id, presence.present, onGone]);
  return (
    <div
      ref={presence.ref}
      className={`cp-toast cp-toast--${toast.variant}`}
      role="status"
      data-leaving={presence.leaving ? "" : undefined}
      inert={presence.leaving}
    >
      <span>{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="cp-toast__action"
          onClick={() => {
            const run = toast.action?.onClick;
            onDismiss(toast.id);
            run?.();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
