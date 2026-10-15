/**
 * A button that takes the person to another page, from a panel that may be
 * drawn with or without a router around it.
 *
 * Track details is drawn by five pages and by tests; all but the tests are
 * inside the router. Outside one the button is left out, as every other
 * action the panel cannot do here is, rather than throwing.
 */
import { useInRouterContext, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "../../components/Button";
import { Hint } from "../../components/Hint";

interface RouteButtonProps {
  /** Where to go; a function when the place is found out on the click, or null for nowhere. */
  to: string | (() => Promise<string | null>);
  /** The location state the page opens with (`cleanMatchState`). */
  state?: unknown;
  className?: string;
  children: ReactNode;
  title?: string;
  /** Draw it as the standard button of this role; without one it is a plain button (a text link). */
  variant?: ButtonVariant;
  /** The full name, when the visible text is a short form of it. */
  "aria-label"?: string;
}

function Inside({ to, state, className, children, title, variant, "aria-label": ariaLabel }: RouteButtonProps) {
  const navigate = useNavigate();
  const go = () => {
    if (typeof to === "string") {
      navigate(to, { state });
      return;
    }
    void to().then((found) => {
      if (found !== null) navigate(found, { state });
    });
  };
  return (
    <Hint text={title}>
      {variant ? (
        <Button variant={variant} className={className} aria-label={ariaLabel} onClick={go}>
          {children}
        </Button>
      ) : (
        <button type="button" className={className} aria-label={ariaLabel} onClick={go}>
          {children}
        </button>
      )}
    </Hint>
  );
}

export function RouteButton(props: RouteButtonProps) {
  return useInRouterContext() ? <Inside {...props} /> : null;
}
