export interface KeyboardShortcutEntry {
  context: string;
  action: string;
  shortcut: string;
}

/** Parity with Qt `ShortcutManager.DEFAULT_SHORTCUTS` (display reference). */
export const KEYBOARD_SHORTCUTS: KeyboardShortcutEntry[] = [
  { context: "Global", action: "Open XML file", shortcut: "Ctrl+O" },
  { context: "Global", action: "Export results", shortcut: "Ctrl+E" },
  { context: "Global", action: "Search library", shortcut: "Ctrl+K" },
  { context: "Global", action: "Show or hide track inspector", shortcut: "Ctrl+I" },
  { context: "Global", action: "Collapse or expand navigation", shortcut: "Ctrl+B" },
  { context: "Global", action: "Open activity", shortcut: "Ctrl+Shift+A" },
  { context: "Global", action: "Show keyboard shortcuts", shortcut: "Ctrl+?" },
  { context: "Global", action: "Show help", shortcut: "F1" },
  { context: "Global", action: "Cancel operation", shortcut: "Esc" },
  { context: "Match", action: "Start processing", shortcut: "F5" },
  { context: "Match", action: "Restart processing", shortcut: "Ctrl+R" },
  { context: "Results", action: "Focus search", shortcut: "Ctrl+F" },
  { context: "Results", action: "Clear filters", shortcut: "Ctrl+Shift+F" },
  { context: "Results", action: "View candidates", shortcut: "Enter" },
  // The Library became a browser in Phase 4 (DEC-039), so it has a context of
  // its own. Ctrl+F is deliberately the same key as on Results: it is the same
  // gesture — put the cursor where the narrowing happens.
  { context: "Library", action: "Focus search", shortcut: "Ctrl+F" },
  { context: "Library", action: "Select all matching tracks", shortcut: "Ctrl+A" },
  // Escape is not listed again here: "Cancel operation" above is what it
  // means everywhere, and clearing a selection is backing out of one. Two rows
  // would be two meanings for one key, which is the thing SHELL-10 forbids.
  { context: "History", action: "Toggle history", shortcut: "Ctrl+H" },
  { context: "Settings", action: "Open settings", shortcut: "Ctrl+," },
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
