import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { CROWD_SETTING_KEY, resetCrowdSettingForTests, saveCrowdSetting } from "./crowdSetting";
import { PlayerBar, TIMELINE_MIN_PX } from "./PlayerBar";
import { PartyView } from "./PartyView";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { resetPartyViewStateForTests, usePartyViewOpen } from "./partyViewState";
import { resetPlayerStore } from "./playerStore";
import { resetQueuePanelStateForTests } from "./queuePanelState";
vi.mock("../crowd/CrowdScene", () => ({ CrowdScene: () => <canvas data-testid="crowd" /> }));
import { resetWaveformDetailForTests } from "../waveform/waveformDetailSetting";

/** The player bar's crowd button: it opens and closes the Party view, and follows Settings. */

const queued: QueueItem = {
  id: "q1",
  trackId: 1,
  filePath: "/music/strobe.flac",
  title: "Strobe",
  artist: "deadmau5",
  key: "8A",
  bpm: 128,
  durationSeconds: 600,
  status: "playing",
};

const state: PlayerSnapshot = {
  status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
  playback: { filePath: queued.filePath, playing: true, paused: false, positionSeconds: 30, durationSeconds: 600, volume: 80, muted: false },
  queue: { length: 1, currentId: "q1", currentIndex: 0, currentItem: queued, shuffle: false, repeat: "off" },
  audio: EMPTY_AUDIO_STATE,
};

function installBridge() {
  const player = {
    getState: vi.fn().mockResolvedValue(state),
    subscribeState: vi.fn((onState: (s: PlayerSnapshot) => void) => {
      onState(state);
      return vi.fn();
    }),
  };
  window.cuepoint = {
    getEngineStatus: vi.fn().mockResolvedValue({ connected: true }),
    listJobs: vi.fn().mockResolvedValue({ jobs: [] }),
    player,
  } as unknown as typeof window.cuepoint;
}

function Open() {
  return <span data-testid="party-open">{String(usePartyViewOpen())}</span>;
}

beforeEach(() => {
  localStorage.clear();
  resetCrowdSettingForTests();
  resetPartyViewStateForTests();
  resetQueuePanelStateForTests();
  resetPlayerStore();
  resetWaveformDetailForTests();
  installBridge();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  resetCrowdSettingForTests();
  resetPartyViewStateForTests();
  resetPlayerStore();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("the crowd button", () => {
  it("shows beside the queue button while the setting is on, and is not pressed", async () => {
    render(<PlayerBar onToggleQueue={() => undefined} />);
    const button = await screen.findByRole("button", { name: "Party view" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveClass("cp-player-bar__button", "cp-player-bar__button--standard");
    expect(button).not.toHaveClass("cp-player-bar__button--on");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "cp-party-view");
    const queue = screen.getByRole("button", { name: /Show the queue/ });
    expect(queue.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is hidden while the setting is off, and appears when it is turned back on", async () => {
    localStorage.setItem(CROWD_SETTING_KEY, "off");
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(screen.queryByRole("button", { name: /party view/i })).toBeNull();
    act(() => saveCrowdSetting(true));
    expect(screen.getByRole("button", { name: "Party view" })).toBeInTheDocument();
  });

  it("opens and closes the view, and says which in its name and aria-pressed", async () => {
    render(
      <>
        <PlayerBar />
        <Open />
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Party view" }));
    expect(screen.getByTestId("party-open")).toHaveTextContent("true");
    const close = screen.getByRole("button", { name: "Close party view" });
    expect(close).toHaveAttribute("aria-pressed", "true");
    expect(close).toHaveAttribute("aria-expanded", "true");
    expect(close).toHaveClass("cp-player-bar__button--on");
    fireEvent.click(close);
    expect(screen.getByTestId("party-open")).toHaveTextContent("false");
    expect(screen.getByRole("button", { name: "Party view" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the crowd in the compact bar's More menu", () => {
  function narrow() {
    return vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("cp-player-bar__wave")) return TIMELINE_MIN_PX;
      if (this.classList.contains("cp-player-bar")) return 1000;
      return 40;
    });
  }

  it("lists Party view as a checked item that toggles it", async () => {
    const width = narrow();
    try {
      render(
        <>
          <PlayerBar onToggleQueue={() => undefined} />
          <Open />
        </>,
      );
      fireEvent.click(await screen.findByRole("button", { name: "More player controls" }));
      expect(screen.queryByRole("button", { name: /party view/i })).toBeNull();
      const item = await screen.findByRole("menuitemcheckbox", { name: "Party view" });
      expect(item).toHaveAttribute("aria-checked", "false");
      fireEvent.click(item);
      expect(screen.getByTestId("party-open")).toHaveTextContent("true");
    } finally {
      width.mockRestore();
    }
  });

  it("puts focus on the More button when the view that the menu opened is closed", async () => {
    const width = narrow();
    try {
      render(
        <>
          <PlayerBar onToggleQueue={() => undefined} />
          <PartyView />
        </>,
      );
      const more = await screen.findByRole("button", { name: "More player controls" });
      more.focus();
      fireEvent.click(more);
      fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Party view" }));
      // The menu closed with its item; focus went to the view's close button.
      const close = await screen.findByRole("button", { name: "Close party view" });
      expect(close).toHaveFocus();
      fireEvent.click(close);
      expect(screen.getByRole("button", { name: "More player controls" })).toHaveFocus();
    } finally {
      width.mockRestore();
    }
  });

  it("leaves it out while the setting is off", async () => {
    localStorage.setItem(CROWD_SETTING_KEY, "off");
    const width = narrow();
    try {
      render(<PlayerBar onToggleQueue={() => undefined} />);
      fireEvent.click(await screen.findByRole("button", { name: "More player controls" }));
      await screen.findByRole("menu", { name: "More player controls" });
      expect(screen.queryByRole("menuitemcheckbox", { name: "Party view" })).toBeNull();
    } finally {
      width.mockRestore();
    }
  });
});
