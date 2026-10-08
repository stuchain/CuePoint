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
  type MenuPlatform,
  type SizeState,
} from "./appMenu";

const SIZES: SizeState = {
  options: [
    { value: 1, label: "Small (1×)" },
    { value: 1.5, label: "Medium (1.5×) — default" },
    { value: 2, label: "Large (2×)" },
    { value: 3, label: "Extra large (3×)" },
  ],
  current: 1.5,
};

function template(
  platform: MenuPlatform,
  { packaged = true, size = SIZES }: { packaged?: boolean; size?: SizeState } = {},
) {
  const sent: string[] = [];
  const items = buildMenuTemplate({ platform, packaged, size, send: (id) => sent.push(id) });
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

  it("gives macOS its CuePoint menu: About, Settings… (Cmd+,), Quit", () => {
    const { items } = template("darwin");
    const app = submenu(top(items, "CuePoint")).filter((item) => item.type !== "separator");
    expect(app.map(labelOf)).toEqual(["About CuePoint", "Settings…", "hide", "hideOthers", "unhide", "quit"]);
    expect(app[1]!.accelerator).toBe("CmdOrCtrl+,");
  });

  it("puts Settings… in View with Ctrl+, on Windows and Linux, About in Help", () => {
    for (const platform of ["win32", "linux"] as const) {
      const { items } = template(platform);
      const view = submenu(top(items, "View"));
      const settings = view.find((item) => item.label === "Settings…");
      expect(settings?.accelerator).toBe("CmdOrCtrl+,");
      const help = submenu(top(items, "Help"));
      expect(labelOf(help.at(-1)!)).toBe("About CuePoint");
    }
  });

  it("leaves Settings… and About out of View and Help on macOS", () => {
    const { items } = template("darwin");
    expect(submenu(top(items, "View")).some((item) => item.label === "Settings…")).toBe(false);
    expect(submenu(top(items, "Help")).some((item) => item.label === "About CuePoint")).toBe(false);
  });
});

describe("File", () => {
  it("imports another file (Ctrl+O) and checks Rekordbox for changes, and does not export (DEC-087)", () => {
    const { items } = template("linux");
    const file = submenu(top(items, "File")).filter((item) => item.type !== "separator");
    const labels = file.map(labelOf);
    expect(labels.slice(0, 2)).toEqual(["Import another file…", "Check Rekordbox for changes"]);
    expect(file[0]!.accelerator).toBe("CmdOrCtrl+O");
    expect(labels.join("|")).not.toMatch(/export/i);
  });

  it("sends import and check-rekordbox", () => {
    const { items, sent } = template("linux");
    click(byId(items, "import"));
    click(byId(items, "check-rekordbox"));
    expect(sent).toEqual(["import", "check-rekordbox"]);
  });
});

describe("Edit", () => {
  it.each(["darwin", "win32", "linux"] as const)(
    "has undo, redo, cut, copy, paste and select all roles on %s",
    (platform) => {
      const { items } = template(platform);
      const roles = submenu(top(items, "Edit")).map((item) => item.role);
      for (const role of ["undo", "redo", "cut", "copy", "paste", "selectAll"]) {
        expect(roles, role).toContain(role);
      }
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
    expect(radios.map((item) => item.checked)).toEqual([false, true, false, false]);
    expect(radios.map((item) => item.id)).toEqual(["size:1", "size:1.5", "size:2", "size:3"]);
  });

  it("ticks another size when the current one changes, and follows added options", () => {
    const next: SizeState = {
      options: [...SIZES.options, { value: 4, label: "Huge (4×)" }],
      current: 2,
    };
    const { items } = template("linux", { size: next });
    const size = submenu(top(items, "View")).find((item) => item.label === "Size")!;
    const radios = submenu(size);
    expect(radios).toHaveLength(5);
    expect(radios.filter((item) => item.checked).map((item) => item.id)).toEqual(["size:2"]);
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
    expect(bigger.label).toBe("Bigger");
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
    expect(normal.label).toBe("Default size");
    expect(normal.accelerator).toBe("CmdOrCtrl+0");
    click(normal);

    expect(sent).toEqual(["size-bigger", "size-bigger", "size-smaller", "size-default"]);
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

  it("leaves a shortcut the page already answers to the page, on Windows and Linux", () => {
    // The page handles Ctrl+B and Ctrl+I itself; a registered accelerator would toggle twice.
    const { items } = template("linux");
    expect(byId(items, "toggle-sidebar")!.registerAccelerator).toBe(false);
    expect(byId(items, "toggle-inspector")!.registerAccelerator).toBe(false);
  });
});

describe("Help", () => {
  it("lists Getting started, Shortcuts, Report a problem and Privacy, then a Troubleshooting group", () => {
    const { items } = template("linux");
    const help = submenu(top(items, "Help"));
    expect(help.filter((item) => item.type !== "separator").map(labelOf)).toEqual([
      "Getting started",
      "Shortcuts",
      "Report a problem…",
      "Privacy",
      "Troubleshooting",
      "About CuePoint",
    ]);
    const group = help.find((item) => item.label === "Troubleshooting")!;
    expect(submenu(group).map(labelOf)).toEqual([
      "Diagnostics…",
      "Log viewer…",
      "Export support bundle…",
      "How to export from Rekordbox…",
    ]);
  });

  it("sends each Help command's fixed id", () => {
    const { items, sent } = template("linux");
    const ids = [
      "getting-started",
      "shortcuts",
      "report-problem",
      "privacy",
      "diagnostics",
      "log-viewer",
      "support-bundle",
      "rekordbox-help",
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
    expect(developer.map((item) => item.role)).toEqual(["reload", "forceReload", "toggleDevTools"]);
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
      "report-problem",
      "diagnostics",
      "log-viewer",
      "support-bundle",
      "rekordbox-help",
      "about",
      "import",
      "check-rekordbox",
      "toggle-inspector",
      "toggle-sidebar",
      "size-bigger",
      "size-smaller",
      "size-default",
    ]);
  });

  it("are all sent by some item on some platform", () => {
    const sent = new Set<string>();
    for (const platform of ["darwin", "win32", "linux"] as const) {
      for (const item of walk(template(platform).items)) {
        if (item.id) sent.add(item.id);
      }
    }
    for (const id of MENU_COMMAND_IDS) expect(sent.has(id), id).toBe(true);
  });
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
