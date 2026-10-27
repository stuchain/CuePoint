/**
 * CuePoint's one menu bar (FLW-20, DEC-204).
 *
 * The template is a pure function of the platform, whether the build is packaged, and the
 * sizes the renderer reported; what a click does is send one fixed command id.
 */
import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";

import {
  MENU_COMMAND_IDS,
  buildMenuTemplate,
  installAppMenu,
  parseSizeState,
  parseViewState,
  type MenuPlatform,
  type SizeState,
} from "./appMenu";

const SIZES: SizeState = {
  options: [
    { value: 1, label: "Small (1×)" },
    { value: 1.25, label: "Compact (1.25×)" },
    { value: 1.5, label: "Medium (1.5×) — default" },
    { value: 2, label: "Large (2×)" },
    { value: 3, label: "Extra large (3×)" },
  ],
  current: 1.5,
};

function template(
  platform: MenuPlatform,
  {
    packaged = true,
    size = SIZES,
    view = null,
  }: { packaged?: boolean; size?: SizeState; view?: { inspector: boolean; sidebar: boolean } | null } = {},
) {
  const sent: string[] = [];
  const items = buildMenuTemplate({ platform, packaged, size, view, send: (id) => sent.push(id) });
  return { items, sent };
}

const labelOf = (item: MenuItemConstructorOptions) => item.label ?? item.role ?? item.type ?? "";

/** Every item, depth first. */
function walk(items: readonly MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? walk(item.submenu) : []),
  ]);
}

function top(items: readonly MenuItemConstructorOptions[], label: string) {
  const found = items.find((item) => item.label === label);
  if (!found) throw new Error(`no ${label} menu in ${items.map(labelOf).join(", ")}`);
  return found;
}

const submenu = (item: MenuItemConstructorOptions) => (item.submenu ?? []) as MenuItemConstructorOptions[];
const byId = (items: readonly MenuItemConstructorOptions[], id: string) =>
  walk(items).find((item) => item.id === id);

function click(item: MenuItemConstructorOptions | undefined) {
  expect(item, "the item exists").toBeDefined();
  (item!.click as unknown as () => void)();
}

describe("the menus on each platform", () => {
  it("is CuePoint, File, Edit, View, Window, Help on macOS", () => {
    // Window is minimize and close: a Mac app has one, and Cmd+W and Cmd+M are its keys.
    expect(template("darwin").items.map(labelOf)).toEqual([
      "CuePoint",
      "File",
      "Edit",
      "View",
      "Window",
      "Help",
    ]);
  });

  it.each(["win32", "linux"] as const)("is File, Edit, View, Help on %s", (platform) => {
    expect(template(platform).items.map(labelOf)).toEqual(["File", "Edit", "View", "Help"]);
  });

  it("gives macOS its CuePoint menu: About, Settings (Cmd+,), Quit", () => {
    const { items } = template("darwin");
    const app = submenu(top(items, "CuePoint")).filter((item) => item.type !== "separator");
    expect(app.map(labelOf)).toEqual(["About CuePoint", "Settings", "hide", "hideOthers", "unhide", "quit"]);
    expect(app[1]!.accelerator).toBe("CmdOrCtrl+,");
  });

  it("puts Settings in File with Ctrl+, on Windows and Linux, About in Help", () => {
    for (const platform of ["win32", "linux"] as const) {
      const { items } = template(platform);
      const file = submenu(top(items, "File"));
      const settings = file.find((item) => item.label === "Settings");
      expect(settings?.accelerator).toBe("CmdOrCtrl+,");
      expect(submenu(top(items, "View")).some((item) => item.label === "Settings")).toBe(false);
      // Settings sits between the file commands and Quit, with a divider on each side.
      expect(file.map((item) => item.label ?? item.role ?? item.type).slice(-4)).toEqual([
        "separator",
        "Settings",
        "separator",
        "quit",
      ]);
      const help = submenu(top(items, "Help"));
      expect(labelOf(help.at(-1)!)).toBe("About CuePoint");
    }
  });

  it("leaves Settings and About out of View and Help on macOS", () => {
    const { items } = template("darwin");
    expect(submenu(top(items, "File")).some((item) => item.label === "Settings")).toBe(false);
    expect(submenu(top(items, "Help")).some((item) => item.label === "About CuePoint")).toBe(false);
  });
});

