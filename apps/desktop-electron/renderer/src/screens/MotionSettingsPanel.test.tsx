/**
 * Settings → Motion (SET-2): the system's Reduce motion line, Turn all on and
 * off, ten switches in three groups, a reset that asks and can be undone.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../components";
import { MOTION_KINDS, MOTION_STORAGE_KEY } from "../tokens/motion";
import { MotionProvider } from "../tokens/MotionContext";
import { MotionSettingsPanel } from "./MotionSettingsPanel";

function renderPanel() {
  return render(
    <MotionProvider>
      <ToastProvider>
        <MotionSettingsPanel />
      </ToastProvider>
    </MotionProvider>,
  );
}

const stored = () => JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY) ?? "{}");

beforeEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(window, "matchMedia");
});
afterEach(() => {
  localStorage.clear();
  for (const k of MOTION_KINDS) document.documentElement.removeAttribute(`data-motion-${k.id}`);
});

describe("the panel", () => {
  it("has ten switches, all on, each named by its plain label", () => {
    renderPanel();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(10);
    for (const kind of MOTION_KINDS) {
      expect(screen.getByRole("checkbox", { name: kind.label })).toBeChecked();
    }
  });

  it("groups them in three plain groups", () => {
    renderPanel();
    const group = (name: string) => screen.getByRole("group", { name });
    expect(within(group("When you act")).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(group("When things change")).getAllByRole("checkbox")).toHaveLength(5);
    expect(
      within(group("When things change")).getByRole("checkbox", { name: "Alerts and confirmations" }),
    ).toBeInTheDocument();
    expect(within(group("While you wait or scroll")).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("shows each switch's one-line description", () => {
    renderPanel();
    for (const kind of MOTION_KINDS) expect(screen.getByText(kind.description)).toBeInTheDocument();
  });

  it("says the system setting is off, with no reduced-motion note", () => {
    renderPanel();
    expect(screen.getByText(/Motion follows your system's Reduce motion setting: off/)).toBeInTheDocument();
    expect(screen.queryByText(/so nothing moves/)).not.toBeInTheDocument();
  });

  it("says the system setting is on, and that nothing moves", () => {
    window.matchMedia = (() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    renderPanel();
    expect(
      screen.getByText(/Motion follows your system's Reduce motion setting: on, so nothing moves/),
    ).toBeInTheDocument();
  });

  it("stores a change, shows Saved, and applies the attribute", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("checkbox", { name: "Hover and keyboard focus" }));
    expect(screen.getByRole("checkbox", { name: "Hover and keyboard focus" })).not.toBeChecked();
    expect(stored()).toEqual({ hover: false });
    expect(document.documentElement).not.toHaveAttribute("data-motion-hover");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("turns all off and all on", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Turn all off" }));
    expect(screen.getAllByRole("checkbox").every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    expect(Object.keys(stored())).toHaveLength(10);
    await userEvent.click(screen.getByRole("button", { name: "Turn all on" }));
    expect(screen.getAllByRole("checkbox").every((b) => (b as HTMLInputElement).checked)).toBe(true);
  });

  it("puts a preview beside each switch", () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll(".motion-settings__preview")).toHaveLength(10);
  });

  it("plays a preview only after its switch goes from off to on", async () => {
    const { container } = renderPanel();
    const preview = () => container.querySelector(".motion-settings__preview[data-kind='hover']");
    expect(preview()).not.toHaveAttribute("data-play");
    const box = screen.getByRole("checkbox", { name: "Hover and keyboard focus" });
    await userEvent.click(box);
    await userEvent.click(box);
    expect(preview()).toHaveAttribute("data-play");
  });
});

describe("Reset to defaults", () => {
  it("asks first, resets on confirm, and Undo puts the switches back", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Turn all off" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    // Asking changes nothing.
    expect(screen.getByRole("checkbox", { name: "Button presses" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getAllByRole("checkbox").every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByRole("checkbox").every((b) => !(b as HTMLInputElement).checked)).toBe(true);
  });

  it("changes nothing on Cancel", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Turn all off" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("checkbox", { name: "Button presses" })).not.toBeChecked();
  });
});
