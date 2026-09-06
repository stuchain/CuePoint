import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { PlayerAnnouncer, announcementFor } from "./PlayerAnnouncer";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { resetPlayerStore } from "./playerStore";

/**
 * Telling a screen reader what happened (PLAYER-12).
 *
 * The failure worth guarding is not silence, it is noise. The position stream
 * pushes several times a second, and a live region that mirrored the snapshot
 * would read the elapsed time aloud for ever — which makes the whole app
 * unusable, not just the player. So the tests below spend most of their effort
 * proving that nothing is said when nothing has happened.
 */

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 1,
    filePath: "/music/a.flac",
    title: "Strobe",
    artist: "deadmau5",
    key: "8A",
    bpm: 128,
    durationSeconds: 600,
    status: "playing",
    ...overrides,
  };
}

function snapshot(overrides: {
  current?: QueueItem | null;
  playing?: boolean;
  paused?: boolean;
  position?: number;
} = {}): PlayerSnapshot {
  const current = overrides.current === undefined ? item() : overrides.current;
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: overrides.playing ?? true,
      paused: overrides.paused ?? false,
      positionSeconds: overrides.position ?? 12,
      durationSeconds: 600,
      volume: 100,
      muted: false,
    },
    queue: {
      length: current ? 2 : 0,
      currentId: current?.id ?? null,
      currentIndex: current ? 0 : -1,
      currentItem: current,
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  };
}

function install(initial: PlayerSnapshot) {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(initial),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        push = onState;
        onState(initial);
        return vi.fn();
      }),
    },
  } as unknown as typeof window.cuepoint;
  return { push: (state: PlayerSnapshot) => push?.(state) };
}

const region = () => screen.getByRole("status");

beforeEach(() => resetPlayerStore());

afterEach(() => {
  resetPlayerStore();
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("what is said", () => {
  it("names the track and who made it", () => {
    expect(announcementFor(snapshot())).toBe("Playing: Strobe — deadmau5 · 8A · 128.0 BPM");
  });

  it("says paused, and stopped", () => {
    expect(announcementFor(snapshot({ paused: true }))).toContain("Paused: Strobe");
    expect(announcementFor(snapshot({ playing: false }))).toContain("Stopped: Strobe");
  });

  it("says nothing with no track and nothing with no player", () => {
    expect(announcementFor(snapshot({ current: null }))).toBe("");
    expect(announcementFor(null)).toBe("");
  });

  it("copes with a track that has no artist or key", () => {
    const bare = snapshot({ current: item({ artist: "", key: null, bpm: null }) });

    expect(announcementFor(bare)).toBe("Playing: Strobe");
  });
});

describe("the live region", () => {
  it("is polite, atomic, and announces the current track", async () => {
    install(snapshot());
    render(<PlayerAnnouncer />);

    await waitFor(() => expect(region()).toHaveTextContent("Playing: Strobe"));
    expect(region()).toHaveAttribute("aria-live", "polite");
    expect(region()).toHaveAttribute("aria-atomic", "true");
  });

  it("says the new track when it changes", async () => {
    const harness = install(snapshot());
    render(<PlayerAnnouncer />);
    await waitFor(() => expect(region()).toHaveTextContent("Strobe"));

    harness.push(snapshot({ current: item({ id: "q2", title: "Ghosts n Stuff" }) }));

    await waitFor(() => expect(region()).toHaveTextContent("Ghosts n Stuff"));
  });

  it("says nothing new while only the position moves", async () => {
    // The one that matters: without this, a screen reader reads the elapsed
    // time out loud several times a second for the length of the track.
    const harness = install(snapshot({ position: 1 }));
    render(<PlayerAnnouncer />);
    await waitFor(() => expect(region()).toHaveTextContent("Playing: Strobe"));
    const said = region().textContent;

    for (let second = 2; second < 40; second += 1) {
      harness.push(snapshot({ position: second }));
    }

    expect(region().textContent).toBe(said);
  });

  it("says nothing new when the volume or the queue order changes", async () => {
    const harness = install(snapshot());
    render(<PlayerAnnouncer />);
    await waitFor(() => expect(region()).toHaveTextContent("Playing: Strobe"));
    const said = region().textContent;

    const louder = snapshot();
    louder.playback.volume = 40;
    louder.queue.shuffle = true;
    harness.push(louder);

    expect(region().textContent).toBe(said);
  });

  it("announces a pause and the resume after it", async () => {
    const harness = install(snapshot());
    render(<PlayerAnnouncer />);
    await waitFor(() => expect(region()).toHaveTextContent("Playing: Strobe"));

    harness.push(snapshot({ paused: true }));
    await waitFor(() => expect(region()).toHaveTextContent("Paused: Strobe"));

    harness.push(snapshot());
    await waitFor(() => expect(region()).toHaveTextContent("Playing: Strobe"));
  });

  it("exists before it has anything to say, so the first change is heard", async () => {
    // A live region inserted *with* text in it is not reliably announced; it
    // has to be in the tree before the text arrives.
    install(snapshot({ current: null }));
    render(<PlayerAnnouncer />);

    expect(region()).toBeInTheDocument();
    expect(region()).toHaveTextContent("");
  });

  it("renders without a bridge at all", () => {
    expect(() => render(<PlayerAnnouncer />)).not.toThrow();
  });
});
