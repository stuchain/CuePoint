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
import { CamelotWheel } from "./CamelotWheel";
import { WheelButton } from "./WheelButton";
import { closeWheel, openWheel } from "./wheelStore";

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

describe("the header button", () => {
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
      await within(dialog()).findByText("Select or play a track to light its key."),
    ).toBeInTheDocument();
    expect(litCodes()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Match on Beatport" })).toBeNull();
  });

  it("says so, with Match tracks…, when no track in the library has a key", async () => {
    install({ hasKeys: false });
    mount();
    await openFromHeader();
    expect(
      await within(dialog()).findByText("No track in your library has a Beatport key yet."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
    expect(cleanMatchOpening(lastLocation!)).toMatchObject({ tracks: null });
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
    expect(segment("9A")).toHaveAttribute("title", "9A: show every 9A track in the Library");
    expect(segment("12B")).toHaveAttribute("title", "12B: show every 12B track in the Library");
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
});
