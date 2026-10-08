/**
 * Settings, one page in sections (PAGES-01, SET-1): the heading, the sections
 * in order by name, a link to each that scrolls it into view, Discover's deep
 * link to the token field, and "Reset to defaults" asking first and undoing.
 * Sections are checked by name and order, never by count, so a later phase can
 * add one (Backups, update controls) without rewriting this.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../components";
import { resetWaveformColourForTests } from "../components/waveform/waveformColour";
import { DEFAULT_SCALE } from "../tokens/scale";
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
  "Rekordbox export",
  "Privacy",
  "About & updates",
];

function renderSettings(
  props: { state?: unknown; onOpenOnboarding?: () => void } = {},
) {
  return render(
    <ThemeProvider>
      <ScaleProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[{ pathname: "/settings", state: props.state ?? null }]}>
            <SettingsScreen onOpenOnboarding={props.onOpenOnboarding} />
          </MemoryRouter>
        </ToastProvider>
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
});

describe("the Beatport test result", () => {
  async function runTest(answer: { ok: boolean; message: string; reason?: string }) {
    (window.cuepoint as unknown as Record<string, unknown>).getBeatportTokenStatus = vi.fn(async () => ({
      configured: true,
      masked: "••••abcd",
    }));
    (window.cuepoint as unknown as Record<string, unknown>).testBeatportToken = vi.fn(async () => answer);
    renderSettings();
    const button = within(region("Beatport")).getByRole("button", { name: "Test connection" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    return await within(region("Beatport")).findByRole("status");
  }

  it("says Beatport rejected the token only when it did", async () => {
    const result = await runTest({ ok: false, message: "The token is invalid or has expired.", reason: "rejected" });
    expect(result).toHaveTextContent("Beatport rejected the token.");
    expect(result).toHaveClass("cp-beatport-settings__result--rejected");
  });

  it("says Beatport could not be reached for a network or server failure", async () => {
    const result = await runTest({ ok: false, message: "The request did not go through.", reason: "unreachable" });
    expect(result).toHaveTextContent("Couldn't reach Beatport.");
    expect(result).not.toHaveTextContent(/rejected/i);
    expect(result).toHaveClass("cp-beatport-settings__result--unreachable");
  });
});

describe("Motion and About & updates", () => {
  it("holds a placeholder for Motion", () => {
    renderSettings();
    expect(within(region("Motion")).getByText("Motion settings will appear here.")).toBeInTheDocument();
  });

  it("shows the version, opens Getting started, and keeps a slot for updates", async () => {
    const onOpenOnboarding = vi.fn();
    renderSettings({ onOpenOnboarding });
    const about = region("About & updates");
    await waitFor(() => expect(within(about).getByTestId("settings-version")).toHaveTextContent("9.8.7"));
    await userEvent.click(within(about).getByRole("button", { name: "Getting started" }));
    expect(onOpenOnboarding).toHaveBeenCalledTimes(1);
    expect(about.querySelector('[data-slot="updates"]')).not.toBeNull();
  });
});

describe("Reset to defaults", () => {
  const theme = () => within(region("Appearance")).getByRole("combobox", { name: "Active theme" });
  const size = () =>
    within(region("Appearance")).getByRole("combobox", { name: "Size of text and controls" });

  it("asks first, then resets Appearance to Neo dark at the default size, and Undo restores it", async () => {
    renderSettings();
    await userEvent.selectOptions(theme(), "retro16");
    await userEvent.selectOptions(size(), "3");

    await userEvent.click(within(region("Appearance")).getByRole("button", { name: "Reset to defaults" }));
    // Asked, nothing changed yet; Cancel keeps it so.
    const dialog = screen.getByRole("dialog", { name: "Reset Appearance to defaults?" });
    expect(theme()).toHaveValue("retro16");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(theme()).toHaveValue("retro16");
    expect(size()).toHaveValue("3");

    await userEvent.click(within(region("Appearance")).getByRole("button", { name: "Reset to defaults" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Reset Appearance to defaults?" })).getByRole("button", {
        name: "Reset",
      }),
    );
    expect(theme()).toHaveValue("neoDark");
    expect(size()).toHaveValue(String(DEFAULT_SCALE));

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(theme()).toHaveValue("retro16");
    expect(size()).toHaveValue("3");
  });

  it("asks first, then resets the waveform colors to Three bands, and Undo restores them", async () => {
    renderSettings();
    const waveforms = region("Waveforms");
    await userEvent.click(within(waveforms).getByRole("radio", { name: "One color" }));
    expect(within(waveforms).getByRole("radio", { name: "One color" })).toBeChecked();

    await userEvent.click(within(waveforms).getByRole("button", { name: "Reset to defaults" }));
    expect(within(waveforms).getByRole("radio", { name: "One color" })).toBeChecked();
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Reset Waveforms to defaults?" })).getByRole("button", {
        name: "Reset",
      }),
    );
    expect(within(waveforms).getByRole("radio", { name: "Three bands" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(waveforms).getByRole("radio", { name: "One color" })).toBeChecked();
  });

  it("is offered by Appearance and Waveforms only", () => {
    renderSettings();
    const holders = TITLES.filter(
      (title) => within(region(title)).queryByRole("button", { name: "Reset to defaults" }) !== null,
    );
    expect(holders).toEqual(["Appearance", "Waveforms"]);
  });
});

describe("Saved", () => {
  it("shows beside Appearance after a change", async () => {
    renderSettings();
    await userEvent.selectOptions(
      within(region("Appearance")).getByRole("combobox", { name: "Active theme" }),
      "mutedPro",
    );
    expect(within(region("Appearance")).getByRole("status")).toHaveTextContent("Saved");
  });
});
