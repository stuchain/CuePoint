import type { ReactNode } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  /** The question: "Delete <thing>?" for a delete, "Clear logs?" for a clear. */
  title: string;
  /** What is lost or changed, in a sentence or two. */
  children: ReactNode;
  /** The main button, named for the act ("Delete <thing>"), never "OK" or "Yes". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** A destructive act: the main button is red (the one place a red fill is used). */
  danger?: boolean;
}

/**
 * The one confirmation: an app dialog (never `window.confirm`), narrow, with Cancel and the act.
 * Delete confirmations use `danger`: title "Delete <thing>?", the body says what is lost, Cancel
 * and a red "Delete <thing>".
 */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, danger = false }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      size="small"
      variant={danger ? "danger" : "default"}
      onClose={onCancel}
      primaryAction={{ label: confirmLabel, onClick: onConfirm }}
      secondaryAction={{ label: "Cancel", onClick: onCancel }}
    >
      <p>{children}</p>
    </Modal>
  );
}
