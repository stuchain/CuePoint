import { describe, expect, it } from "vitest";
import { filterShortcuts, KEYBOARD_SHORTCUTS } from "./keyboardShortcuts";
import { REVIEW_KEYS } from "../screens/clean/reviewKeyboard";
import appSource from "../App.tsx?raw";
import globalSearchSource from "../components/shell/GlobalSearch.tsx?raw";
import inspectorSource from "../components/shell/TrackInspector.tsx?raw";
import sidebarSource from "../components/shell/Sidebar.tsx?raw";
import statusStripSource from "../components/shell/StatusStrip.tsx?raw";
import playerShortcutsSource from "../components/player/usePlayerShortcuts.ts?raw";
import queuePanelSource from "../components/player/QueuePanel.tsx?raw";
import libraryScreenSource from "../screens/library/LibraryScreen.tsx?raw";
import trackTableSource from "../components/table/TrackTable.tsx?raw";
import collectionsPaneSource from "../screens/library/CollectionsPane.tsx?raw";
import prepareLayoutSource from "../screens/prepare/PrepareLayout.tsx?raw";
import entryZoneSource from "../screens/prepare/SetEntryZone.tsx?raw";
import prepareScreenSource from "../screens/prepare/PrepareScreen.tsx?raw";
import timeCellSource from "../screens/prepare/prepareEditing.tsx?raw";
import appMenuSource from "../../../electron/appMenu.ts?raw";

describe("keyboardShortcuts", () => {
  it("filters by action name", () => {
    const rows = filterShortcuts(KEYBOARD_SHORTCUTS, "search");
    expect(rows.some((r) => r.action.includes("Search library"))).toBe(true);
    expect(rows.length).toBeLessThan(KEYBOARD_SHORTCUTS.length);
  });

  it("returns all when query empty", () => {
    expect(filterShortcuts(KEYBOARD_SHORTCUTS, "")).toHaveLength(KEYBOARD_SHORTCUTS.length);
  });
});

describe("the Library's shortcuts (LIBUI-10)", () => {
  it("documents the keys the page binds", () => {
    const library = KEYBOARD_SHORTCUTS.filter((row) => row.context === "Library");

    expect(library.map((row) => row.shortcut).sort()).toEqual(
      ["Alt+Up / Alt+Down", "Ctrl+A", "Ctrl+F", "Delete", "Enter", "Esc", "F2", "Shift+F10"].sort(),
    );
  });

  it("says what each one does, in the words LIB-12 chose", () => {
    const action = (shortcut: string) =>
      KEYBOARD_SHORTCUTS.find((row) => row.context === "Library" && row.shortcut === shortcut)
        ?.action;

    expect(action("Enter")).toBe("Play the selected track");
    expect(action("Esc")).toBe("Clear the selection");
    expect(action("Shift+F10")).toBe("Open the track menu");
    expect(action("F2")).toBe("Rename the selected Collection");
    expect(action("Delete")).toBe("Delete the selected Collection");
  });

  it("lists Ctrl+F once: the Results screen it was shared with is gone", () => {
    const focus = KEYBOARD_SHORTCUTS.filter((row) => row.shortcut === "Ctrl+F");

    expect(focus.map((row) => row.context)).toEqual(["Library"]);
  });
});

describe("the review queue's shortcuts (CLEAN-12)", () => {
  it("documents every key the queue binds, as the queue names them", () => {
    const clean = KEYBOARD_SHORTCUTS.filter((row) => row.context === "Clean");
    const keys = Object.values(REVIEW_KEYS);

    // Each command's key appears in the dialog: arrows as a pair, letters alone.
    for (const key of keys) {
      expect(clean.some((row) => row.shortcut.split(" / ").includes(key)), key).toBe(true);
    }
    expect(clean).toHaveLength(5);
  });

  it("binds no modified key, so none can collide with a shell shortcut", () => {
    const clean = KEYBOARD_SHORTCUTS.filter((row) => row.context === "Clean");
    for (const row of clean) {
      expect(row.shortcut).not.toMatch(/Ctrl|Alt|Shift|Cmd/);
    }
  });
});

