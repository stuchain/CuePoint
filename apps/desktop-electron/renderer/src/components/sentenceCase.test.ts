/** G6 N3 guard: labels are sentence case as typed; no sheet shouts with `text-transform: uppercase`. */
import { describe, expect, it } from "vitest";
import { KEYBOARD_SHORTCUTS } from "../api/keyboardShortcuts";

const menuSources = import.meta.glob("../../../electron/appMenu.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

describe("sentence case (N3)", () => {
  it("has no text-transform: uppercase in any stylesheet", () => {
    const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
    const bad = Object.entries(sheets)
      .filter(([, css]) => /text-transform\s*:\s*uppercase/.test(code(css)))
      .map(([sheet]) => sheet);
    expect(bad).toEqual([]);
    expect(Object.keys(sheets).length).toBeGreaterThan(40);
  });

  it("writes the menu's and the Shortcuts list's Rekordbox file labels in sentence case", () => {
    const menu = Object.values(menuSources).join("\n");
    expect(menu.length).toBeGreaterThan(1000);
    expect(menu).not.toMatch(/Rekordbox File/);
    expect(menu).toContain("Import a Rekordbox file…");
    const actions = KEYBOARD_SHORTCUTS.map((row) => row.action);
    expect(actions.filter((action) => /Rekordbox File/.test(action))).toEqual([]);
    expect(actions).toContain("Import a Rekordbox file…");
  });

  it("writes every Settings Reset button in sentence case", async () => {
    const { render, screen } = await import("@testing-library/react");
    const { createElement } = await import("react");
    const { ToastProvider } = await import("../components");
    const { ResetToDefaults } = await import("../screens/ResetToDefaults");
    const sections = ["Appearance", "Privacy", "Playback", "Waveforms", "Motion", "Beatport"];
    render(
      createElement(
        ToastProvider,
        null,
        ...sections.map((section) => createElement(ResetToDefaults, { key: section, section, onReset: () => () => {} })),
      ),
    );
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual([
      "Reset appearance",
      "Reset privacy",
      "Reset playback",
      "Reset waveforms",
      "Reset motion",
      "Reset Beatport",
    ]);
  });
});