describe("File", () => {
  it("imports another file (Ctrl+O), checks for changes (F5) and exports to Rekordbox (M497)", () => {
    const { items } = template("linux");
    const file = submenu(top(items, "File")).filter((item) => item.type !== "separator");
    const labels = file.map(labelOf);
    expect(labels.slice(0, 3)).toEqual([
      "Import a Rekordbox file…",
      "Check for changes",
      "Export to Rekordbox…",
    ]);
    expect(file[0]!.accelerator).toBe("CmdOrCtrl+O");
    expect(file[1]!.accelerator).toBe("F5");
  });

  it("lets the menu answer F5: the page has no handler for it, so the accelerator is registered", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      expect(byId(template(platform).items, "check-rekordbox")!.registerAccelerator).not.toBe(false);
    }
  });

  it("sends import, check-rekordbox and export-rekordbox", () => {
    const { items, sent } = template("linux");
    click(byId(items, "import"));
    click(byId(items, "check-rekordbox"));
    click(byId(items, "export-rekordbox"));
    expect(sent).toEqual(["import", "check-rekordbox", "export-rekordbox"]);
  });
});

describe("Edit", () => {
  it.each(["darwin", "win32", "linux"] as const)(
    "has redo, cut, copy, paste and select all roles on %s",
    (platform) => {
      const { items } = template(platform);
      const roles = submenu(top(items, "Edit")).map((item) => item.role);
      for (const role of ["redo", "cut", "copy", "paste", "selectAll"]) {
        expect(roles, role).toContain(role);
      }
    },
  );

  it.each(["darwin", "win32", "linux"] as const)(
    "has CuePoint's own Undo on Ctrl+Z, first, on %s (M456)",
    (platform) => {
      const { items, sent } = template(platform);
      const edit = submenu(top(items, "Edit"));
      const undo = edit[0]!;
      expect(undo.id).toBe("undo");
      expect(undo.label).toBe("Undo");
      expect(undo.accelerator).toBe("CmdOrCtrl+Z");
      // The menu takes the key and the page decides what it undoes: a text edit or the newest change.
      expect(undo.registerAccelerator).not.toBe(false);
      expect(undo.role).toBeUndefined();
      click(undo);
      expect(sent).toEqual(["undo"]);
    },
  );
});

