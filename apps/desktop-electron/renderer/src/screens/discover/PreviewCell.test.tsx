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

function tableOf(rows: BeatportTrackRow[]) {
  const selection = {
    keys: new Set<number>(),
    rows: [],
    count: 0,
    anchorRow: null,
    anchor: null,
    onRowClick,
    onRowMenu: vi.fn(),
    select: vi.fn(),
    selectAll: vi.fn(),
    clear: vi.fn(),
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

function draw() {
  return render(tableOf(ROWS));
}

describe("the preview cell", () => {
  it("is the first column, named Preview in the header", () => {
    draw();
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]).toHaveTextContent("Preview");
    expect(headers[0]).toHaveAttribute("data-column", "preview");
  });

  it("plays on click without selecting the row, and stops on a second click", async () => {
    draw();
    const play = screen.getByRole("button", { name: "Play preview of Alpha" });
    expect(play).toHaveAttribute("title", "Preview");

    await userEvent.click(play);

    const stop = await screen.findByRole("button", { name: "Stop preview of Alpha" });
    expect(stop).toHaveAttribute("title", "Stop");
    expect(bridge.getCatalogPreview).toHaveBeenCalledWith({ beatportTrackId: 11 });
    expect(onRowClick).not.toHaveBeenCalled();

    await userEvent.click(stop);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play preview of Alpha" })).toBeInTheDocument(),
    );
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("shows busy while the sample loads", async () => {
    let resolve!: (url: string) => void;
    bridge.getCatalogPreview!.mockReturnValue(new Promise((r) => (resolve = r)));
    draw();
    await userEvent.click(screen.getByRole("button", { name: "Play preview of Alpha" }));
    expect(screen.getByRole("button", { name: "Stop preview of Alpha" })).toHaveAttribute("aria-busy", "true");
    await act(async () => resolve("blob:x"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop preview of Alpha" })).not.toHaveAttribute("aria-busy"),
    );
  });

  it("disables itself as No preview when the engine answers null", async () => {
    draw();
    await userEvent.click(screen.getByRole("button", { name: "Play preview of Beta" }));

    const none = await screen.findByRole("button", { name: "No preview for Beta" });
    expect(none).toHaveAttribute("title", "No preview");
    expect(none).toHaveAttribute("aria-disabled", "true");
    expect(none).not.toBeDisabled();
    await userEvent.click(none);
    expect(bridge.getCatalogPreview).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("keeps sounding when the playing row leaves the table, and stops with the table", async () => {
    const view = draw();
    await userEvent.click(screen.getByRole("button", { name: "Play preview of Alpha" }));
    await screen.findByRole("button", { name: "Stop preview of Alpha" });
    const audio = FakeAudio.instances[0]!;

    view.rerender(tableOf([ROWS[1]!]));
    expect(screen.queryByRole("button", { name: /of Alpha/ })).toBeNull();
    expect(audio.pause).not.toHaveBeenCalled();

    view.rerender(tableOf(ROWS));
    expect(screen.getByRole("button", { name: "Stop preview of Alpha" })).toBeInTheDocument();

    view.unmount();
    expect(audio.pause).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-11");
  });

  it("is not there when the bridge cannot fetch samples", () => {
    delete bridge.getCatalogPreview;
    draw();
    expect(screen.queryByRole("button", { name: /Play preview/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Preview" })).toBeNull();
  });
});
