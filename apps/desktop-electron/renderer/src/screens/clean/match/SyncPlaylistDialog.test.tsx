/**
 * Sync a playlist to files (the Review tab's green button): the ticked tracks, then the Sync window.
 *
 * The Sync window itself is tested with the save window it is a variant of; here it is a stand-in
 * that shows what it was handed. What this holds: opening it reads which tracks are ticked and
 * calls nothing that writes, a close has nothing to take back, and every failure is said in words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

interface DialogProps {
  open: boolean;
  selection: { track_ids?: number[] } | null;
  count: number;
  variant?: string;
  title?: string;
  onClose: () => void;
  onChanged?: () => void;
}

vi.mock("../../../components/saveToFiles/SaveToFilesDialog", () => ({
  SaveToFilesDialog: (props: DialogProps) =>
    props.open ? (
      <div role="dialog" aria-label="Sync window">
        <p>{props.title ?? "default title"}</p>
        <p>{`${props.count} tracks, ${(props.selection?.track_ids ?? []).join(",")}, ${props.variant}`}</p>
        <button type="button" onClick={props.onChanged}>
          files written
        </button>
        <button type="button" onClick={props.onClose}>
          close sync
        </button>
      </div>
    ) : null,
}));

import { SyncPlaylistDialog } from "./SyncPlaylistDialog";

/** The grey Close of the footer; the title bar has a close button of the same name. */
function footerClose(): HTMLElement {
  return screen.getAllByRole("button", { name: "Close" }).find((b) => b.classList.contains("cp-btn--secondary"))!;
}

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;

beforeEach(() => {
  bridge = {
    getMatchReview: vi.fn().mockResolvedValue({ ids: [3, 5, 8], tracks: [], total: 9, ticked: 3 }),
    correctMatches: vi.fn(),
    correctMatch: vi.fn(),
    decideMatch: vi.fn(),
    setMatchTicks: vi.fn(),
    revertBatch: vi.fn(),
    startTagWrite: vi.fn(),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function dialog(overrides: Partial<Parameters<typeof SyncPlaylistDialog>[0]> = {}) {
  const props = {
    open: true,
    name: "hJ",
    source: { playlistId: 7 },
    onClose: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
  const view = render(<SyncPlaylistDialog {...props} />);
  return { props, ...view };
}

function nothingWritten() {
  for (const name of ["correctMatches", "correctMatch", "decideMatch", "setMatchTicks", "revertBatch", "startTagWrite"]) {
    expect(bridge[name], name).not.toHaveBeenCalled();
  }
}

describe("opening it", () => {
  it("reads the ticked tracks of the review and opens the Sync window on them, writing nothing", async () => {
    dialog();
    await screen.findByRole("dialog", { name: "Sync window" });
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 7, tickedIds: true });
    expect(screen.getByText("3 tracks, 3,5,8, sync")).toBeInTheDocument();
    // The window names the tracks itself: "Sync 3 tracks to your files".
    expect(screen.getByText("default title")).toBeInTheDocument();
    nothingWritten();
  });

  it("reads a run's ticked tracks by the run, and the whole library's with neither", async () => {
    const run = dialog({ source: { jobId: "job-1" } });
    await screen.findByRole("dialog", { name: "Sync window" });
    expect(bridge.getMatchReview).toHaveBeenLastCalledWith({ jobId: "job-1", tickedIds: true });
    run.unmount();
    dialog({ source: {} });
    await screen.findByRole("dialog", { name: "Sync window" });
    expect(bridge.getMatchReview).toHaveBeenLastCalledWith({ tickedIds: true });
  });

  it("says it is reading and that nothing is written to the files, while it reads", async () => {
    let finish: (value: unknown) => void = () => undefined;
    bridge.getMatchReview.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    dialog();
    expect(await screen.findByText(/Loading the ticked tracks/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is written to your files/)).toBeInTheDocument();
    finish({ ids: [1], tracks: [], total: 1, ticked: 1 });
    await screen.findByRole("dialog", { name: "Sync window" });
  });

  it("says there is nothing to sync when nothing is ticked", async () => {
    bridge.getMatchReview.mockResolvedValue({ ids: [], tracks: [], total: 9, ticked: 0 });
    dialog();
    expect(await screen.findByText(/Nothing is ticked/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Sync window" })).toBeNull();
    nothingWritten();
  });
});

describe("closing", () => {
  it("has nothing to take back: closing the Sync window only closes it", async () => {
    const { props } = dialog();
    await screen.findByRole("dialog", { name: "Sync window" });
    await userEvent.click(screen.getByRole("button", { name: "close sync" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    nothingWritten();
  });

  it("tells the page once files were written", async () => {
    const { props } = dialog();
    await screen.findByRole("dialog", { name: "Sync window" });
    await userEvent.click(screen.getByRole("button", { name: "files written" }));
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it("cancels while it is reading", async () => {
    bridge.getMatchReview.mockImplementation(() => new Promise(() => undefined));
    const { props } = dialog();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("when it cannot be done", () => {
  it("says why the ticked tracks could not be read, and offers Close", async () => {
    bridge.getMatchReview.mockRejectedValue(new Error("The library is busy"));
    const { props } = dialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("The library is busy");
    await userEvent.click(footerClose());
    expect(props.onClose).toHaveBeenCalled();
  });

  it("needs the desktop app", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    dialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("This needs the CuePoint desktop app.");
  });

  it("is not there while closed", () => {
    dialog({ open: false });
    expect(bridge.getMatchReview).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the words of the questions (C107, C141, C164)", () => {
  it("names the playlist in curly quotes while it reads", async () => {
    bridge.getMatchReview.mockImplementation(() => new Promise(() => undefined));
    dialog();
    expect(await screen.findByRole("dialog", { name: "Sync “hJ” to your files" })).toBeInTheDocument();
  });

  it("ends in one grey Close once it has nothing to ask", async () => {
    bridge.getMatchReview.mockResolvedValue({ ids: [], tracks: [], total: 9, ticked: 0 });
    dialog();
    await screen.findByText(/Nothing is ticked/);
    expect(footerClose()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "OK" })).toBeNull();
  });
});
