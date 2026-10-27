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

/**
 * The ids the menu sends besides `size:<value>`; the renderer's `menuCommands.ts` lists the same.
 * `report-problem` and `support-bundle` are gone: no item sends them (M497).
 */
export const MENU_COMMAND_IDS = [
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
] as const;

export interface SizeOption {
  value: number;
  label: string;
  /** Too big for the screen (R2-5): shown greyed, and not clickable. */
  disabled?: boolean;
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
    const {
      value: size,
      label,
      disabled,
    } = option as { value?: unknown; label?: unknown; disabled?: unknown };
    if (typeof size !== "number" || !Number.isFinite(size)) continue;
    if (typeof label !== "string" || label.trim() === "") continue;
    kept.push({
      value: size,
      label: label.slice(0, MAX_LABEL_LENGTH),
      ...(disabled === true ? { disabled: true } : {}),
    });
  }
  if (kept.length === 0 && options.length > 0) return null;
  return { options: kept, current };
}

/** Which panels are open, for the check marks beside View → Track details and Sidebar (M497). */
export interface ViewState {
  inspector: boolean;
  sidebar: boolean;
}

/** The page's view state, or null when it is not one: anything but two booleans is refused. */
export function parseViewState(value: unknown): ViewState | null {
  if (!value || typeof value !== "object") return null;
  const { inspector, sidebar } = value as { inspector?: unknown; sidebar?: unknown };
  if (typeof inspector !== "boolean" || typeof sidebar !== "boolean") return null;
  return { inspector, sidebar };
}

interface MenuInput {
  platform: MenuPlatform;
  packaged: boolean;
  size: SizeState;
  /** Null until the page reports it; the two panel items then carry no check mark. */
  view?: ViewState | null;
  /** Called with the command id when an item is clicked. */
  send: (id: string) => void;
}

const NO_SIZES: SizeState = { options: [], current: 0 };

export function buildMenuTemplate({
  platform,
  packaged,
  size,
  view = null,
  send,
}: MenuInput): MenuItemConstructorOptions[] {
  const mac = platform === "darwin";

  /** An item that sends its own id. */
  const command = (
    id: string,
    label: string,
    extra: Partial<MenuItemConstructorOptions> = {},
  ): MenuItemConstructorOptions => ({ id, label, click: () => send(id), ...extra });

  // An opener ends in "…" only when it asks for input first (M404, D33): Settings, Getting started,
  // Diagnostics and Log viewer open a page or a list, so they do not.
  const settings = command("settings", "Settings", { accelerator: "CmdOrCtrl+," });
  const about = command("about", "About CuePoint");

  /** A panel item is a check item once its state is known, and a plain one before. */
  const panelCheck = (open: boolean | undefined): Partial<MenuItemConstructorOptions> =>
    open === undefined ? {} : { type: "checkbox", checked: open };

  const sizeItems: MenuItemConstructorOptions[] = size.options.map((option) => ({
    id: `size:${option.value}`,
    label: option.label,
    type: "radio" as const,
    checked: option.value === size.current,
    enabled: !option.disabled,
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
      command("import", "Import a Rekordbox file…", { accelerator: "CmdOrCtrl+O" }),
      command("check-rekordbox", "Check for changes", { accelerator: "F5" }),
      // The export asks where to save first, so it ends in "…" (M497; amends DEC-087).
      command("export-rekordbox", "Export to Rekordbox…"),
      // Settings is in the File menu on Windows and Linux, where it is a menu of its own on macOS.
      ...(mac
        ? []
        : ([{ type: "separator" }, settings, { type: "separator" }, { role: "quit" }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: "Edit",
    submenu: [
      // Undo is CuePoint's own (M456): the page undoes the newest change, or a typed edit when a
      // text field has the focus. Redo stays the system's, for text.
      command("undo", "Undo", { accelerator: "CmdOrCtrl+Z" }),
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
      // Check marks once the page has said what is open (M497).
      command("toggle-inspector", "Track details", { accelerator: "CmdOrCtrl+I", ...shownOnly, ...panelCheck(view?.inspector) }),
      command("toggle-sidebar", "Sidebar", { accelerator: "CmdOrCtrl+B", ...shownOnly, ...panelCheck(view?.sidebar) }),
      { type: "separator" },
      // Both open a dialog, so both end in "…" (C166); the page answers Ctrl+K and Ctrl+Shift+A itself.
      command("search-library", "Search library…", { accelerator: "CmdOrCtrl+K", ...shownOnly }),
      command("activity", "Activity…", { accelerator: "CmdOrCtrl+Shift+A", ...shownOnly }),
    ],
  });

  // Minimize and close only: Electron's window menu role also has "Zoom", the word this
  // menu keeps out so that nothing in it suggests the page can be zoomed.
  if (mac) template.push({ label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] });

  template.push({
    label: "Help",
    submenu: [
      // An item that opens a dialog ends in "…", and the dialog repeats its words without it: this
      // one opens the "Keyboard shortcuts" dialog, "Getting started" and "Privacy" likewise (C168).
      command("getting-started", "Getting started"),
      // F1 is the page's own key for the list (it opens it itself), so the menu only shows it.
      command("shortcuts", "Keyboard shortcuts…", { accelerator: "F1", ...shownOnly }),
      command("get-help", "Get help…"),
      command("rekordbox-help", "How to get your Rekordbox file…"),
      command("privacy", "Privacy…"),
      ...(mac ? [] : ([{ type: "separator" }, about] as MenuItemConstructorOptions[])),
    ],
  });

  // Reload, the developer tools, Diagnostics and the log are for building CuePoint, not for using it.
  if (!packaged) {
    template.push({
      label: "Developer",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        command("diagnostics", "Diagnostics"),
        command("log-viewer", "Log viewer"),
      ],
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
  let view: ViewState | null = null;

  const send = (id: string): void => {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send("menu:command", id);
  };

  const install = (): void => {
    menus.setApplicationMenu(
      menus.buildFromTemplate(buildMenuTemplate({ platform, packaged, size, view, send })),
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
            option.value === size.options[at]!.value &&
            option.label === size.options[at]!.label &&
            (option.disabled ?? false) === (size.options[at]!.disabled ?? false),
        );
      if (same) return;
      size = next;
      install();
    },

    /** Takes which panels are open; ignores what is not that, and a state that changes nothing. */
    setViewState(value: unknown): void {
      const next = parseViewState(value);
      if (!next) return;
      if (view && view.inspector === next.inspector && view.sidebar === next.sidebar) return;
      view = next;
      install();
    },
  };
}