describe("only shortcuts that work (PAGES-03B)", () => {
  const rows = (context: string) => KEYBOARD_SHORTCUTS.filter((row) => row.context === context);
  const shortcuts = KEYBOARD_SHORTCUTS.map((row) => row.shortcut);

  it("no longer lists keys nothing answers to", () => {
    // The Qt app's, from before the Electron shell: Match and Results are gone, there is
    // no History panel, and nothing exports on Ctrl+E.
    for (const gone of ["Ctrl+E", "F5", "Ctrl+R", "Ctrl+H", "Ctrl+Shift+F"]) {
      expect(shortcuts, gone).not.toContain(gone);
    }
    const contexts = new Set(KEYBOARD_SHORTCUTS.map((row) => row.context));
    for (const gone of ["Match", "Results", "History"]) expect(contexts.has(gone), gone).toBe(false);
  });

  it("lists the menu's: Open, Settings and the three size keys", () => {
    for (const key of ["Ctrl+O", "Ctrl+,", "Ctrl+=", "Ctrl+-", "Ctrl+0"]) {
      expect(shortcuts, key).toContain(key);
    }
    expect(KEYBOARD_SHORTCUTS.find((row) => row.shortcut === "Ctrl+0")?.action).toMatch(/default size/i);
    expect(KEYBOARD_SHORTCUTS.find((row) => row.shortcut === "Ctrl+O")?.action).toMatch(/import/i);
  });

  it("lists Prepare's", () => {
    expect(rows("Prepare").length).toBeGreaterThanOrEqual(2);
    expect(rows("Prepare").map((row) => row.shortcut).join("|")).toMatch(/Left/);
    expect(rows("Prepare").map((row) => row.shortcut).join("|")).toMatch(/Enter/);
  });

  it("lists no action twice in one context", () => {
    const seen = new Set<string>();
    for (const row of KEYBOARD_SHORTCUTS) {
      const key = `${row.context}|${row.action}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("spells American, and never says engine or job", () => {
    for (const row of KEYBOARD_SHORTCUTS) {
      expect(`${row.action} ${row.context}`).not.toMatch(/\b(engine|jobs?)\b|colour|behaviour|analyse/i);
    }
  });

  // Each shortcut is read against the code that answers it. A row whose handler is renamed
  // or removed fails here instead of staying in the dialog as a promise.
  const handlers: Array<[shortcut: string, context: string, source: string, pattern: RegExp]> = [
    ["Ctrl+K", "Global", globalSearchSource, /key\.toLowerCase\(\) === "k"/],
    ["Ctrl+I", "Global", inspectorSource, /key\.toLowerCase\(\) === "i"/],
    ["Ctrl+B", "Global", sidebarSource, /key\.toLowerCase\(\) === "b"/],
    ["Ctrl+Shift+A", "Global", statusStripSource, /shiftKey && event\.key\.toLowerCase\(\) === "a"/],
    ["Ctrl+?", "Global", appSource, /key === "\?"/],
    ["F1", "Global", appSource, /key === "F1"/],
    ["Esc", "Global", globalSearchSource, /key === "Escape"/],
    ["Ctrl+F", "Library", libraryScreenSource, /key\.toLowerCase\(\) === "f"/],
    ["Ctrl+A", "Library", libraryScreenSource, /key\.toLowerCase\(\) === "a"/],
    ["Enter", "Library", trackTableSource, /key === "Enter" && onRowActivate/],
    ["Esc", "Library", libraryScreenSource, /key === "Escape" && !typing\) selection\.clear/],
    ["Shift+F10", "Library", trackTableSource, /shiftKey && event\.key === "F10"/],
    ["Alt+Up / Alt+Down", "Library", trackTableSource, /event\.altKey &&\s+onRowMove/],
    ["F2", "Library", collectionsPaneSource, /key === "F2"/],
    ["Delete", "Library", collectionsPaneSource, /key === "Delete"/],
    ["Space", "Player", playerShortcutsSource, /event\.key === " "/],
    ["Ctrl+Right", "Player", playerShortcutsSource, /case "ArrowRight"/],
    ["Ctrl+Left", "Player", playerShortcutsSource, /case "ArrowLeft"/],
    ["Ctrl+Up", "Player", playerShortcutsSource, /case "ArrowUp"/],
    ["Ctrl+Down", "Player", playerShortcutsSource, /case "ArrowDown"/],
    ["Alt+Up / Alt+Down", "Player", queuePanelSource, /altKey && event\.key === "ArrowUp"/],
    ["Delete", "Player", queuePanelSource, /key === "Delete"/],
  ];

  it.each(handlers)("%s (%s) has a handler", (shortcut, context, source, pattern) => {
    expect(KEYBOARD_SHORTCUTS.some((row) => row.shortcut === shortcut && row.context === context)).toBe(true);
    expect(source).toMatch(pattern);
  });

  it("answers Prepare's keys in Prepare's code", () => {
    expect(prepareLayoutSource).toMatch(/key !== "ArrowLeft" && event\.key !== "ArrowRight"/);
    expect(entryZoneSource).toMatch(/key === "Enter"/);
    // FLW-17, FLW-18: the table's own keys, and the cell's.
    expect(prepareScreenSource).toMatch(/event\.altKey[\s\S]*"ArrowUp"[\s\S]*"ArrowDown"/);
    expect(prepareScreenSource).toMatch(/"Delete"/);
    expect(prepareScreenSource).toMatch(/"Enter" \|\| event\.key === "F2"/);
    expect(timeCellSource).toMatch(/event\.key === "Tab"/);
    expect(timeCellSource).toMatch(/event\.key === "Escape"/);
  });

  it("lists Prepare's entry keys and the cell's (FLW-17, FLW-18)", () => {
    const prepare = rows("Prepare");
    const keyOf = (action: RegExp) => prepare.find((row) => action.test(row.action))?.shortcut;
    expect(keyOf(/Move the selected entries/)).toBe("Alt+Up / Alt+Down");
    expect(keyOf(/Remove the selected entries/)).toBe("Delete");
    expect(keyOf(/Type the selected entry's Mix in/)).toBe("Enter or F2");
    expect(keyOf(/Save a typed time and go to the next/)).toBe("Enter or Tab");
    expect(keyOf(/Drop a typed time/)).toBe("Esc");
  });

  it("gets the menu's keys from the menu, each with the accelerator it lists", () => {
    const accelerators: Record<string, string> = {
      "Ctrl+O": "CmdOrCtrl+O",
      "Ctrl+,": "CmdOrCtrl+,",
      "Ctrl+=": "CmdOrCtrl+=",
      "Ctrl+-": "CmdOrCtrl+-",
      "Ctrl+0": "CmdOrCtrl+0",
    };
    for (const [shown, accelerator] of Object.entries(accelerators)) {
      expect(appMenuSource, shown).toContain(`"${accelerator}"`);
    }
  });
});
