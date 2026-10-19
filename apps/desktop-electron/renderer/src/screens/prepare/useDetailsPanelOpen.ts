/**
 * Whether the shell's Track details panel is open (C226).
 *
 * The shell unmounts the panel when it is closed, so its element is the answer. A page cannot ask
 * the shell directly (the toggle's state is private to it), and a second panel beside the Set and
 * the source panel would be a third column: Prepare shows one right-hand panel at a time.
 */
import { useEffect, useState } from "react";

import { DETAILS_PANEL_ID } from "../../components/shell/detailsToggle";

const isOpen = () => document.getElementById(DETAILS_PANEL_ID) !== null;

export function useDetailsPanelOpen(): boolean {
  const [open, setOpen] = useState(isOpen);
  useEffect(() => {
    const check = () => setOpen(isOpen());
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return open;
}
