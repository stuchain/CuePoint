/**
 * The save window (G4 step 4, option S1): a tick list with a count per field and one
 * count of files in the footer.
 *
 * What it must hold: the row counts move with a tick, Keep and the key style without a
 * new preview; the footer total is the engine's count of the union; a Save sends exactly
 * the ticked options; and a write that started can always be restored.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LIBRARY_CHANGED_EVENT } from "../../api/libraryChanges";
import type { TagWritePreview, TagWriteResult } from "../../api/cuepointBridge.types";
import { SAVE_CHOICES_KEY, previewOptions, DEFAULT_SAVE_CHOICES } from "./saveChoices";
import { SaveToFilesDialog } from "./SaveToFilesDialog";

function preview(overrides: Partial<TagWritePreview> = {}): TagWritePreview {
  return {
    preview_id: "p-1",
    options: previewOptions(DEFAULT_SAVE_CHOICES),
    total: 47,
    files: 38,
    fields: {},
    skipped: {},
    field_skipped: {},
    changes: [
      {
        track_id: 1,
        file_path: "C:\\music\\one.mp3",
        fields: { key: { from: null, to: "Am" }, year: { from: "2001", to: "2009" }, label: { from: "Old", to: "New" } },
        artwork: false,
      },
      { track_id: 2, file_path: "C:\\music\\two.mp3", fields: { genre: { from: null, to: "House" } }, artwork: false },
    ],
    cancelled: false,
    computed_at: "2026-10-13T10:00:00Z",
    duration_seconds: 0.1,
    summary_line: "",
    field_choices: {
      key: {
        normal: { replace: 5, fill: 31 },
        camelot: { replace: 7, fill: 29 },
        short: { replace: 1, fill: 2 },
      },
      genre: { replace: 4, fill: 22 },
      label: { replace: 6, fill: 18 },
      year: { replace: 3, fill: 25 },
      bpm: { replace: 0, fill: 6 },
      artwork: { fill: 9 },
    },
    ...overrides,
  };
}

const WRITTEN: TagWriteResult = {
  job_id: "w-1",
  preview_id: "p-1",
  total: 38,
  completed: 38,
  written: 38,
  failed: 0,
  skipped: {},
  fields: { key: 31 },
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
  localStorage.clear();
  results = { "w-1": WRITTEN };
  bridge = {
    previewTagWrite: vi.fn().mockResolvedValue({ preview: preview() }),
    countTagPreview: vi.fn().mockResolvedValue({ files: 38, fields: {} }),
    startTagWrite: vi.fn().mockResolvedValue({ job_id: "w-1", id: "w-1", state: "queued", preview_id: "p-1" }),
    startTagRestore: vi.fn().mockResolvedValue({
      job_id: "r-1",
      id: "r-1",
      state: "queued",
      writes: 38,
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
    total: 38,
    completed: 38,
    restored: 38,
    already: 0,
    skipped: 0,
    failed: 0,
    files: 38,
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
  localStorage.clear();
  vi.restoreAllMocks();
});

function open(overrides: Partial<Parameters<typeof SaveToFilesDialog>[0]> = {}) {
  const props = {
    open: true,
    selection: { track_ids: [1, 2, 3] },
    count: 47,
    onClose: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
  render(<SaveToFilesDialog {...props} />);
  return props;
}

async function ready() {
  await waitFor(() => expect(screen.getByRole("button", { name: /^Save to 38 files$/ })).toBeEnabled());
}

function row(name: string) {
  return screen.getByRole("checkbox", { name }).closest("li") as HTMLElement;
}

describe("opening", () => {
  it("is titled with the track count and asks for one preview with every field on", async () => {
    open();
    expect(screen.getByRole("dialog", { name: "Save 47 tracks to your files" })).toBeInTheDocument();
    await ready();
    expect(bridge.previewTagWrite).toHaveBeenCalledTimes(1);
    expect(bridge.previewTagWrite).toHaveBeenCalledWith({
      selection: { track_ids: [1, 2, 3] },
      options: {
        key_format: "normal",
        write_key: true,
        write_genre: true,
        write_label: true,
        write_year: true,
        write_bpm: true,
        write_comment: false,
        comment_text: "ok",
        embed_missing_artwork: true,
        // Keep off, whatever is remembered: the one preview is the superset.
        keep_existing: false,
      },
    });
  });

  it("lists Key, Genre, Label, Year, BPM and Artwork with a count each, and no Comment", async () => {
    open();
    await ready();
    const names = screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label") ?? box.closest("label")?.textContent);
    expect(names).toEqual(["Key", "Genre", "Label", "Year", "BPM", "Artwork", "Keep values already in the files"]);
    expect(within(row("Key")).getByText("31 files")).toBeInTheDocument();
    expect(within(row("Genre")).getByText("22 files")).toBeInTheDocument();
    expect(within(row("Artwork")).getByText("9 files")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /comment/i })).toBeNull();
  });

  it("starts with Key, Genre and Label ticked, Year, BPM and Artwork not, and Keep ticked", async () => {
    open();
    await ready();
    expect(["Key", "Genre", "Label"].map((n) => screen.getByRole("checkbox", { name: n }))).toSatisfy(
      (boxes: HTMLElement[]) => boxes.every((box) => (box as HTMLInputElement).checked),
    );
    for (const name of ["Year", "BPM", "Artwork"]) expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Keep values already in the files" })).toBeChecked();
  });

  it("shows ellipses for counts while a job-sized preview reads, with its progress", async () => {
    bridge.previewTagWrite.mockResolvedValue({ preview_id: "j-1", job_id: "j-1", id: "j-1", state: "queued" });
    let finish: (value: unknown) => void = () => undefined;
    bridge.getJob.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          if (id === "j-1") finish = resolve;
          else resolve({ id, state: "succeeded" });
        }),
    );
    // The progress read: a second kind of call that answers while the first waits.
    bridge.subscribeJobEvents = vi.fn((id: string, listener: (event: unknown) => void) => {
      listener({ id, state: "running", progress: { completed_tracks: 412, total_tracks: 1200 } });
      return () => undefined;
    });
    results["j-1"] = preview({ preview_id: "j-1" });
    open({ count: 1200 });
    expect(await screen.findByText("Reading 412 of 1,200 files…")).toBeInTheDocument();
    expect(within(row("Key")).getByText("…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    finish({ id: "j-1", state: "succeeded" });
    await ready();
    expect(within(row("Key")).getByText("31 files")).toBeInTheDocument();
  });

  it("says why when the preview is refused, and offers nothing to save", async () => {
    bridge.previewTagWrite.mockRejectedValue(new Error("A file check is running; wait for it"));
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("A file check is running; wait for it");
    expect(screen.queryByRole("button", { name: /^Save to/ })).toBeNull();
  });
});

describe("counts that move without a new preview", () => {
  it("add the files that would be replaced when Keep is turned off", async () => {
    open();
    await ready();
    await userEvent.click(screen.getByRole("checkbox", { name: "Keep values already in the files" }));
    expect(within(row("Key")).getByText("36 files")).toBeInTheDocument();
    expect(within(row("Genre")).getByText("26 files")).toBeInTheDocument();
    // Artwork is only ever fill.
    expect(within(row("Artwork")).getByText("9 files")).toBeInTheDocument();
    expect(bridge.previewTagWrite).toHaveBeenCalledTimes(1);
  });

  it("count the key in the style chosen", async () => {
    open();
    await ready();
    await userEvent.selectOptions(screen.getByLabelText("Key style"), "camelot");
    expect(within(row("Key")).getByText("29 files")).toBeInTheDocument();
    expect(bridge.previewTagWrite).toHaveBeenCalledTimes(1);
  });

  it("offer the three styles as examples", async () => {
    open();
    await ready();
    const options = within(screen.getByLabelText("Key style")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Am", "8A", "Amin"]);
  });

  it("dim an unticked row but keep its count", async () => {
    open();
    await ready();
    expect(row("Year")).toHaveAttribute("data-ticked", "false");
    expect(within(row("Year")).getByText("25 files")).toBeInTheDocument();
    expect(row("Key")).toHaveAttribute("data-ticked", "true");
  });
});

describe("the footer total", () => {
  it("is the engine's count of the union, asked with the ticked options after a short wait", async () => {
    open();
    await ready();
    expect(bridge.countTagPreview).toHaveBeenLastCalledWith({
      preview_id: "p-1",
      options: expect.objectContaining({ write_key: true, write_genre: true, write_label: true, write_year: false }),
    });
    bridge.countTagPreview.mockResolvedValue({ files: 41, fields: {} });
    await userEvent.click(screen.getByRole("checkbox", { name: "Year" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to 41 files" })).toBeEnabled());
    expect(bridge.countTagPreview).toHaveBeenLastCalledWith({
      preview_id: "p-1",
      options: expect.objectContaining({ write_year: true }),
    });
  });

  it("asks once for a burst of changes", async () => {
    open();
    await ready();
    bridge.countTagPreview.mockClear();
    await userEvent.click(screen.getByRole("checkbox", { name: "Year" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "BPM" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Keep values already in the files" }));
    await waitFor(() => expect(bridge.countTagPreview).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(bridge.countTagPreview).toHaveBeenCalledTimes(1);
  });
});

describe("remembered choices", () => {
  it("are restored on opening", async () => {
    localStorage.setItem(
      SAVE_CHOICES_KEY,
      JSON.stringify({
        fields: { key: false, genre: true, label: false, year: true, bpm: false, artwork: true },
        key_format: "camelot",
        keep_existing: false,
      }),
    );
    open();
    await waitFor(() => expect(bridge.countTagPreview).toHaveBeenCalled());
    expect(screen.getByRole("checkbox", { name: "Key" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Year" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Keep values already in the files" })).not.toBeChecked();
    expect(screen.getByLabelText("Key style")).toHaveValue("camelot");
    expect(bridge.previewTagWrite).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ key_format: "camelot", keep_existing: false }) }),
    );
  });

  it("are stored when Save is pressed, not on every tick", async () => {
    open();
    await ready();
    await userEvent.click(screen.getByRole("checkbox", { name: "BPM" }));
    await userEvent.selectOptions(screen.getByLabelText("Key style"), "short");
    expect(localStorage.getItem(SAVE_CHOICES_KEY)).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Save to 38 files$/ })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    expect(JSON.parse(localStorage.getItem(SAVE_CHOICES_KEY)!)).toEqual({
      fields: { key: true, genre: true, label: true, year: false, bpm: true, artwork: false },
      key_format: "short",
      keep_existing: true,
    });
  });
});

describe("when Save is greyed", () => {
  it("asks for a tick when none is ticked", async () => {
    open();
    await ready();
    for (const name of ["Key", "Genre", "Label"]) await userEvent.click(screen.getByRole("checkbox", { name }));
    expect(screen.getByText("Tick at least one value.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save to/ })).toBeDisabled();
  });

  it("says WAV files are skipped when every file is one", async () => {
    bridge.previewTagWrite.mockResolvedValue({
      preview: preview({ total: 5, files: 0, skipped: { wav: { count: 5, examples: [] } } }),
    });
    bridge.countTagPreview.mockResolvedValue({ files: 0, fields: {} });
    open({ count: 5 });
    expect(await screen.findByText("WAV files are skipped (Rekordbox does not read their tags).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save to 0 files$/ })).toBeDisabled();
  });

  it("names why files were skipped instead of saying they hold the values", async () => {
    bridge.previewTagWrite.mockResolvedValue({
      preview: preview({ total: 5, files: 0, skipped: { missing: { count: 4, examples: [] } } }),
    });
    bridge.countTagPreview.mockResolvedValue({ files: 0, fields: {} });
    open({ count: 5, canMarkSaved: true });
    expect(await screen.findByText("4 files skipped: files that are missing")).toBeInTheDocument();
    expect(screen.queryByText("These files already hold these values.")).toBeNull();
    expect(screen.getByRole("button", { name: /^Save to 0 files$/ })).toBeDisabled();
  });

  it("says the files already hold the values when nothing would change", async () => {
    bridge.countTagPreview.mockResolvedValue({ files: 0, fields: {} });
    open();
    expect(await screen.findByText("These files already hold these values.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save to 0 files$/ })).toBeDisabled();
  });
});

describe("marking tracks as saved", () => {
  beforeEach(() => {
    bridge.countTagPreview.mockResolvedValue({ files: 0, fields: {} });
  });

  it("turns the button into Mark N tracks as saved when the bar counted them", async () => {
    open({ canMarkSaved: true });
    const button = await screen.findByRole("button", { name: "Mark 47 tracks as saved" });
    expect(button).toBeEnabled();
    expect(screen.getByText("These files already hold these values.")).toBeInTheDocument();
  });

  it("calls the write, which records them, and says they are marked", async () => {
    results["w-1"] = { ...WRITTEN, total: 47, completed: 47, written: 0, skipped: { nothing_to_write: 47 } };
    const props = open({ canMarkSaved: true });
    await userEvent.click(await screen.findByRole("button", { name: "Mark 47 tracks as saved" }));
    await waitFor(() =>
      expect(bridge.startTagWrite).toHaveBeenCalledWith({
        preview_id: "p-1",
        options: expect.objectContaining({ write_key: true }),
      }),
    );
    expect(await screen.findByText("47 tracks are marked as saved.")).toBeInTheDocument();
    // Nothing was written, so there is nothing to restore.
    expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
    expect(props.onChanged).toHaveBeenCalled();
  });
});

describe("See changes", () => {
  it("lists what changes for the ticked fields, before struck and after, and goes back", async () => {
    open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "See changes" }));
    const table = screen.getByRole("table");
    // Keep is on: Label and Year already hold values, so only Key and Genre are written.
    expect(within(table).getByText("one.mp3")).toBeInTheDocument();
    expect(within(table).getByText("two.mp3")).toBeInTheDocument();
    expect(within(table).getByText("Key")).toBeInTheDocument();
    expect(within(table).queryByText(/Label/)).toBeNull();
    expect(within(table).queryByText(/Year/)).toBeNull();
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Key" })).toBeInTheDocument();
  });

  it("follows the ticks and Keep, strikes the old value, and says how many more there are", async () => {
    open({ count: 47 });
    await ready();
    await userEvent.click(screen.getByRole("checkbox", { name: "Keep values already in the files" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Year" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Genre" }));
    await userEvent.click(screen.getByRole("button", { name: "See changes" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("2001").tagName).toBe("S");
    expect(within(table).getByText("2009")).toBeInTheDocument();
    expect(within(table).queryByText("House")).toBeNull();
    expect(within(table).queryByText("two.mp3")).toBeNull();
    // The sample is truncated: 1 of the 38 files is shown.
    expect(screen.getByText("+37 more")).toBeInTheDocument();
  });

  it("opens straight on the list when asked to, and saves from there", async () => {
    open({ initialView: "changes" });
    expect(await screen.findByRole("table")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Save to 38 files" }));
    await waitFor(() => expect(bridge.startTagWrite).toHaveBeenCalled());
  });
});

describe("Save", () => {
  it("sends exactly the ticked options with the preview it read", async () => {
    open();
    await ready();
    await userEvent.click(screen.getByRole("checkbox", { name: "Label" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "BPM" }));
    await userEvent.selectOptions(screen.getByLabelText("Key style"), "short");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Save to 38 files$/ })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    await waitFor(() =>
      expect(bridge.startTagWrite).toHaveBeenCalledWith({
        preview_id: "p-1",
        options: {
          key_format: "short",
          write_key: true,
          write_genre: true,
          write_label: false,
          write_year: false,
          write_bpm: true,
          write_comment: false,
          comment_text: "ok",
          embed_missing_artwork: false,
          keep_existing: true,
        },
      }),
    );
  });

  it("says how it went, reminds about Reload Tag, announces the change, and ends with Done", async () => {
    const heard = vi.fn();
    window.addEventListener(LIBRARY_CHANGED_EVENT, heard);
    const props = open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    expect(await screen.findByText("Wrote 38 files.")).toBeInTheDocument();
    expect(screen.getByText(/Reload Tag/)).toBeInTheDocument();
    expect(props.onChanged).toHaveBeenCalled();
    expect(heard).toHaveBeenCalled();
    window.removeEventListener(LIBRARY_CHANGED_EVENT, heard);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("offers Restore after a write and restores that write", async () => {
    const props = open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Restore these files" }));
    await waitFor(() => expect(bridge.startTagRestore).toHaveBeenCalledWith({ job_id: "w-1" }));
    expect(await screen.findByText("Restored 38 files.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore these files" })).toBeNull();
    expect(props.onChanged).toHaveBeenCalledTimes(2);
  });

  it("offers Restore for a write that started and failed", async () => {
    bridge.getJob.mockImplementation(async (id: string) =>
      id === "w-1" ? { id, state: "failed", error: { message: "The disk is full" } } : { id, state: "succeeded" },
    );
    open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The disk is full");
    expect(screen.getByText(/The write did not finish/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore these files" })).toBeEnabled();
  });

  it("reads the files again when the engine no longer holds the preview, and clears its line once ready", async () => {
    bridge.startTagWrite.mockRejectedValue(
      Object.assign(new Error("No tag write preview p-1. Preview again."), {
        status: 404,
        code: "TAG_WRITE_PREVIEW_NOT_FOUND",
      }),
    );
    const props = open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    await waitFor(() => expect(bridge.previewTagWrite).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
    expect(props.onChanged).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await ready();
  });

  it("leaves the preview alone for any other refusal, so Save can be tried again", async () => {
    bridge.startTagWrite.mockRejectedValueOnce(new Error("A file check is running; wait for it"));
    open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A file check is running");
    await ready();
    expect(bridge.previewTagWrite).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    expect(await screen.findByText("Wrote 38 files.")).toBeInTheDocument();
  });

  it("says marked from the engine's answer, not from the button that was pressed", async () => {
    // The button said 38 files, but the engine found every file already held the values.
    results["w-1"] = { ...WRITTEN, written: 0, skipped: { nothing_to_write: 38 } };
    open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    expect(await screen.findByText("47 tracks are marked as saved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
  });

  it("moves focus to the result, and the library is told once", async () => {
    const heard = vi.fn();
    window.addEventListener(LIBRARY_CHANGED_EVENT, heard);
    const props = open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    const headline = await screen.findByText("Wrote 38 files.");
    await waitFor(() => expect(headline).toHaveFocus());
    expect(heard).toHaveBeenCalledTimes(1);
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener(LIBRARY_CHANGED_EVENT, heard);
  });

  it("shows the write's progress and can stop it", async () => {
    let finish: (value: unknown) => void = () => undefined;
    bridge.getJob.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          if (id === "w-1") finish = resolve;
          else resolve({ id, state: "succeeded" });
        }),
    );
    bridge.subscribeJobEvents = vi.fn((id: string, listener: (event: unknown) => void) => {
      listener({ id, state: "running", progress: { completed_tracks: 12, total_tracks: 38 } });
      return () => undefined;
    });
    open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /^Save to 38 files$/ }));
    expect(await screen.findByText("Saving 12 of 38 files…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(bridge.cancelJob).toHaveBeenCalledWith("w-1");
    await act(async () => finish({ id: "w-1", state: "cancelled" }));
  });
});

describe("closing and stopping", () => {
  function slowRead() {
    bridge.previewTagWrite.mockResolvedValue({ preview_id: "j-1", job_id: "j-1", id: "j-1", state: "queued" });
    bridge.getJob.mockImplementation(
      (id: string) => new Promise((resolve) => (id === "j-1" ? undefined : resolve({ id, state: "succeeded" }))),
    );
  }

  it("cancels a job-sized preview that is still reading when the window is closed, then closes", async () => {
    slowRead();
    const props = open({ count: 1200 });
    await screen.findByText(/Reading the files/);
    await userEvent.keyboard("{Escape}");
    expect(bridge.cancelJob).toHaveBeenCalledWith("j-1");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(bridge.cancelJob.mock.invocationCallOrder[0]).toBeLessThan((props.onClose as Mock).mock.invocationCallOrder[0]!);
  });

  it("does the same from the close button", async () => {
    slowRead();
    const props = open({ count: 1200 });
    await screen.findByText(/Reading the files/);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bridge.cancelJob).toHaveBeenCalledWith("j-1");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("closes without cancelling anything once the files are read", async () => {
    const props = open();
    await ready();
    await userEvent.keyboard("{Escape}");
    expect(bridge.cancelJob).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("a preview that did not finish", () => {
  it("is a failure: no count is asked, counts stay as ellipses, and Try again reads the files again", async () => {
    bridge.previewTagWrite.mockResolvedValueOnce({ preview: preview({ cancelled: true }) });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("stopped before it read every file");
    expect(within(row("Key")).getByText("…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save to/ })).toBeNull();
    expect(bridge.countTagPreview).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(bridge.previewTagWrite).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the footer count going wrong", () => {
  it("discards an answer that arrives after a newer change", async () => {
    open();
    await ready();
    let late: (value: unknown) => void = () => undefined;
    bridge.countTagPreview.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)));
    await userEvent.click(screen.getByRole("checkbox", { name: "Year" }));
    await waitFor(() => expect(bridge.countTagPreview).toHaveBeenCalledTimes(2));
    bridge.countTagPreview.mockResolvedValue({ files: 44, fields: {} });
    await userEvent.click(screen.getByRole("checkbox", { name: "BPM" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to 44 files" })).toBeEnabled());
    await act(async () => late({ files: 12, fields: {} }));
    expect(screen.getByRole("button", { name: "Save to 44 files" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save to 12 files" })).toBeNull();
  });

  it("reads the files again when the engine no longer holds the preview", async () => {
    bridge.countTagPreview.mockRejectedValueOnce(
      Object.assign(new Error("No tag write preview p-1. Preview again."), { code: "TAG_WRITE_PREVIEW_NOT_FOUND" }),
    );
    open();
    await waitFor(() => expect(bridge.previewTagWrite).toHaveBeenCalledTimes(2));
    await ready();
  });

  it("offers Try again for any other failure, which asks for the count again", async () => {
    bridge.countTagPreview.mockRejectedValueOnce(new Error("The count failed"));
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("The count failed");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(bridge.previewTagWrite).toHaveBeenCalledTimes(1);
  });
});

describe("See changes, in the style chosen", () => {
  it("shows the key as the style says, and with Keep off the values the files hold", async () => {
    bridge.previewTagWrite.mockResolvedValue({
      preview: preview({
        changes: [{ track_id: 1, file_path: "/m/one.mp3", fields: { key: { from: "Dm", to: "Am" } }, artwork: false }],
      }),
    });
    open();
    await ready();
    await userEvent.selectOptions(screen.getByLabelText("Key style"), "camelot");
    await userEvent.click(screen.getByRole("checkbox", { name: "Keep values already in the files" }));
    await userEvent.click(screen.getByRole("button", { name: "See changes" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("8A")).toBeInTheDocument();
    expect(within(table).queryByText("Am")).toBeNull();
  });
});

describe("focus and announcements", () => {
  it("goes to Back on entering the list, and back to See changes on leaving it", async () => {
    open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "See changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Back/ })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "See changes" })).toHaveFocus());
  });

  it("ties each row's count to its tick and announces the reason politely", async () => {
    open();
    await ready();
    const key = screen.getByRole("checkbox", { name: "Key" });
    expect(key).toHaveAccessibleDescription("31 files");
    for (const name of ["Key", "Genre", "Label"]) await userEvent.click(screen.getByRole("checkbox", { name }));
    const reason = screen.getByText("Tick at least one value.");
    expect(reason).toHaveAttribute("role", "status");
    expect(reason).toHaveAttribute("aria-live", "polite");
  });
});
