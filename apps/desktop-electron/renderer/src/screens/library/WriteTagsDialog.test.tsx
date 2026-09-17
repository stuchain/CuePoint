/**
 * "Write tags to files…" (CLEAN-13, DEC-070).
 *
 * The property worth the most: **nothing can be written before a preview has
 * answered**, and a preview answers only for the options it was asked with.
 * After a write, Restore is offered — and a write that started and failed is
 * offered for restoring too, because it may have written files.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { TagWritePreview, TagWriteResult } from "../../api/cuepointBridge.types";
import { DEFAULT_TAG_OPTIONS } from "./tagWriting";
import { WriteTagsDialog } from "./WriteTagsDialog";

function preview(overrides: Partial<TagWritePreview> = {}): TagWritePreview {
  return {
    preview_id: "p-1",
    options: DEFAULT_TAG_OPTIONS,
    total: 3,
    files: 2,
    fields: { key: 2, year: 1 },
    skipped: { wav: { count: 1, examples: [] } },
    field_skipped: {},
    changes: [
      {
        track_id: 1,
        file_path: "C:\\music\\one.mp3",
        fields: { key: { from: "Am", to: "8A" }, year: { from: null, to: "2009" } },
        artwork: false,
      },
    ],
    cancelled: false,
    computed_at: "2026-09-16T10:00:00Z",
    duration_seconds: 0.1,
    summary_line: "",
    ...overrides,
  };
}

const WRITTEN: TagWriteResult = {
  job_id: "w-1",
  preview_id: "p-1",
  total: 2,
  completed: 2,
  written: 2,
  failed: 0,
  skipped: {},
  fields: { key: 2 },
  field_skipped: {},
  failed_fields: 0,
  problems: [],
  problems_truncated: false,
  cancelled: false,
  duration_seconds: 0.3,
  summary_line: "",
};

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock>;
let results: Record<string, unknown>;

beforeEach(() => {
  results = { "w-1": WRITTEN };
  bridge = {
    previewTagWrite: vi.fn().mockResolvedValue({ preview: preview() }),
    startTagWrite: vi.fn().mockResolvedValue({ job_id: "w-1", id: "w-1", state: "queued", preview_id: "p-1" }),
    startTagRestore: vi.fn().mockResolvedValue({
      job_id: "r-1",
      id: "r-1",
      state: "queued",
      writes: 2,
      unconfirmed: 0,
      restored_job_id: "w-1",
      track_id: null,
    }),
    getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({ id, state: "succeeded", result: results[id] })),
    cancelJob: vi.fn().mockResolvedValue({ id: "x", state: "cancelled" }),
  };
  results["r-1"] = {
    job_id: "r-1",
    restored_job_id: "w-1",
    track_id: null,
    total: 2,
    completed: 2,
    restored: 2,
    already: 0,
    skipped: 0,
    failed: 0,
    files: 2,
    problems: [],
    problems_truncated: false,
    cancelled: false,
    duration_seconds: 0.1,
    summary_line: "",
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function dialog(overrides: Partial<Parameters<typeof WriteTagsDialog>[0]> = {}) {
  const props = {
    open: true,
    selection: { track_ids: [1, 2, 3] },
    count: 3,
    onClose: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
  render(<WriteTagsDialog {...props} />);
  return props;
}

function primary(name: RegExp | string) {
  return screen.getByRole("button", { name });
}

describe("before a preview", () => {
  it("offers Preview and no Write", () => {
    dialog();
    expect(primary("Preview")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Write/ })).toBeNull();
    expect(bridge.startTagWrite).not.toHaveBeenCalled();
  });

  it("opens with the comment off and every option sent", async () => {
    dialog();
    expect(screen.getByRole("checkbox", { name: "Comment" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Key" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /artwork/ })).not.toBeChecked();
    await userEvent.click(primary("Preview"));
    await waitFor(() =>
      expect(bridge.previewTagWrite).toHaveBeenCalledWith({
        selection: { track_ids: [1, 2, 3] },
        options: DEFAULT_TAG_OPTIONS,
      }),
    );
  });

  it("refuses options that write nothing, without asking the engine", async () => {
    dialog();
    for (const name of ["Key", "Year", "Label"]) {
      await userEvent.click(screen.getByRole("checkbox", { name }));
    }
    await userEvent.click(primary("Preview"));
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one field/);
    expect(bridge.previewTagWrite).not.toHaveBeenCalled();
  });
});

describe("the preview", () => {
  it("is shown, says nothing was written, and only then offers Write", async () => {
    dialog();
    await userEvent.click(primary("Preview"));
    const answer = await screen.findByRole("region", { name: "Preview" });
    expect(within(answer).getByText("Writing would change 2 files of 3. Nothing has been written yet.")).toBeInTheDocument();
    expect(within(answer).getByText("Key: 2 files")).toBeInTheDocument();
    expect(within(answer).getByText(/1 file skipped: WAV files/)).toBeInTheDocument();
    expect(within(answer).getByText("one.mp3")).toBeInTheDocument();
    expect(within(answer).getByText("Key: Am → 8A · Year: — → 2009")).toBeInTheDocument();
    expect(primary("Write 2 files")).toBeEnabled();
  });

  it("is thrown away when an option changes, and Write goes with it", async () => {
    dialog();
    await userEvent.click(primary("Preview"));
    await screen.findByRole("region", { name: "Preview" });
    await userEvent.click(screen.getByRole("checkbox", { name: "BPM" }));
    expect(screen.queryByRole("region", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Write/ })).toBeNull();
    expect(primary("Preview")).toBeEnabled();
  });

  it("offers no Write when it would change nothing", async () => {
    bridge.previewTagWrite.mockResolvedValue({ preview: preview({ files: 0, changes: [] }) });
    dialog();
    await userEvent.click(primary("Preview"));
    await screen.findByText(/Nothing to write/);
    expect(primary("Write")).toBeDisabled();
  });

  it("is followed as a job when it is one", async () => {
    bridge.previewTagWrite.mockResolvedValue({ preview_id: "j-1", job_id: "j-1", id: "j-1", state: "queued" });
    results["j-1"] = preview({ preview_id: "j-1", files: 5, total: 5 });
    dialog();
    await userEvent.click(primary("Preview"));
    expect(await screen.findByText(/Writing would change 5 files of 5/)).toBeInTheDocument();
    expect(bridge.getJob).toHaveBeenCalledWith("j-1");
  });

  it("shows a refusal in the engine's words", async () => {
    bridge.previewTagWrite.mockRejectedValue(new Error("A file check is running; wait for it"));
    dialog();
    await userEvent.click(primary("Preview"));
    expect(await screen.findByRole("alert")).toHaveTextContent("A file check is running; wait for it");
    expect(screen.queryByRole("button", { name: /^Write/ })).toBeNull();
  });
});

describe("writing", () => {
  async function previewed() {
    const props = dialog();
    await userEvent.click(primary("Preview"));
    await screen.findByRole("region", { name: "Preview" });
    return props;
  }

  it("writes the preview it showed, says how it went, and reminds about Reload Tag", async () => {
    const props = await previewed();
    await userEvent.click(primary("Write 2 files"));
    await waitFor(() => expect(bridge.startTagWrite).toHaveBeenCalledWith({ preview_id: "p-1" }));
    const written = await screen.findByRole("region", { name: "Written" });
    expect(within(written).getByText("Wrote 2 files.")).toBeInTheDocument();
    expect(within(written).getByText(/Reload Tag/)).toBeInTheDocument();
    expect(props.onChanged).toHaveBeenCalled();
    // One way out once it is written.
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("offers Restore after a write, and restores that write", async () => {
    await previewed();
    await userEvent.click(primary("Write 2 files"));
    await userEvent.click(await screen.findByRole("button", { name: "Restore these files" }));
    await waitFor(() => expect(bridge.startTagRestore).toHaveBeenCalledWith({ job_id: "w-1" }));
    expect(await screen.findByText("Restored 2 files.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore these files" })).toBeNull();
  });

  it("offers Restore for a write that started and failed", async () => {
    bridge.getJob.mockImplementation(async (id: string) =>
      id === "w-1" ? { id, state: "failed", error: { message: "The disk is full" } } : { id, state: "succeeded" },
    );
    const props = await previewed();
    await userEvent.click(primary("Write 2 files"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The disk is full");
    expect(screen.getByText(/The write did not finish/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore these files" })).toBeEnabled();
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("goes back to the options when the engine refuses before writing", async () => {
    bridge.startTagWrite.mockRejectedValue(new Error("No tag write preview p-1. Preview again."));
    const props = await previewed();
    await userEvent.click(primary("Write 2 files"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Preview again");
    expect(screen.queryByRole("region", { name: "Preview" })).toBeNull();
    expect(primary("Preview")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Restore these files" })).toBeNull();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it("can stop a write that is a job", async () => {
    let finish: (value: unknown) => void = () => undefined;
    bridge.getJob.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          if (id === "w-1") finish = resolve;
          else resolve({ id, state: "succeeded" });
        }),
    );
    await previewed();
    await userEvent.click(primary("Write 2 files"));
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(bridge.cancelJob).toHaveBeenCalledWith("w-1");
    finish({ id: "w-1", state: "cancelled" });
  });
});
