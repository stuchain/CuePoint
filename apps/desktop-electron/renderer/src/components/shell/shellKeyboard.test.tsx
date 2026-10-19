/**
 * The shell's keyboard model and focus behaviour (SHELL-10).
 *
 * The failure these guard against is quiet: a control the user just pressed
 * disappears, focus falls to `<body>`, and a keyboard user is silently returned
 * to the top of the tab order with no indication of where they are. Nothing on
 * screen looks wrong when that happens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../Toast";
import { Sidebar } from "./Sidebar";
import { ScreenHeader } from "./ScreenHeader";
import { INSPECTOR_AUTO_OPEN_DELAY_MS, TrackInspector } from "./TrackInspector";
import { setSelectedTrack } from "./selectedTrack";
import { StatusStrip } from "./StatusStrip";
import { resetActivityForTests } from "./activityState";
import { AppShellLayout } from "./AppShellLayout";
import { KEYBOARD_SHORTCUTS } from "../../api/keyboardShortcuts";

afterEach(() => {
  localStorage.clear();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("sidebar keyboard", () => {
  const renderSidebar = () =>
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
  const toggle = () => screen.getByRole("button", { name: /(Collapse|Expand) sidebar/i });

  it("collapses and expands with Ctrl+B", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: /main navigation/i });

    await user.keyboard("{Control>}b{/Control}");
    expect(nav).toHaveAttribute("data-collapsed", "true");

    await user.keyboard("{Control>}b{/Control}");
    expect(nav).toHaveAttribute("data-collapsed", "false");
  });

  it("leaves focus on the toggle rather than on the body", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.keyboard("{Control>}b{/Control}");

    expect(toggle()).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("does not fire on Ctrl+Shift+B", async () => {
    // Ctrl+Shift+A is taken; a modifier-sloppy handler would collide with any
    // future Ctrl+Shift binding on the same letter.
    const user = userEvent.setup();
    renderSidebar();

    await user.keyboard("{Control>}{Shift>}b{/Shift}{/Control}");

    expect(screen.getByRole("navigation", { name: /main navigation/i })).toHaveAttribute(
      "data-collapsed",
      "false",
    );
  });
});

describe("inspector focus", () => {
  // The panel opens with a selection (K1); these are about the open panel's controls.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setSelectedTrack({ id: 1, key: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    setSelectedTrack(null);
  });

  /** Renders, then lets the selection's double-click window pass so the panel is open. */
  function render(ui: Parameters<typeof rtlRender>[0]) {
    const result = rtlRender(ui);
    act(() => {
      vi.advanceTimersByTime(INSPECTOR_AUTO_OPEN_DELAY_MS);
    });
    return result;
  }

  it("moves focus to the reveal control when hidden", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <ScreenHeader title="Page" />
        <TrackInspector />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /hide track details/i }));

    expect(screen.getByRole("button", { name: /^track details$/i })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("moves focus to the hide control when shown again", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <ScreenHeader title="Page" />
        <TrackInspector />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /hide track details/i }));

    await user.click(screen.getByRole("button", { name: /^track details$/i }));

    expect(screen.getByRole("button", { name: /hide track details/i })).toHaveFocus();
  });

  it("keeps focus somewhere real when toggled by keyboard", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <ScreenHeader title="Page" />
        <TrackInspector />
      </MemoryRouter>,
    );

    await user.keyboard("{Control>}i{/Control}");

    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("button", { name: /^track details$/i })).toHaveFocus();
  });

  it("does not steal focus on first render", () => {
    // An app that grabs focus on launch is worse than one that never moves it.
    render(
      <MemoryRouter>
        <button type="button">elsewhere</button>
        <ScreenHeader title="Page" />
        <TrackInspector />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /hide track details/i })).not.toHaveFocus();
  });
});

describe("status strip keyboard", () => {
  afterEach(() => resetActivityForTests());
  beforeEach(() => {
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getEngineStatus: vi.fn().mockResolvedValue({ connected: true }),
      listJobs: vi.fn().mockResolvedValue({ jobs: [], active_count: 0 }),
      getRecentActivity: vi.fn().mockResolvedValue({ events: [], total: 0, limit: 50 }),
    };
  });

  it("opens the activity panel with Ctrl+Shift+A", async () => {
    const user = userEvent.setup();
    render(<StatusStrip />);

    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /activity/i })).toBeInTheDocument(),
    );
  });

  it("does not open it on Ctrl+A, which selects text", async () => {
    const user = userEvent.setup();
    render(<StatusStrip />);

    await user.keyboard("{Control>}a{/Control}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("landmarks", () => {
  it("marks the status strip as contentinfo and has no search landmark until the dialog opens", () => {
    // The `search` landmark is the dialog's own form (K8), so a closed dialog adds none.
    const { container } = render(
      <ToastProvider>
        <MemoryRouter>
          <AppShellLayout statusBar={<p>status</p>}>
            <p>page</p>
          </AppShellLayout>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(container.querySelectorAll('[role="search"]')).toHaveLength(0);
    expect(container.querySelector("footer")).not.toBeNull();
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("declares no landmark for a region that is not rendered", () => {
    const { container } = render(
      <AppShellLayout>
        <p>page</p>
      </AppShellLayout>,
    );

    expect(container.querySelector('[role="search"]')).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
  });
});

describe("the shortcuts registry", () => {
  it("never gives one key two meanings", () => {
    // The DoD for SHELL-10, and the reason Ctrl+K was chosen for global search
    // in SHELL-04 rather than overloading Ctrl+F. A page's own key (Enter in a table, the
    // arrows on a divider) means what that page says; the global ones mean one thing
    // everywhere, so no page may reuse one.
    const seen = new Map<string, Set<string>>();
    for (const entry of KEYBOARD_SHORTCUTS) {
      const contexts = seen.get(entry.shortcut) ?? new Set<string>();
      contexts.add(entry.context);
      seen.set(entry.shortcut, contexts);
    }
    // Esc is the one key that means "let go of whatever is on top" everywhere; the
    // Library's row says what it lets go of there (LIB-12), and a dialog still wins.
    const reusedGlobal = [...seen.entries()].filter(
      ([shortcut, contexts]) => shortcut !== "Esc" && contexts.has("Everywhere") && contexts.size > 1,
    );
    expect(reusedGlobal).toEqual([]);

    const twiceInOneContext = KEYBOARD_SHORTCUTS.filter(
      (entry, at) =>
        KEYBOARD_SHORTCUTS.findIndex(
          (other) => other.context === entry.context && other.shortcut === entry.shortcut,
        ) !== at,
    );
    expect(twiceInOneContext).toEqual([]);
  });

  it("documents every shell binding the shell actually implements", () => {
    const documented = KEYBOARD_SHORTCUTS.map((entry) => entry.shortcut);

    for (const shortcut of ["Ctrl+K", "Ctrl+I", "Ctrl+B", "Ctrl+Shift+A"]) {
      expect(documented).toContain(shortcut);
    }
  });
});
