import { useEffect, useRef } from "react";
import { MENU_COMMAND_IDS, sizeAfterCommand } from "../../api/menuCommands";
import { useScale } from "../../tokens/ScaleContext";

type MenuCommandId = (typeof MENU_COMMAND_IDS)[number];

/** The commands that do something other than set the size; the size ones are answered here. */
export type ActionCommandId = Exclude<MenuCommandId, `size-${string}`>;

/**
 * Answer the native menu's commands (FLW-20, DEC-204).
 *
 * Main builds the menu and sends the id of the item picked. A page or dialog command is
 * the caller's to run; a size command (Bigger, Smaller, Default size, or a size picked
 * in View → Size) steps the Size setting, so the menu and Settings → Appearance are one
 * setting. An id nothing here knows is ignored: the page never runs what it was not given.
 */
export function useMenuCommands(actions: Record<ActionCommandId, () => void>): void {
  const { scale, setScale } = useScale();
  const latest = useRef({ actions, scale, setScale });
  latest.current = { actions, scale, setScale };

  useEffect(() => {
    const menu = window.cuepoint?.menu;
    if (!menu) return undefined;
    return menu.onCommand((id) => {
      const { actions: run, scale: current, setScale: set } = latest.current;
      if (Object.prototype.hasOwnProperty.call(run, id)) {
        run[id as ActionCommandId]();
        return;
      }
      const size = sizeAfterCommand(id, current);
      if (size === null) return;
      set(size);
      // The next command steps from this size, not from the last render's. Two presses
      // of Smaller can arrive before React renders the first (each IPC message is its own
      // task, the render another), and both would otherwise step from the same size.
      latest.current.scale = size;
    });
  }, []);
}
