/**
 * Holding Down with the match panel open: what one move re-draws.
 *
 * Each table row asks for its Beatport preview while it renders, so counting those asks counts
 * the rows drawn again. A move changes the look of two rows (the one left and the one reached);
 * every other row is the same and must not be drawn again, nor must the candidates already in
 * the panel be drawn again when nothing about them changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ToastProvider } from "../../../components";
import { ScaleProvider } from "../../../tokens/ScaleContext";
import { installMatchBridge, newWorld, removeMatchBridge } from "../../../test/matchHarness";
import { reviewTrack } from "../../../test/matchFixtures";

const drawn = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock("../../../components/preview/useBeatportPreview", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../components/preview/useBeatportPreview")>();
  return {
    ...real,
    useBeatportPreview: (key: Parameters<typeof real.useBeatportPreview>[0]) => {
      drawn.keys.push(key ? `${key.kind}:${key.id}` : "none");
      return real.useBeatportPreview(key);
    },
  };
});

import { ReviewTab } from "./ReviewTab";

/** Tracks 11 to 30, every one matched: row N's candidate is 1000 + N. */
const IDS = Array.from({ length: 20 }, (_, index) => 11 + index);

function rowOf(id: number): HTMLElement {
  const row = document.querySelector<HTMLElement>(`tr[data-track-id="${id}"]`);
  if (!row) throw new Error(`no row for track ${id}`);
  return row;
}

/** How many times the table row of track `id` was drawn since the count was cleared. */
function rowDraws(id: number): number {
  return drawn.keys.filter((key) => key === `candidate:${1000 + id}`).length;
}

beforeEach(() => {
  const world = newWorld();
  world.review = IDS.map((id) => reviewTrack(id, "matched"));
  installMatchBridge(world);
  drawn.keys.length = 0;
});

afterEach(() => {
  removeMatchBridge();
  vi.restoreAllMocks();
});

describe("a move along the table with the panel open", () => {
  it("draws again only the row left and the row reached", async () => {
    render(
      <ScaleProvider>
        <ToastProvider>
          <ReviewTab source={{ playlistId: 7 }} name="hJ" version={0} matching={false} onChanged={() => {}} />
        </ToastProvider>
      </ScaleProvider>,
    );
    await screen.findByRole("table", undefined, { timeout: 3000 });
    fireEvent.click(rowOf(11));
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    await within(panel).findByRole("radiogroup", { name: "Beatport candidates" });
    // Let every read the panel started answer before counting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    drawn.keys.length = 0;

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    });
    await waitFor(() => expect(within(screen.getByRole("complementary")).getByText("2 of 20")).toBeInTheDocument());

    expect(rowDraws(11)).toBeGreaterThan(0);
    expect(rowDraws(12)).toBeGreaterThan(0);
    const others = IDS.filter((id) => id !== 11 && id !== 12).filter((id) => rowDraws(id) > 0);
    expect(others).toEqual([]);
  });
});
