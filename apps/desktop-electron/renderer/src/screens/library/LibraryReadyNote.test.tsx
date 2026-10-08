/**
 * The note under the Library's header after an import (LIB-1, DEC-132).
 *
 * An import is followed by work nobody asked for: checking the files, reading
 * the cover art, drawing waveforms. Without a word on the page the Library
 * looks finished and then slows down. The note says what is going on, that the
 * user can keep working, and where progress is. It shows only after an import
 * (never while someone works in the table), only while one of the five jobs
 * runs, and it can be dismissed for the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import { LibraryReadyNote } from "./LibraryReadyNote";
import { isReadyNoteOpen } from "./libraryNoticeMemory";

const AFTER_IMPORT = 1_700_000_000_000;

function job(overrides: Partial<EngineJobSummary> = {}): EngineJobSummary {
  return {
    id: "job-1",
    type: "waveform_analysis",
    state: "running",
    created_at: "2026-10-08T10:00:00Z",
    updated_at: "2026-10-08T10:00:00Z",
    progress: { completed_tracks: 1204, total_tracks: 12000 },
    ...overrides,
  };
}

let listJobs: ReturnType<typeof vi.fn>;

function running(...jobs: EngineJobSummary[]) {
  listJobs.mockResolvedValue({ jobs, active_count: jobs.length });
}

beforeEach(() => {
  sessionStorage.clear();
  listJobs = vi.fn().mockResolvedValue({ jobs: [], active_count: 0 });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { listJobs };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the ready note", () => {
  it("explains the work, says to keep going, and says where progress is", async () => {
    running(job());
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("Getting your library ready.");
    expect(note).toHaveTextContent(
      "CuePoint is checking that your music files are where Rekordbox says, reading their cover art and drawing each track's waveform.",
    );
    expect(note).toHaveTextContent("You can browse and play while it works.");
    expect(note).toHaveTextContent("Progress is in the status strip at the bottom");
    expect(note).toHaveTextContent("Activity shows each step.");
  });

  it("says what is happening now, with the count", async () => {
    running(job());
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);

    expect(await screen.findByText("Now: drawing waveforms, 1,204 of 12,000")).toBeInTheDocument();
  });

  it.each([
    ["file_check", "Now: checking your music files"],
    ["artwork_scan", "Now: reading cover art"],
    ["waveform_analysis", "Now: drawing waveforms"],
    ["marks_backfill", "Now: reading cue points and beat grids"],
    ["credit_index", "Now: getting artist and label pages ready"],
  ])("shows for %s", async (type, now) => {
    running(job({ type, progress: {} }));
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);

    expect(await screen.findByText(now)).toBeInTheDocument();
  });

  it("stays away for work that is not the chain after an import", async () => {
    running(job({ type: "clean_match" }), job({ id: "b", type: "library_batch" }));
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);

    await waitFor(() => expect(listJobs).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("finds the chain's job behind other work", async () => {
    running(job({ type: "clean_match" }), job({ id: "b", type: "artwork_scan", progress: {} }));
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);

    expect(await screen.findByText("Now: reading cover art")).toBeInTheDocument();
  });

  it("is not mounted when nothing was imported, however busy the engine is", () => {
    expect(isReadyNoteOpen(null)).toBe(false);
    expect(isReadyNoteOpen(AFTER_IMPORT)).toBe(true);
  });

  it("is done for the import once the chain has ended, and later work does not bring it back", async () => {
    running(job());
    const { rerender } = render(<LibraryReadyNote armedAt={AFTER_IMPORT} pollMs={20} />);
    await screen.findByRole("status");

    running();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(isReadyNoteOpen(AFTER_IMPORT)).toBe(false);

    // A file check (or waveform run) starting again later is not the import's work.
    running(job({ type: "file_check", progress: {} }));
    rerender(<LibraryReadyNote armedAt={AFTER_IMPORT} pollMs={20} />);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is done when the first answer finds no chain job", async () => {
    running();
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);

    await waitFor(() => expect(isReadyNoteOpen(AFTER_IMPORT)).toBe(false));
  });

  it("goes when the chain ends", async () => {
    running(job());
    const { rerender } = render(<LibraryReadyNote armedAt={AFTER_IMPORT} pollMs={20} />);
    await screen.findByRole("status");

    running();
    rerender(<LibraryReadyNote armedAt={AFTER_IMPORT} pollMs={20} />);

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("can be dismissed, and stays dismissed for the session", async () => {
    running(job());
    const { unmount } = render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);
    await screen.findByRole("status");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss this note" }));
    expect(screen.queryByRole("status")).toBeNull();

    // Leaving the Library and coming back is the same session.
    unmount();
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);
    await waitFor(() => expect(listJobs).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("comes back for the next import", async () => {
    running(job());
    const { unmount } = render(<LibraryReadyNote armedAt={AFTER_IMPORT} />);
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this note" }));
    unmount();

    render(<LibraryReadyNote armedAt={AFTER_IMPORT + 5000} />);
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("reports when it is gone, so the next notice can take the line", async () => {
    running(job());
    const onShownChange = vi.fn();
    render(<LibraryReadyNote armedAt={AFTER_IMPORT} onShownChange={onShownChange} />);
    await screen.findByRole("status");

    expect(onShownChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this note" }));
    expect(onShownChange).toHaveBeenLastCalledWith(false);
  });
});