describe("View: size, panels, Settings", () => {
  it("lists the renderer's sizes as radio items with the current one ticked", () => {
    const { items } = template("linux");
    const size = submenu(top(items, "View")).find((item) => item.label === "Size")!;
    const radios = submenu(size);
    expect(radios.map(labelOf)).toEqual(SIZES.options.map((option) => option.label));
    expect(radios.every((item) => item.type === "radio")).toBe(true);
    expect(radios.map((item) => item.checked)).toEqual([false, false, true, false, false]);
    expect(radios.map((item) => item.id)).toEqual(["size:1", "size:1.25", "size:1.5", "size:2", "size:3"]);
  });

  it("ticks another size when the current one changes, and follows added options", () => {
    const next: SizeState = {
      options: [...SIZES.options, { value: 4, label: "Huge (4×)" }],
      current: 2,
    };
    const { items } = template("linux", { size: next });
    const size = submenu(top(items, "View")).find((item) => item.label === "Size")!;
    const radios = submenu(size);
    expect(radios).toHaveLength(6);
    expect(radios.filter((item) => item.checked).map((item) => item.id)).toEqual(["size:2"]);
  });

  it("greys a size that is too big for the screen, and leaves the others enabled", () => {
    const size: SizeState = {
      options: [
        { value: 1, label: "Small (1×)" },
        { value: 2, label: "Large (2×)", disabled: true },
      ],
      current: 1,
    };
    const { items } = template("linux", { size });
    const radios = submenu(submenu(top(items, "View")).find((item) => item.label === "Size")!);
    expect(radios.map((item) => item.enabled)).toEqual([true, false]);
  });

  it("parses a disabled flag, and drops anything but true", () => {
    expect(
      parseSizeState({
        current: 1,
        options: [
          { value: 1, label: "a", disabled: false },
          { value: 2, label: "b", disabled: true },
          { value: 3, label: "c", disabled: "yes" },
        ],
      }),
    ).toEqual({
      current: 1,
      options: [
        { value: 1, label: "a" },
        { value: 2, label: "b", disabled: true },
        { value: 3, label: "c" },
      ],
    });
  });

  it("sends size:<value> for a picked size", () => {
    const { items, sent } = template("linux");
    click(byId(items, "size:2"));
    expect(sent).toEqual(["size:2"]);
  });

  it("has an empty, disabled Size until the renderer has reported its sizes", () => {
    const { items } = template("linux", { size: { options: [], current: 1.5 } });
    const size = submenu(top(items, "View")).find((item) => item.label === "Size")!;
    expect(size.enabled).toBe(false);
  });

  it("steps the size with Ctrl+= (also Ctrl+Plus), Ctrl+- and Ctrl+0", () => {
    const { items, sent } = template("linux");
    const bigger = byId(items, "size-bigger")!;
    expect(bigger.label).toBe("Larger text");
    expect(bigger.accelerator).toBe("CmdOrCtrl+=");
    click(bigger);
    const plus = walk(items).filter(
      (item) => item.accelerator === "CmdOrCtrl+Plus" && item.visible === false,
    );
    expect(plus).toHaveLength(1);
    expect(plus[0]!.acceleratorWorksWhenHidden).not.toBe(false);
    click(plus[0]);

    const smaller = byId(items, "size-smaller")!;
    expect(smaller.accelerator).toBe("CmdOrCtrl+-");
    click(smaller);
    const normal = byId(items, "size-default")!;
    expect(normal.label).toBe("Default text size");
    expect(normal.accelerator).toBe("CmdOrCtrl+0");
    click(normal);

    expect(sent).toEqual(["size-bigger", "size-bigger", "size-smaller", "size-default"]);
  });

  it("has no check mark on the panels until the page says what is open", () => {
    const { items } = template("linux");
    expect(byId(items, "toggle-sidebar")!.type).toBeUndefined();
    expect(byId(items, "toggle-inspector")!.type).toBeUndefined();
  });

  it("ticks Track details and Sidebar as check items by what is open (M497)", () => {
    const open = template("linux", { view: { inspector: true, sidebar: false } }).items;
    expect(byId(open, "toggle-inspector")).toMatchObject({ type: "checkbox", checked: true });
    expect(byId(open, "toggle-sidebar")).toMatchObject({ type: "checkbox", checked: false });
    const other = template("linux", { view: { inspector: false, sidebar: true } }).items;
    expect(byId(other, "toggle-inspector")).toMatchObject({ type: "checkbox", checked: false });
    expect(byId(other, "toggle-sidebar")).toMatchObject({ type: "checkbox", checked: true });
  });

  it("still sends the toggle ids as check items", () => {
    const { items, sent } = template("linux", { view: { inspector: true, sidebar: true } });
    click(byId(items, "toggle-inspector"));
    click(byId(items, "toggle-sidebar"));
    expect(sent).toEqual(["toggle-inspector", "toggle-sidebar"]);
  });

  it("toggles Track details and the sidebar (Ctrl+B)", () => {
    const { items, sent } = template("linux");
    const sidebar = byId(items, "toggle-sidebar")!;
    expect(sidebar.label).toBe("Sidebar");
    expect(sidebar.accelerator).toBe("CmdOrCtrl+B");
    const details = byId(items, "toggle-inspector")!;
    expect(details.label).toBe("Track details");
    click(details);
    click(sidebar);
    expect(sent).toEqual(["toggle-inspector", "toggle-sidebar"]);
  });

  it("opens Search and Activity from the View menu, with the keys the page answers to", () => {
    const { items, sent } = template("linux");
    const search = byId(items, "search-library")!;
    expect(search.label).toBe("Search library…");
    expect(search.accelerator).toBe("CmdOrCtrl+K");
    expect(search.registerAccelerator).toBe(false);
    const activity = byId(items, "activity")!;
    expect(activity.label).toBe("Activity…");
    expect(activity.accelerator).toBe("CmdOrCtrl+Shift+A");
    expect(activity.registerAccelerator).toBe(false);
    click(search);
    click(activity);
    expect(sent).toEqual(["search-library", "activity"]);
  });

  it("leaves a shortcut the page already answers to the page, on Windows and Linux", () => {
    // The page handles Ctrl+B and Ctrl+I itself; a registered accelerator would toggle twice.
    const { items } = template("linux");
    expect(byId(items, "toggle-sidebar")!.registerAccelerator).toBe(false);
    expect(byId(items, "toggle-inspector")!.registerAccelerator).toBe(false);
  });
});

