import { useEffect, useRef } from "react";

/**
 * Call `reload` when `token` changes to a new value above 0.
 *
 * A kept-alive page (React Activity) re-runs its effects on every show, so an
 * effect keyed on the token alone would reload again on each revisit and put
 * the table back to skeletons. The last token handled is remembered instead.
 */
export function useReloadOnToken(reload: () => void, token: number): void {
  const handled = useRef(0);
  useEffect(() => {
    if (token > 0 && handled.current !== token) {
      handled.current = token;
      reload();
    }
  }, [reload, token]);
}
