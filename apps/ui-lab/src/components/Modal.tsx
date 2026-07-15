import type { ReactNode } from "react";
import { Button } from "./Button";
import "./Modal.css";

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  primaryAction?: { label: string; onClick: () => void; loading?: boolean };
  secondaryAction?: { label: string; onClick: () => void };
}

export function Modal({
  open,
  title,
  children,
  onClose,
  primaryAction,
  secondaryAction,
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="cp-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="cp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-modal-title"
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
