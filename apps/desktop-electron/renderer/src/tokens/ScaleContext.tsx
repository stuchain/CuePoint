import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  SCALE_OPTIONS,
  initScale,
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
