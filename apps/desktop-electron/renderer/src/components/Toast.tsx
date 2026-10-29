import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { reportToast } from "../reporting/reporting";
import { inHiddenPage } from "./shell/pageActive";
import { MODAL_DIALOG_SELECTOR } from "./shell/shellKeyboard";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { usePresence } from "../tokens/usePresence";
import "./Toast.css";

export type ToastVariant = "info" | "success" | "warning" | "error";

/** A button on a toast, such as "Undo": it runs once and dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
  /**
   * The action takes back what was just done (M456): Ctrl+Z and Edit › Undo press it, and only
   * such an action. Left out, an action labelled "Undo" counts as one.
   */
  undo?: boolean;
}

/** Whether a toast's action is an undo (M456): said so, or labelled "Undo". */
export function isUndoAction(action: ToastAction | undefined): boolean {
  if (!action) return false;
  return action.undo ?? /^undo\b/i.test(action.label.trim());
}

/** The modal dialog on top, if one is open in the page that shows (M456). */
function topDialog(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const open = Array.from(document.querySelectorAll<HTMLElement>(MODAL_DIALOG_SELECTOR)).filter(
    (dialog) => !inHiddenPage(dialog) && !dialog.closest("[data-leaving], [data-ghost]"),
  );
  return open.length > 0 ? open[open.length - 1]! : null;
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
  /** Close every toast still showing: the window is about to be, or has just stopped being, a different screen. */
  dismissAll: () => void;
  /** Moves focus to the newest toast's action (or its close button), so Undo is reachable from the keyboard (M456). False when none shows. */
  focusNewest: () => boolean;
  /**
   * Presses Undo on the newest toast that offers one: Ctrl+Z and Edit › Undo (M456). Only an undo
   * action (`data-undo`) is ever pressed, never another action. False when no toast offers Undo.
   */
  runNewestAction: () => boolean;
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

  const dismissAll = useCallback(() => {
    setToasts((prev) => prev.map((t) => (t.closing ? t : { ...t, closing: true })));
  }, []);

  // The stack floats over the page (Toast.css): it takes no room from the content, so a table does
  // not shrink and the selection bar does not jump while a toast shows (M283).
  const stack = useRef<HTMLDivElement>(null);

  /** The newest toast that is still showing, as an element. */
  const newestToast = useCallback(() => {
    const shown = stack.current?.querySelectorAll<HTMLElement>(".cp-toast:not([data-leaving])");
    return shown && shown.length > 0 ? shown[shown.length - 1] : undefined;
  }, []);

  const focusNewest = useCallback(() => {
    const toast = newestToast();
    if (!toast) return false;
    // Its action when it has one (Undo), else its close button.
    toast.querySelector<HTMLElement>(".cp-toast__action, .cp-toast__close")?.focus();
    return true;
  }, [newestToast]);

  const runNewestAction = useCallback(() => {
    const undos = stack.current?.querySelectorAll<HTMLElement>(".cp-toast:not([data-leaving]) .cp-toast__action[data-undo]");
    const action = undos && undos.length > 0 ? undos[undos.length - 1] : undefined;
    if (!action) return false;
    action.click();
    return true;
  }, []);

  // While a modal dialog is open the stack is drawn inside it (M456): a toast outside an
  // `aria-modal` dialog cannot be reached or read, so its Undo would be lost behind the dialog.
  // A layout effect, so a new toast moves into the dialog before it paints or is read outside it.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const showing = toasts.length > 0;
  useLayoutEffect(() => {
    if (!showing) {
      setHost(null);
      return;
    }
    const find = () => setHost(topDialog());
    find();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "data-leaving"] });
    return () => observer.disconnect();
  }, [showing]);

  const value = useMemo(
    () => ({ push, dismissKey, dismissAll, focusNewest, runNewestAction }),
    [push, dismissKey, dismissAll, focusNewest, runNewestAction],
  );

  const stackNode = (
    <div className="cp-toast-stack" aria-live="polite" ref={stack} data-in-dialog={host ? "" : undefined}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onGone={remove} />
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {host ? createPortal(stackNode, host) : stackNode}
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
      role={toast.variant === "error" ? "alert" : "status"}
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
      <span className="cp-toast__text">{toast.message}</span>
      {toast.action ? (
        <Button
          variant="secondary"
          size="sm"
          className="cp-toast__action"
          data-undo={isUndoAction(toast.action) ? "" : undefined}
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

/** The toast context, or null outside a provider, for a control that can do without one. */
export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext);
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
