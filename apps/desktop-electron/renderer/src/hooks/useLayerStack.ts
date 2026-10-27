import { useLayoutEffect, useRef } from "react";

/** Open layers (dialogs, menus), oldest first. Escape and Tab belong to the newest one only (M469). */
const layers: object[] = [];

/** Whether this layer is the newest open one. */
export type IsTopLayer = () => boolean;

/**
 * Registers an open dismissible layer in the one stack, so a menu opened from a dialog answers
 * Escape before the dialog does, and a question opened from a dialog does not close both. Pass
 * `open`; the layer is on the stack from the commit that shows it until it closes. A layer calls
 * the returned function when its key arrives and does nothing unless it returns true.
 */
export function useLayerStack(open: boolean): IsTopLayer {
  const me = useRef({});
  useLayoutEffect(() => {
    if (!open) return;
    const mine = me.current;
    layers.push(mine);
    return () => {
      const at = layers.indexOf(mine);
      if (at !== -1) layers.splice(at, 1);
    };
  }, [open]);
  return () => layers[layers.length - 1] === me.current;
}
