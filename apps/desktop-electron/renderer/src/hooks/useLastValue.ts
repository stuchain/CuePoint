import { useRef } from "react";

/**
 * The newest value that was not empty (M248). A dialog holds on to its words while it plays its
 * exit: the state that named it ("Freeze “Peak time”?") is already null by then, so the title would
 * fall back to a bare "Freeze ?". Give the hook the state; draw what it returns.
 */
export function useLastValue<T>(value: T | null | undefined): T | null | undefined {
  const last = useRef<T | null | undefined>(value);
  if (value !== null && value !== undefined) last.current = value;
  return value ?? last.current;
}
