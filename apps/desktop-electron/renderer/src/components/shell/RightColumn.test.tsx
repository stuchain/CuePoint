import { ToastProvider } from "../Toast";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueWindow } from "../../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "../player/playerFormat";
import { resetPlayerStore } from "../player/playerStore";
import { resetQueuePanelStateForTests, setQueueOpen, useQueueOpen } from "../player/queuePanelState";
import { RightColumn } from "./RightColumn";
import { emitShellCommand } from "./shellCommands";

/**
 * The right column (R2-1, DEC-264).
 *
 * Track details has the column until the queue is opened, then the queue takes
 * all of it. Both ways back are held here: the queue's own Close button, and
 * the two ways of asking for Track details (View › Track details, Ctrl+I),
 * which nothing else answers while the Inspector is unmounted.
 */

const snapshot: PlayerSnapshot = {
  status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
  playback: {
    filePath: null,
    playing: false,
    paused: true,
    positionSeconds: null,
    durationSeconds: null,
    volume: 100,
    muted: false,
  },
  queue: { length: 0, currentId: null, currentIndex: -1, currentItem: null, shuffle: false, repeat: "off" },
  audio: EMPTY_AUDIO_STATE,
};

function installBridge(): void {
  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(snapshot),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        onState(snapshot);
        return vi.fn();
      }),
      queueWindow: vi.fn(async (offset: number): Promise<QueueWindow> => ({ offset, total: 0, items: [] })),
    },
  } as unknown as typeof window.cuepoint;
}

/** Reads the store from outside the column, so a test can see what a command did to it. */
function OpenProbe() {
  return <span data-testid="open">{String(useQueueOpen())}</span>;
}

function renderColumn() {
  return render(
    <ToastProvider>
      <RightColumn>
        <div>Track details stub</div>
      </RightColumn>
      <OpenProbe />
    </ToastProvider>,
  );
}

beforeEach(() => {
  resetPlayerStore();
  installBridge();
});

afterEach(() => {
  resetQueuePanelStateForTests();
  resetPlayerStore();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

const queue = () => screen.queryByRole("complementary", { name: "Playback queue" });
const stub = () => screen.queryByText("Track details stub");

describe("what the column holds", () => {
  it("shows Track details while the queue is closed", () => {
    renderColumn();

    expect(stub()).toBeInTheDocument();
    expect(queue()).toBeNull();
  });

  it("gives the whole column to the queue while it is open", async () => {
    renderColumn();

    act(() => setQueueOpen(true));

    expect(await screen.findByRole("complementary", { name: "Playback queue" })).toBeInTheDocument();
    expect(stub()).toBeNull();
  });

  it("brings Track details back when the queue is closed from its panel", async () => {
    renderColumn();
    act(() => setQueueOpen(true));

    fireEvent.click(await screen.findByRole("button", { name: "Close the queue" }));

    await waitFor(() => expect(queue()).toBeNull());
    expect(stub()).toBeInTheDocument();
  });
});

describe("asking for Track details while the queue is open", () => {
  it("View > Track details closes the queue", async () => {
    renderColumn();
    act(() => setQueueOpen(true));
    await screen.findByRole("complementary", { name: "Playback queue" });

    act(() => emitShellCommand("toggle-inspector"));

    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(stub()).toBeInTheDocument();
  });

  it.each([
    ["Ctrl+I", { key: "i", ctrlKey: true }],
    ["Cmd+I", { key: "I", metaKey: true }],
  ])("%s closes the queue", async (_name, init) => {
    renderColumn();
    act(() => setQueueOpen(true));
    await screen.findByRole("complementary", { name: "Playback queue" });

    fireEvent.keyDown(window, init);

    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(stub()).toBeInTheDocument();
  });

  it("leaves Ctrl+Shift+I alone", async () => {
    renderColumn();
    act(() => setQueueOpen(true));
    await screen.findByRole("complementary", { name: "Playback queue" });

    fireEvent.keyDown(window, { key: "i", ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId("open")).toHaveTextContent("true");
  });

  it("keeps focus where the user is typing", async () => {
    render(
      <ToastProvider>
        <input aria-label="Search" />
        <RightColumn>
          <div>Track details stub</div>
        </RightColumn>
      </ToastProvider>,
    );
    act(() => setQueueOpen(true));
    await screen.findByRole("complementary", { name: "Playback queue" });
    const input = screen.getByLabelText("Search");
    input.focus();

    fireEvent.keyDown(input, { key: "i", ctrlKey: true });

    expect(queue()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("does nothing to the queue while it is closed", () => {
    renderColumn();

    act(() => emitShellCommand("toggle-inspector"));
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });

    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(stub()).toBeInTheDocument();
  });

  it("does not swallow Ctrl+I while closed, so Track details still hears it", () => {
    renderColumn();

    const allowed = fireEvent.keyDown(window, { key: "i", ctrlKey: true });

    expect(allowed).toBe(true);
  });
});
