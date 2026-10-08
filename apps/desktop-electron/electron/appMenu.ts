import type { BrowserWindow, Menu, MenuItemConstructorOptions } from "electron";

/**
 * CuePoint's one menu bar (FLW-20, DEC-204).
 *
 * It replaces both Electron's default menu and the in-window bar the renderer used to
 * draw. The template is a pure function of the platform, whether the build is packaged,
 * and the sizes the renderer reported; what a click does is send one fixed command id to
 * the window (`menu:command`), which the renderer answers (`api/menuCommands.ts`).
 *
 * The size lives in the renderer's storage, so the menu and Settings → Appearance agree
 * through two narrow calls: the renderer sends its options and the current one whenever
 * it changes (`menu:setSizeState`), and the menu asks it to set one (`size:<value>`).
 * Ctrl+=, Ctrl+- and Ctrl+0 are those items' accelerators, so they step that setting and
 * never zoom: no zoom role is in any template, packaged or not.
 */

export type MenuPlatform = "darwin" | "win32" | "linux";

/** The ids the menu sends besides `size:<value>`; the renderer's `menuCommands.ts` lists the same. */
export const MENU_COMMAND_IDS = [
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
] as const;

export interface SizeOption {
  value: number;
  label: string;
}

export interface SizeState {
  options: readonly SizeOption[];
  current: number;
}

/** More than the app will ever offer; a bound on what the page can make main build. */
const MAX_SIZE_OPTIONS = 12;
const MAX_LABEL_LENGTH = 60;

/**
 * The renderer's size state, or null when it is not one. The page is not trusted to be
 * well formed: a bad option is dropped and the list is bounded.
 */
export function parseSizeState(value: unknown): SizeState | null {
  if (!value || typeof value !== "object") return null;
  const { options, current } = value as { options?: unknown; current?: unknown };
  if (!Array.isArray(options) || typeof current !== "number" || !Number.isFinite(current)) {
    return null;
  }
  const kept: SizeOption[] = [];
  for (const option of options) {
    if (kept.length >= MAX_SIZE_OPTIONS) break;
    if (!option || typeof option !== "object") continue;
    const { value: size, label } = option as { value?: unknown; label?: unknown };
    if (typeof size !== "number" || !Number.isFinite(size)) continue;
    if (typeof label !== "string" || label.trim() === "") continue;
    kept.push({ value: size, label: label.slice(0, MAX_LABEL_LENGTH) });
  }
  if (kept.length === 0 && options.length > 0) return null;
  return { options: kept, current };
}

interface MenuInput {
  platform: MenuPlatform;
  packaged: boolean;
  size: SizeState;
  /** Called with the command id when an item is clicked. */
  send: (id: string) => void;
}

const NO_SIZES: SizeState = { options: [], current: 0 };

