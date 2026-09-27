/**
 * Whether an element is too narrow for two columns side by side (DISCOVER-10).
 *
 * The Runs tab puts its list beside the open run. With the sidebar and the
 * Inspector open, at the default scale and a common window, that left the run
 * about 300 pixels: its header wrapped into a column and its table had no room.
 * Below a width, the list goes above the run instead.
 *
 * Measured rather than a media query because the width that matters is this
 * element's, which the sidebar and the Inspector change without the window
 * changing; and against the UI scale, because a scale of 2 draws everything
 * twice as wide. An element never measured — a test's, or one not laid out
 * yet — is not narrow, so nothing changes until there is a width to act on.
 */
import { useEffect, useState } from "react";

import { useScale } from "../../tokens/ScaleContext";

/**
 * A ref to put on the element, and whether it is narrow. A callback ref rather
 * than a ref object, because the element can mount after the first render — a
 * list still being read renders something else — and an effect keyed on a ref
 * object would never see it arrive.
 */
export function useNarrow(below: number): [(element: HTMLElement | null) => void, boolean] {
  const { scale } = useScale();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, width > 0 && width < below * scale];
}
