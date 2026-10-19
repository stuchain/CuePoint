import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { usePresence } from "../tokens/usePresence";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { ReasonLine } from "./ReasonLine";
import "./Modal.css";

export type ModalSize = "small" | "medium" | "large";

/** An extra for the footer's far left is either a button (`extraAction`) or anything else (`footerExtra`), never both. */
type FooterExtras =
  | { extraAction?: { label: string; onClick: () => void }; footerExtra?: never }
  | { extraAction?: never; footerExtra?: ReactNode };

type ModalProps = FooterExtras & {
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
    /** One line saying why it is greyed; shown only while `disabled` is true. */
    disabledReason?: string;
    /** `"write"` is a button that writes to the user's files (Export to Rekordbox): the green fill. */
    variant?: "write";
  };
  secondaryAction?: { label: string; onClick: () => void };
  /**
   * A step back in a multi-screen dialog (the first-run guide), in the footer between
   * the secondary and the primary action, so the buttons keep their places. Disabled
   * rather than absent on the first screen, for the same reason.
   */
  backAction?: { label: string; onClick: () => void; disabled?: boolean };
  /**
   * A dialog that only shows something, or applies each change at once (columns, tags, a log,
   * activity), ends in one grey button, `closeLabel` (usually "Close"), which calls `onClose`.
   * It sits last, where the main button would; with a `primaryAction` it is not drawn.
   */
  closeLabel?: string;
  /**
   * One muted line just above the footer: why the main button is greyed, or the one note about
   * the buttons. A greyed `primaryAction.disabledReason` is shown the same way when this is absent.
   */
  reason?: string;
  /**
   * Three widths, all scaled with the text: `"small"` for a question (a confirmation), `"medium"`
   * (the default) for a form, `"large"` only for a table or a list (columns, shortcuts, activity,
   * the log viewer, search). `"narrow"`, `"default"` and `"wide"` are the old names of the same three.
   */
  size?: ModalSize;
  /**
   * `"danger"` is a delete confirmation: the main button is red (the one place a red fill is
   * used). Title it "Delete <thing>?", say what is lost in the body, offer Cancel and
   * a button named "Delete <thing>".
   */
  variant?: "default" | "danger";
  /**
   * False when a stray click must not end the dialog (the first-run guide, RUN-1):
   * the backdrop then does nothing. Escape and the close button still call `onClose`.
   */
  closeOnBackdrop?: boolean;
  /**
   * False when closing hands focus to something else (search opening a track): the dialog then
   * does not put it back on the opener first. Escape and the close button leave it true.
   */
  restoreFocus?: boolean;
  /**
   * The control that gets focus when the dialog opens (the name box of a rename). Without it
   * focus starts on the dialog itself, so nothing is highlighted before the first Tab.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * True while the dialog must not be left (a write is running): the × is greyed and Escape and
   * the backdrop do nothing. Say why in `closeReason`, which takes the reason line.
   */
  closeDisabled?: boolean;
  closeReason?: string;
};

