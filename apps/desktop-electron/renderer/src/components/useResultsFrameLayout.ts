import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampFrameWidth,
  FRAME_MAX_HEIGHT,
  FRAME_MIN_HEIGHT,
  loadResultsTableLayout,
  patchResultsTableLayout,
} from "./resultsTableLayout";

function readInitialFrameWidth(scale: number): number | null {
  const stored = loadResultsTableLayout(scale).tableWidth;
  if (stored == null) return null;
  return clampFrameWidth(stored);
}

export function useResultsFrameLayout(scale: number) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState<number | null>(() => readInitialFrameWidth(scale));
  const [frameHeight, setFrameHeight] = useState<number | null>(
    () => loadResultsTableLayout(scale).tableHeight,
  );

  useEffect(() => {
    patchResultsTableLayout(scale, { tableWidth: frameWidth, tableHeight: frameHeight });
  }, [frameWidth, frameHeight, scale]);

  useEffect(() => {
    const onResize = () => {
      setFrameWidth((prev) => (prev != null ? clampFrameWidth(prev) : null));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isSized = frameWidth != null || frameHeight != null;

  const startFrameResize = useCallback(
    (startX: number, startY: number) => {
      const node = frameRef.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      const startW = frameWidth ?? rect.width;
      const startH = frameHeight ?? rect.height;

      const onMove = (event: MouseEvent) => {
        setFrameWidth(clampFrameWidth(startW + (event.clientX - startX)));
        setFrameHeight(
          Math.min(
            FRAME_MAX_HEIGHT,
            Math.max(FRAME_MIN_HEIGHT, Math.round(startH + (event.clientY - startY))),
          ),
        );
      };

      const onUp = () => {
        document.body.classList.remove("results-frame--resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      document.body.classList.add("results-frame--resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [frameWidth, frameHeight],
  );

  const resetFrameSize = useCallback(() => {
    setFrameWidth(null);
    setFrameHeight(null);
  }, []);

  return {
    frameRef,
    frameWidth,
    frameHeight,
    isSized,
    startFrameResize,
    resetFrameSize,
  };
}
