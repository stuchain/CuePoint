/**
 * Settings → Motion (SET-2, K11, M435): one Follow system, On, Off or Custom choice, under Custom ten
 * switches in three groups, and a reset that acts at once, can be undone and is hidden at defaults.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../components";
import { MOTION_FOLLOW_SYSTEM_KEY, MOTION_KINDS, MOTION_STORAGE_KEY } from "../tokens/motion";
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
const mode = (name: "Follow system" | "On" | "Off" | "Custom") =>
  screen.getByRole("radio", { name: name === "Follow system" ? /^Follow system/ : name });
// Custom is what shows the list of kinds.
const openList = () => userEvent.click(mode("Custom"));
const kindBoxes = () => screen.queryAllByRole("checkbox");

function reduceSystemMotion() {
  window.matchMedia = (() => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(window, "matchMedia");
});
afterEach(() => {
  localStorage.clear();
  for (const k of MOTION_KINDS) document.documentElement.removeAttribute(`data-motion-${k.id}`);
});

describe("the Motion choice", () => {
  it("is one radio group of Follow system, On, Off and Custom, with Follow system chosen by default", () => {
    renderPanel();
    const group = screen.getByRole("group", { name: "Animations" });
    // M435, D23: "On" is its own choice beside Follow system.
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual([
      "system",
      "on",
      "off",
      "custom",
    ]);
    expect(mode("Follow system")).toBeChecked();
    expect(mode("Off")).not.toBeChecked();
    expect(mode("Custom")).not.toBeChecked();
  });

  it("has no Turn all on or Turn all off buttons any more", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Turn all on" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn all off" })).not.toBeInTheDocument();
  });

  it("Off turns every kind off, and On turns every kind back on", async () => {
    renderPanel();
    await userEvent.click(mode("Off"));
    expect(mode("Off")).toBeChecked();
    expect(Object.keys(stored())).toHaveLength(10);
    expect(Object.values(stored()).every((v) => v === false)).toBe(true);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    await openList();
    expect(kindBoxes().every((b) => !(b as HTMLInputElement).checked)).toBe(true);

    await userEvent.click(mode("Follow system"));
    expect(mode("Follow system")).toBeChecked();
    expect(Object.values(stored()).every((v) => v === true)).toBe(true);
    expect(kindBoxes().every((b) => (b as HTMLInputElement).checked)).toBe(true);
  });

  it("On applies every kind's attribute, and Off removes them", async () => {
    renderPanel();
    await userEvent.click(mode("Off"));
    expect(document.documentElement).not.toHaveAttribute("data-motion-hover");
    await userEvent.click(mode("Follow system"));
    for (const k of MOTION_KINDS) {
      expect(document.documentElement).toHaveAttribute(`data-motion-${k.id}`, "on");
    }
  });

  it("On still gives way to the system's Reduce motion (DEC-134)", async () => {
    reduceSystemMotion();
    renderPanel();
    await userEvent.click(mode("Off"));
    await userEvent.click(mode("Follow system"));
    expect(mode("Follow system")).toBeChecked();
    expect(document.documentElement).not.toHaveAttribute("data-motion-hover");
  });

  it("On moves every kind even while the system asks for less, and remembers it (M435)", async () => {
    reduceSystemMotion();
    renderPanel();
    expect(document.documentElement).not.toHaveAttribute("data-motion-hover");
    await userEvent.click(mode("On"));
    expect(mode("On")).toBeChecked();
    expect(mode("Follow system")).not.toBeChecked();
    expect(localStorage.getItem(MOTION_FOLLOW_SYSTEM_KEY)).toBe("false");
    for (const k of MOTION_KINDS) {
      expect(document.documentElement).toHaveAttribute(`data-motion-${k.id}`, "on");
    }
    expect(screen.getByText(/CuePoint moves anyway/)).toBeInTheDocument();
    // Follow system gives the system back its say.
    await userEvent.click(mode("Follow system"));
    expect(mode("Follow system")).toBeChecked();
    expect(localStorage.getItem(MOTION_FOLLOW_SYSTEM_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveAttribute("data-motion-hover");
  });

  it("is On on load when Follow system was turned off with every kind on", () => {
    localStorage.setItem(MOTION_FOLLOW_SYSTEM_KEY, "false");
    renderPanel();
    expect(mode("On")).toBeChecked();
  });

  it("Off keeps the Follow system flag, so Custom after it still gives way to the system", async () => {
    reduceSystemMotion();
    localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ page: false }));
    renderPanel();
    await userEvent.click(mode("Off"));
    await userEvent.click(mode("Custom"));
    expect(mode("Custom")).toBeChecked();
    expect(localStorage.getItem(MOTION_FOLLOW_SYSTEM_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveAttribute("data-motion-micro");
  });

  it("becomes Custom by itself when one kind is off", async () => {
    renderPanel();
    await openList();
    await userEvent.click(screen.getByRole("checkbox", { name: "Hover and keyboard focus" }));
    expect(mode("Custom")).toBeChecked();
    expect(mode("Follow system")).not.toBeChecked();
    expect(stored()).toEqual({ hover: false });
    // With that kind back on, every kind is on again, which is On.
    await userEvent.click(screen.getByRole("checkbox", { name: "Hover and keyboard focus" }));
    expect(mode("Follow system")).toBeChecked();
  });

  it("is Custom on load when the stored kinds differ", () => {
    localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ page: false }));
    renderPanel();
    expect(mode("Custom")).toBeChecked();
  });

  it("is Off on load when every stored kind is off", () => {
    localStorage.setItem(
      MOTION_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(MOTION_KINDS.map((k) => [k.id, false]))),
    );
    renderPanel();
    expect(mode("Off")).toBeChecked();
  });

  it("changes nothing when Custom alone is chosen, and shows the list", async () => {
    renderPanel();
    await userEvent.click(mode("Custom"));
    expect(mode("Custom")).toBeChecked();
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    for (const k of MOTION_KINDS) {
      expect(document.documentElement).toHaveAttribute(`data-motion-${k.id}`, "on");
    }
    expect(kindBoxes()).toHaveLength(10);
    // Choosing On or Off leaves Custom again.
    await userEvent.click(mode("Follow system"));
    expect(mode("Follow system")).toBeChecked();
  });
});

describe("Custom", () => {
  it("lets the switches decide once a kind changes, so putting it back is On", async () => {
    renderPanel();
    await userEvent.click(mode("Custom"));
    const box = screen.getByRole("checkbox", { name: "Hover and keyboard focus" });
    await userEvent.click(box);
    expect(mode("Custom")).toBeChecked();
    await userEvent.click(box);
    expect(mode("Follow system")).toBeChecked();
    expect(mode("Custom")).not.toBeChecked();
  });

  it("brings back the hand-made set when chosen again after On or Off", async () => {
    localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ page: false, hover: false }));
    renderPanel();
    await userEvent.click(mode("Off"));
    expect(mode("Off")).toBeChecked();
    await userEvent.click(mode("Custom"));
    expect(mode("Custom")).toBeChecked();
    expect(stored()).toMatchObject({ page: false, hover: false, micro: true, state: true });
    expect(document.documentElement).not.toHaveAttribute("data-motion-page");
    expect(document.documentElement).toHaveAttribute("data-motion-micro", "on");
    await userEvent.click(mode("Follow system"));
    await userEvent.click(mode("Custom"));
    expect(screen.getByRole("checkbox", { name: "Changing page" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Button presses" })).toBeChecked();
  });

  it("names the radio group Animations, not Motion again (the card title)", () => {
    renderPanel();
    expect(screen.getByRole("group", { name: "Animations" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Motion" })).toBeNull();
  });

  it("says what the system is doing in the choice itself", () => {
    reduceSystemMotion();
    renderPanel();
    expect(screen.getByRole("radio", { name: "Follow system (now: reduced)" })).toBeChecked();
  });
});

describe("the per-kind list", () => {
  it("is hidden until Custom is chosen, with no Choose each kind button", async () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /Choose each kind/ })).toBeNull();
    expect(kindBoxes()).toHaveLength(0);
    await openList();
    expect(kindBoxes()).toHaveLength(10);
  });

  it("opens by itself when Custom is the state on load", () => {
    localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ page: false }));
    renderPanel();
    expect(kindBoxes()).toHaveLength(10);
  });

  it("has ten switches, each named by its plain label, all on", async () => {
    renderPanel();
    await openList();
    for (const kind of MOTION_KINDS) {
      expect(screen.getByRole("checkbox", { name: kind.label })).toBeChecked();
    }
  });

  it("groups them in three plain groups", async () => {
    renderPanel();
    await openList();
    const group = (name: string) => screen.getByRole("group", { name });
    expect(within(group("When you act")).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(group("When things change")).getAllByRole("checkbox")).toHaveLength(5);
    expect(
      within(group("When things change")).getByRole("checkbox", { name: "Alerts and confirmations" }),
    ).toBeInTheDocument();
    expect(within(group("While you wait or scroll")).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("shows each switch's one-line description", async () => {
    renderPanel();
    await openList();
    for (const kind of MOTION_KINDS) expect(screen.getByText(kind.description)).toBeInTheDocument();
  });

  it("stores a change, shows Saved, and applies the attribute", async () => {
    renderPanel();
    await openList();
    await userEvent.click(screen.getByRole("checkbox", { name: "Hover and keyboard focus" }));
    expect(screen.getByRole("checkbox", { name: "Hover and keyboard focus" })).not.toBeChecked();
    expect(stored()).toEqual({ hover: false });
    expect(document.documentElement).not.toHaveAttribute("data-motion-hover");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("puts a preview beside each switch", async () => {
    const { container } = renderPanel();
    await openList();
    expect(container.querySelectorAll(".motion-settings__preview")).toHaveLength(10);
  });

  it("plays a preview only after its switch goes from off to on", async () => {
    const { container } = renderPanel();
    await openList();
    const preview = () => container.querySelector(".motion-settings__preview[data-kind='hover']");
    expect(preview()).not.toHaveAttribute("data-play");
    const box = screen.getByRole("checkbox", { name: "Hover and keyboard focus" });
    await userEvent.click(box);
    await userEvent.click(box);
    expect(preview()).toHaveAttribute("data-play");
  });
});

describe("the system line", () => {
  it("says the system allows animations", () => {
    renderPanel();
    expect(screen.getByText("Your system allows animations.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Follow system (now: full)" })).toBeChecked();
  });

  it("says the system is reducing them, in plain words with no OS-specific setting name", () => {
    reduceSystemMotion();
    renderPanel();
    expect(screen.getByText(/Your system is set to reduce animations, so CuePoint keeps still/)).toBeInTheDocument();
    expect(screen.queryByText(/Reduce motion/)).toBeNull();
  });
});

describe("Reset to defaults", () => {
  it("is not drawn while every kind is at its default (M436)", async () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Reset to defaults" })).toBeNull();
    await userEvent.click(mode("Off"));
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeInTheDocument();
  });

  it("resets at once, with no question, and Undo puts the switches back", async () => {
    renderPanel();
    await userEvent.click(mode("Off"));
    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mode("Follow system")).toBeChecked();
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    expect(screen.getByText("Motion reset")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mode("Off")).toBeChecked();
  });
  it("is drawn after On, and puts Follow system back (M435)", async () => {
    renderPanel();
    await userEvent.click(mode("On"));
    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(mode("Follow system")).toBeChecked();
    expect(localStorage.getItem(MOTION_FOLLOW_SYSTEM_KEY)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mode("On")).toBeChecked();
  });
});