/** Dialogs open now, oldest first: only the newest answers Escape and Tab, so a question asked from inside a dialog does not close both. */
const openDialogs: object[] = [];

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
  extraAction,
  backAction,
  closeLabel,
  footerExtra,
  reason: reasonProp,
  size = "medium",
  variant = "default",
  closeOnBackdrop = true,
  restoreFocus = true,
  initialFocus,
  closeDisabled = false,
  closeReason,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Each dialog's own title id. A shared one named every dialog on the page after the
  // first title in it: while one dialog plays its exit and the next opens, both read as
  // whichever of them comes first in the page.
  const titleId = useId();
  const reasonId = useId();
  // Where focus was before the dialog opened, so it can be put back.
  const restoreTo = useRef<HTMLElement | null>(null);
  // Read when the dialog closes, not when it opened.
  const restoreFocusRef = useRef(restoreFocus);
  restoreFocusRef.current = restoreFocus;
  // Kept in a ref so a new inline `onClose` on a re-render does not re-register the dialog:
  // re-registering would push a parent above a child dialog that opened after it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Read at the moment of the key press, so a dialog that becomes closable hears the next Escape.
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;
  const primaryRef = useRef(primaryAction);
  primaryRef.current = primaryAction;
  const meRef = useRef({});

  // Enter runs in the bubble phase, after the field's own handler. A capture listener on the
  // window fired first, so a field that submits itself (NewSetDialogs, ChapterDialog) submitted
  // twice. A handler that already took the key calls preventDefault, and this then does nothing.
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (openDialogs[openDialogs.length - 1] !== meRef.current) return;
    // Enter in a text field presses the one main button, if it can be pressed. A button, a
    // link, a multi-line box or a list keeps its own Enter.
    const target = event.target;
    const main = primaryRef.current;
    if (main && !main.disabled && !main.loading && target instanceof HTMLInputElement) {
      const type = target.type;
      if (type !== "button" && type !== "submit" && type !== "checkbox" && type !== "radio") {
        event.preventDefault();
        main.onClick();
      }
    }
  };

  // Layout effects, not passive ones: the dialog is on screen from this commit, and
  // a passive effect runs after the paint, so an Escape pressed as it appeared (or
  // focus asked for at once) found nothing listening and was lost.
  useLayoutEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    // The dialog itself, not its first control. Its `aria-labelledby` means the
    // title is announced, and it avoids starting the user on whatever control
    // happens to come first in the markup — which is the close button.
    (initialFocusRef.current?.current ?? dialogRef.current)?.focus();

    return () => {
      // Only restore if the old element is still there: the dialog may have
      // been what removed it.
      const target = restoreTo.current;
      if (restoreFocusRef.current && target && document.contains(target)) target.focus();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const me = meRef.current;
    openDialogs.push(me);
    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== me) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!closeDisabledRef.current) onCloseRef.current();
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
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      const at = openDialogs.indexOf(me);
      if (at !== -1) openDialogs.splice(at, 1);
    };
  }, [open]);

  // A closed dialog may play its exit (PAGES-12). The leaving copy is inert and takes no
  // pointer events at all, so a click on its backdrop lands on what is behind it.
  const presence = usePresence<HTMLDivElement>(open);
  if (!presence.present) return null;

  const reason =
    (closeDisabled ? closeReason : undefined) ??
    reasonProp ??
    (primaryAction?.disabled ? primaryAction.disabledReason : undefined);
  // A dialog with no buttons of its own only shows something: it ends in one grey Close (C107).
  const footerClose = closeLabel ?? (!primaryAction && !secondaryAction && !backAction ? "Close" : undefined);
  const close = () => {
    if (!closeDisabled) onClose();
  };

  return (
    <div
      ref={presence.ref}
      className="cp-modal__backdrop"
      role="presentation"
      data-leaving={presence.leaving ? "" : undefined}
      inert={presence.leaving}
      onClick={closeOnBackdrop && !presence.leaving ? close : undefined}
    >
      <div
        ref={dialogRef}
        className={`cp-modal${` cp-modal--${size}`}${variant === "danger" ? " cp-modal--danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Focusable so a dialog with no controls of its own can still receive
        // focus rather than leaving it behind the backdrop.
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className="cp-modal__header">
          <h2 id={titleId} className="cp-modal__title">
            {title}
          </h2>
          <CloseButton onClick={close} aria-disabled={closeDisabled || undefined} />
        </header>
        <div className="cp-modal__body">{children}</div>
        {/* The one reason line, directly above the footer (area 93). */}
        <ReasonLine id={reasonId} align="end" className="cp-modal__reason">
          {reason}
        </ReasonLine>
        {(primaryAction || secondaryAction || extraAction || backAction || footerClose || footerExtra) && (
          <footer className="cp-modal__footer">
            {footerExtra && <div className="cp-modal__footer-extra">{footerExtra}</div>}
            {extraAction && (
              <Button variant="secondary" className="cp-modal__extra" onClick={extraAction.onClick}>
                {extraAction.label}
              </Button>
            )}
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
            {footerClose && !primaryAction && (
              <Button variant="secondary" onClick={close}>
                {footerClose}
              </Button>
            )}
            {primaryAction && (
              <Button
                variant={variant === "danger" ? "danger-confirm" : (primaryAction.variant ?? "primary")}
                onClick={primaryAction.onClick}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
                aria-describedby={reason ? reasonId : undefined}
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
