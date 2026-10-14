/**
 * The Inspector's lead zone (PREP-10's "In this Set"), keyed by its caller.
 *
 * Regression (found in PREP-11): the panel put the caller's zone and its own
 * editor, keyed by track id, in one list of children. Prepare keys its zone by
 * entry id, and in a Set built from the library in order an entry's id is often
 * a track's, so both children were keyed "3". React then left the old zone in
 * the Inspector beside the new one when the selection moved on: "Entry 3" under
 * the track at entry 4. A caller's key is the caller's, and must not meet the
 * panel's.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { LibraryTrackDetail } from "../../api/cuepointBridge.types";
import { TRACK_DETAILS_TAB_KEY, TrackDetailPanel } from "./TrackDetailPanel";
import { TRACK_DETAIL } from "./librarySets.testFixture";

afterEach(() => {
  localStorage.clear();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

function detailOf(id: number, title: string): LibraryTrackDetail {
  return { ...TRACK_DETAIL, track: { ...TRACK_DETAIL.track, id, title } };
}

function zone(entryId: number) {
  return (
    <section key={entryId} aria-label="In this Set">
      Entry {entryId}
    </section>
  );
}

describe("the lead zone", () => {
  it("is replaced, not joined, when the entry changes and its key met the track's", () => {
    const view = render(<TrackDetailPanel detail={detailOf(3, "Track 03")} leadZone={zone(3)} />);
    expect(screen.getAllByRole("region", { name: "In this Set" })).toHaveLength(1);

    view.rerender(<TrackDetailPanel detail={detailOf(16, "Track 16")} leadZone={zone(21)} />);

    const zones = screen.getAllByRole("region", { name: "In this Set" });
    expect(zones).toHaveLength(1);
    expect(zones[0]).toHaveTextContent("Entry 21");
  });

  it("keeps the lead zone above the tabs, and opens on Overview when the remembered tab is not offered", () => {
    // The tab is remembered for every page that hosts the panel; Prepare passes no Clean link
    // and a build may offer no Beatport tab, so a remembered Beatport tab falls back gracefully.
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "beatport");
    render(<TrackDetailPanel detail={detailOf(3, "Track 03")} leadZone={zone(3)} />);
    const lead = screen.getByRole("region", { name: "In this Set" });
    const tabs = screen.getByRole("tablist");
    expect(lead.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Overview");
    expect(screen.queryByRole("button", { name: /Compare all on the Clean page/ })).toBeNull();
  });
});
