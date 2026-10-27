/**
 * Settings, one page in sections (PAGES-01, SET-1): the heading, the sections
 * in order by name, a link to each that scrolls it into view, Discover's deep
 * link to the token field, and "Reset {section}" acting at once and undoing.
 * Sections are checked by name and order, never by count, so a later phase can
 * add one (Backups, update controls) without rewriting this.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../components";
import { resetWaveformColourForTests } from "../components/waveform/waveformColour";
import { DEFAULT_SCALE } from "../tokens/scale";
import { MotionProvider } from "../tokens/MotionContext";
import { ScaleProvider } from "../tokens/ScaleContext";
import { ThemeProvider } from "../tokens/ThemeContext";
import { BEATPORT_TOKEN_FIELD_ID, SettingsScreen } from "./SettingsScreen";
import { SETTINGS_SECTIONS } from "./settingsSections";
import { settingsFocusState } from "./settingsLink";

const TITLES = [
  "Appearance",
  "Motion",
  "Playback",
  "Waveforms",
  "Beatport",
  "Rekordbox",
  "Privacy",
  "About & updates",
];

function renderSettings(
  props: {
    state?: unknown;
    onOpenOnboarding?: () => void;
    onOpenHelp?: () => void;
    onOpenShortcuts?: () => void;
    onOpenAbout?: () => void;
  } = {},
) {
  return render(
    <ThemeProvider>
      <ScaleProvider>
        <MotionProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[{ pathname: "/settings", state: props.state ?? null }]}>
              <SettingsScreen
                onOpenOnboarding={props.onOpenOnboarding}
                onOpenHelp={props.onOpenHelp}
                onOpenShortcuts={props.onOpenShortcuts}
                onOpenAbout={props.onOpenAbout}
              />
            </MemoryRouter>
          </ToastProvider>
        </MotionProvider>
      </ScaleProvider>
    </ThemeProvider>,
  );
}

/** `wanted` appear in `found`, in that order, with anything else allowed between. */
function inOrder(found: string[], wanted: string[]): boolean {
  let at = 0;
  for (const name of found) if (name === wanted[at]) at += 1;
  return at === wanted.length;
}

const region = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  localStorage.clear();
  resetWaveformColourForTests();
  document.documentElement.removeAttribute("data-theme");
  Element.prototype.scrollIntoView = vi.fn();
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    getJob: vi.fn(),
    getBeatportTokenStatus: vi.fn(async () => ({ configured: false, masked: null })),
    buildInfo: vi.fn(async () => ({ version: "9.8.7", dist: "test", environment: "production" })),
  };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  localStorage.clear();
  resetWaveformColourForTests();
  vi.restoreAllMocks();
});

