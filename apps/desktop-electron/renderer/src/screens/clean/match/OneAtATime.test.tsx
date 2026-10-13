/**
 * One at a time (C14, CLEAN-12): two cards, the other results, the ticks, and
 * the buttons and keys that decide.
 *
 * The view draws and reports; the Match area sends the decision, so these tests
 * read what it was asked to do. The two CLEAN-14 regressions of the old review
 * queue are ported here on purpose: the choice of result survives the
 * candidates being read again, and the key listener is replaced in the commit
 * that shows the card its commands read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import { installMatchBridge, newWorld, removeMatchBridge } from "../../../test/matchHarness";
import { SCORE_OPEN_STORAGE_KEY } from "../comparison";
import { CARD_FIELDS, type CardField } from "./matchCard";
import { OneAtATime } from "./OneAtATime";
import { candidate, stateFor, track } from "../../../test/matchFixtures";

type Props = ComponentProps<typeof OneAtATime>;
type Fn = ReturnType<typeof vi.fn>;

const LOADED = { timeout: 3000 };

let bridge: Record<string, Fn>;

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  listeners: Record<string, () => void> = {};
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  addEventListener(name: string, listener: () => void) {
    this.listeners[name] = listener;
  }
}

function callbacks() {
  return {
    onToggleTick: vi.fn(),
    onUndo: vi.fn(),
    onCorrect: vi.fn(),
    onNotThis: vi.fn(),
    onSkip: vi.fn(),
    onPreviousTrack: vi.fn(),
    onNextTrack: vi.fn(),
    onPlayFile: vi.fn(),
    onSearchBeatport: vi.fn(),
    onSearchAgain: vi.fn(),
  };
}

function propsFor(overrides: Partial<Props> = {}): Props & ReturnType<typeof callbacks> {
  return {
    row: track(1),
    version: 0,
    position: 1,
    total: 3,
    ticks: new Set<CardField>(CARD_FIELDS),
    busy: false,
    status: null,
    emptyState: <p>Nothing here.</p>,
    ...callbacks(),
    ...overrides,
  } as Props & ReturnType<typeof callbacks>;
}

function renderOne(overrides: Partial<Props> = {}) {
  const props = propsFor(overrides);
  const view = render(<OneAtATime {...props} />);
  return {
    props,
    ...view,
    update: (next: Partial<Props>) => view.rerender(<OneAtATime {...props} {...next} />),
  };
}

/** The card is ready when the likelihood is drawn and the results are chips. */
async function ready() {
  await screen.findByTestId("likelihood", undefined, LOADED);
}

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    fireEvent.keyDown(window, { key, ...init });
  });
}

beforeEach(() => {
  localStorage.clear();
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  bridge = installMatchBridge(newWorld());
});

