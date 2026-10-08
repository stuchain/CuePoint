interface KeyboardShortcutEntry {
  context: string;
  action: string;
  shortcut: string;
}

/**
 * The Shortcuts list (Help → Shortcuts): only keys that do something. Each row is read
 * against the code that answers it by `keyboardShortcuts.test.ts`, so a handler that goes
 * takes its row with it. The menu's keys (Ctrl+O, Ctrl+,, Ctrl+=, Ctrl+-, Ctrl+0) are
 * answered by the native menu (`electron/appMenu.ts`). On a Mac, Cmd takes the place of Ctrl.
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcutEntry[] = [
  { context: "Global", action: "Import another file", shortcut: "Ctrl+O" },
  { context: "Global", action: "Open Settings", shortcut: "Ctrl+," },
  { context: "Global", action: "Make everything bigger", shortcut: "Ctrl+=" },
  { context: "Global", action: "Make everything smaller", shortcut: "Ctrl+-" },
  { context: "Global", action: "Back to the default size", shortcut: "Ctrl+0" },
  { context: "Global", action: "Search library", shortcut: "Ctrl+K" },
  { context: "Global", action: "Show or hide track details", shortcut: "Ctrl+I" },
  { context: "Global", action: "Collapse or expand the sidebar", shortcut: "Ctrl+B" },
  { context: "Global", action: "Open activity", shortcut: "Ctrl+Shift+A" },
  { context: "Global", action: "Show keyboard shortcuts", shortcut: "Ctrl+?" },
  { context: "Global", action: "Open this list", shortcut: "F1" },
  { context: "Global", action: "Close a dialog, panel or search", shortcut: "Esc" },
  // The Library became a browser in Phase 4 (DEC-039), so it has a context of
  // its own.
  { context: "Library", action: "Focus search", shortcut: "Ctrl+F" },
  { context: "Library", action: "Select all matching tracks", shortcut: "Ctrl+A" },
  { context: "Library", action: "Play the selected track", shortcut: "Enter" },
  { context: "Library", action: "Clear the selection", shortcut: "Esc" },
  { context: "Library", action: "Open the track menu", shortcut: "Shift+F10" },
  { context: "Library", action: "Move the selected track up or down in a Collection", shortcut: "Alt+Up / Alt+Down" },
  { context: "Library", action: "Rename the selected Collection", shortcut: "F2" },
  { context: "Library", action: "Delete the selected Collection", shortcut: "Delete" },
  // Prepare's: the Set's source panel has a divider to drag; Mix in and Mix out are typed in
  // the table (FLW-18) and the entry keys are the queue's (FLW-17), answered while the Set
  // table has focus. Plain Enter and the arrows are the field's and the divider's own.
  { context: "Prepare", action: "Resize the source panel (focus its divider first)", shortcut: "Left / Right" },
  { context: "Prepare", action: "In Track details: save Mix in or Mix out", shortcut: "Enter" },
  { context: "Prepare", action: "Type the selected entry's Mix in", shortcut: "Enter or F2" },
  { context: "Prepare", action: "Save a typed time and go to the next", shortcut: "Enter or Tab" },
  { context: "Prepare", action: "Drop a typed time", shortcut: "Esc" },
  { context: "Prepare", action: "Move the selected entries", shortcut: "Alt+Up / Alt+Down" },
  { context: "Prepare", action: "Remove the selected entries", shortcut: "Delete" },
  // Clean's review queue (CLEAN-12). Bare keys, because reviewing thousands of
  // tracks is a keyboard job; they are not taken while typing in a field or
  // inside a dialog, and none of them is modified, so none collides with a
  // shell shortcut.
  { context: "Clean", action: "Previous or next track in the review queue", shortcut: "Up / Down" },
  { context: "Clean", action: "Choose another candidate", shortcut: "Left / Right" },
  { context: "Clean", action: "Accept the chosen candidate", shortcut: "A" },
  { context: "Clean", action: "Reject the match", shortcut: "R" },
  { context: "Clean", action: "Next track without deciding", shortcut: "N" },
  // The player (PLAYER-12). Space is bare because it is the one key everyone
  // already tries; the rest are Ctrl-modified because bare arrows belong to the
  // table and the queue panel, which is where a keyboard user spends their time.
  { context: "Player", action: "Play or pause", shortcut: "Space" },
  { context: "Player", action: "Next track", shortcut: "Ctrl+Right" },
  { context: "Player", action: "Previous track", shortcut: "Ctrl+Left" },
  { context: "Player", action: "Volume up", shortcut: "Ctrl+Up" },
  { context: "Player", action: "Volume down", shortcut: "Ctrl+Down" },
  { context: "Player", action: "Move a queued track", shortcut: "Alt+Up / Alt+Down" },
  { context: "Player", action: "Remove a queued track", shortcut: "Delete" },
  // Held only while CuePoint has focus, so the rest of the machine keeps them.
  { context: "Player", action: "Media keys, while CuePoint is focused", shortcut: "Play/Pause, Next, Previous" },
];

export function filterShortcuts(
  entries: KeyboardShortcutEntry[],
  query: string,
): KeyboardShortcutEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (row) =>
      row.context.toLowerCase().includes(q) ||
      row.action.toLowerCase().includes(q) ||
      row.shortcut.toLowerCase().includes(q),
  );
}
