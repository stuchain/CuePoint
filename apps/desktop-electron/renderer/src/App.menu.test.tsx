/**
 * The menu's commands, answered by the renderer (FLW-20, DEC-204).
 *
 * The menu is built in main and sends fixed ids; this is the other half. The bridge is a
 * fake whose `menu.onCommand` hands the test the callback, so each command can be sent
 * as main would send it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";

import App from "./App";

type Send = (id: string) => void;

let send: Send;
let unsubscribe: ReturnType<typeof vi.fn>;
let menu: { setSizeState: ReturnType<typeof vi.fn>; onCommand: ReturnType<typeof vi.fn> };
let bridge: Record<string, unknown>;

const nav = () => screen.getByRole("navigation", { name: /main navigation/i });

function command(id: string) {
  act(() => send(id));
}

beforeEach(() => {
  localStorage.setItem("cuepoint-onboarding-complete", "1");
  window.location.hash = "";
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
  unsubscribe = vi.fn();
  menu = {
    setSizeState: vi.fn().mockResolvedValue(undefined),
    onCommand: vi.fn((callback: Send) => {
      send = callback;
      return unsubscribe;
    }),
  };
  bridge = {
    menu,
    openXmlFileDialog: vi.fn().mockResolvedValue({ canceled: true }),
    startLibraryImport: vi.fn(),
    startLibraryRefreshPreview: vi.fn().mockRejectedValue(new Error("stopped")),
    getJobResults: vi.fn(),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  localStorage.clear();
  delete document.documentElement.dataset.scale;
});

describe("the in-window menu bar is gone", () => {
  it("renders no Help menu and no menu bar region", () => {
    const { container } = render(<App />);
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
    expect(container.querySelector(".app-menu-bar, .app-shell__menubar")).toBeNull();
  });
});

describe("listening", () => {
  it("subscribes once, and lets go when the window goes", () => {
    const view = render(<App />);
    expect(menu.onCommand).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("tolerates a bridge with no menu (a browser tab, an older main)", () => {
    delete bridge.menu;
    expect(() => render(<App />)).not.toThrow();
  });
});

describe("pages and dialogs", () => {
  it("opens Settings", async () => {
    render(<App />);
    command("settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/settings");
  });

  it("opens Settings at Privacy", async () => {
    render(<App />);
    command("privacy");
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/settings");
    // No dialog: the choices are in Settings, and the dialog only explains.
    expect(screen.queryByRole("dialog", { name: "Privacy" })).not.toBeInTheDocument();
  });

  it.each([
    ["getting-started", "Getting started"],
    ["shortcuts", "Keyboard Shortcuts"],
    ["report-problem", "Report a problem"],
    ["diagnostics", "Diagnostics"],
    ["log-viewer", "Log Viewer"],
    ["support-bundle", "Export Support Bundle"],
    ["rekordbox-help", "Export XML from Rekordbox"],
    ["about", "About CuePoint"],
  ])("opens a dialog for %s", async (id, title) => {
    render(<App />);
    command(id);
    expect(await screen.findByRole("dialog", { name: new RegExp(title, "i") })).toBeInTheDocument();
  });

  it("ignores an id it does not know", () => {
    render(<App />);
    expect(() => command("format-disk")).not.toThrow();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("the Shortcuts key", () => {
  it("opens on Ctrl+? and, on macOS, Cmd+?", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<App />);
    fireEvent.keyDown(window, { key: "?", ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: /keyboard shortcuts/i })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    fireEvent.keyDown(window, { key: "?", metaKey: true });
    expect(await screen.findByRole("dialog", { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });
});

describe("panels", () => {
  it("toggles the sidebar", async () => {
    render(<App />);
    expect(nav()).toHaveAttribute("data-collapsed", "false");
    command("toggle-sidebar");
    await waitFor(() => expect(nav()).toHaveAttribute("data-collapsed", "true"));
    command("toggle-sidebar");
    await waitFor(() => expect(nav()).toHaveAttribute("data-collapsed", "false"));
  });

  it("toggles Track details", async () => {
    render(<App />);
    expect(screen.getByRole("complementary", { name: /track details/i })).toBeInTheDocument();
    command("toggle-inspector");
    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: /track details/i })).not.toBeInTheDocument(),
    );
    command("toggle-inspector");
    expect(await screen.findByRole("complementary", { name: /track details/i })).toBeInTheDocument();
  });
});

describe("size", () => {
  const scale = () => document.documentElement.dataset.scale;
  const lastReported = () => menu.setSizeState.mock.calls.at(-1)![0] as { current: number };

  it("tells main the sizes and the current one when it starts", async () => {
    render(<App />);
    await waitFor(() => expect(menu.setSizeState).toHaveBeenCalled());
    const first = menu.setSizeState.mock.calls[0]![0] as {
      options: { value: number; label: string }[];
      current: number;
    };
    expect(first.current).toBe(1.5);
    expect(first.options).toEqual([
      { value: 1, label: "Small (1×)" },
      { value: 1.5, label: "Medium (1.5×) — default" },
      { value: 2, label: "Large (2×)" },
      { value: 3, label: "Extra large (3×)" },
    ]);
  });

  it("steps up and down, and tells main each time", async () => {
    render(<App />);
    command("size-bigger");
    await waitFor(() => expect(scale()).toBe("2"));
    expect(lastReported().current).toBe(2);
    command("size-smaller");
    command("size-smaller");
    await waitFor(() => expect(scale()).toBe("1"));
    expect(lastReported().current).toBe(1);
  });

  it("sets a size by value and returns to the default", async () => {
    render(<App />);
    command("size:3");
    await waitFor(() => expect(scale()).toBe("3"));
    command("size-default");
    await waitFor(() => expect(scale()).toBe("1.5"));
    expect(lastReported().current).toBe(1.5);
  });

  it("changes the stored size Settings reads", async () => {
    render(<App />);
    command("size:2");
    await waitFor(() => expect(localStorage.getItem("cuepoint-ui-lab-scale")).toBe("2"));
  });
});

describe("the Library's own actions", () => {
  it("import opens the Library and asks for a file, as its button does", async () => {
    render(<App />);
    command("settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" });

    command("import");

    await waitFor(() => expect(bridge.openXmlFileDialog).toHaveBeenCalledTimes(1));
    expect(window.location.hash).toBe("#/library");
    expect(within(nav()).getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
  });

  it("import works again from the Library itself", async () => {
    render(<App />);
    await screen.findByText(/Nothing imported yet/i);
    command("import");
    await waitFor(() => expect(bridge.openXmlFileDialog).toHaveBeenCalledTimes(1));
    command("import");
    await waitFor(() => expect(bridge.openXmlFileDialog).toHaveBeenCalledTimes(2));
  });

  it("check-rekordbox opens the Library and starts the check", async () => {
    render(<App />);
    command("settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" });

    command("check-rekordbox");

    await waitFor(() => expect(bridge.startLibraryRefreshPreview).toHaveBeenCalledTimes(1));
    expect(window.location.hash).toBe("#/library");
  });
});
