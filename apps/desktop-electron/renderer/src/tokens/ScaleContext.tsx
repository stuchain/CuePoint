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
  devicePixelRatio,
  initScale,
  scaleChoices,
  screenAvailHeight,
  setStoredScale,
  watchDevicePixelRatio,
  type ScaleFactor,
} from "./scale";
import { startWindowThemeSync } from "../api/windowTheme";

interface ScaleContextValue {
  scale: ScaleFactor;
  setScale: (scale: ScaleFactor) => void;
  scaleOptions: readonly ScaleFactor[];
}

const ScaleContext = createContext<ScaleContextValue | null>(null);

export function ScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<ScaleFactor>(() => initScale());
  // The display's ratio, so the menu's suggested size and `--dpr` follow a window moved to another
  // display (M493).
  const [dpr, setDpr] = useState<number>(() => devicePixelRatio());
  useEffect(() => watchDevicePixelRatio(setDpr), []);
  // Main is told the theme's colours too, for the frame around the page (M492, M495, M496): the
  // provider is the one place that already reports the page's look to main.
  useEffect(() => startWindowThemeSync(), []);

  const setScale = useCallback((next: ScaleFactor) => {
    setStoredScale(next);
    setScaleState(next);
  }, []);

  // View → Size in the native menu shows these options with the current one ticked (FLW-20),
  // so main is told whenever the size changes, and once at start.
  // The greyed state is computed on a scale change only: the rule reads the screen, not the window.
  useEffect(() => {
    const told = window.cuepoint?.menu?.setSizeState({
      options: scaleChoices(scale, screenAvailHeight(), dpr).map(({ value, label, disabled }) => ({
        value,
        label,
        // Optional, so only a size that is too big for the screen carries it.
        ...(disabled ? { disabled: true } : {}),
      })),
      current: scale,
    });
    void Promise.resolve(told).catch(() => undefined);
  }, [scale, dpr]);

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
