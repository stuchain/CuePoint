import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SCALE,
  SCALE_OPTIONS,
  initScale,
  scaleOptionLabel,
  setStoredScale,
  type ScaleFactor,
} from "./scale";

interface ScaleContextValue {
  scale: ScaleFactor;
  setScale: (scale: ScaleFactor) => void;
  scaleOptions: readonly ScaleFactor[];
}

const ScaleContext = createContext<ScaleContextValue | null>(null);

export function ScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<ScaleFactor>(() => initScale());

  const setScale = useCallback((next: ScaleFactor) => {
    setStoredScale(next);
    setScaleState(next);
  }, []);

  // View → Size in the native menu shows these options with the current one ticked (FLW-20),
  // so main is told whenever the size changes, and once at start.
  useEffect(() => {
    const told = window.cuepoint?.menu?.setSizeState({
      options: SCALE_OPTIONS.map((value) => ({ value, label: scaleOptionLabel(value) })),
      current: scale,
    });
    void Promise.resolve(told).catch(() => undefined);
  }, [scale]);

  const value = useMemo(
    () => ({ scale, setScale, scaleOptions: SCALE_OPTIONS }),
    [scale, setScale],
  );

  return <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>;
}

export function useScale(): ScaleContextValue {
  const ctx = useContext(ScaleContext);
  if (!ctx) throw new Error("useScale must be used within ScaleProvider");
  return ctx;
}

/**
 * The scale alone, and the default outside a provider: for a part that draws
 * in scale pixels wherever it is rendered, such as a waveform (WAVE-06).
 */
export function useScaleFactor(): ScaleFactor {
  return useContext(ScaleContext)?.scale ?? DEFAULT_SCALE;
}