describe("Help", () => {
  it("lists Getting started, Keyboard shortcuts, Get help, the Rekordbox file and Privacy, with no Troubleshooting", () => {
    const { items } = template("linux");
    const help = submenu(top(items, "Help"));
    expect(help.filter((item) => item.type !== "separator").map(labelOf)).toEqual([
      "Getting started",
      "Keyboard shortcuts…",
      "Get help…",
      "How to get your Rekordbox file…",
      "Privacy…",
      "About CuePoint",
    ]);
    expect(walk(items).some((item) => /troubleshooting/i.test(item.label ?? ""))).toBe(false);
  });

  it("shows F1 beside Keyboard shortcuts, and leaves the key to the page (it opens the list itself)", () => {
    const { items } = template("linux");
    const shortcuts = byId(items, "shortcuts")!;
    expect(shortcuts.accelerator).toBe("F1");
    expect(shortcuts.registerAccelerator).toBe(false);
  });

  it("asks for \"…\" only where input comes first (M404): no dots on Settings, Getting started, Diagnostics, Log viewer", () => {
    const labels = walk(template("linux", { packaged: false }).items).map(labelOf);
    for (const label of ["Settings", "Getting started", "Diagnostics", "Log viewer"]) {
      expect(labels, label).toContain(label);
      expect(labels, `${label}…`).not.toContain(`${label}…`);
    }
  });

  it("sends each Help command's fixed id", () => {
    const { items, sent } = template("linux");
    const ids = [
      "getting-started",
      "shortcuts",
      "get-help",
      "rekordbox-help",
      "privacy",
      "about",
    ];
    for (const id of ids) click(byId(items, id));
    expect(sent).toEqual(ids);
  });
});

describe("builds: packaged, and development", () => {
  const FORBIDDEN = ["reload", "forceReload", "toggleDevTools", "zoomIn", "zoomOut", "resetZoom", "zoom"];

  it.each(["darwin", "win32", "linux"] as const)(
    "has no Reload, Developer Tools or Zoom in a packaged build on %s",
    (platform) => {
      const { items } = template(platform, { packaged: true });
      const all = walk(items);
      expect(all.map((item) => item.role).filter((role) => FORBIDDEN.includes(role ?? ""))).toEqual([]);
      const words = all.map((item) => (item.label ?? "").toLowerCase());
      for (const word of ["reload", "developer", "devtools", "zoom"]) {
        expect(words.some((label) => label.includes(word)), word).toBe(false);
      }
      expect(items.some((item) => item.label === "Developer")).toBe(false);
    },
  );

  it("adds a Developer menu with reload and the tools in a development build", () => {
    const { items } = template("linux", { packaged: false });
    const developer = submenu(top(items, "Developer"));
    expect(developer.slice(0, 3).map((item) => item.role)).toEqual(["reload", "forceReload", "toggleDevTools"]);
  });

  it("adds Diagnostics and Log viewer to Developer after a separator, and only when unpackaged", () => {
    const dev = template("linux", { packaged: false });
    const items = submenu(top(dev.items, "Developer"));
    expect(items.slice(3).map(labelOf)).toEqual(["separator", "Diagnostics", "Log viewer"]);
    const packaged = walk(template("linux", { packaged: true }).items);
    expect(packaged.some((item) => item.id === "diagnostics" || item.id === "log-viewer")).toBe(false);
    click(byId(dev.items, "diagnostics"));
    click(byId(dev.items, "log-viewer"));
    expect(dev.sent).toEqual(["diagnostics", "log-viewer"]);
  });

  it("still has no zoom role in development: Ctrl+= is the Size setting's", () => {
    const { items } = template("linux", { packaged: false });
    const roles = walk(items).map((item) => item.role ?? "");
    expect(roles.filter((role) => /zoom/i.test(role))).toEqual([]);
  });
});

