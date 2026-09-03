import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import "./Modal.css";

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /**
   * `disabled` is for a decision that is not ready to be taken — LIBRARY-11's
   * refresh preview uses it while a warning is unacknowledged. A button that
   * looks pressable and silently does nothing is worse than a greyed one.
   */
  primaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
  };
  secondaryAction?: { label: string; onClick: () => void };
  /**
   * `"wide"` for content that is a table or a log rather than a message or a
   * form. The default 520px is right for a question and too narrow for rows.
   */
  size?: "default" | "wide";
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog behaviour every dialog in the app inherits (SHELL-10).
 *
 * Before this, a modal did none of it: Escape did nothing, focus stayed behind
 * on whatever opened the dialog, Tab wandered out into the page underneath, and
 * closing left focus on an element that was now covered. A keyboard user could
 * open a dialog and never reach it.
 */
export function Modal({
  open,
  title,
  children,
  onClose,
  primaryAction,
  secondaryAction,
  size = "default",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Where focus was before the dialog opened, so it can be put back.
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    // The dialog itself, not its first control. Its `aria-labelledby` means the
    // title is announced, and it avoids starting the user on whatever control
    // happens to come first in the markup — which is the close button.
    dialogRef.current?.focus();

    return () => {
      // Only restore if the old element is still there: the dialog may have
      // been what removed it.
      const target = restoreTo.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Keep Tab inside the dialog. Without this, focus walks into the page
      // behind an aria-modal dialog, which is exactly what the attribute
      // promises does not happen.
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="cp-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`cp-modal ${size === "wide" ? "cp-modal--wide" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-modal-title"
        // Focusable so a dialog with no controls of its own can still receive
        // focus rather than leaving it behind the backdrop.
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cp-modal__header">
          <h2 id="cp-modal-title" className="cp-modal__title">
            {title}
          </h2>
          <button type="button" className="cp-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="cp-modal__body">{children}</div>
        {(primaryAction || secondaryAction) && (
          <footer className="cp-modal__footer">
            {secondaryAction && (
              <Button variant="secondary" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button
                variant="primary"
                onClick={primaryAction.onClick}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
              >
                {primaryAction.label}
              </Button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
