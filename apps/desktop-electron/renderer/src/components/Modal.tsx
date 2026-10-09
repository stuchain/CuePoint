import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePresence } from "../tokens/usePresence";
import { Button } from "./Button";
import "./Modal.css";

interface ModalProps {
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
   * A step back in a multi-screen dialog (the first-run guide), in the footer between
   * the secondary and the primary action, so the buttons keep their places. Disabled
   * rather than absent on the first screen, for the same reason.
   */
  backAction?: { label: string; onClick: () => void; disabled?: boolean };
  /**
   * `"wide"` for content that is a table or a log rather than a message or a
   * form. The default 520px is right for a question and too narrow for rows.
   */
  size?: "default" | "wide";
  /**
   * False when a stray click must not end the dialog (the first-run guide, RUN-1):
   * the backdrop then does nothing. Escape and the close button still call `onClose`.
   */
  closeOnBackdrop?: boolean;
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
  backAction,
  size = "default",
  closeOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Each dialog's own title id. A shared one named every dialog on the page after the
  // first title in it: while one dialog plays its exit and the next opens, both read as
  // whichever of them comes first in the page.
  const titleId = useId();
  // Where focus was before the dialog opened, so it can be put back.
  const restoreTo = useRef<HTMLElement | null>(null);

  // Layout effects, not passive ones: the dialog is on screen from this commit, and
  // a passive effect runs after the paint, so an Escape pressed as it appeared (or
  // focus asked for at once) found nothing listening and was lost.
  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
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

  // A closed dialog may play its exit (PAGES-12). The leaving copy is inert and takes no
  // pointer events at all, so a click on its backdrop lands on what is behind it.
  const presence = usePresence<HTMLDivElement>(open);
  if (!presence.present) return null;

  return (
    <div
      ref={presence.ref}
      className="cp-modal__backdrop"
      role="presentation"
      data-leaving={presence.leaving ? "" : undefined}
      inert={presence.leaving}
      onClick={closeOnBackdrop && !presence.leaving ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        className={`cp-modal ${size === "wide" ? "cp-modal--wide" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Focusable so a dialog with no controls of its own can still receive
        // focus rather than leaving it behind the backdrop.
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cp-modal__header">
          <h2 id={titleId} className="cp-modal__title">
            {title}
          </h2>
          <button type="button" className="cp-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="cp-modal__body">{children}</div>
        {(primaryAction || secondaryAction || backAction) && (
          <footer className="cp-modal__footer">
            {secondaryAction && (
              <Button variant="secondary" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
            {backAction && (
              <Button variant="secondary" onClick={backAction.onClick} disabled={backAction.disabled}>
                {backAction.label}
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