describe("the command ids", () => {
  it("are the fixed set the renderer answers to", () => {
    expect([...MENU_COMMAND_IDS]).toEqual([
      "settings",
      "getting-started",
      "shortcuts",
      "privacy",
      "get-help",
      "diagnostics",
      "log-viewer",
      "rekordbox-help",
      "about",
      "import",
      "check-rekordbox",
      "export-rekordbox",
      "undo",
      "toggle-inspector",
      "toggle-sidebar",
      "search-library",
      "activity",
      "size-bigger",
      "size-smaller",
      "size-default",
    ]);
  });

  it("are all sent by some item on some platform", () => {
    const sent = new Set<string>();
    for (const platform of ["darwin", "win32", "linux"] as const) {
      // Diagnostics and Log viewer are in the Developer menu, which only a development build has.
      for (const item of walk(template(platform, { packaged: false }).items)) {
        if (item.id) sent.add(item.id);
      }
    }
    // Every id has an item; the two the old items sent are gone with them (M497).
    for (const id of MENU_COMMAND_IDS) expect(sent.has(id), id).toBe(true);
    expect(sent.has("report-problem")).toBe(false);
    expect(sent.has("support-bundle")).toBe(false);
  });
});

describe("parseViewState", () => {
  it("takes two booleans", () => {
    expect(parseViewState({ inspector: true, sidebar: false })).toEqual({ inspector: true, sidebar: false });
  });

  it.each([null, undefined, 1, "x", {}, { inspector: true }, { inspector: "yes", sidebar: true }])(
    "refuses %j",
    (value) => {
      expect(parseViewState(value)).toBeNull();
    },
  );
});

describe("parseSizeState", () => {
  it("accepts what the renderer sends", () => {
    expect(parseSizeState(SIZES)).toEqual(SIZES);
  });

  it.each([
    ["nothing", undefined],
    ["a number", 1.5],
    ["no options", { current: 1 }],
    ["text options", { options: ["1"], current: 1 }],
    ["an option without a label", { options: [{ value: 1 }], current: 1 }],
    ["a non-finite current", { options: [], current: "big" }],
  ])("refuses %s", (_what, value) => {
    expect(parseSizeState(value)).toBeNull();
  });

  it("drops an option that is not a finite number or has no words, and caps the list", () => {
    const parsed = parseSizeState({
      options: [
        { value: 1, label: "Small" },
        { value: Number.NaN, label: "Bad" },
        { value: 2, label: "" },
        ...Array.from({ length: 40 }, (_unused, i) => ({ value: 10 + i, label: `S${i}` })),
      ],
      current: 1,
    });
    expect(parsed!.options[0]).toEqual({ value: 1, label: "Small" });
    expect(parsed!.options.length).toBeLessThanOrEqual(12);
    expect(parsed!.options.some((option) => option.label === "Bad")).toBe(false);
  });
});

