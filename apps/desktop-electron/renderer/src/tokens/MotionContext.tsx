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
  readFollowSystem,
  readMotionOverrides,
  writeFollowSystem,
  writeMotionOverrides,
  type MotionKindId,
  type MotionOverrides,
  type MotionSwitches,
} from "./motion";

interface MotionContextValue {
  /** Each kind's switch, the defaults under what the user changed. */
  switches: MotionSwitches;
  setKind: (kind: MotionKindId, on: boolean) => void;
  /** The Motion choice's On and Off: writes all ten the same. */
  setAll: (on: boolean) => void;
  /** Writes all ten as given: Custom's last set, put back. */
  setSwitches: (next: MotionSwitches) => void;
  /** Back to the defaults; returns the way to put back what was there. */
  reset: () => () => void;
  /** The system's Reduce motion setting. While it and `followSystem` are on, nothing moves. */
  systemReduced: boolean;
  /** Follow system chosen (M435): the system's setting wins. "On" clears it. Stored. */
  followSystem: boolean;
  setFollowSystem: (follow: boolean) => void;
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
 * none while the system asks for reduced motion and Follow system is chosen
 * (the default), whatever the switches say. "On" (M435) lets the switches win.
 * Every animation's CSS is gated on one of these (see `motionRules.test.ts`).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<MotionOverrides>(() => readMotionOverrides());
  const [systemReduced, setSystemReduced] = useState<boolean>(() => reducedQuery()?.matches ?? false);
  const [followSystem, setFollowState] = useState<boolean>(() => readFollowSystem());
  // The system stills motion only while it is followed.
  const stilled = systemReduced && followSystem;

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
      if (switches[kind.id] && !stilled) root.setAttribute(name, "on");
      else root.removeAttribute(name);
    }
  }, [switches, stilled]);

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

  const setSwitches = useCallback((next: MotionSwitches) => commit({ ...next }), [commit]);

  const setFollowSystem = useCallback((follow: boolean) => {
    writeFollowSystem(follow);
    setFollowState(follow);
  }, []);

  const reset = useCallback(() => {
    const before = overrides;
    const followedBefore = followSystem;
    commit({});
    setFollowSystem(true);
    return () => {
      commit(before);
      setFollowSystem(followedBefore);
    };
  }, [commit, overrides, followSystem, setFollowSystem]);

  const value = useMemo(
    () => ({ switches, setKind, setAll, setSwitches, reset, systemReduced, followSystem, setFollowSystem }),
    [switches, setKind, setAll, setSwitches, reset, systemReduced, followSystem, setFollowSystem],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

/**
 * Without a kind: the switches and their setters (Settings → Motion). With one:
 * whether that kind may move right now, which is its switch on and the system not
 * stilling it (asking for reduced motion while Follow system is chosen). Outside a provider that is false, so a component
 * rendered alone (a test, a story) shows its still state.
 *
 * Motion written in script asks this; motion written in CSS is gated on the
 * attribute the provider writes. `motionRules.test.ts` holds both to it.
 */
export function useMotion(): MotionContextValue;
export function useMotion(kind: MotionKindId): boolean;
export function useMotion(kind?: MotionKindId): MotionContextValue | boolean {
  const ctx = useContext(MotionContext);
  if (kind !== undefined) return ctx ? ctx.switches[kind] && !(ctx.systemReduced && ctx.followSystem) : false;
  if (!ctx) throw new Error("useMotion must be used within MotionProvider");
  return ctx;
}
