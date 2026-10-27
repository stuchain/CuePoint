/**
 * The Camelot wheel (PAGES-10, DEC-133, DEC-157, DEC-160).
 *
 * The button in the header opens a dialog drawing the 24 keys. The track it lights
 * is the selected one, else the playing one; from the player bar's key, the playing
 * one. What mixes with a key is the engine's answer (`getCompatibleKeys`), so these
 * tests give it and check what is drawn, said and navigated to.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { CompatibleKeys, PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { libraryOpening } from "../../screens/library/libraryLink";
import { cleanMatchOpening } from "../../screens/clean/cleanLink";
import { setSelectedTrack } from "../shell/selectedTrack";
import { EMPTY_AUDIO_STATE } from "../player/playerFormat";
import { resetPlayerStore } from "../player/playerStore";
import { declarations, parseRules, stripComments } from "../../test/cssRules";
import { CamelotWheel } from "./CamelotWheel";
import wheelCss from "./CamelotWheel.css?raw";
import keysCss from "../../screens/keys/keys.css?raw";
import { saveKeyColours } from "./keyColourSetting";
import { resetKeyNotationForTests, saveKeyNotation } from "./keyNotationSetting";
import { WheelButton } from "./WheelButton";
import { WheelPopoverHost } from "./WheelPopoverHost";
import { closeWheel, openWheel, toggleWheel } from "./wheelStore";

function wheelFor(code: string): CompatibleKeys {
  const number = Number(code.slice(0, -1));
  const letter = code.slice(-1);
  const other = letter === "A" ? "B" : "A";
  return {
    key: code,
    wheel: [
      { code, relation: "same" },
      { code: `${(number % 12) + 1}${letter}`, relation: "adjacent" },
      { code: `${((number + 10) % 12) + 1}${letter}`, relation: "adjacent" },
      { code: `${number}${other}`, relation: "relative" },
    ],
  };
}

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 5,
    filePath: "/music/strobe.flac",
    title: "Strobe",
    artist: "deadmau5",
    key: "8A",
    bpm: 128,
    durationSeconds: 600,
    status: "playing",
    ...overrides,
  };
}

function playerSnapshot(current: QueueItem | null): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: current !== null,
      paused: false,
      positionSeconds: 1,
      durationSeconds: 600,
      volume: 80,
      muted: false,
    },
    queue: {
      length: current ? 1 : 0,
      currentId: current?.id ?? null,
      currentIndex: current ? 0 : -1,
      currentItem: current,
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  } as PlayerSnapshot;
}

interface Bridge {
  getCompatibleKeys: ReturnType<typeof vi.fn>;
  getLibraryFacet: ReturnType<typeof vi.fn>;
  getLibraryTrack: ReturnType<typeof vi.fn>;
}

function install(options: { playing?: QueueItem | null; hasKeys?: boolean } = {}): Bridge {
  const state = playerSnapshot(options.playing ?? null);
  const bridge: Bridge = {
    getCompatibleKeys: vi.fn((params: { key: string }) => Promise.resolve(wheelFor(params.key))),
    getLibraryFacet: vi.fn().mockResolvedValue({
      field: "key",
      values:
        options.hasKeys === false
          ? [{ value: null, count: 4 }]
          : [
              { value: "8A", count: 2 },
              { value: null, count: 1 },
            ],
      truncated: false,
      total_values: 2,
      range: null,
    }),
    getLibraryTrack: vi.fn().mockResolvedValue({ track: { id: 9, title: "Ghosts" } }),
  };
  window.cuepoint = {
    ...bridge,
    player: {
      getState: vi.fn().mockResolvedValue(state),
      subscribeState: vi.fn((onState: (next: PlayerSnapshot) => void) => {
        onState(state);
        return vi.fn();
      }),
    },
  } as unknown as typeof window.cuepoint;
  return bridge;
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
}

let lastLocation: ReturnType<typeof useLocation> | null = null;
function Capture() {
  lastLocation = useLocation();
  return null;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <Capture />
      <Where />
      <Routes>
        <Route path="*" element={<WheelButton />} />
      </Routes>
      <WheelPopoverHost />
    </MemoryRouter>,
  );
}

const dialog = () => screen.getByRole("dialog", { name: "Camelot wheel" });
const segment = (code: string) => within(dialog()).getByRole("button", { name: new RegExp(`^${code},`) });
const litCodes = () =>
  within(dialog())
    .getAllByRole("button")
    .filter((button) => button.hasAttribute("data-lit"))
    .map((button) => button.getAttribute("data-key"))
    .sort();

async function openFromHeader() {
  await userEvent.click(screen.getByRole("button", { name: "Camelot wheel" }));
  await screen.findByRole("dialog", { name: "Camelot wheel" });
}

beforeEach(() => {
  resetPlayerStore();
  lastLocation = null;
});

afterEach(() => {
  act(() => {
    setSelectedTrack(null);
    closeWheel();
  });
  resetPlayerStore();
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the Track details button (K8)", () => {
  it("opens a dialog of 24 keys, each a button named with its place", async () => {
    install();
    mount();
    const button = screen.getByRole("button", { name: "Camelot wheel" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await openFromHeader();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(dialog().querySelectorAll("button[data-key]")).toHaveLength(24);
    expect(segment("8A")).toHaveAccessibleName("8A, A minor");
  });

  it("draws the popover in the body, fixed, so a scrolling panel cannot clip it", async () => {
    install();
    const { container } = mount();
    await openFromHeader();
    expect(container.contains(dialog())).toBe(false);
    expect(dialog().parentElement).toBe(document.body);
    expect(dialog().style.top).not.toBe("");
    expect(dialog().style.left).not.toBe("");
  });

  it("opens from the player bar's key with no Track details button mounted, just above that key, not in the window's corner", async () => {
    install({ playing: item({ title: "Strobe", key: "8A" }) });
    render(
      <MemoryRouter>
        <button type="button" data-wheel-opener="" onClick={() => toggleWheel("player")}>
          player key
        </button>
        <WheelPopoverHost />
      </MemoryRouter>,
    );
    const opener = screen.getByRole("button", { name: "player key" });
    // The foot of the window, where the player bar's key is.
    opener.getBoundingClientRect = () => ({ left: 300, top: 700, right: 330, bottom: 720, width: 30, height: 20, x: 300, y: 700, toJSON() {} });

    await userEvent.click(opener);

    expect(await screen.findByRole("dialog", { name: "Camelot wheel" })).toBeInTheDocument();
    // Regression: it opened at the window's top left, over the logo. Now it ends just above the key
    // (jsdom lays nothing out, so it is 0 high) and starts level with the key's left edge.
    expect(dialog().style.top).toBe("692px");
    expect(dialog().style.left).toBe("300px");
    expect(within(dialog()).getByText("Playing: Strobe · 8A")).toBeInTheDocument();
  });

  it("follows its opener when something scrolls", async () => {
    install();
    mount();
    const button = screen.getByRole("button", { name: "Camelot wheel" });
    let top = 100;
    button.getBoundingClientRect = () => ({ left: 900, top, right: 930, bottom: top + 20, width: 30, height: 20, x: 900, y: top, toJSON() {} });
    await openFromHeader();
    // Beside the key, level with its top.
    expect(dialog().style.top).toBe("100px");

    top = 60;
    fireEvent.scroll(document.body);

    expect(dialog().style.top).toBe("60px");
  });

  it("closes with Escape, an outside click and the button, and gives focus back", async () => {
    install();
    mount();
    await openFromHeader();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Camelot wheel" })).toHaveFocus();

    await openFromHeader();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();

    await openFromHeader();
    await userEvent.click(screen.getByRole("button", { name: "Camelot wheel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("which track it lights", () => {
  it("lights the selected track's key and the keys the engine says mix with it", async () => {
    const bridge = install({ playing: item({ key: "3B" }) });
    mount();
    act(() => setSelectedTrack({ id: 5, key: "8A", title: "Strobe" }));
    await openFromHeader();
    await waitFor(() => expect(litCodes()).toEqual(["7A", "8A", "8B", "9A"]));
    expect(bridge.getCompatibleKeys).toHaveBeenCalledWith({ key: "8A" });
    expect(segment("9A")).toHaveAccessibleName("9A, E minor, compatible");
    expect(segment("8A")).toHaveAttribute("aria-current", "true");
    expect(segment("3B")).not.toHaveAttribute("data-lit");
    expect(within(dialog()).getByText("Selected: Strobe · 8A")).toBeInTheDocument();
  });

  it("writes the caption and the centre in the chosen notation, leaving the names alone (K1)", async () => {
    saveKeyNotation("both");
    try {
      install();
      mount();
      act(() => setSelectedTrack({ id: 5, key: "8A", title: "Strobe" }));
      await openFromHeader();
      await waitFor(() => expect(litCodes()).toContain("8A"));
      expect(within(dialog()).getByText("Selected: Strobe · 8A · Am")).toBeInTheDocument();
      expect(dialog().querySelector(".cp-wheel__center")).toHaveTextContent("8AAm");
      expect(segment("8A")).toHaveAccessibleName("8A, A minor, this track's key");
    } finally {
      localStorage.clear();
      delete document.documentElement.dataset.keyNotation;
      resetKeyNotationForTests();
    }
  });

  it("names the track's own key apart from the keys that mix with it", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: 5, key: "8A", title: "Strobe" }));
    await openFromHeader();
    await waitFor(() => expect(litCodes()).toContain("8A"));
    expect(segment("8A")).toHaveAccessibleName("8A, A minor, this track's key");
  });

  it("keeps a key's lit state when it has focus", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: 5, key: "8A", title: "Strobe" }));
    await openFromHeader();
    await waitFor(() => expect(litCodes()).toEqual(["7A", "8A", "8B", "9A"]));
    act(() => segment("9A").focus());
    expect(segment("9A")).toHaveFocus();
    expect(segment("9A")).toHaveAttribute("data-lit", "adjacent");
    expect(segment("8A")).toHaveAttribute("data-lit", "same");
    expect(litCodes()).toEqual(["7A", "8A", "8B", "9A"]);
    // The focus is a ring round the wedge; the wedge keeps its compatible fill.
    expect(dialog().querySelector('[data-shape="9A"]')).toHaveAttribute("data-lit", "adjacent");
    expect(dialog().querySelector('[data-mark="focus"]')).not.toBeNull();
    expect(dialog().querySelector(".cp-wheel__key[data-key='9A'] + .cp-wheel__label")).not.toHaveAttribute("style", expect.stringContaining("background"));
  });

  it("still names an untitled selected track", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: "bp-5", key: "8A" }));
    await openFromHeader();
    expect(await within(dialog()).findByText("Selected: this track · 8A")).toBeInTheDocument();
  });

  it("falls back to the playing track when nothing is selected", async () => {
    install({ playing: item({ title: "Ghosts", key: "9A" }) });
    mount();
    await openFromHeader();
    await waitFor(() => expect(litCodes()).toContain("9A"));
    expect(within(dialog()).getByText("Playing: Ghosts · 9A")).toBeInTheDocument();
  });

  it("lets a selected track with no Beatport key win over a keyed playing one (DEC-157)", async () => {
    install({ playing: item({ key: "8A" }) });
    mount();
    act(() => setSelectedTrack({ id: 7, key: null, title: "Rej" }));
    await openFromHeader();
    expect(within(dialog()).getByText("This track has no Beatport key yet")).toBeInTheDocument();
    expect(litCodes()).toEqual([]);
    expect(screen.getByRole("button", { name: "Match on Beatport" })).toBeInTheDocument();
  });

  it("opens Clean on the track from Match on Beatport, and closes the wheel", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: 7, key: null, title: "Rej" }));
    await openFromHeader();
    await userEvent.click(screen.getByRole("button", { name: "Match on Beatport" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/clean");
    expect(cleanMatchOpening(lastLocation!)).toMatchObject({ tracks: { ids: [7] } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens Clean's matching for a Beatport row, which has no library id", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: "bp-99", key: null }));
    await openFromHeader();
    await userEvent.click(screen.getByRole("button", { name: "Match on Beatport" }));
    expect(cleanMatchOpening(lastLocation!)).toMatchObject({ tracks: null });
  });

  it("says to select or play when there is no track, and lights nothing", async () => {
    install();
    mount();
    await openFromHeader();
    expect(
      await within(dialog()).findByText("Select or play a track to light its key"),
    ).toBeInTheDocument();
    expect(litCodes()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Match on Beatport" })).toBeNull();
  });

  it("keeps the keys clickable when there is no track", async () => {
    install();
    mount();
    await openFromHeader();
    await userEvent.click(segment("4B"));
    expect(screen.getByTestId("where")).toHaveTextContent("/library");
  });

  it("names the playing track's key from the player bar's opener, whatever is selected", async () => {
    install({ playing: item({ title: "Strobe", key: "8A" }) });
    mount();
    act(() => setSelectedTrack({ id: 7, key: "3B", title: "Other" }));
    act(() => openWheel("player"));
    await screen.findByRole("dialog", { name: "Camelot wheel" });
    await waitFor(() => expect(litCodes()).toEqual(["7A", "8A", "8B", "9A"]));
    expect(within(dialog()).getByText("Playing: Strobe · 8A")).toBeInTheDocument();
  });

  it("looks the title up for a library track that did not bring one", async () => {
    const bridge = install();
    mount();
    act(() => setSelectedTrack({ id: 9, key: "8A" }));
    await openFromHeader();
    await waitFor(() => expect(bridge.getLibraryTrack).toHaveBeenCalledWith({ trackId: 9 }));
    expect(await within(dialog()).findByText("Selected: Ghosts · 8A")).toBeInTheDocument();
  });

  it("follows the selection while open", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: 5, key: "8A", title: "A" }));
    await openFromHeader();
    await waitFor(() => expect(litCodes()).toContain("8A"));
    act(() => setSelectedTrack({ id: 6, key: "2B", title: "B" }));
    await waitFor(() => expect(litCodes()).toEqual(["1B", "2A", "2B", "3B"]));
  });

  it("does not light a key the engine could not answer for, but still marks the track's own", async () => {
    const bridge = install();
    bridge.getCompatibleKeys.mockRejectedValue(new Error("down"));
    mount();
    act(() => setSelectedTrack({ id: 5, key: "8A", title: "A" }));
    await openFromHeader();
    await waitFor(() => expect(litCodes()).toEqual(["8A"]));
  });
});

describe("clicking a key (DEC-160)", () => {
  it("opens the whole Library on one rule, Key is 9A, and closes the wheel", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: 5, key: "8A", title: "A" }));
    await openFromHeader();
    await userEvent.click(segment("9A"));
    expect(screen.getByTestId("where")).toHaveTextContent("/library");
    expect(libraryOpening(lastLocation!)?.rules).toEqual({
      match: "all",
      rules: [{ field: "key", operator: "is", value: "9A" }],
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says in every key's hint what a click does", async () => {
    install();
    mount();
    await openFromHeader();
    expect(segment("9A")).toHaveAttribute("data-hint", "9A: show every 9A track in the Library");
    expect(segment("12B")).toHaveAttribute("data-hint", "12B: show every 12B track in the Library");
  });
});

describe("the keyboard", () => {
  it("moves round the ring with the arrows, between rings with up and down, and filters with Enter", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: 5, key: "8A", title: "A" }));
    await openFromHeader();
    await waitFor(() => expect(litCodes()).toContain("8A"));

    // Focus starts on the track's own key.
    await waitFor(() => expect(segment("8A")).toHaveFocus());
    await userEvent.keyboard("{ArrowRight}");
    expect(segment("9A")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(segment("7A")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(segment("7B")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(segment("7A")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(libraryOpening(lastLocation!)?.rules.rules[0]).toMatchObject({ value: "7A" });
  });

  it("is one tab stop: only the focused key is in the tab order", async () => {
    install();
    mount();
    await openFromHeader();
    const stops = within(dialog())
      .getAllByRole("button")
      .filter((button) => button.getAttribute("data-key") && button.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });

  it("wraps from 12 to 1", async () => {
    install();
    mount();
    act(() => setSelectedTrack({ id: 5, key: "12A", title: "A" }));
    await openFromHeader();
    await waitFor(() => expect(segment("12A")).toHaveFocus());
    await userEvent.keyboard("{ArrowRight}");
    expect(segment("1A")).toHaveFocus();
  });
});


describe("the wheel in counts mode (PAGES-16)", () => {
  const counts = new Map([
    ["8A", 12],
    ["9A", 3],
    ["11B", 1234],
  ]);

  function drawn(props: Partial<React.ComponentProps<typeof CamelotWheel>> = {}) {
    const onPick = vi.fn();
    render(
      <CamelotWheel
        lit={new Map()}
        focusCode="8A"
        onFocusCode={() => undefined}
        onPick={onPick}
        counts={counts}
        {...props}
      />,
    );
    return onPick;
  }

  it("writes each key's count on its segment, and 0 where there are none", () => {
    drawn();
    const label = (code: string) => document.querySelector(`[data-label-for="${code}"]`)!;
    expect(label("8A")).toHaveTextContent("8A12");
    expect(label("9A")).toHaveTextContent("9A3");
    expect(label("1A")).toHaveTextContent("1A0");
    // Short enough for a wedge; the list beside it writes the whole number.
    expect(label("11B")).toHaveTextContent("11B1.2k");
  });

  it("sets the count smaller than the key name (C21)", () => {
    const size = (selector: string) => {
      const rule = parseRules(stripComments(wheelCss)).find((r) => r.selector === selector)!;
      return declarations(rule.body).find(([name]) => name === "font-size")![1];
    };
    // "round(<mode>, calc(var(--font-size-xs) * a / b), 1px)" at font-xs = 10px * scale.
    const pixels = (selector: string, scale: number) => {
      const match = /^round\((nearest|down), calc\(var\(--font-size-xs\) \* (\d+) \/ (\d+)\), 1px\)$/.exec(
        size(selector),
      )!;
      expect(match).not.toBeNull();
      const value = (10 * scale * Number(match[2])) / Number(match[3]);
      return match[1] === "down" ? Math.floor(value) : Math.round(value);
    };
    const scales = [1, 1.25, 1.5, 2, 3];
    const labels = scales.map((scale) => pixels(".cp-wheel__label", scale));
    const countSizes = scales.map((scale) => pixels(".cp-wheel__count", scale));
    expect(labels).toEqual([9, 12, 14, 19, 28]);
    expect(countSizes).toEqual([8, 10, 13, 17, 26]);
    labels.forEach((label, index) => expect(countSizes[index]).toBeLessThan(label));
  });

  it("is darker where there are more, by level on the shape", () => {
    drawn();
    const level = (code: string) =>
      document.querySelector(`[data-shape="${code}"]`)!.getAttribute("data-level");
    expect(level("1A")).toBeNull();
    expect(Number(level("11B"))).toBeGreaterThan(Number(level("8A")));
    expect(Number(level("8A"))).toBeGreaterThanOrEqual(Number(level("9A")));
  });

  it("says the count in each key's name, not on hover alone", () => {
    drawn();
    expect(screen.getByRole("button", { name: /^8A, A minor, 12 tracks$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^9A, .*, 3 tracks$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^1A, .*, no tracks$/ })).toBeInTheDocument();
  });

  it("marks the chosen keys in the drawing and to assistive technology", () => {
    drawn({ chosen: new Set(["8A", "11B"]) });
    expect(document.querySelector('[data-shape="8A"]')).toHaveAttribute("data-chosen", "true");
    expect(document.querySelector('[data-shape="9A"]')).not.toHaveAttribute("data-chosen");
    expect(screen.getByRole("button", { name: /^8A,.*12 tracks, chosen$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^9A,/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("still lights the keys that mix, over the counts", () => {
    drawn({ lit: new Map([["9A", "adjacent" as const]]) });
    expect(document.querySelector('[data-shape="9A"]')).toHaveAttribute("data-lit", "adjacent");
    expect(screen.getByRole("button", { name: /^9A,.*3 tracks, mixes$/ })).toBeInTheDocument();
  });

  it("hands the click's Ctrl, Command and Shift to the page", () => {
    const onPick = drawn();
    fireEvent.click(screen.getByRole("button", { name: /^8A,/ }));
    expect(onPick).toHaveBeenLastCalledWith("8A", { ctrlKey: false, metaKey: false, shiftKey: false });
    fireEvent.click(screen.getByRole("button", { name: /^9A,/ }), { ctrlKey: true });
    expect(onPick).toHaveBeenLastCalledWith("9A", { ctrlKey: true, metaKey: false, shiftKey: false });
    fireEvent.click(screen.getByRole("button", { name: /^11B,/ }), { shiftKey: true });
    expect(onPick).toHaveBeenLastCalledWith("11B", { ctrlKey: false, metaKey: false, shiftKey: true });
  });

  it("leaves the header's wheel as it was: no counts, the old names and hints", () => {
    render(<CamelotWheel lit={new Map()} focusCode="8A" onFocusCode={() => undefined} onPick={() => undefined} />);
    expect(screen.getByRole("button", { name: "8A, A minor" })).toBeInTheDocument();
    expect(document.querySelector('[data-label-for="8A"]')).toHaveTextContent(/^8A$/);
    expect(document.querySelector('[data-shape="8A"]')).not.toHaveAttribute("data-level");
  });

  it("colours the wedges in their key colours with Color keys on, and not with it off", () => {
    const wheel = () => document.querySelector(".cp-wheel");
    const props = { lit: new Map(), focusCode: "8A", onFocusCode: () => undefined, onPick: () => undefined };
    const { unmount } = render(<CamelotWheel {...props} counts={new Map([["8A", 5]])} />);
    expect(wheel()).toHaveClass("cp-wheel--coloured", "cp-wheel--counts");
    unmount();
    render(<CamelotWheel {...props} />);
    expect(wheel()).toHaveClass("cp-wheel--coloured", "cp-wheel--keys");
  });

  it("is violet on both wheels with Color keys off", () => {
    saveKeyColours(false);
    try {
      const props = { lit: new Map(), focusCode: "8A", onFocusCode: () => undefined, onPick: () => undefined };
      const { unmount } = render(<CamelotWheel {...props} counts={new Map([["8A", 5]])} />);
      expect(document.querySelector(".cp-wheel")).not.toHaveClass("cp-wheel--coloured");
      unmount();
      render(<CamelotWheel {...props} />);
      expect(document.querySelector(".cp-wheel")).not.toHaveClass("cp-wheel--coloured");
    } finally {
      saveKeyColours(true);
    }
  });

  it("sizes a cell from the text size: round(nearest, 6px * scale, 1px), at most 9px * scale (D12)", () => {
    const cell = /--keys-cell:\s*([^;]+);/.exec(parseRules(stripComments(keysCss)).find((r) => r.selector === ".keys-page")!.body)![1]!;
    expect(cell).toBe(
      "min(round(nearest, calc(6px * var(--scale)), 1px), calc(9px * var(--scale)))",
    );
    // Never from the window's width.
    expect(cell).not.toMatch(/cqi|vw|%/);
    // At each text size that is a whole pixel count (the 9 * scale cap is a ceiling the rounding never reaches).
    const px = [1, 1.25, 1.5, 2, 3].map((scale) => Math.min(Math.round(6 * scale), 9 * scale));
    expect(px).toEqual([6, 8, 9, 12, 18]);
    expect(px.every(Number.isInteger)).toBe(true);
  });

  it("lights the compatible keys without the key colours as a violet tint, with no green", () => {
    saveKeyColours(false);
    try {
      render(
        <CamelotWheel
          lit={new Map([["9A", "adjacent" as const]])}
          focusCode="8A"
          onFocusCode={() => undefined}
          onPick={() => undefined}
          counts={counts}
        />,
      );
      expect(document.querySelector(".cp-wheel")).not.toHaveClass("cp-wheel--coloured");
      expect(document.querySelector('[data-shape="9A"]')).toHaveAttribute("data-lit", "adjacent");
    } finally {
      saveKeyColours(true);
    }
  });

  it("cuts each key's button to its smooth wedge", () => {
    render(<CamelotWheel lit={new Map()} focusCode="8A" onFocusCode={() => undefined} onPick={() => undefined} />);
    const buttons = document.querySelectorAll<HTMLElement>("[data-key]");
    expect(buttons).toHaveLength(24);
    for (const button of buttons) {
      const code = button.getAttribute("data-key")!;
      const clip = button.style.clipPath;
      expect(clip, code).toMatch(/^polygon\(/);
      expect(clip.split(",").length, code).toBeGreaterThanOrEqual(30);
      expect(document.querySelector(`[data-shape="${code}"]`)?.getAttribute("d"), code).toContain(" A");
    }
  });
});

describe("the wheel with Keys written as (K1 to K3)", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.keyNotation;
    resetKeyNotationForTests();
  });

  const draw = (center?: string) =>
    render(
      <CamelotWheel
        lit={new Map()}
        focusCode="8A"
        onFocusCode={() => undefined}
        onPick={() => undefined}
        center={center}
      />,
    );
  const label = (container: HTMLElement, code: string) =>
    container.querySelector<HTMLElement>(`[data-label-for="${code}"]`)!;

  it("labels the wedges with the code in Camelot", () => {
    const { container } = draw();
    expect(container.querySelector(".cp-wheel")).toHaveAttribute("data-notation", "camelot");
    expect(label(container, "8A")).toHaveTextContent("8A");
    expect(label(container, "8A").querySelector(".cp-wheel__musical")).toBeNull();
  });

  it("labels the wedges with the musical name in Musical, and names the key the same", () => {
    saveKeyNotation("musical");
    const { container } = draw();
    expect(label(container, "8A")).toHaveTextContent(/^Am$/);
    expect(label(container, "5B")).toHaveTextContent(/^E♭$/);
    expect(container.querySelector('[data-key="8A"]')).toHaveAttribute("aria-label", "8A, A minor");
  });

  it("writes the code and a small musical line under it in Both", () => {
    saveKeyNotation("both");
    const { container } = draw();
    expect(container.querySelector(".cp-wheel")).toHaveAttribute("data-notation", "both");
    expect(label(container, "8A")).toHaveTextContent("8AAm");
    expect(label(container, "8A").querySelector(".cp-wheel__musical")).toHaveTextContent("Am");
    expect(label(container, "12B").querySelector(".cp-wheel__musical")).toHaveTextContent("E");
  });

  it("styles the Both label as a column and the name at 80% of the code", () => {
    expect(wheelCss).toMatch(/\.cp-wheel\[data-notation="both"\] \.cp-wheel__label \{[^}]*flex-direction: column;/);
    expect(wheelCss).toMatch(/\.cp-wheel__musical \{[^}]*\* 0\.8\)/);
  });
});

describe("D6 B: the wheel stays smooth, its labels are the pixel face (M35)", () => {
  const rule = (selector: string) => parseRules(stripComments(wheelCss)).find((r) => r.selector === selector)!;
  const decl = (selector: string, name: string) => declarations(rule(selector).body).find(([n]) => n === name)?.[1];

  it("writes the key and its count in the control (pixel) face at the regular weight, not Inter semibold", () => {
    expect(decl(".cp-wheel__label", "font-family")).toBe("var(--font-control)");
    expect(decl(".cp-wheel__label", "font-weight")).toBe("var(--font-weight-regular)");
    expect(decl(".cp-wheel__count", "font-weight")).toBe("var(--font-weight-bold)");
  });

  it("sets every line at a whole number of pixels, never a bare multiplier", () => {
    for (const selector of [".cp-wheel__label", ".cp-wheel__count", ".cp-wheel__center"]) {
      expect(decl(selector, "line-height"), selector).toMatch(/^round\(nearest, [\d.]+em, 1px\)$/);
    }
  });

  it("keeps the drawing itself smooth (DEC-238): arcs are not stepped and carry no crispEdges", () => {
    expect(decl(".cp-wheel__shape", "shape-rendering")).toBe("geometricPrecision");
    expect(wheelCss).not.toContain("crispEdges");
  });
});

describe("the wheel's keyboard choosing (M478)", () => {
  const counts = new Map([
    ["8A", 12],
    ["9A", 3],
  ]);
  const props = { lit: new Map(), focusCode: "8A", onFocusCode: () => undefined };

  it("takes a run with Shift+Arrow in the counts mode, as Shift+click does", () => {
    const onPick = vi.fn();
    render(<CamelotWheel {...props} onPick={onPick} counts={counts} />);
    const start = document.querySelector<HTMLElement>('[data-key="8A"]')!;
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true });
    expect(onPick).toHaveBeenCalledWith("9A", { ctrlKey: false, metaKey: false, shiftKey: true });
  });

  it("only moves with a bare arrow, and the header's wheel never picks by arrow", () => {
    const onPick = vi.fn();
    const { unmount } = render(<CamelotWheel {...props} onPick={onPick} counts={counts} />);
    const start = document.querySelector<HTMLElement>('[data-key="8A"]')!;
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(onPick).not.toHaveBeenCalled();
    unmount();
    render(<CamelotWheel {...props} onPick={onPick} />);
    const header = document.querySelector<HTMLElement>('[data-key="8A"]')!;
    fireEvent.keyDown(header, { key: "ArrowRight", shiftKey: true });
    expect(onPick).not.toHaveBeenCalled();
  });
});
