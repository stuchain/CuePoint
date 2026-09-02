/**
 * The shell's keyboard model and focus behaviour (SHELL-10).
 *
 * The failure these guard against is quiet: a control the user just pressed
 * disappears, focus falls to `<body>`, and a keyboard user is silently returned
 * to the top of the tab order with no indication of where they are. Nothing on
 * screen looks wrong when that happens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { TrackInspector } from "./TrackInspector";
import { StatusStrip } from "./StatusStrip";
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
  const toggle = () => screen.getByRole("button", { name: /(Collapse|Expand) navigation/i });

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
  it("moves focus to the reveal control when hidden", async () => {
    const user = userEvent.setup();
    render(<TrackInspector />);

    await user.click(screen.getByRole("button", { name: /hide track inspector/i }));

    expect(screen.getByRole("button", { name: /show track inspector/i })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("moves focus to the hide control when shown again", async () => {
    const user = userEvent.setup();
    render(<TrackInspector />);
    await user.click(screen.getByRole("button", { name: /hide track inspector/i }));

    await user.click(screen.getByRole("button", { name: /show track inspector/i }));

    expect(screen.getByRole("button", { name: /hide track inspector/i })).toHaveFocus();
  });

  it("keeps focus somewhere real when toggled by keyboard", async () => {
    const user = userEvent.setup();
    render(<TrackInspector />);

    await user.keyboard("{Control>}i{/Control}");

    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("button", { name: /show track inspector/i })).toHaveFocus();
  });

  it("does not steal focus on first render", () => {
    // An app that grabs focus on launch is worse than one that never moves it.
    render(
      <>
        <button type="button">elsewhere</button>
        <TrackInspector />
      </>,
    );

    expect(screen.getByRole("button", { name: /hide track inspector/i })).not.toHaveFocus();
  });
});

describe("status strip keyboard", () => {
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
  it("marks the header as search and the status strip as contentinfo", () => {
    const { container } = render(
      <AppShellLayout header={<p>search</p>} statusBar={<p>status</p>}>
        <p>page</p>
      </AppShellLayout>,
    );

    expect(container.querySelector('[role="search"]')).not.toBeNull();
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
    // in SHELL-04 rather than overloading Ctrl+F.
    const byShortcut = new Map<string, Set<string>>();
    for (const entry of KEYBOARD_SHORTCUTS) {
      const actions = byShortcut.get(entry.shortcut) ?? new Set<string>();
      actions.add(entry.action);
      byShortcut.set(entry.shortcut, actions);
    }
    const ambiguous = [...byShortcut.entries()].filter(([, actions]) => actions.size > 1);

    expect(ambiguous).toEqual([]);
  });

  it("documents every shell binding the shell actually implements", () => {
    const documented = KEYBOARD_SHORTCUTS.map((entry) => entry.shortcut);

    for (const shortcut of ["Ctrl+K", "Ctrl+I", "Ctrl+B", "Ctrl+Shift+A"]) {
      expect(documented).toContain(shortcut);
    }
  });
});
