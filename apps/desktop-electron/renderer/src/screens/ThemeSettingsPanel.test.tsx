/**
 * Settings → Appearance (SET-3, SET-4): theme names a person can read with the
 * ids a stored choice uses unchanged, a custom theme deleted only after a
 * confirm, swatches named in words, and the size select built from the scales
 * the app offers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../components";
import { NEO_DARK_EDITOR_COLORS, saveCustomTheme } from "../tokens/customThemes";
import { DEFAULT_SCALE, SCALE_OPTIONS, scaleOptionLabel } from "../tokens/scale";
import { resetKeyColoursForTests } from "../components/wheel/keyColourSetting";
import { resetRowDensityForTests } from "../tokens/rowDensity";
import { ScaleProvider } from "../tokens/ScaleContext";
import { ThemeProvider } from "../tokens/ThemeContext";
import { BUILT_IN_THEME_OPTIONS } from "../tokens/theme";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";

function renderPanel() {
  return render(
    <ThemeProvider>
      <ScaleProvider>
        <ToastProvider>
          <ThemeSettingsPanel />
        </ToastProvider>
      </ScaleProvider>
    </ThemeProvider>,
  );
}

const theme = () => screen.getByRole("combobox", { name: "Active theme" });
const size = () => screen.getByRole("combobox", { name: "Size of text and controls" });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.rowDensity;
  delete document.documentElement.dataset.keyColours;
  resetRowDensityForTests();
  resetKeyColoursForTests();
});

describe("theme names", () => {
  it("offers the five built-in themes by their new names, ids unchanged", () => {
    renderPanel();
    const options = within(theme()).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Neo dark",
      "Retro 16-bit",
      "Classic",
      "Club neon",
      "Muted",
    ]);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      "neoDark",
      "retro16",
      "qtEvolved",
      "clubNeon",
      "mutedPro",
    ]);
    expect(BUILT_IN_THEME_OPTIONS.map((o) => o.id)).toEqual([
      "neoDark",
      "retro16",
      "qtEvolved",
      "clubNeon",
      "mutedPro",
    ]);
  });

  it.each([
    ["qtEvolved", "Classic"],
    ["neoDark", "Neo dark"],
    ["clubNeon", "Club neon"],
    ["mutedPro", "Muted"],
  ])("a stored %s still applies and shows as %s", (id, label) => {
    localStorage.setItem("cuepoint-ui-lab-theme", id);
    renderPanel();
    expect(document.documentElement.dataset.theme).toBe(id);
    expect(theme()).toHaveValue(id);
    expect(within(theme()).getByRole("option", { name: label })).toHaveProperty("selected", true);
  });

  it("no longer carries a Themes badge", () => {
    renderPanel();
    expect(screen.queryByText("Themes")).toBeNull();
  });
});

describe("size of text and controls", () => {
  it("builds its options from the scales on offer, through one label", () => {
    renderPanel();
    const options = within(size()).getAllByRole("option");
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(SCALE_OPTIONS.map(String));
    expect(options.map((o) => o.textContent)).toEqual(SCALE_OPTIONS.map(scaleOptionLabel));
    expect(scaleOptionLabel(1.25)).toBe("Compact (1.25×)");
  });

  it("words the sizes, marking the default", () => {
    // " — default" goes on whichever size is the default, so this holds when it moves.
    const mark = (size: number) => (size === (DEFAULT_SCALE as number) ? " — default" : "");
    expect(scaleOptionLabel(1)).toBe(`Small (1×)${mark(1)}`);
    expect(scaleOptionLabel(1.5)).toBe(`Medium (1.5×)${mark(1.5)}`);
    expect(scaleOptionLabel(2)).toBe(`Large (2×)${mark(2)}`);
    expect(scaleOptionLabel(3)).toBe(`Extra large (3×)${mark(3)}`);
    expect(
      SCALE_OPTIONS.filter((o) => scaleOptionLabel(o).endsWith(" — default")),
    ).toEqual([DEFAULT_SCALE]);
  });

  it("has no line about lines snapping to whole pixels", () => {
    renderPanel();
    expect(screen.queryByText(/snap to whole pixels/)).toBeNull();
  });

  it("offers five sizes in order, with 1.5 selected by default", () => {
    renderPanel();
    const options = within(size()).getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((o) => o.textContent)).toEqual([
      "Small (1×)",
      "Compact (1.25×)",
      "Medium (1.5×) — default",
      "Large (2×)",
      "Extra large (3×)",
    ]);
    expect(size()).toHaveValue("1.5");
  });

  describe("on a screen too short for the big sizes (R2-5)", () => {
    afterEach(() => {
      Object.defineProperty(window.screen, "availHeight", { value: 0, configurable: true });
    });

    it("greys the sizes that are too big, gives the reason, and marks the suggested one", () => {
      Object.defineProperty(window.screen, "availHeight", { value: 768, configurable: true });
      renderPanel();
      const option = (name: RegExp) => within(size()).getByRole("option", { name }) as HTMLOptionElement;
      // 768 / 1.5 = 512 < 560, 768 / 1.25 = 614.
      expect(option(/^Small/).disabled).toBe(false);
      expect(option(/^Compact/).disabled).toBe(false);
      expect(option(/^Compact/).textContent).toContain("suggested for this screen");
      expect(option(/^Medium/).disabled).toBe(true);
      expect(option(/^Large/).disabled).toBe(true);
      expect(option(/^Extra large/).disabled).toBe(true);
      expect(screen.getByText(/Medium, Large and Extra large are too big for this screen/)).toBeInTheDocument();
    });

    it("never greys the size in use", () => {
      Object.defineProperty(window.screen, "availHeight", { value: 768, configurable: true });
      localStorage.setItem("cuepoint-ui-lab-scale", "2");
      renderPanel();
      const option = (name: RegExp) => within(size()).getByRole("option", { name }) as HTMLOptionElement;
      expect(size()).toHaveValue("2");
      expect(option(/^Large/).disabled).toBe(false);
      expect(option(/^Extra large/).disabled).toBe(true);
    });
  });

  it("sets --scale and data-scale to 1.5 when 1.5 is chosen", async () => {
    renderPanel();
    await userEvent.selectOptions(size(), "3");
    await userEvent.selectOptions(size(), "1.5");
    expect(document.documentElement.dataset.scale).toBe("1.5");
    expect(document.documentElement.style.getPropertyValue("--scale")).toBe("1.5");
  });

  it("changes the size", async () => {
    renderPanel();
    await userEvent.selectOptions(size(), "3");
    expect(document.documentElement.dataset.scale).toBe("3");
  });
});

describe("custom themes", () => {
  it("says what the empty list is for", () => {
    renderPanel();
    expect(
      screen.getByText("No custom themes yet. Pick nine colors; borders are made from them."),
    ).toBeInTheDocument();
  });

  it("draws the swatches as decoration: the theme's name is what names it", () => {
    saveCustomTheme({
      id: "mine",
      name: "Mine",
      colors: { ...NEO_DARK_EDITOR_COLORS },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { container } = renderPanel();
    const swatches = [...container.querySelectorAll(".theme-settings__swatch")];
    expect(swatches).toHaveLength(3);
    for (const swatch of swatches) {
      expect(swatch).toHaveAttribute("aria-hidden", "true");
      expect(swatch).not.toHaveAttribute("title");
    }
  });

  it("deletes only after the confirm", async () => {
    saveCustomTheme({
      id: "mine",
      name: "Mine",
      colors: { ...NEO_DARK_EDITOR_COLORS },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { container } = renderPanel();
    const listed = () => container.querySelector(".theme-settings__list");
    await userEvent.click(screen.getByRole("button", { name: "Delete…" }));
    const dialog = screen.getByRole("dialog", { name: "Delete theme?" });
    expect(within(dialog).getByText("The theme “Mine” will be gone. This cannot be undone.")).toBeInTheDocument();
    // Asked, not done: Cancel keeps it.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(listed()).toHaveTextContent("Mine");

    await userEvent.click(screen.getByRole("button", { name: "Delete…" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Delete theme?" })).getByRole("button", { name: "Delete theme" }),
    );
    expect(listed()).toBeNull();
    expect(
      screen.getByText("No custom themes yet. Pick nine colors; borders are made from them."),
    ).toBeInTheDocument();
  });
});

describe("Tables", () => {
  const density = () => screen.getByRole("combobox", { name: "Row density" });
  const keys = () => screen.getByRole("checkbox", { name: "Color keys" });

  it("is part of Appearance, and Reset Appearance puts it back, Undo restores it", async () => {
    renderPanel();
    await userEvent.selectOptions(density(), "roomy");
    await userEvent.click(keys());
    expect(document.documentElement.dataset.rowDensity).toBe("roomy");
    expect(document.documentElement.dataset.keyColours).toBe("off");

    await userEvent.click(screen.getByRole("button", { name: "Reset Appearance" }));
    expect(density()).toHaveValue("compact");
    expect(keys()).toBeChecked();
    expect(document.documentElement.dataset.rowDensity).toBeUndefined();
    expect(document.documentElement.dataset.keyColours).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(density()).toHaveValue("roomy");
    expect(keys()).not.toBeChecked();
  });
});
