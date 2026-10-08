import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  MOTION_KINDS,
  clearStoredMotion,
  mergeMotion,
  readMotionOverrides,
  writeMotionOverrides,
  type MotionKindId,
  type MotionOverrides,
  type MotionSwitches,
} from "./motion";

interface MotionContextValue {
  /** Each kind's switch, the defaults under what the user changed. */
  switches: MotionSwitches;
  setKind: (kind: MotionKindId, on: boolean) => void;
  /** "Turn all on" and "Turn all off": writes all ten. */
  setAll: (on: boolean) => void;
  /** Back to the defaults; returns the way to put back what was there. */
  reset: () => () => void;
  /** The system's Reduce motion setting. While it is on, nothing is switched on. */
  systemReduced: boolean;
}

const MotionContext = createContext<MotionContextValue | null>(null);

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function reducedQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_QUERY)
    : null;
}

/**
 * Writes `data-motion-<kind>="on"` on `<html>` for every kind that is on, and
 * none while the system asks for reduced motion, whatever the switches say.
 * Every animation's CSS is gated on one of these (see `motionRules.test.ts`).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<MotionOverrides>(() => readMotionOverrides());
  const [systemReduced, setSystemReduced] = useState<boolean>(() => reducedQuery()?.matches ?? false);

  useEffect(() => {
    const query = reducedQuery();
    if (!query) return;
    const onChange = (event: { matches: boolean }) => setSystemReduced(event.matches);
    setSystemReduced(query.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener?.(onChange);
    return () => query.removeListener?.(onChange);
  }, []);

  const switches = useMemo(() => mergeMotion(overrides), [overrides]);

  useEffect(() => {
    const root = document.documentElement;
    for (const kind of MOTION_KINDS) {
      const name = `data-motion-${kind.id}`;
      if (switches[kind.id] && !systemReduced) root.setAttribute(name, "on");
      else root.removeAttribute(name);
    }
  }, [switches, systemReduced]);

  const commit = useCallback((next: MotionOverrides) => {
    if (Object.keys(next).length === 0) clearStoredMotion();
    else writeMotionOverrides(next);
    setOverrides(next);
  }, []);

  const setKind = useCallback(
    (kind: MotionKindId, on: boolean) => commit({ ...overrides, [kind]: on }),
    [commit, overrides],
  );

  const setAll = useCallback(
    (on: boolean) => commit(Object.fromEntries(MOTION_KINDS.map((k) => [k.id, on]))),
    [commit],
  );

  const reset = useCallback(() => {
    const before = overrides;
    commit({});
    return () => commit(before);
  }, [commit, overrides]);

  const value = useMemo(
    () => ({ switches, setKind, setAll, reset, systemReduced }),
    [switches, setKind, setAll, reset, systemReduced],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): MotionContextValue {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error("useMotion must be used within MotionProvider");
  return ctx;
}
