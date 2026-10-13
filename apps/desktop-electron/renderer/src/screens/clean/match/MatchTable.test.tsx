/**
 * The Match table (C14): every track's before → after, to tick and take many.
 *
 * Over the real area, because the table is one of two views of its list: the
 * ticks, "Take ticked values" and opening a row in One at a time are the
 * area's together. A row's cells come from its `match_proposal` only.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";

import type { LibraryHealth } from "../../../api/cuepointBridge.types";
import { ToastProvider } from "../../../components";
import { ScaleProvider } from "../../../tokens/ScaleContext";
import {
  installMatchBridge,
  installTableEnvironment,
  newWorld,
  removeMatchBridge,
  removeTableEnvironment,
  type MatchWorld,
} from "../../../test/matchHarness";
import { proposed, track } from "../../../test/matchFixtures";
import fixture from "../cleanEmpty.fixture.json";
import type { CleanMatch } from "../useCleanMatch";
import { MATCH_TAB_STORAGE_KEY, MatchArea } from "./MatchArea";
import { MATCH_TICKS_STORAGE_KEY } from "./useMatchTicks";
import { statusCell, valueCell, likelyCell } from "./matchColumns";

type Fn = ReturnType<typeof vi.fn>;
type Props = ComponentProps<typeof MatchArea>;

const MATCHED = fixture.matched.health as LibraryHealth;
const LOADED = { timeout: 3000 };

let bridge: Record<string, Fn>;
let world: MatchWorld;

function stubMatch(): CleanMatch {
  return { matching: false, running: null, note: null, progress: null, ended: 0, started: 0, start: vi.fn(), resume: vi.fn() };
}

function renderTable(overrides: Partial<Props> = {}) {
  localStorage.setItem(MATCH_TAB_STORAGE_KEY, "table");
  const props: Props = {
    health: MATCHED,
    onHealthChanged: vi.fn(),
    match: stubMatch(),
    onMatchTracks: vi.fn(),
    playlists: { data: null, error: null, loading: false, reload: vi.fn() },
    ticked: new Set<string>(),
    onTick: vi.fn(),
    ...overrides,
  };
  const view = render(
    <ScaleProvider>
      <ToastProvider>
        <MemoryRouter>
          <MatchArea {...props} />
        </MemoryRouter>
      </ToastProvider>
    </ScaleProvider>,
  );
  return { props, ...view };
}

function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest('[role="row"]');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${title}`);
  return row;
}

beforeAll(installTableEnvironment);
afterAll(removeTableEnvironment);

beforeEach(() => {
  localStorage.clear();
  world = newWorld();
  bridge = installMatchBridge(world);
});

afterEach(() => {
  removeMatchBridge();
  vi.restoreAllMocks();
});

describe("the cells", () => {
  it("show before → after where Correct would change a value, and the value where it would not", () => {
    const row = proposed(1);
    expect(valueCell(row, "bpm")).toBe("126 → 128");
    expect(valueCell(row, "genre")).toBe("Techno → Melodic House & Techno");
    expect(valueCell(row, "year")).toBe("— → 2024");
    expect(valueCell(row, "label")).toBe("Label One");
    // Beatport's key arrives as Camelot, and it comes with Correct: not a change to tick.
    expect(valueCell(row, "key")).toBe("6A");
    expect(likelyCell(row)).toBe("92%");
  });

  it("show the key as a change only where it would replace one of your own", () => {
    const mine = proposed(1, { effective_key: "5A", key_source: "yours" });
    expect(valueCell(mine, "key")).toBe("5A → 6A");
  });

  it("say what to do about a track with no one answer, and what became of a disputed one", () => {
    expect(statusCell(track(5))).toBe("Several possible matches · choose in One at a time");
    expect(statusCell(track(5, { match_state: "no_match" }))).toBe("Beatport found nothing");
    expect(statusCell(track(5, { match_state: "rejected" }))).toBe("You said not this track");
    expect(statusCell(track(5, { match_state: "not_matched" }))).toBe("Not looked up yet");
    expect(statusCell(proposed(5, { match_disputed: true }))).toMatch(/changed since you decided$/);
    expect(likelyCell(track(5))).toBe("—");
  });
});

describe("the table", () => {
  it("draws each track's proposal, with the change said in words as well as colour", async () => {
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    const row = rowOf("Track 1");
    expect(within(row).getByText(/126 → 128/)).toBeInTheDocument();
    expect(within(row).getByText(/Techno → Melodic House & Techno/)).toBeInTheDocument();
    expect(within(row).getAllByText("(Correct would change this)").length).toBeGreaterThan(0);
    expect(within(row).getByText("92%")).toBeInTheDocument();
    expect(within(row).getByText("Waiting for you")).toBeInTheDocument();
    expect(screen.getByText("Double-click a row to open it in One at a time.")).toBeInTheDocument();
  });

  it("says what a track without a proposal needs, in its own row", async () => {
    world.tracks = [track(7, { title: "Mystery" }), proposed(1)];
    renderTable();
    await screen.findByText("Mystery", undefined, LOADED);
    expect(
      within(rowOf("Mystery")).getByText("Several possible matches · choose in One at a time"),
    ).toBeInTheDocument();
  });

  it("offers which values to take, all on but the key at first, and remembers a change", async () => {
    const { unmount } = renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    const values = screen.getByRole("group", { name: "Values to take" });
    const boxes = within(values).getAllByRole("checkbox");
    expect(boxes.map((box) => box.parentElement?.textContent)).toEqual([
      "Key (replaces yours)",
      "BPM",
      "Genre",
      "Label",
      "Year",
    ]);
    // Replacing a key the user typed is ticked only by choice.
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ]);

    fireEvent.click(within(values).getByRole("checkbox", { name: "Key (replaces yours)" }));
    expect(JSON.parse(localStorage.getItem(MATCH_TICKS_STORAGE_KEY)!)).toEqual([
      "key",
      "bpm",
      "genre",
      "label",
      "year",
    ]);
    unmount();

    // The same preference One at a time reads.
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    expect(
      within(screen.getByRole("group", { name: "Values to take" })).getByRole("checkbox", {
        name: "Key (replaces yours)",
      }),
    ).toBeChecked();
  });

  it("says how many hand-corrected keys the Key tick would replace, only while it is ticked", async () => {
    world.tracks = [
      proposed(1, { effective_key: "5A", key_source: "yours" }),
      proposed(2, { effective_key: "5A", key_source: "yours" }),
      proposed(3),
    ];
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    for (const title of ["Track 1", "Track 2", "Track 3"]) {
      fireEvent.click(within(rowOf(title)).getByRole("checkbox", { name: `Take ${title}` }));
    }
    expect(screen.queryByTestId("replacing")).toBeNull();

    fireEvent.click(
      within(screen.getByRole("group", { name: "Values to take" })).getByRole("checkbox", {
        name: "Key (replaces yours)",
      }),
    );
    expect(screen.getByTestId("replacing")).toHaveTextContent(
      "Key is ticked: 2 hand-corrected keys among the ticked tracks would be replaced.",
    );

    // An unticked row is not counted.
    fireEvent.click(within(rowOf("Track 2")).getByRole("checkbox", { name: "Take Track 2" }));
    expect(screen.getByTestId("replacing")).toHaveTextContent("1 hand-corrected key among");
  });

  it("takes nothing until a row is ticked", async () => {
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    expect(screen.getByRole("button", { name: "Take ticked values (0 tracks)" })).toBeDisabled();
  });

  it("takes the ticked rows through one correctMatches, with the ticked values", async () => {
    const { props } = renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    fireEvent.click(within(rowOf("Track 1")).getByRole("checkbox", { name: "Take Track 1" }));
    fireEvent.click(within(rowOf("Track 3")).getByRole("checkbox", { name: "Take Track 3" }));

    const take = screen.getByRole("button", { name: "Take ticked values (2 tracks)" });
    expect(take).toBeEnabled();
    fireEvent.click(take);

    await waitFor(() => expect(bridge.correctMatches).toHaveBeenCalledTimes(1));
    expect(bridge.correctMatches).toHaveBeenCalledWith({
      selection: { track_ids: [1, 3] },
      fields: ["bpm", "genre", "label", "year"],
    });
    const status = await screen.findByText("Corrected 2 tracks.");
    expect(status).toHaveAttribute("role", "status");
    // Undo takes the whole batch back.
    fireEvent.click(within(status).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-many" }));
    expect(await screen.findByText("Undid the correction of 2 tracks.")).toBeInTheDocument();
    expect(props.onHealthChanged).toHaveBeenCalled();
  });

  it("replaces the key only when its tick is on", async () => {
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Values to take" })).getByRole("checkbox", {
        name: "Key (replaces yours)",
      }),
    );
    fireEvent.click(within(rowOf("Track 2")).getByRole("checkbox", { name: "Take Track 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Take ticked values (1 track)" }));
    await waitFor(() => expect(bridge.correctMatches).toHaveBeenCalledTimes(1));
    expect(bridge.correctMatches).toHaveBeenCalledWith({
      selection: { track_ids: [2] },
      fields: ["bpm", "genre", "label", "year"],
      replace_key: true,
    });
  });

  it("says when there was nothing to change, and offers no Undo", async () => {
    bridge.correctMatches!.mockResolvedValue({
      applied: {
        batch_id: "b",
        operation: "correct_match",
        target: "",
        total: 1,
        changed: 0,
        unchanged: 1,
        failed: 0,
        cancelled: false,
      },
    });
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    fireEvent.click(within(rowOf("Track 1")).getByRole("checkbox", { name: "Take Track 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Take ticked values (1 track)" }));
    expect(await screen.findByText("Nothing to change for those tracks.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("follows a job, and counts the tracks as checked once it has finished", async () => {
    bridge.correctMatches!.mockImplementation(async () => {
      world.tracks = world.tracks.map((row) =>
        row.id === 1 ? { ...row, match_state: "accepted" } : row,
      );
      return { job_id: "job-c", id: "job-c", state: "queued" };
    });
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    expect(screen.getByText("0 of 3 checked")).toBeInTheDocument();
    fireEvent.click(within(rowOf("Track 1")).getByRole("checkbox", { name: "Take Track 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Take ticked values (1 track)" }));
    expect(await screen.findByText("Corrected the ticked tracks.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1 of 3 checked")).toBeInTheDocument());
  });

  it("opens a row in One at a time on a double-click", async () => {
    renderTable();
    await screen.findByText("Track 2", undefined, LOADED);
    fireEvent.doubleClick(screen.getByText("Track 2"));
    expect(await screen.findByRole("region", { name: "One at a time" })).toBeInTheDocument();
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 2 }), LOADED);
    expect(screen.getByRole("tab", { name: "One at a time" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("opens the row Enter is pressed on", async () => {
    renderTable();
    fireEvent.click(await screen.findByText("Track 3", undefined, LOADED));
    const grid = screen.getByRole("table", { name: "Match table" });
    act(() => {
      fireEvent.keyDown(grid, { key: "Enter" });
    });
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 3 }), LOADED);
    expect(await screen.findByRole("region", { name: "One at a time" })).toBeInTheDocument();
  });

  it("keeps One at a time's letters out of the table", async () => {
    renderTable();
    fireEvent.click(await screen.findByText("Track 1", undefined, LOADED));
    act(() => {
      fireEvent.keyDown(window, { key: "a" });
      fireEvent.keyDown(window, { key: "r" });
    });
    expect(bridge.correctMatch).not.toHaveBeenCalled();
    expect(bridge.decideMatch).not.toHaveBeenCalled();
  });

  it("saves the review list as a file, saying what it holds", async () => {
    bridge.saveExportFileDialog = vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: "C:\\out\\review-list.xlsx" });
    bridge.exportReviewList = vi.fn().mockResolvedValue({
      file_path: "C:\\out\\review-list.xlsx",
      format: "excel",
      count: 3,
      columns: [],
    });
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Save review list as a file…" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Saves the 3 tracks shown — with their match state and Beatport link — as a spreadsheet you can share or check by hand.",
    );
    fireEvent.change(within(dialog).getByLabelText("Format"), { target: { value: "excel" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Choose where to save…" }));

    await waitFor(() =>
      expect(bridge.exportReviewList).toHaveBeenCalledWith({
        selection: {
          query: {
            q: undefined,
            playlist_id: null,
            collection_id: null,
            filters: fixture.rules.needs_review,
          },
        },
        format: "excel",
        file_path: "C:\\out\\review-list.xlsx",
        overwrite: true,
      }),
    );
    expect(bridge.saveExportFileDialog).toHaveBeenCalledWith({
      defaultPath: "review-list.xlsx",
      format: "xlsx",
    });
    expect(await screen.findByText("Exported 3 tracks to review-list.xlsx.")).toBeInTheDocument();
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    bridge.saveExportFileDialog = vi.fn().mockResolvedValue({ canceled: true });
    bridge.exportReviewList = vi.fn();
    renderTable();
    await screen.findByText("Track 1", undefined, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Save review list as a file…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose where to save…" }));
    await waitFor(() => expect(bridge.saveExportFileDialog).toHaveBeenCalled());
    expect(bridge.exportReviewList).not.toHaveBeenCalled();
  });
});
