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
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
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
  /** Set by a keyed push; a later push with the same key replaces this toast in place. */
  dedupeKey?: string;
  /** Counts replacements, so the timer restarts when the toast's words change. */
  revision: number;
  /** Dismissed; it leaves the screen once its exit has played (or at once, with none to play). */
  closing?: boolean;
}

interface ToastContextValue {
  push: (message: string, variant?: ToastVariant, action?: ToastAction, options?: ToastOptions) => void;
  /** Close the toast pushed with this key, if it is still showing. */
  dismissKey: (key: string) => void;
}

export interface ToastOptions {
  /** A push with the key of a toast still on screen replaces that toast in place. */
  key?: string;
}

/** A toast with an action stays long enough to be reached. */
const ACTION_TOAST_MS = 10000;
const TOAST_MS = 4000;
/** Errors and warnings stay until closed, so the stack is capped. */
const MAX_TOASTS = 5;

/** How long a toast stays by itself; errors and warnings stay until closed (null). */
function lifetime(toast: ToastMessage): number | null {
  if (toast.variant === "error" || toast.variant === "warning") return null;
  return toast.action ? ACTION_TOAST_MS : TOAST_MS;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
  }, []);
  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant = "info", action?: ToastAction, options?: ToastOptions) => {
      // The same words again replace the toast already showing them, so a refusal
      // repeated by a held key or a run of skipped tracks is one toast, not a pile.
      const given = options?.key;
      const key = given !== undefined ? given : action ? undefined : `text:${variant}:${message}`;
      // A step before an error report, by its kind: the words may carry a name (REPORT-06).
      if (variant === "error" || variant === "warning") reportToast(variant);
      const id = crypto.randomUUID();
      setToasts((prev) => {
        const same = key === undefined ? undefined : prev.find((t) => t.dedupeKey === key && !t.closing);
        if (!same) {
          const next = [...prev, { id, message, variant, action, dedupeKey: key, revision: 0 }];
          // At most MAX_TOASTS on screen: the oldest one still showing makes way.
          const open = next.filter((t) => !t.closing);
          if (open.length <= MAX_TOASTS) return next;
          const oldest = open[0];
          return next.map((t) => (t === oldest ? { ...t, closing: true } : t));
        }
        return prev.map((t) =>
          t === same ? { ...t, message, variant, action, revision: t.revision + 1 } : t,
        );
      });
    },
    [],
  );

  const dismissKey = useCallback((key: string) => {
    setToasts((prev) => prev.map((t) => (t.dedupeKey === key && !t.closing ? { ...t, closing: true } : t)));
  }, []);

  const value = useMemo(() => ({ push, dismissKey }), [push, dismissKey]);

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
  // The time left on its timer, kept across pauses so a hover does not restart it.
  const remaining = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const duration = lifetime(toast);
  const { id, revision, closing } = toast;
  useEffect(() => {
    remaining.current = duration;
  }, [duration, revision]);
  useEffect(() => {
    if (duration === null || closing || paused || remaining.current === null) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      remaining.current = 0;
      onDismiss(id);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (remaining.current !== null) remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [duration, revision, closing, paused, id, onDismiss]);
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
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        // Tabbing between its own buttons keeps it paused.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <span>{toast.message}</span>
      {toast.action ? (
        <Button
          variant="secondary"
          size="sm"
          className="cp-toast__action"
          onClick={() => {
            const run = toast.action?.onClick;
            onDismiss(toast.id);
            run?.();
          }}
        >
          {toast.action.label}
        </Button>
      ) : null}
      <CloseButton className="cp-toast__close" aria-label="Close message" onClick={() => onDismiss(toast.id)} />
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