describe("installAppMenu", () => {
  function fakes() {
    const built: MenuItemConstructorOptions[][] = [];
    const Menu = {
      buildFromTemplate: vi.fn((tpl: MenuItemConstructorOptions[]) => {
        built.push(tpl);
        return { tpl };
      }),
      setApplicationMenu: vi.fn(),
    };
    const webContents = { send: vi.fn(), isDestroyed: () => false };
    const win = { webContents, isDestroyed: () => false };
    return { built, Menu, webContents, getWindow: () => win as never };
  }

  it("installs the menu at once, with no sizes yet", () => {
    const { Menu } = fakes();
    installAppMenu({ Menu: Menu as never, getWindow: () => null, platform: "linux", packaged: true });
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
  });

  it("rebuilds with the reported sizes and ticks the current one", () => {
    const { Menu, built } = fakes();
    const menu = installAppMenu({ Menu: Menu as never, getWindow: () => null, platform: "linux", packaged: true });

    menu.setSizeState(SIZES);

    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(2);
    const view = built.at(-1)!.find((item) => item.label === "View")!;
    const size = (view.submenu as MenuItemConstructorOptions[]).find((item) => item.label === "Size")!;
    const ticked = (size.submenu as MenuItemConstructorOptions[]).filter((item) => item.checked);
    expect(ticked.map((item) => item.id)).toEqual(["size:1.5"]);
  });

  it("rebuilds with the panels' state, once for each change", () => {
    const { Menu, built } = fakes();
    const menu = installAppMenu({ Menu: Menu as never, getWindow: () => null, platform: "linux", packaged: true });
    menu.setViewState({ inspector: true, sidebar: true });
    menu.setViewState({ inspector: true, sidebar: true });
    menu.setViewState({ inspector: "no" });
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(2);
    menu.setViewState({ inspector: false, sidebar: true });
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(3);
    const view = built.at(-1)!.find((item) => item.label === "View")!;
    const inspector = (view.submenu as MenuItemConstructorOptions[]).find((item) => item.id === "toggle-inspector")!;
    expect(inspector).toMatchObject({ type: "checkbox", checked: false });
  });

  it("ignores a size state it cannot read, and one that has not changed", () => {
    const { Menu } = fakes();
    const menu = installAppMenu({ Menu: Menu as never, getWindow: () => null, platform: "linux", packaged: true });
    menu.setSizeState({ nonsense: true });
    menu.setSizeState(SIZES);
    menu.setSizeState({ ...SIZES, options: [...SIZES.options] });
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(2);
  });

  it("sends a clicked item to the window as menu:command", () => {
    const { Menu, built, webContents, getWindow } = fakes();
    installAppMenu({ Menu: Menu as never, getWindow, platform: "linux", packaged: true });
    const file = built[0]!.find((item) => item.label === "File")!;
    const importItem = (file.submenu as MenuItemConstructorOptions[]).find((item) => item.id === "import")!;
    (importItem.click as unknown as () => void)();
    expect(webContents.send).toHaveBeenCalledWith("menu:command", "import");
  });

  it("does nothing when a click finds no window", () => {
    const { Menu, built } = fakes();
    installAppMenu({ Menu: Menu as never, getWindow: () => null, platform: "darwin", packaged: true });
    const app = built[0]!.find((item) => item.label === "CuePoint")!;
    const settings = (app.submenu as MenuItemConstructorOptions[]).find((item) => item.id === "settings")!;
    expect(() => (settings.click as unknown as () => void)()).not.toThrow();
  });
});

describe("the glossary (docs/user-guide/glossary.md)", () => {
  // The same never-forms as the renderer's words guard (renderer/src/userWords.test.ts).
  const NEVER =
    /\btokens?\b|\b(revert|reverted|reverting|put back)\b|\bgo back to\b|\brestor(e|ed|es|ing)\b|\baccepted\b|rekordbox export|xml export|your export|this export|rekordbox collection|library service|\bengine\b|import another file|\bwrit(e|ing) tags\b|save changes into the files|check rekordbox for changes|\bno value\b/i;

  it.each(["darwin", "win32", "linux"] as const)("uses no never-form in a %s menu label", (platform) => {
    const { items } = template(platform, { packaged: true });
    const labels = walk(items)
      .map((item) => item.label)
      .filter((label): label is string => typeof label === "string");
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.filter((label) => NEVER.test(label))).toEqual([]);
  });

  it("names the Rekordbox file in the File and Help menus", () => {
    const { items } = template("linux");
    const labels = walk(items).map(labelOf);
    expect(labels).toContain("Import a Rekordbox file…");
    expect(labels).toContain("How to get your Rekordbox file…");
  });
});