afterEach(() => {
  removeMatchBridge();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the two cards", () => {
  it("puts the track beside the best match, with what Correct would change", async () => {
    renderOne();
    await ready();

    expect(screen.getByRole("region", { name: "Your track" })).toBeInTheDocument();
    const theirs = screen.getByRole("region", { name: "Best match on Beatport" });
    expect(screen.getByTestId("likelihood")).toHaveTextContent("92% likely");
    expect(within(theirs).getByTestId("decision")).toHaveTextContent("Waiting for you");

    // BPM and label differ; the key, in Beatport's notation, is 8A and comes with Correct.
    const changes = [...theirs.querySelectorAll('[data-changes="true"]')].map((cell) =>
      cell.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(changes).toEqual([
      "126 → becomes 128",
      "Label One → becomes Label Two",
      "— → becomes 2020",
    ]);
    expect(within(theirs).getByText(/comes with Correct/)).toBeInTheDocument();
  });

  it("lists the other results as chips, a ruled-out one saying why on hover", async () => {
    renderOne();
    await ready();
    const group = screen.getByRole("group", { name: "Other results" });
    const chips = within(group).getAllByRole("button", { pressed: false }).concat(
      within(group).getAllByRole("button", { pressed: true }),
    );
    expect(chips.map((chip) => chip.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^1 · Original Mix · 92%$/), expect.stringMatching(/^2 · Extended Mix · ruled out/)]),
    );
    expect(within(group).getByRole("button", { name: /^2 ·/ })).toHaveAttribute(
      "title",
      expect.stringMatching(/no artist in common/i),
    );
  });

  it("says why a result was ruled out in its text, not only on hover", async () => {
    renderOne();
    await ready();
    expect(screen.getByRole("button", { name: /^2 ·.*no artist in common/i })).toBeInTheDocument();
  });

  it("does not show the track's own title as Beatport's when the result has none", async () => {
    bridge.getMatchCandidates!.mockImplementation(async ({ attemptId }: { attemptId: number }) => ({
      attempt_id: attemptId,
      track_id: 1,
      candidates: [candidate(1001, { title: null, mix: null })],
      total: 1,
    }));
    renderOne();
    await ready();
    const theirs = screen.getByRole("region", { name: "Best match on Beatport" });
    expect(within(theirs).getByRole("heading", { level: 3 })).toHaveTextContent("—");
    expect(within(theirs).queryByText("Track 1")).toBeNull();
  });

  it("puts no label on a plain span", async () => {
    const { container } = renderOne();
    await ready();
    expect(container.querySelector("span[aria-label]")).toBeNull();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("offers ticks only for what Correct would change", async () => {
    renderOne();
    await ready();
    const ticks = screen.getByRole("group", { name: /When I say/ });
    const boxes = within(ticks).getAllByRole("checkbox");
    expect(boxes.map((box) => box.parentElement?.textContent)).toEqual([
      "BPM 126 → 128",
      "Label Label One → Label Two",
      "Year — → 2020",
    ]);
  });

  it("calls the tick that was clicked", async () => {
    const { props } = renderOne();
    await ready();
    const ticks = screen.getByRole("group", { name: /When I say/ });
    fireEvent.click(within(ticks).getByRole("checkbox", { name: /Label/ }));
    expect(props.onToggleTick).toHaveBeenCalledWith("label");
  });

  it("folds the scoring under Why this score?, and remembers the choice (CLN-5)", async () => {
    const { unmount } = renderOne();
    await ready();
    const toggle = screen.getByRole("button", { name: "Why this score?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("rowheader", { name: "Key bonus" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Before bonuses", "Title similarity", "Key bonus", "Guards", "Found by"]) {
      expect(screen.getByRole("rowheader", { name: label })).toBeInTheDocument();
    }
    expect(localStorage.getItem(SCORE_OPEN_STORAGE_KEY)).toBe("open");
    unmount();

    renderOne();
    await ready();
    expect(screen.getByRole("button", { name: "Why this score?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("says plainly when the track has never been matched", async () => {
    bridge.getTrackMatches!.mockImplementation(async ({ trackId }: { trackId: number }) => ({
      track_id: trackId,
      track: {},
      state: stateFor(trackId, { state: "not_matched", attempt_id: null, candidate_id: null }),
      candidate: null,
      attempts: [],
      total: 0,
    }));
    renderOne();
    expect(
      await screen.findByText("This track has not been matched on Beatport yet.", undefined, LOADED),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Correct/ })).toBeDisabled();
  });

  it("says what is shown in place of the cards when there is no track", () => {
    renderOne({ row: null });
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your track" })).toBeNull();
  });

  it("shows a ruled-out result with its reason and no likelihood word", async () => {
    renderOne();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^2 ·/ }));
    expect(screen.getByTestId("likelihood")).toHaveTextContent(/no artist in common/i);
    expect(screen.queryByText("Beatport match")).toBeNull();
    expect(screen.getByRole("heading", { name: "Result 2 on Beatport" })).toBeInTheDocument();
  });
});

