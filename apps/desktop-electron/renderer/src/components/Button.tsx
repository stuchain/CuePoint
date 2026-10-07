import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

type ButtonVariant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      className={`cp-btn cp-btn--${variant} ${loading ? "cp-btn--loading" : ""} ${className}`.trim()}
      disabled={isDisabled}
      {...rest}
    >
      {icon && <span className="cp-btn__icon">{icon}</span>}
      <span className="cp-btn__label">{loading ? "…" : children}</span>
    </button>
  );
}
