export interface KeyboardShortcutEntry {
  context: string;
  action: string;
  shortcut: string;
}

/** Parity with Qt `ShortcutManager.DEFAULT_SHORTCUTS` (display reference). */
export const KEYBOARD_SHORTCUTS: KeyboardShortcutEntry[] = [
  { context: "Global", action: "Open XML file", shortcut: "Ctrl+O" },
  { context: "Global", action: "Export results", shortcut: "Ctrl+E" },
  { context: "Global", action: "Show keyboard shortcuts", shortcut: "Ctrl+?" },
  { context: "Global", action: "Show help", shortcut: "F1" },
  { context: "Global", action: "Cancel operation", shortcut: "Esc" },
  { context: "Match", action: "Start processing", shortcut: "F5" },
  { context: "Match", action: "Restart processing", shortcut: "Ctrl+R" },
  { context: "Results", action: "Focus search", shortcut: "Ctrl+F" },
  { context: "Results", action: "Clear filters", shortcut: "Ctrl+Shift+F" },
  { context: "Results", action: "View candidates", shortcut: "Enter" },
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