describe("the current section (T15)", () => {
  class FakeObserver {
    static last: FakeObserver | null = null;
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      FakeObserver.last = this;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  it("marks the section in view with motion off", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    try {
      renderSettings();
      const section = document.getElementById("settings-motion")!;
      act(() => {
        FakeObserver.last!.callback(
          [{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry],
          FakeObserver.last as unknown as IntersectionObserver,
        );
      });
      expect(screen.getByRole("link", { name: "Motion" })).toHaveAttribute("data-current");
      expect(screen.getByRole("link", { name: "Appearance" })).not.toHaveAttribute("data-current");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the page", () => {
  it("has the heading Settings", () => {
    renderSettings();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
  });

  it("lists the sections as links, in order, and none is named Settings", () => {
    renderSettings();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const names = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent ?? "");
    expect(inOrder(names, TITLES)).toBe(true);
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("has each section as a named region, in order", () => {
    renderSettings();
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label") ?? "");
    expect(inOrder(names, TITLES)).toBe(true);
    for (const title of TITLES) expect(region(title)).toBeInTheDocument();
  });

  it("defines the sections once, with stable ids, in the same order", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.title)).toEqual(TITLES);
    renderSettings();
    for (const section of SETTINGS_SECTIONS) {
      expect(document.getElementById(section.id)).toBe(region(section.title));
    }
  });

  it("titles each section's panel with the section's name", () => {
    renderSettings();
    for (const title of TITLES) {
      expect(within(region(title)).getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });
});

describe("the links", () => {
  it.each(SETTINGS_SECTIONS.map((s) => [s.title, s.id]))(
    "%s scrolls its section into view",
    async (title, id) => {
      const scrolled: string[] = [];
      Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
        scrolled.push(this.id);
      });
      renderSettings();
      await userEvent.click(
        within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("link", {
          name: title,
        }),
      );
      expect(scrolled).toEqual([id]);
    },
  );

  it("leaves the address alone", async () => {
    window.location.hash = "";
    renderSettings();
    await userEvent.click(screen.getByRole("link", { name: "Playback" }));
    expect(window.location.hash).toBe("");
  });
});

describe("Discover's deep link", () => {
  it("focuses the Beatport token field once its status is read", async () => {
    renderSettings({ state: settingsFocusState("beatport-token") });
    const field = document.getElementById(BEATPORT_TOKEN_FIELD_ID)!;
    await waitFor(() => expect(field).toHaveFocus());
    expect(region("Beatport")).toContainElement(field);
  });

  it("scrolls to the Privacy section when Help → Privacy asks for it", async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.id);
    });
    renderSettings({ state: settingsFocusState("privacy") });
    await waitFor(() => expect(scrolled).toContain("settings-privacy"));
  });

  it("focuses the size control when the update note's Change size asks for it", async () => {
    renderSettings({ state: settingsFocusState("size") });
    const field = screen.getByLabelText("Size of text and controls");
    await waitFor(() => expect(field).toHaveFocus());
  });

  it("scrolls to the Waveforms section when Prepare's waiting waveform asks for it", async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.id);
    });
    renderSettings({ state: settingsFocusState("waveforms") });
    await waitFor(() => expect(scrolled).toContain("settings-waveforms"));
  });
});