describe("deciding with the buttons", () => {
  it("Correct sends the chosen result with the ticked values", async () => {
    const { props } = renderOne({ ticks: new Set<CardField>(["bpm", "year"]) });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Correct/ }));
    expect(props.onCorrect).toHaveBeenCalledTimes(1);
    const [candidate, plan] = props.onCorrect.mock.calls[0]!;
    expect(candidate.id).toBe(1001);
    expect(plan).toEqual({ fields: ["bpm", "year"], replaceKey: false });
  });

  it("replaces the key only when the track's own is ticked", async () => {
    const mine = track(1, { effective_key: "5A", key_source: "yours" });
    const { props } = renderOne({ row: mine, ticks: new Set<CardField>(["key"]) });
    await ready();
    expect(screen.getByText(/\(replaces yours\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Correct/ }));
    expect(props.onCorrect.mock.calls[0]![1]).toEqual({ fields: [], replaceKey: true });
  });

  it("Not this track, Skip for now and the arrows report what was pressed", async () => {
    const { props } = renderOne();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Not this track/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Skip for now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Search Beatport myself…" }));
    fireEvent.click(screen.getByRole("button", { name: "Search again" }));
    fireEvent.click(screen.getByRole("button", { name: /^Play your file/ }));
    expect(props.onNotThis).toHaveBeenCalledTimes(1);
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onSearchBeatport).toHaveBeenCalledTimes(1);
    expect(props.onSearchAgain).toHaveBeenCalledTimes(1);
    expect(props.onPlayFile).toHaveBeenCalledTimes(1);
  });

  it("steps through the results with the buttons, stopping at the ends", async () => {
    renderOne();
    await ready();
    const previous = screen.getByRole("button", { name: "Previous result" });
    const next = screen.getByRole("button", { name: "Next result" });
    expect(previous).toBeDisabled();
    fireEvent.click(next);
    expect(screen.getByRole("button", { name: /^2 ·/ })).toHaveAttribute("aria-pressed", "true");
    expect(next).toBeDisabled();
    fireEvent.click(previous);
    expect(screen.getByRole("button", { name: /^1 ·/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("lets R do only what the Not this track button would: it needs an attempt", async () => {
    bridge.getTrackMatches!.mockImplementation(async ({ trackId }: { trackId: number }) => ({
      track_id: trackId,
      track: {},
      state: stateFor(trackId, { state: "not_matched", attempt_id: null, candidate_id: null }),
      candidate: null,
      attempts: [],
      total: 0,
    }));
    const { props } = renderOne();
    await screen.findByText("This track has not been matched on Beatport yet.", undefined, LOADED);
    expect(screen.getByRole("button", { name: /^Not this track/ })).toBeDisabled();
    press("r");
    press("a");
    expect(props.onNotThis).not.toHaveBeenCalled();
    expect(props.onCorrect).not.toHaveBeenCalled();
  });

  it("stops offering a decision while one is being sent", async () => {
    const { props } = renderOne({ busy: true });
    await ready();
    for (const name of [/^Correct/, /^Not this track/, /^Skip for now/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    press("a");
    press("r");
    press("n");
    expect(props.onCorrect).not.toHaveBeenCalled();
    expect(props.onNotThis).not.toHaveBeenCalled();
    expect(props.onSkip).not.toHaveBeenCalled();
  });

  it("offers Undo for the last act, and only when it changed something", async () => {
    const status = { text: "Corrected “Track 1”.", batchId: "batch-1" };
    const { props, update } = renderOne({ status });
    await ready();
    expect(screen.getByRole("status")).toHaveTextContent("Corrected “Track 1”.");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(props.onUndo).toHaveBeenCalledTimes(1);

    update({ status: { text: "Nothing to change for “Track 1”.", batchId: null } });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});

describe("deciding from the keyboard", () => {
  it("A corrects, R says not this track, N skips, the arrows move", async () => {
    const { props } = renderOne({ ticks: new Set<CardField>(["bpm"]) });
    await ready();

    press("a");
    expect(props.onCorrect).toHaveBeenCalledTimes(1);
    expect(props.onCorrect.mock.calls[0]![0].id).toBe(1001);
    expect(props.onCorrect.mock.calls[0]![1]).toEqual({ fields: ["bpm"], replaceKey: false });
    press("r");
    expect(props.onNotThis).toHaveBeenCalledTimes(1);
    press("n");
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    press("ArrowDown");
    expect(props.onNextTrack).toHaveBeenCalledTimes(1);
    press("ArrowUp");
    expect(props.onPreviousTrack).toHaveBeenCalledTimes(1);
    press("y");
    expect(props.onPlayFile).toHaveBeenCalledTimes(1);
  });

  it("Left and Right choose another result, and A then corrects that one", async () => {
    const { props } = renderOne();
    await ready();
    press("ArrowRight");
    expect(screen.getByRole("button", { name: /^2 ·/ })).toHaveAttribute("aria-pressed", "true");
    press("a");
    expect(props.onCorrect.mock.calls[0]![0].id).toBe(1002);
    press("ArrowLeft");
    expect(screen.getByRole("button", { name: /^1 ·/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves Space to the player", async () => {
    const { props } = renderOne();
    await ready();
    const space = new KeyboardEvent("keydown", { key: " ", cancelable: true, bubbles: true });
    act(() => {
      window.dispatchEvent(space);
    });
    expect(space.defaultPrevented).toBe(false);
    expect(props.onCorrect).not.toHaveBeenCalled();
    expect(props.onSkip).not.toHaveBeenCalled();
    expect(props.onPlayFile).not.toHaveBeenCalled();
  });

  it("ignores a capital, a modified key and a key typed into a field", async () => {
    const { props } = renderOne();
    await ready();
    press("A", { shiftKey: true });
    press("a", { ctrlKey: true });
    const field = document.createElement("input");
    document.body.append(field);
    act(() => {
      fireEvent.keyDown(field, { key: "a" });
    });
    field.remove();
    expect(props.onCorrect).not.toHaveBeenCalled();
  });

  it("leaves its keys alone while a dialog is open", async () => {
    const { props } = renderOne();
    await ready();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    try {
      press("a");
      press("ArrowDown");
    } finally {
      dialog.remove();
    }
    expect(props.onCorrect).not.toHaveBeenCalled();
    expect(props.onNextTrack).not.toHaveBeenCalled();
  });

  it("leaves a key alone that something else already handled", async () => {
    const { props } = renderOne();
    await ready();
    const handled = new KeyboardEvent("keydown", { key: "a", cancelable: true, bubbles: true });
    handled.preventDefault();
    act(() => {
      window.dispatchEvent(handled);
    });
    expect(props.onCorrect).not.toHaveBeenCalled();
    press("a");
    expect(props.onCorrect).toHaveBeenCalledTimes(1);
  });

  it("takes a key pressed the moment the card appears (CLEAN-14)", async () => {
    // The listener was once replaced by a passive effect, which React runs
    // after the commit that shows the card: a key pressed in between reached
    // the listener of the card without the result and was dropped. It is
    // pressed here from a MutationObserver, in the microtask after the likelihood
    // appears and before any passive effect could run.
    const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    const props = propsFor();
    try {
      render(<OneAtATime {...props} />);
      await new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!screen.queryByTestId("likelihood")) return;
          observer.disconnect();
          fireEvent.keyDown(window, { key: "a" });
          resolve();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      });
      expect(props.onCorrect).toHaveBeenCalledTimes(1);
      expect(props.onCorrect.mock.calls[0]![0].id).toBe(1001);
    } finally {
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });
});

describe("the choice of result (CLEAN-14)", () => {
  it("survives the candidates being read again", async () => {
    // A match ending reads the candidates again. The choice made with Right
    // must survive that, or A corrects a result nobody chose.
    const { props, update } = renderOne();
    await ready();
    press("ArrowRight");
    expect(screen.getByRole("button", { name: /^2 ·/ })).toHaveAttribute("aria-pressed", "true");
    const reads = bridge.getMatchCandidates!.mock.calls.length;

    update({ version: 1 });
    await waitFor(() =>
      expect(bridge.getMatchCandidates!.mock.calls.length).toBeGreaterThan(reads),
    );
    await ready();

    expect(screen.getByRole("button", { name: /^2 ·/ })).toHaveAttribute("aria-pressed", "true");
    press("a");
    expect(props.onCorrect.mock.calls[0]![0].id).toBe(1002);
  });

  it("starts a new track from its default choice", async () => {
    const { update } = renderOne();
    await ready();
    press("ArrowRight");
    expect(screen.getByRole("button", { name: /^2 ·/ })).toHaveAttribute("aria-pressed", "true");

    update({ row: track(2), position: 2 });
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 2 }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^1 ·/ })).toHaveAttribute("aria-pressed", "true"),
    );
  });
});

describe("Beatport's art and preview", () => {
  it("draws the candidate's art from the guarded route, and lets go of it", async () => {
    bridge.getCandidateArtwork!.mockResolvedValue("blob:candidate-art");
    const { container, unmount } = renderOne();
    await ready();
    await waitFor(() =>
      expect(container.querySelector('img[src="blob:candidate-art"]')).not.toBeNull(),
    );
    expect(bridge.getCandidateArtwork).toHaveBeenCalledWith({ candidateId: 1001, size: "inspector" });
    unmount();
    expect(bridge.releaseTrackArtwork).toHaveBeenCalledWith("blob:candidate-art");
  });

  it("B plays the preview, pausing the player; Esc stops it and lets go of the URL", async () => {
    bridge.getCandidatePreview!.mockResolvedValue("blob:preview");
    bridge.player = {
      getState: vi.fn().mockResolvedValue({ playback: { playing: true, paused: false } }),
      pause: vi.fn().mockResolvedValue(undefined),
    } as unknown as Fn;
    renderOne();
    await ready();

    press("b");
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    expect(bridge.getCandidatePreview).toHaveBeenCalledWith({ candidateId: 1001 });
    const player = bridge.player as unknown as { pause: Fn };
    expect(player.pause).toHaveBeenCalledTimes(1);
    const audio = FakeAudio.instances[0]!;
    expect(audio.src).toBe("blob:preview");
    expect(audio.play).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /^Stop preview/ })).toBeInTheDocument();

    press("Escape");
    expect(audio.pause).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:preview");
    expect(await screen.findByRole("button", { name: /^Play Beatport preview/ })).toBeInTheDocument();
  });

  it("stops the preview when the player starts playing, from wherever", async () => {
    bridge.getCandidatePreview!.mockResolvedValue("blob:preview");
    let push: ((snapshot: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    bridge.player = {
      getState: vi.fn().mockResolvedValue({ playback: { playing: false, paused: true } }),
      pause: vi.fn(),
      subscribeState: vi.fn((listener: (snapshot: unknown) => void) => {
        push = listener;
        return unsubscribe;
      }),
    } as unknown as Fn;
    const { unmount } = renderOne();
    await ready();
    press("b");
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    await screen.findByRole("button", { name: /^Stop preview/ });

    // A paused player is not a reason to stop.
    act(() => push?.({ playback: { playing: true, paused: true } }));
    expect(FakeAudio.instances[0]!.pause).not.toHaveBeenCalled();
    // Space or the Now playing bar starting it is.
    act(() => push?.({ playback: { playing: true, paused: false } }));
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:preview");
    expect(await screen.findByRole("button", { name: /^Play Beatport preview/ })).toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("does not take B when this build cannot fetch previews", async () => {
    delete bridge.getCandidatePreview;
    renderOne();
    await ready();
    expect(screen.getByRole("button", { name: /^Play Beatport preview/ })).toBeDisabled();
    press("b");
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("does not take Esc when no preview is sounding", async () => {
    renderOne();
    await ready();
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    act(() => {
      window.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(false);
  });

  it("stops the preview when another result is chosen or the file is played", async () => {
    bridge.getCandidatePreview!.mockResolvedValue("blob:preview");
    const { props } = renderOne();
    await ready();
    press("b");
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    press("ArrowRight");
    await waitFor(() => expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled());

    press("b");
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(2));
    press("y");
    expect(FakeAudio.instances[1]!.pause).toHaveBeenCalled();
    expect(props.onPlayFile).toHaveBeenCalledTimes(1);
  });

  it("says so when a result has no preview, as a plain note and not an error", async () => {
    renderOne();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Play Beatport preview/ }));
    expect(await screen.findByText("No preview is available for this result.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(FakeAudio.instances).toHaveLength(0);
  });
});

describe("with no track left (the last one was just decided)", () => {
  it("still offers the one Undo for the last act, and calls it", () => {
    const status = { text: "Corrected “Track 1”.", batchId: "batch-1" };
    const { props } = renderOne({ row: null, status, emptyState: <p>Nothing is waiting for you.</p> });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(props.onUndo).toHaveBeenCalledTimes(1);
  });

  it("disables Undo while a decision is being sent", () => {
    const status = { text: "Corrected “Track 1”.", batchId: "batch-1" };
    renderOne({ row: null, busy: true, status, emptyState: <p>Nothing is waiting for you.</p> });
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });
});

describe("the decide buttons stay last (R2-3)", () => {
  it("keeps the order: cards, Other results, Why this score?, ticks, Decide", async () => {
    renderOne({ status: { text: "Corrected “Place”.", batchId: null } });
    await ready();
    const cards = screen.getByRole("region", { name: "Your track" }).parentElement as HTMLElement;
    const results = screen.getByRole("group", { name: "Other results" });
    const why = screen.getByRole("button", { name: "Why this score?" });
    const ticks = screen.getByRole("group", { name: /When I say/ });
    const decide = screen.getByRole("group", { name: "Decide" });
    const ordered = [cards, results, why, ticks, decide];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      expect(
        ordered[i]!.compareDocumentPosition(ordered[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `item ${i} comes before item ${i + 1}`,
      ).toBeTruthy();
    }
    // Nothing but the status line follows the Decide group.
    const after = decide.nextElementSibling;
    expect(after).toHaveClass("match-status");
    expect(after).toHaveAttribute("role", "status");
    expect(after!.nextElementSibling).toBeNull();
  });
});

describe("the cover art thumbnail (R2-3)", () => {
  /**
   * Open the larger art once the card has settled. The card can choose its candidate a
   * second time as the matches finish loading, which fetches the art again and closes
   * the larger view, so a click that lands before that is undone (a flake seen in CI).
   * Clicking again until it stays open tests the click, not the loading order.
   */
  async function openLarger() {
    await screen.findByRole("button", { name: "Show the cover art larger" }, LOADED);
    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Show the cover art larger" });
      if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
      expect(screen.getByRole("figure", { name: "Cover art, larger" })).toBeInTheDocument();
    }, LOADED);
    return screen.getByRole("button", { name: "Show the cover art larger" });
  }
  it("opens the art larger on a click, and closes it on a second click or Escape", async () => {
    bridge.getCandidateArtwork!.mockResolvedValue("blob:beatport-art");
    renderOne();
    await ready();
    const closed = await screen.findByRole("button", { name: "Show the cover art larger" }, LOADED);
    expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("figure", { name: "Cover art, larger" })).toBeNull();

    const button = await openLarger();
    const figure = screen.getByRole("figure", { name: "Cover art, larger" });
    expect(figure.querySelector("img")).toHaveAttribute("src", "blob:beatport-art");
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(button);
    expect(screen.queryByRole("figure", { name: "Cover art, larger" })).toBeNull();

    fireEvent.click(button);
    expect(screen.getByRole("figure", { name: "Cover art, larger" })).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByRole("figure", { name: "Cover art, larger" })).toBeNull();
  });

  it("keeps a visible caption beside the thumbnail when there is art", async () => {
    bridge.getCandidateArtwork!.mockResolvedValue("blob:beatport-art");
    renderOne();
    await ready();
    await screen.findByRole("button", { name: "Show the cover art larger" }, LOADED);
    expect(screen.getByText("Beatport art")).toBeVisible();
  });

  it("closes the art first on Escape while a preview plays, leaving the preview alone", async () => {
    bridge.getCandidateArtwork!.mockResolvedValue("blob:beatport-art");
    bridge.getCandidatePreview!.mockResolvedValue("blob:preview");
    renderOne();
    await ready();
    await screen.findByRole("button", { name: "Show the cover art larger" }, LOADED);
    press("b");
    await screen.findByRole("button", { name: /^Stop preview/ });
    await openLarger();

    press("Escape");
    expect(screen.queryByRole("figure", { name: "Cover art, larger" })).toBeNull();
    expect(FakeAudio.instances[0]!.pause).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Stop preview/ })).toBeInTheDocument();

    press("Escape");
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
  });

  it("has no button when there is no art, just the placeholder and its caption", async () => {
    const { container } = renderOne();
    await ready();
    expect(screen.queryByRole("button", { name: "Show the cover art larger" })).toBeNull();
    expect(container.querySelector(".match-card__art--none")).not.toBeNull();
    expect(screen.getByText("Beatport art")).toBeVisible();
    expect(screen.getByText("your art")).toBeVisible();
  });
});
