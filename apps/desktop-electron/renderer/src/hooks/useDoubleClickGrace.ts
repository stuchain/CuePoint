import { useEffect, useState } from "react";

/**
 * A double-click's length: the Windows default, the longest of the systems the app runs on.
 * Something that appears where the first click of a double-click has just landed (Prepare's entry
 * buttons, the selection bar over a table's bottom rows) lets the pointer through for this long, so
 * the second click reaches the row and plays it instead of pressing what appeared.
 */
export const DOUBLE_CLICK_MS = 500;

/**
 * False for a double-click's length after the component mounts, then true. While false the caller
 * lets the pointer through (`pointer-events: none`); keys and Tab are never held back.
 */
export function useDoubleClickGrace(): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), DOUBLE_CLICK_MS);
    return () => clearTimeout(timer);
  }, []);
  return armed;
}