describe("the Beatport test result", () => {
  async function runTest(answer: { ok: boolean; message: string; reason?: string }) {
    (window.cuepoint as unknown as Record<string, unknown>).getBeatportTokenStatus = vi.fn(async () => ({
      configured: true,
      masked: "••••abcd",
    }));
    (window.cuepoint as unknown as Record<string, unknown>).testBeatportToken = vi.fn(async () => answer);
    (window.cuepoint as unknown as Record<string, unknown>).getBeatportAuth = vi.fn(async () => ({
      state: "signed_in",
      masked: "••••abcd",
      expires_at: null,
      secure_storage: true,
    }));
    renderSettings();
    const button = await within(region("Beatport")).findByRole("button", { name: "Check sign-in" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    return await within(region("Beatport")).findByRole("status");
  }

  it("says Beatport rejected the token only when it did", async () => {
    const result = await runTest({ ok: false, message: "The token is invalid or has expired.", reason: "rejected" });
    expect(result).toHaveTextContent("Beatport refused the sign-in.");
    expect(result).toHaveClass("settings-status--danger");
  });

  it("says Beatport could not be reached for a network or server failure", async () => {
    const result = await runTest({ ok: false, message: "The request did not go through.", reason: "unreachable" });
    expect(result).toHaveTextContent("Could not reach Beatport.");
    expect(result).not.toHaveTextContent(/rejected/i);
    expect(result).toHaveClass("settings-status--warning");
  });
});

describe("Motion and About & updates", () => {
  it("holds the Follow system, On, Off and Custom choice", () => {
    renderSettings();
    // M435, D23: "On" is a choice of its own beside Follow system.
    expect(within(region("Motion")).getAllByRole("radio")).toHaveLength(4);
  });

  it("shows the version, opens Getting started, and keeps a slot for updates", async () => {
    const onOpenOnboarding = vi.fn();
    const onOpenHelp = vi.fn();
    const onOpenShortcuts = vi.fn();
    const onOpenAbout = vi.fn();
    renderSettings({ onOpenOnboarding, onOpenHelp, onOpenShortcuts, onOpenAbout });
    const about = region("About & updates");
    await waitFor(() => expect(within(about).getByTestId("settings-version")).toHaveTextContent("9.8.7"));
    await userEvent.click(within(about).getByRole("button", { name: "Getting started" }));
    expect(onOpenOnboarding).toHaveBeenCalledTimes(1);
    // The native menu's help entries, here too for people who hide the menu bar (M489).
    await userEvent.click(within(about).getByRole("button", { name: "Get help" }));
    await userEvent.click(within(about).getByRole("button", { name: "Keyboard shortcuts" }));
    await userEvent.click(within(about).getByRole("button", { name: "About CuePoint" }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(onOpenAbout).toHaveBeenCalledTimes(1);
    expect(about.querySelector('[data-slot="updates"]')).not.toBeNull();
  });
});

describe("Reset section", () => {
  const theme = () => within(region("Appearance")).getByRole("combobox", { name: "Theme" });
  const size = () =>
    within(region("Appearance")).getByRole("combobox", { name: "Size of text and controls" });

  it("resets Appearance at once to Neo dark at the default size, and Undo restores it", async () => {
    renderSettings();
    await userEvent.selectOptions(theme(), "retro16");
    await userEvent.selectOptions(size(), "3");

    await userEvent.click(within(region("Appearance")).getByRole("button", { name: "Reset to defaults" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Appearance reset")).toBeInTheDocument();
    expect(theme()).toHaveValue("neoDark");
    expect(size()).toHaveValue(String(DEFAULT_SCALE));

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(theme()).toHaveValue("retro16");
    expect(size()).toHaveValue("3");
  });

  it("resets the waveform colors to Three bands at once, and Undo restores them", async () => {
    renderSettings();
    const waveforms = region("Waveforms");
    await userEvent.click(within(waveforms).getByRole("radio", { name: "One color" }));
    expect(within(waveforms).getByRole("radio", { name: "One color" })).toBeChecked();

    await userEvent.click(within(waveforms).getByRole("button", { name: "Reset to defaults" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(waveforms).getByRole("radio", { name: "Three bands" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(waveforms).getByRole("radio", { name: "One color" })).toBeChecked();
  });

  const resets = () =>
    TITLES.filter((title) => within(region(title)).queryByRole("button", { name: "Reset to defaults" }) !== null);

  it("is drawn by no section while every value is its default (M436)", () => {
    renderSettings();
    expect(resets()).toEqual([]);
  });

  it("is offered once a value differs, by every section that has settings, and by About and Rekordbox never", async () => {
    renderSettings();
    await userEvent.selectOptions(within(region("Appearance")).getByRole("combobox", { name: "Theme" }), "retro16");
    await userEvent.click(within(region("Motion")).getByRole("radio", { name: "Off" }));
    await userEvent.click(within(region("Waveforms")).getByRole("radio", { name: "One color" }));
    await userEvent.click(within(region("Beatport")).getByRole("checkbox", { name: /charts by regular Beatport users/ }));
    await userEvent.click(within(region("Privacy")).getByRole("checkbox", { name: "Clear cache" }));
    expect(resets()).toEqual(expect.arrayContaining(["Appearance", "Motion", "Waveforms", "Beatport", "Privacy"]));
    expect(resets()).not.toContain("Rekordbox");
    expect(resets()).not.toContain("About & updates");
  });

  it("puts Reset at the right of the card's title line, quiet, the same words everywhere (C52, M436)", async () => {
    renderSettings();
    await userEvent.selectOptions(within(region("Appearance")).getByRole("combobox", { name: "Theme" }), "retro16");
    await userEvent.click(within(region("Motion")).getByRole("radio", { name: "Off" }));
    for (const title of ["Appearance", "Motion"]) {
      const reset = within(region(title)).getByRole("button", { name: "Reset to defaults" });
      expect(reset.closest(".settings-page__tools"), title).not.toBeNull();
      expect(reset.closest(".settings-actions"), title).toBeNull();
      expect(reset).toHaveClass("cp-btn--quiet");
    }
  });

  it("states the header as a count only, and writes the version once, in About (C233, C118, M434)", () => {
    renderSettings();
    expect(screen.getByText(/^\d+ sections?$/)).toBeInTheDocument();
    expect(within(region("About & updates")).getByTestId("settings-version")).toHaveTextContent(/^Version \d/);
  });
});

describe("Saved", () => {
  it("shows beside Appearance after a change", async () => {
    renderSettings();
    await userEvent.selectOptions(
      within(region("Appearance")).getByRole("combobox", { name: "Theme" }),
      "mutedPro",
    );
    expect(within(region("Appearance")).getByRole("status")).toHaveTextContent("Saved");
  });
});