export function buildMenuTemplate({
  platform,
  packaged,
  size,
  send,
}: MenuInput): MenuItemConstructorOptions[] {
  const mac = platform === "darwin";

  /** An item that sends its own id. */
  const command = (
    id: string,
    label: string,
    extra: Partial<MenuItemConstructorOptions> = {},
  ): MenuItemConstructorOptions => ({ id, label, click: () => send(id), ...extra });

  const settings = command("settings", "Settings…", { accelerator: "CmdOrCtrl+," });
  const about = command("about", "About CuePoint");

  const sizeItems: MenuItemConstructorOptions[] = size.options.map((option) => ({
    id: `size:${option.value}`,
    label: option.label,
    type: "radio" as const,
    checked: option.value === size.current,
    click: () => send(`size:${option.value}`),
  }));

  const template: MenuItemConstructorOptions[] = [];

  if (mac) {
    template.push({
      label: "CuePoint",
      submenu: [
        about,
        settings,
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push({
    label: "File",
    submenu: [
      command("import", "Import another file…", { accelerator: "CmdOrCtrl+O" }),
      command("check-rekordbox", "Check Rekordbox for changes"),
      ...(mac ? [] : ([{ type: "separator" }, { role: "quit" }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  });

  // Chromium offers a key equivalent to the page first, and the page's handler for Ctrl+B
  // and Ctrl+I calls preventDefault, so the menu's accelerator would not also fire. On
  // Windows and Linux the menu only shows them (registerAccelerator: false), so there is
  // one owner of each key. (macOS always registers an accelerator, and there the menu answers.)
  const shownOnly: Partial<MenuItemConstructorOptions> = mac ? {} : { registerAccelerator: false };
  template.push({
    label: "View",
    submenu: [
      { label: "Size", enabled: sizeItems.length > 0, submenu: sizeItems },
      { type: "separator" },
      command("size-bigger", "Bigger", { accelerator: "CmdOrCtrl+=" }),
      // Ctrl+Plus is the same key with Shift held; a second, hidden item accepts it.
      command("size-bigger-plus", "Bigger", {
        accelerator: "CmdOrCtrl+Plus",
        visible: false,
        acceleratorWorksWhenHidden: true,
        click: () => send("size-bigger"),
      }),
      command("size-smaller", "Smaller", { accelerator: "CmdOrCtrl+-" }),
      command("size-default", "Default size", { accelerator: "CmdOrCtrl+0" }),
      { type: "separator" },
      command("toggle-inspector", "Track details", { accelerator: "CmdOrCtrl+I", ...shownOnly }),
      command("toggle-sidebar", "Sidebar", { accelerator: "CmdOrCtrl+B", ...shownOnly }),
      ...(mac ? [] : ([{ type: "separator" }, settings] as MenuItemConstructorOptions[])),
    ],
  });

  // Minimize and close only: Electron's window menu role also has "Zoom", the word this
  // menu keeps out so that nothing in it suggests the page can be zoomed.
  if (mac) template.push({ label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] });

  template.push({
    label: "Help",
    submenu: [
      command("getting-started", "Getting started"),
      command("shortcuts", "Shortcuts"),
      command("report-problem", "Report a problem…"),
      command("privacy", "Privacy"),
      { type: "separator" },
      {
        label: "Troubleshooting",
        submenu: [
          command("diagnostics", "Diagnostics…"),
          command("log-viewer", "Log viewer…"),
          command("support-bundle", "Export support bundle…"),
          command("rekordbox-help", "How to export from Rekordbox…"),
        ],
      },
      ...(mac ? [] : ([{ type: "separator" }, about] as MenuItemConstructorOptions[])),
    ],
  });

  // Reload and the developer tools are for building CuePoint, not for using it.
  if (!packaged) {
    template.push({
      label: "Developer",
      submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }],
    });
  }

  return template;
}

interface InstallInput {
  Menu: Pick<typeof Menu, "buildFromTemplate" | "setApplicationMenu">;
  /** The window a command goes to, or null when there is none (macOS keeps the app alive). */
  getWindow: () => Pick<BrowserWindow, "webContents" | "isDestroyed"> | null;
  platform: MenuPlatform;
  packaged: boolean;
}

/**
 * Install the menu, and rebuild it when the renderer reports a different size. The sizes
 * are empty until it does, which is a moment after the window opens.
 */
export function installAppMenu({ Menu: menus, getWindow, platform, packaged }: InstallInput) {
  let size: SizeState = NO_SIZES;

  const send = (id: string): void => {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send("menu:command", id);
  };

  const install = (): void => {
    menus.setApplicationMenu(
      menus.buildFromTemplate(buildMenuTemplate({ platform, packaged, size, send })),
    );
  };
  install();

  return {
    /** Takes what the page sent; ignores what is not a size state, and one that changes nothing. */
    setSizeState(value: unknown): void {
      const next = parseSizeState(value);
      if (!next) return;
      const same =
        next.current === size.current &&
        next.options.length === size.options.length &&
        next.options.every(
          (option, at) =>
            option.value === size.options[at]!.value && option.label === size.options[at]!.label,
        );
      if (same) return;
      size = next;
      install();
    },
  };
}
