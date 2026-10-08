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

interface RouteButtonProps {
  /** Where to go; a function when the place is found out on the click, or null for nowhere. */
  to: string | (() => Promise<string | null>);
  /** The location state the page opens with (`cleanMatchState`, `cleanFixState`). */
  state?: unknown;
  className?: string;
  children: ReactNode;
  title?: string;
}

function Inside({ to, state, className, children, title }: RouteButtonProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={() => {
        if (typeof to === "string") {
          navigate(to, { state });
          return;
        }
        void to().then((found) => {
          if (found !== null) navigate(found, { state });
        });
      }}
    >
      {children}
    </button>
  );
}

export function RouteButton(props: RouteButtonProps) {
  return useInRouterContext() ? <Inside {...props} /> : null;
}
