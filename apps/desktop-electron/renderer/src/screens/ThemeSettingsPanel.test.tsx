/**
 * Settings → Appearance (SET-3, SET-4): theme names a person can read with the
 * ids a stored choice uses unchanged, a custom theme deleted only after a
 * confirm from its "..." menu, "In use" on the active one, the editor inline on
 * the page (M239-M241), and the size select built from the scales the app offers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../components";
import { NEO_DARK_EDITOR_COLORS, saveCustomTheme } from "../tokens/customThemes";
import { DEFAULT_SCALE, SCALE_OPTIONS, scaleOptionLabel } from "../tokens/scale";
import { resetKeyColoursForTests } from "../components/wheel/keyColourSetting";
import { resetKeyNotationForTests } from "../components/wheel/keyNotationSetting";
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

const theme = () => screen.getByRole("combobox", { name: "Theme" });
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
  delete document.documentElement.dataset.keyNotation;
  resetKeyColoursForTests();
  resetKeyNotationForTests();
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
    expect(scaleOptionLabel(1.25)).toBe("Small (1.25×)");
  });

  it("words the sizes, marking the default", () => {
    // " — default" goes on whichever size is the default, so this holds when it moves.
    const mark = (size: number) => (size === (DEFAULT_SCALE as number) ? " — default" : "");
    expect(scaleOptionLabel(1)).toBe(`Extra small (1×)${mark(1)}`);
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
      "Extra small (1×)",
      "Small (1.25×)",
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
      expect(option(/^Extra small/).disabled).toBe(false);
      expect(option(/^Small/).disabled).toBe(false);
      expect(option(/^Small/).textContent).toContain("suggested for this screen");
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

const MINE = {
  id: "mine",
  name: "Mine",
  colors: { ...NEO_DARK_EDITOR_COLORS },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("custom themes", () => {
  it("says what the empty list is for, in a few words (M440)", () => {
    renderPanel();
    expect(screen.getByText("No custom themes yet.")).toBeInTheDocument();
  });

  it("draws the swatches as decoration: the theme's name is what names it", () => {
    saveCustomTheme(MINE);
    const { container } = renderPanel();
    const swatches = [...container.querySelectorAll(".theme-settings__swatch")];
    expect(swatches).toHaveLength(3);
    for (const swatch of swatches) {
      expect(swatch).toHaveAttribute("aria-hidden", "true");
      expect(swatch).not.toHaveAttribute("title");
    }
  });

  it("marks the theme in use with a chip in place of Apply, and offers Apply on the others (M241)", async () => {
    saveCustomTheme(MINE);
    saveCustomTheme({ ...MINE, id: "other", name: "Other" });
    renderPanel();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByRole("button", { name: "Apply" })).toBeInTheDocument();
    await userEvent.click(within(rows[0]!).getByRole("button", { name: "Apply" }));
    expect(within(screen.getAllByRole("listitem")[0]!).getByText("In use")).toBeInTheDocument();
    expect(within(screen.getAllByRole("listitem")[0]!).queryByRole("button", { name: "Apply" })).toBeNull();
    expect(within(screen.getAllByRole("listitem")[1]!).getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("keeps Edit and Delete in a \"...\" menu, not as three framed buttons (M241)", async () => {
    saveCustomTheme(MINE);
    renderPanel();
    expect(screen.queryByRole("button", { name: "Delete…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit…" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More for Mine" }));
    const menu = screen.getByRole("menu", { name: "Mine actions" });
    expect(within(menu).getByRole("menuitem", { name: "Edit…" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Delete…" })).toBeInTheDocument();
  });

  it("deletes only after the confirm, titled with the theme's name (M451)", async () => {
    saveCustomTheme(MINE);
    const { container } = renderPanel();
    const listed = () => container.querySelector(".theme-settings__list");
    const openDelete = async () => {
      await userEvent.click(screen.getByRole("button", { name: "More for Mine" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    };
    await openDelete();
    const dialog = screen.getByRole("dialog", { name: "Delete \u201cMine\u201d?" });
    expect(within(dialog).getByText("This cannot be undone.")).toBeInTheDocument();
    // Asked, not done: Cancel keeps it.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(listed()).toHaveTextContent("Mine");

    await openDelete();
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Delete \u201cMine\u201d?" })).getByRole("button", { name: "Delete theme" }),
    );
    expect(listed()).toBeNull();
    expect(screen.getByText("No custom themes yet.")).toBeInTheDocument();
  });
});

describe("Tables", () => {
  const density = () => screen.getByRole("combobox", { name: "Row density" });
  const keys = () => screen.getByRole("checkbox", { name: "Color key chips" });
  const notation = () => screen.getByRole("combobox", { name: "Keys written as" });

  it("is part of Appearance, and Reset Appearance puts it back, Undo restores it", async () => {
    renderPanel();
    await userEvent.selectOptions(density(), "roomy");
    await userEvent.click(keys());
    await userEvent.selectOptions(notation(), "both");
    expect(document.documentElement.dataset.rowDensity).toBe("roomy");
    expect(document.documentElement.dataset.keyColours).toBe("off");
    expect(document.documentElement.dataset.keyNotation).toBe("both");

    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(density()).toHaveValue("compact");
    expect(keys()).toBeChecked();
    expect(document.documentElement.dataset.rowDensity).toBeUndefined();
    expect(document.documentElement.dataset.keyColours).toBeUndefined();
    expect(notation()).toHaveValue("camelot");
    expect(document.documentElement.dataset.keyNotation).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(density()).toHaveValue("roomy");
    expect(keys()).not.toBeChecked();
    expect(notation()).toHaveValue("both");
  });
});

describe("Create custom theme", () => {
  const editor = () => screen.getByRole("region", { name: "Create custom theme" });

  it("opens inline on the page, not in a dialog, so the preview is seen undimmed (M240)", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Create custom theme…" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editor()).toBeInTheDocument();
  });

  it("does not restyle the app when the editor opens, only once a color is changed", async () => {
    renderPanel();
    const before = document.documentElement.dataset.theme;
    await userEvent.click(screen.getByRole("button", { name: "Create custom theme…" }));
    expect(document.documentElement.dataset.theme).toBe(before);

    // The name is not a color.
    await userEvent.type(within(editor()).getByRole("textbox", { name: "Theme name" }), "Mine");
    expect(document.documentElement.dataset.theme).toBe(before);

    fireEvent.change(within(editor()).getByLabelText("Accent swatch"), { target: { value: "#ff0000" } });
    expect(document.documentElement.dataset.theme).toBe("custom:editor-preview");

    // Cancel puts the stored theme back.
    await userEvent.click(within(editor()).getByRole("button", { name: "Cancel" }));
    expect(document.documentElement.dataset.theme).not.toBe("custom:editor-preview");
    expect(screen.queryByRole("region", { name: "Create custom theme" })).toBeNull();
  });

  it("takes a typed or pasted hex beside the swatch, and says when it is not one (M41)", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Create custom theme…" }));
    const accent = within(editor()).getByRole("textbox", { name: "Accent" });
    await userEvent.clear(accent);
    await userEvent.type(accent, "#ff0000");
    expect(document.documentElement.dataset.theme).toBe("custom:editor-preview");
    expect(within(editor()).getByLabelText("Accent swatch")).toHaveValue("#ff0000");

    // A short code is widened on leaving the field, not while it is being typed.
    await userEvent.clear(accent);
    await userEvent.type(accent, "0f0");
    expect(accent).toHaveValue("0f0");
    await userEvent.tab();
    expect(accent).toHaveValue("#00ff00");
    expect(within(editor()).getByLabelText("Accent swatch")).toHaveValue("#00ff00");

    await userEvent.clear(accent);
    await userEvent.type(accent, "nope");
    await userEvent.tab();
    expect(within(editor()).getByText("Use six digits, like #1a1a2e")).toBeInTheDocument();
    expect(within(editor()).getByLabelText("Accent swatch")).toHaveValue("#00ff00");
  });

  it("follows the swatch into the hex field", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Create custom theme…" }));
    fireEvent.change(within(editor()).getByLabelText("Danger swatch"), { target: { value: "#123456" } });
    expect(within(editor()).getByRole("textbox", { name: "Danger" })).toHaveValue("#123456");
  });

  it("draws each color's name above its field and swatch", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Create custom theme…" }));
    const field = within(editor()).getByLabelText("Accent swatch").closest(".theme-color-field")!;
    expect(field.querySelector("label")).toHaveTextContent("Accent");
    expect(field.firstElementChild?.querySelector("label")).not.toBeNull();
  });

  it("saves a theme, and an existing one carries its own Delete theme\u2026 at the footer's far left (M250)", async () => {
    saveCustomTheme(MINE);
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "More for Mine" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit…" }));
    const region = screen.getByRole("region", { name: "Edit custom theme" });
    const footer = region.querySelector(".theme-editor__footer")!;
    expect(footer.firstElementChild).toHaveTextContent("Delete theme…");
    await userEvent.click(within(region).getByRole("button", { name: "Save theme" }));
    expect(screen.queryByRole("region", { name: "Edit custom theme" })).toBeNull();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
