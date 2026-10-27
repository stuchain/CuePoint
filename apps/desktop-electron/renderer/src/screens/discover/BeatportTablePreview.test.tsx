/**
 * A Beatport row's sample (M99, D12 A): no row draws a play button; a double-click or Enter plays
 * the row's sample through the preview hook, the row shows it is sounding, and the sample belongs to
 * the table's lifetime, not its row's.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { BeatportTrackRow } from "../../api/cuepointBridge.types";
import { resetBeatportPreviewsForTests } from "../../components/preview/useBeatportPreview";
import { inMemorySource } from "../../components/table/trackTableSource";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { BeatportTable } from "./BeatportTable";
import { WANTLIST_COLUMNS } from "./beatportColumns";
import type { BeatportSelection } from "./useBeatportSelection";

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  addEventListener() {}
}

const row = (id: number, title: string): BeatportTrackRow => ({
  beatport_track_id: id,
  title,
  mix_name: null,
  url: "https://example.test",
  label_id: null,
  label_name: null,
  label_key: null,
  release_id: null,
  release_name: null,
  release_date: null,
  bpm: null,
  key: null,
  genre_id: null,
  genre_name: null,
  fetched_at: "2026-01-01T00:00:00Z",
  artists: [],
  remixers: [],
  owned: false,
  on_wantlist: false,
});

const ROWS = [row(11, "Alpha"), row(404, "Beta")];
type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;
let onRowClick: Fn;
let clear: Fn;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 400 });
});

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  localStorage.clear();
  onRowClick = vi.fn();
  clear = vi.fn();
  bridge = {
    getCatalogPreview: vi.fn(async ({ beatportTrackId }: { beatportTrackId: number }) =>
      beatportTrackId === 404 ? null : `blob:catalog-${beatportTrackId}`,
    ),
    releaseCandidatePreview: vi.fn(),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
});

afterEach(() => {
  resetBeatportPreviewsForTests();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "cuepoint");
});

function tableOf(rows: BeatportTrackRow[], count = 0) {
  const selection = {
    keys: new Set<number>(),
    rows: [],
    count,
    anchorRow: null,
    anchor: null,
    onRowClick,
    onRowMenu: vi.fn(),
    select: vi.fn(),
    selectAll: vi.fn(),
    clear,
    reindex: () => {},
  } as unknown as BeatportSelection<BeatportTrackRow>;
  return (
    <ScaleProvider>
      <BeatportTable<BeatportTrackRow>
        columns={WANTLIST_COLUMNS as never}
        layoutKey="test-preview-layout"
        source={inMemorySource(rows)}
        selection={selection}
        idOf={(r) => r.beatport_track_id}
        actions={[]}
        onAction={vi.fn()}
        label="Tracks"
        summary={`${rows.length} tracks`}
        emptyState={null}
        resetKey="x"
      />
    </ScaleProvider>
  );
}

function draw(count = 0) {
  return render(tableOf(ROWS, count));
}

const rowOf = (title: string) => screen.getByText(title).closest('[role="row"]') as HTMLElement;

describe("a Beatport row's sample (M99)", () => {
  it("draws no play button and no Preview column", () => {
    const view = draw();
    expect(screen.queryByRole("columnheader", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("button", { name: /preview/i })).toBeNull();
    expect(view.container.querySelector(".cp-play-btn")).toBeNull();
    expect(view.container.querySelector(".track-table__end")).toBeNull();
  });

  it("plays that track's sample on a double-click, marks the row, and leaves a sounding one alone", async () => {
    draw();
    await userEvent.dblClick(screen.getByText("Alpha"));
    await waitFor(() => expect(bridge.getCatalogPreview).toHaveBeenCalledWith({ beatportTrackId: 11 }));
    await waitFor(() => expect(rowOf("Alpha")).toHaveAttribute("data-playing", "true"));
    expect(rowOf("Beta")).not.toHaveAttribute("data-playing");

    // Another double-click on the sounding row does not stop it or ask again.
    await userEvent.dblClick(screen.getByText("Alpha"));
    expect(bridge.getCatalogPreview).toHaveBeenCalledTimes(1);
    expect(rowOf("Alpha")).toHaveAttribute("data-playing", "true");
  });

  it("plays the keyboard's row on Enter", async () => {
    draw();
    await userEvent.click(screen.getByText("Alpha"));
    screen.getByRole("grid").focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(bridge.getCatalogPreview).toHaveBeenCalledWith({ beatportTrackId: 11 }));
  });

  it("moves to another row's sample, and asks no more for one Beatport has none for", async () => {
    draw();
    await userEvent.dblClick(screen.getByText("Alpha"));
    await waitFor(() => expect(rowOf("Alpha")).toHaveAttribute("data-playing", "true"));
    await userEvent.dblClick(screen.getByText("Beta"));
    await waitFor(() => expect(bridge.getCatalogPreview).toHaveBeenCalledWith({ beatportTrackId: 404 }));
    await waitFor(() => expect(rowOf("Alpha")).not.toHaveAttribute("data-playing"));
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
    expect(rowOf("Beta")).not.toHaveAttribute("data-playing");

    await userEvent.dblClick(screen.getByText("Beta"));
    expect(bridge.getCatalogPreview).toHaveBeenCalledTimes(2);
  });

  it("keeps sounding when the playing row leaves the table, and stops with the table", async () => {
    const view = draw();
    await userEvent.dblClick(screen.getByText("Alpha"));
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    const audio = FakeAudio.instances[0]!;

    view.rerender(tableOf([ROWS[1]!]));
    expect(audio.pause).not.toHaveBeenCalled();

    view.unmount();
    expect(audio.pause).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-11");
  });

  it("does nothing when the bridge cannot fetch samples", async () => {
    delete bridge.getCatalogPreview;
    draw();
    await act(async () => {
      await userEvent.dblClick(screen.getByText("Alpha"));
    });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(rowOf("Alpha")).not.toHaveAttribute("data-playing");
  });

  it("lets go of the selection on Escape", async () => {
    draw(2);
    screen.getByRole("grid").focus();
    await userEvent.keyboard("{Escape}");
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
