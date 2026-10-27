export interface KeyboardShortcutEntry {
  context: string;
  action: string;
  shortcut: string;
}

/**
 * The names of the keys a menu entry may show beside its label (`TrackContextMenuItem.shortcut`),
 * written once here so a menu and this list can never disagree.
 */
export const KEYS = {
  play: "Enter",
  edit: "F2",
  remove: "Delete",
  selectAll: "Ctrl+A",
  clear: "Esc",
  menu: "Shift+F10",
} as const;

/**
 * The Keyboard shortcuts list (Help → Keyboard shortcuts): only keys that do something. Each row is read
 * against the code that answers it by `keyboardShortcuts.test.ts`, so a handler that goes
 * takes its row with it. The menu's keys (Ctrl+O, Ctrl+,, Ctrl+=, Ctrl+-, Ctrl+0) are
 * answered by the native menu (`electron/appMenu.ts`), and a row for one of them
 * uses the menu item's own words (`keyboardShortcuts.test.ts` compares them). On a Mac, Cmd takes the place of Ctrl.
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcutEntry[] = [
  { context: "Everywhere", action: "Import a Rekordbox file…", shortcut: "Ctrl+O" },
  { context: "Everywhere", action: "Settings", shortcut: "Ctrl+," },
  { context: "Everywhere", action: "Larger text", shortcut: "Ctrl+=" },
  { context: "Everywhere", action: "Smaller text", shortcut: "Ctrl+-" },
  { context: "Everywhere", action: "Default text size", shortcut: "Ctrl+0" },
  { context: "Everywhere", action: "Search library", shortcut: "Ctrl+K" },
  // The panels say what the key does to them; the View menu ticks them by name (M444).
  { context: "Everywhere", action: "Show or hide Track details", shortcut: "Ctrl+I" },
  { context: "Everywhere", action: "Show or hide the sidebar", shortcut: "Ctrl+B" },
  { context: "Everywhere", action: "Activity", shortcut: "Ctrl+Shift+A" },
  // The panes of the window (M459, D34): sidebar, page and its panes, Track details or the queue, player.
  { context: "Everywhere", action: "Go to the next pane", shortcut: "F6" },
  { context: "Everywhere", action: "Go to the previous pane", shortcut: "Shift+F6" },
  // Two keys for one action, so one row (M444).
  { context: "Everywhere", action: "Keyboard shortcuts", shortcut: "Ctrl+? / F1" },
  { context: "Everywhere", action: "Close a dialog, panel or search", shortcut: "Esc" },
  // The Library became a browser in Phase 4 (DEC-039), so it has a context of
  // its own.
  { context: "Library", action: "Search these tracks", shortcut: "Ctrl+F" },
  { context: "Library", action: "Select all matching tracks", shortcut: KEYS.selectAll },
  { context: "Library", action: "Play the selected track", shortcut: KEYS.play },
  { context: "Library", action: "Clear the selection", shortcut: KEYS.clear },
  { context: "Library", action: "Open the track menu", shortcut: KEYS.menu },
  { context: "Library", action: "Move the selected track up or down in a Collection", shortcut: "Alt+Up / Alt+Down" },
  { context: "Library", action: "Rename the selected Collection", shortcut: KEYS.edit },
  { context: "Library", action: "Delete the selected Collection", shortcut: KEYS.remove },
  // The Keys page (PAGES-16): the wheel and the list both choose keys the same way.
  { context: "Keys", action: "Add or remove a key from the choice", shortcut: "Ctrl+Click" },
  { context: "Keys", action: "Choose every key between the last one and this one", shortcut: "Shift+Click" },
  // Prepare's: the Set's source panel has a divider to drag; Mix in and Mix out are typed in
  // the table (FLW-18) and the entry keys are the queue's (FLW-17), answered while the Set
  // table has focus. Plain Enter and the arrows are the field's and the divider's own.
  { context: "Prepare", action: "Resize the source panel (focus its divider first)", shortcut: "Left / Right" },
  // M480: the page's search is the Library tab's box, opened if another tab shows.
  { context: "Prepare", action: "Search the Library tab", shortcut: "Ctrl+F" },
  { context: "Prepare", action: "Play from here", shortcut: "Enter" },
  { context: "Prepare", action: "Edit mix-in time", shortcut: "F2" },
  { context: "Prepare", action: "Save a typed time", shortcut: "Enter (while typing)" },
  { context: "Prepare", action: "Save a typed time and go to the next", shortcut: "Tab" },
  { context: "Prepare", action: "Drop a typed time", shortcut: "Esc" },
  // "Tracks", as the page counts them (M427).
  { context: "Prepare", action: "Move the selected tracks", shortcut: "Alt+Up / Alt+Down" },
  { context: "Prepare", action: "Remove the selected tracks", shortcut: "Delete" },
  // Every track table: the table itself, once focused, answers these. Clean's Match table uses them too;
  // Enter on a row plays it (`onRowActivate`), F2 edits where a table has an edit (`onRowEdit`).
  { context: "Tables", action: "Select the previous or next track", shortcut: "Up / Down" },
  { context: "Tables", action: "Extend the selection", shortcut: "Shift+Up / Shift+Down" },
  { context: "Tables", action: "First or last track", shortcut: "Home / End" },
  { context: "Tables", action: "A page up or down", shortcut: "Page Up / Page Down" },
  { context: "Tables", action: "Add or remove the focused track", shortcut: "Ctrl+Space" },
  // Clean's Match area, the Review of a playlist: the table and its side panel. Bare keys, because checking
  // thousands of tracks is a keyboard job; they are not taken while typing in a field or inside a dialog, and
  // none of them is modified, so none collides with a shell shortcut. A tick is a checkbox and takes Space.
  { context: "Clean", action: "Previous or next track in the review", shortcut: "Up / Down" },
  { context: "Clean", action: "First or last track in the review", shortcut: "Home / End" },
  { context: "Clean", action: "Select every track in the review", shortcut: "Ctrl+A" },
  { context: "Clean", action: "Close the track's side panel", shortcut: "Esc" },
  { context: "Clean", action: "Play the track", shortcut: "Enter" },
  { context: "Clean", action: "Tick or untick the track", shortcut: "Space" },
  { context: "Clean", action: "Next track still to check", shortcut: "N" },
  // The side panel's own keys (M508), answered while focus is in it and not on one of its buttons.
  { context: "Check the match", action: "Pick the previous or next candidate", shortcut: "Left / Right" },
  { context: "Check the match", action: "Pick a candidate by its number", shortcut: "1–9" },
  { context: "Check the match", action: "Use the picked match and go to the next track", shortcut: "Enter" },
  { context: "Check the match", action: "Use the picked match and stay on the track", shortcut: "Shift+Enter" },
  { context: "Check the match", action: "Leave the track out", shortcut: "Backspace" },
  // The player (PLAYER-12). Space is bare because it is the one key everyone
  // already tries; the rest are Ctrl-modified because bare arrows belong to the
  // table and the queue panel, which is where a keyboard user spends their time.
  { context: "Player", action: "Play or pause", shortcut: "Space" },
  { context: "Player", action: "Next track", shortcut: "Ctrl+Right" },
  { context: "Player", action: "Previous track", shortcut: "Ctrl+Left" },
  { context: "Player", action: "Volume up", shortcut: "Ctrl+Up" },
  { context: "Player", action: "Volume down", shortcut: "Ctrl+Down" },
  // The queue panel's list: the arrows move the selection, Enter plays the row.
  { context: "Player", action: "Select the previous or next queued track", shortcut: "Up / Down" },
  { context: "Player", action: "First or last queued track", shortcut: "Home / End" },
  { context: "Player", action: "Play the queued track", shortcut: "Enter" },
  { context: "Player", action: "Open the menu for a queued track", shortcut: "Menu key / Shift+F10" },
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
