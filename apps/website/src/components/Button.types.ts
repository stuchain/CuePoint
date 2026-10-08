export type ButtonVariant = "primary" | "secondary";

interface ButtonBase {
  variant?: ButtonVariant;
  class?: string;
}

/** A link styled as a button: a real <a>. */
export interface ButtonLinkProps extends ButtonBase {
  href: string;
  /** Opens off-site: adds rel="noopener noreferrer". */
  external?: boolean;
  type?: never;
  disabled?: never;
}

/** A real <button>. */
export interface ButtonActionProps extends ButtonBase {
  href?: undefined;
  type?: "button" | "submit";
  disabled?: boolean;
  external?: never;
}

export type ButtonProps = ButtonLinkProps | ButtonActionProps;
