/**
 * Clean's Fix values tab (PAGES-07B, FLW-12).
 *
 * Edit values, use Beatport's values and save changes into the files, for the
 * tracks passed in or a scope picked here. The properties worth the most: the
 * scope is exactly what the Library's "In playlist" rule says, a Key is never
 * among Beatport's choices (an accepted match already gives it), and a big
 * batch asks before it runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { LibrarySearchResponse } from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { FixValues } from "./FixValues";
import type { CleanTracks } from "./cleanTracks";
import type { FixAction } from "./cleanLink";

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock>;
let counts: Record<string, number>;

const EMPTY_PREVIEW = {
  preview_id: "p-1",
  options: {},
  total: 3,
  files: 3,
  fields: {},
  skipped: {},
  field_skipped: {},
  changes: [],
  cancelled: false,
  computed_at: "2026-10-08T10:00:00Z",
  duration_seconds: 0.1,
  summary_line: "",
};

function answer(params: Record<string, unknown>, total: number): LibrarySearchResponse {
  return {
    query: "",
    total,
    limit: 1,
    offset: 0,
    tracks: [],
    library_empty: false,
    mode: "browse",
    scope: null,
    collection_scope: null,
    collection_id: null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

const applied = (operation: string, total: number) => ({
  applied: {
    batch_id: "b1",
    operation,
    target: "x",
    total,
    changed: total,
    unchanged: 0,
    failed: 0,
    cancelled: false,
  },
});

beforeEach(() => {
  counts = { "playlist:10": 2, "set:7": 5, "playlist:10,set:7": 6 };
  bridge = {
    getLibraryPlaylists: vi.fn().mockResolvedValue({
      playlists: [
        { id: 10, parent_id: null, name: "Friday", kind: "playlist", depth: 0, position: 0, path: "Friday", track_count: 2 },
      ],
      total: 1,
    }),
    getCollections: vi.fn().mockResolvedValue({
      collections: [
        { id: 3, parent_id: null, kind: "collection", name: "Peak", position: 0, depth: 0, rules: null, entry_count: 4, track_count: 4 },
        { id: 7, parent_id: null, kind: "set", name: "Saturday", position: 1, depth: 0, rules: null, entry_count: 5, track_count: 5 },
      ],
      total: 2,
    }),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => {
      const rule = (params.filters as { rules: Array<{ field: string; value: unknown }> } | null)?.rules[0];
      const key = Array.isArray(rule?.value)
        ? (rule.value as Array<{ kind: string; id: number }>).map((s) => `${s.kind}:${s.id}`).join(",")
        : "";
      return answer(params, counts[key] ?? 0);
    }),
    applyBatch: vi.fn(async (params: { operation: { kind: string } }) => applied(params.operation.kind, 3)),
    setTrackOverrides: vi.fn().mockResolvedValue({}),
    applyMatch: vi.fn(),
    decideMatch: vi.fn(),
    previewTagWrite: vi.fn().mockResolvedValue({ preview: EMPTY_PREVIEW }),
    startTagWrite: vi.fn(),
    getJob: vi.fn(),
    getJobResults: vi.fn(),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function open(tracks?: CleanTracks, action: FixAction | null = null, libraryCount = 3880) {
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <FixValues
        opening={tracks ? { tracks, action, token: "t1" } : null}
        libraryCount={libraryCount}
        onChanged={onChanged}
      />
    </ToastProvider>,
  );
  return { onChanged };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("with nothing chosen", () => {
  it("says how to choose tracks, and offers nothing to do yet", async () => {
    open();
    expect(
      await screen.findByText(
        "Choose tracks: pick playlists here, or select tracks in the Library and use Fix ▸.",
      ),
    ).toBeInTheDocument();
    for (const name of ["Edit values…", "Use Beatport's values…", "Save changes into the files…"]) {
      expect(button(name)).toBeDisabled();
    }
  });
});

describe("the scope picker", () => {
  it("lists playlists, Collections and Sets, each under its own heading", async () => {
    open();
    const places = await screen.findByRole("group", { name: /Playlists, Collections and Sets/ });
    await within(places).findByRole("checkbox", { name: "Friday" });
    expect(within(places).getByText("Rekordbox playlists")).toBeInTheDocument();
    expect(within(places).getByText("Collections")).toBeInTheDocument();
    expect(within(places).getByText("Sets")).toBeInTheDocument();
    expect(within(places).getByRole("checkbox", { name: "Peak" })).toBeInTheDocument();
    expect(within(places).getByRole("checkbox", { name: "Saturday" })).toBeInTheDocument();
  });

  it("counts the tracks of the places ticked with the same rule the Library's In playlist makes", async () => {
    open();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Friday" }));
    expect(await screen.findByText("2 tracks")).toBeInTheDocument();
    const asked = bridge.browseLibrary!.mock.calls.at(-1)![0] as { filters: unknown };
    expect(asked.filters).toEqual({
      match: "all",
      rules: [{ field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 10 }] }],
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Saturday" }));
    expect(await screen.findByText("6 tracks")).toBeInTheDocument();
    expect(button("Edit values…")).toBeEnabled();
  });

  it("works on the whole library, counted from Health", async () => {
    open();
    fireEvent.click(await screen.findByRole("radio", { name: "The whole library" }));
    expect(await screen.findByText("3,880 tracks")).toBeInTheDocument();
    fireEvent.click(button("Edit values…"));
    fireEvent.change(await screen.findByLabelText("Genre value"), { target: { value: "House" } });
    const dialog = screen.getByRole("dialog", { name: "Edit values" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    // 3,880 tracks is a big batch: the editor asks with the number first (LIB-11).
    fireEvent.click(await within(dialog).findByRole("button", { name: "Change 3,880 tracks" }));
    await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
    const call = bridge.applyBatch!.mock.calls[0]![0] as { selection: { query: unknown } };
    expect(call.selection).toEqual({ query: {} });
  });

  it("empties the count again when the last place is unticked", async () => {
    open();
    const friday = await screen.findByRole("checkbox", { name: "Friday" });
    fireEvent.click(friday);
    await screen.findByText("2 tracks");
    fireEvent.click(friday);
    expect(
      await screen.findByText(/Choose tracks: pick playlists here/),
    ).toBeInTheDocument();
    expect(button("Edit values…")).toBeDisabled();
  });
});

describe("tracks passed in by an opener", () => {
  it("arrive chosen, and are what the buttons act on", async () => {
    open({ ids: [4, 5, 6] });
    const chosen = await screen.findByRole("radio", { name: "The 3 tracks you chose" });
    expect(chosen).toBeChecked();
    expect(screen.queryByText(/Choose tracks: pick playlists here/)).toBeNull();

    fireEvent.click(button("Edit values…"));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    fireEvent.change(within(dialog).getByLabelText("Genre value"), { target: { value: "House" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(bridge.applyBatch).toHaveBeenCalledWith({
        selection: { track_ids: [4, 5, 6] },
        operation: { kind: "set_override", value: { field: "genre", value: "House" } },
      }),
    );
  });

  it("edit one track the way Track details does", async () => {
    open({ ids: [9] });
    await screen.findByRole("radio", { name: "The 1 track you chose" });
    fireEvent.click(button("Edit values…"));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    fireEvent.change(within(dialog).getByLabelText("BPM value"), { target: { value: "128" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 9, bpm: 128 }),
    );
  });

  it("start the action the opener named", async () => {
    open({ ids: [4, 5] }, "edit");
    expect(await screen.findByRole("dialog", { name: "Edit values" })).toBeInTheDocument();
  });

  it("can be put aside for a scope picked here", async () => {
    open({ ids: [4, 5, 6] });
    fireEvent.click(await screen.findByRole("radio", { name: "The whole library" }));
    expect(await screen.findByText("3,880 tracks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "The 3 tracks you chose" }));
    expect(await screen.findByText("3 tracks")).toBeInTheDocument();
  });

  it("carry a described selection with the count it had", async () => {
    open({ query: { filters: { match: "all", rules: [{ field: "key", operator: "is_empty" }] } }, count: 40 });
    expect(await screen.findByRole("radio", { name: "The 40 tracks you chose" })).toBeChecked();
  });
});

describe("Use Beatport's values", () => {
  it("never offers the key: an accepted match already gives it", async () => {
    open({ ids: [4, 5, 6] }, "beatport");
    const dialog = await screen.findByRole("dialog", { name: "Use Beatport's values" });
    for (const field of ["BPM", "Genre", "Label", "Year"]) {
      expect(within(dialog).getByRole("checkbox", { name: field })).toBeInTheDocument();
    }
    expect(within(dialog).queryByRole("checkbox", { name: /key/i })).toBeNull();
    expect(dialog).toHaveTextContent(/accepted match already gives/i);
  });

  it("copies the fields ticked from each track's accepted match", async () => {
    open({ ids: [4, 5, 6] }, "beatport");
    const dialog = await screen.findByRole("dialog", { name: "Use Beatport's values" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Genre" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(bridge.applyBatch).toHaveBeenCalledWith({
        selection: { track_ids: [4, 5, 6] },
        operation: { kind: "apply_match", value: ["genre"] },
      }),
    );
  });
});

describe("Save changes into the files", () => {
  it("previews before it writes anything", async () => {
    open({ ids: [4, 5, 6] });
    fireEvent.click(await screen.findByRole("button", { name: "Save changes into the files…" }));
    const dialog = await screen.findByRole("dialog", { name: "Save changes into the files" });
    expect(bridge.previewTagWrite).not.toHaveBeenCalled();
    expect(bridge.startTagWrite).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(bridge.previewTagWrite).toHaveBeenCalledWith(
        expect.objectContaining({ selection: { track_ids: [4, 5, 6] } }),
      ),
    );
    expect(bridge.startTagWrite).not.toHaveBeenCalled();
  });
});

describe("a big batch (LIB-11)", () => {
  const BIG: CleanTracks = {
    query: { filters: { match: "all", rules: [{ field: "key", operator: "is_empty" }] } },
    count: 4213,
  };

  it("asks with the number before it changes anything above 1,000 tracks", async () => {
    open(BIG, "beatport");
    const dialog = await screen.findByRole("dialog", { name: "Use Beatport's values" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Genre" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    const ask = await screen.findByRole("dialog", { name: "Change 4,213 tracks?" });
    expect(ask).toHaveTextContent("Apply Beatport's genre to 4,213 tracks?");
    expect(ask).toHaveTextContent("It runs in the background; you can keep working.");
    expect(ask).toHaveTextContent("Every change is recorded in each track's History");
    expect(ask).toHaveTextContent("Activity");
    expect(bridge.applyBatch).not.toHaveBeenCalled();

    fireEvent.click(within(ask).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalledTimes(1));
  });

  it("asks before an edit above 1,000 tracks too", async () => {
    open(BIG, "edit");
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    fireEvent.change(within(dialog).getByLabelText("Genre value"), { target: { value: "House" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    expect(await within(dialog).findByText("Change 4,213 tracks?")).toBeInTheDocument();
    expect(bridge.applyBatch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Change 4,213 tracks" }));
    await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalledTimes(1));
  });

  it("runs nothing when the question is cancelled", async () => {
    open(BIG, "beatport");
    const dialog = await screen.findByRole("dialog", { name: "Use Beatport's values" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Genre" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    const ask = await screen.findByRole("dialog", { name: "Change 4,213 tracks?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(bridge.applyBatch).not.toHaveBeenCalled();
  });

  it("does not ask for 1,000 tracks or fewer", async () => {
    open({ ...BIG, count: 1000 }, "beatport");
    const dialog = await screen.findByRole("dialog", { name: "Use Beatport's values" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Genre" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: /^Change / })).toBeNull();
  });
});
