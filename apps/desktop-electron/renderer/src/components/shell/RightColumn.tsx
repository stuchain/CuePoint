import { useCallback, useEffect, type ReactNode } from "react";
import { QueuePanel } from "../player/QueuePanel";
import { closeQueue, useQueueOpen } from "../player/queuePanelState";
import { publishDetails } from "./detailsToggle";
import { useShellCommand } from "./shellCommands";

interface RightColumnProps {
  /** Track details, which has the column whenever the queue is closed. */
  children: ReactNode;
}

/**
 * The queue while it is open; the Track details panel otherwise (R2-1, DEC-264).
 *
 * The queue is a place to work in, so it takes the whole column rather than
 * sharing it, and it sits beside the table instead of above the player bar,
 * where it used to take the table's height away. Track details comes back when
 * the queue closes.
 *
 * Track details is unmounted while the queue is open, and with it the View ›
 * Track details command and Ctrl+I that it answers. Asking for Track details
 * is exactly what these two mean then, so they close the queue.
 */
export function RightColumn({ children }: RightColumnProps) {
  const queueOpen = useQueueOpen();
  return queueOpen ? <QueueDock /> : <>{children}</>;
}

/** The queue in the column, and the two ways back to Track details. */
function QueueDock() {
  const close = useCallback(() => closeQueue(), []);
  useShellCommand("toggle-inspector", close);
  // The header's Details toggle asks for Track details, which is what closing the queue gives.
  useEffect(() => {
    publishDetails({ open: false, toggle: close });
    return () => publishDetails(null);
  }, [close]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        closeQueue();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <QueuePanel onClose={closeQueue} />;
}
