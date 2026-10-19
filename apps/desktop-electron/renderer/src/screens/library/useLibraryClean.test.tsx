/**
 * Saving to the files from the Library's Clean path (G4 step 4): the page's `onChanged`
 * and the library-change announcement each fire once for a save, not twice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LIBRARY_CHANGED_EVENT } from "../../api/libraryChanges";
import type { TagWritePreview, TagWriteResult } from "../../api/cuepointBridge.types";
import type { LibraryBatchController } from "./useLibraryBatch";
import { useLibraryClean } from "./useLibraryClean";

const PREVIEW: TagWritePreview = {
  preview_id: "p-1",
  options: {} as TagWritePreview["options"],
  total: 3,
  files: 3,
  fields: {},
  skipped: {},
  field_skipped: {},
  changes: [],
  cancelled: false,
  computed_at: "2026-10-13T10:00:00Z",
  duration_seconds: 0.1,
  summary_line: "",
  field_choices: {
    key: {
      normal: { replace: 0, fill: 3 },
      camelot: { replace: 0, fill: 3 },
      short: { replace: 0, fill: 3 },
    },
    year: { replace: 0, fill: 0 },
    bpm: { replace: 0, fill: 0 },
    label: { replace: 0, fill: 0 },
    genre: { replace: 0, fill: 0 },
  },
};

const WRITTEN: TagWriteResult = {
  job_id: "w-1",
  preview_id: "p-1",
  total: 3,
  completed: 3,
  written: 3,
  failed: 0,
  skipped: {},
  fields: {},
  field_skipped: {},
  failed_fields: 0,
  problems: [],
  problems_truncated: false,
  cancelled: false,
  duration_seconds: 0.1,
  summary_line: "",
};

function Harness({ onChanged }: { onChanged: () => void }) {
  const clean = useLibraryClean({ batch: {} as LibraryBatchController, onChanged });
  const handlers = clean.handlersFor({ selection: { track_ids: [1, 2, 3] }, count: 3 });
  return (
    <>
      <button type="button" onClick={handlers.onWriteTags}>
        open save
      </button>
      {clean.dialogs}
    </>
  );
}

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  localStorage.clear();
});

describe("useLibraryClean's save to files", () => {
  it("opens the save window for the selection and tells the page and the library once each", async () => {
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      previewTagWrite: vi.fn().mockResolvedValue({ preview: PREVIEW }),
      countTagPreview: vi.fn().mockResolvedValue({ files: 3, fields: {} }),
      startTagWrite: vi.fn().mockResolvedValue({ job_id: "w-1", id: "w-1", state: "queued", preview_id: "p-1" }),
      getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
      getJobResults: vi.fn(async (id: string) => ({ id, state: "succeeded", result: WRITTEN })),
    };
    const heard = vi.fn();
    window.addEventListener(LIBRARY_CHANGED_EVENT, heard);
    const onChanged = vi.fn();
    render(<Harness onChanged={onChanged} />);

    await userEvent.click(screen.getByRole("button", { name: "open save" }));
    const save = await screen.findByRole("button", { name: "Sync 3 files" });
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByRole("dialog", { name: "Sync 3 tracks to your files" })).toBeInTheDocument();
    await userEvent.click(save);

    expect(await screen.findByText("Synced 3 files.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(LIBRARY_CHANGED_EVENT, heard);
  });
});
