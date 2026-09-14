/**
 * The refresh preview's acknowledgement (DEC-011 as amended, CLEAN-05).
 *
 * A refresh that would delete tracks carrying a user's own work — a rating, a
 * tag, a review, an edited value, a place in a Collection — cannot be applied
 * until the user ticks that they understand. The property worth a render is
 * that **the button follows the tick**: blocked without it, and handing the
 * engine the confirmation only when it was given.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { RefreshDiff, RefreshReferences } from "../../api/cuepointBridge.types";
import { applyLabel } from "./libraryFormat";
import { RefreshPreviewDialog } from "./RefreshPreviewDialog";

const NO_REFERENCES: RefreshReferences = {
  collection_count: 0,
  set_count: 0,
  referenced_track_count: 0,
  referenced_track_ids: [],
  collection_ids: [],
  has_references: false,
  collection_track_count: 0,
  rated_track_count: 0,
  tagged_track_count: 0,
  reviewed_track_count: 0,
  edited_track_count: 0,
};

function category<T>(count = 0, items: T[] = []) {
  return { count, items, truncated: count > items.length };
}

function removing(references: Partial<RefreshReferences>, diffId = "d1"): RefreshDiff {
  return {
    diff_id: diffId,
    xml_path: "collection.xml",
    is_empty: false,
    contents_compared: true,
    duration_seconds: 0.4,
    computed_at: "2026-09-03T10:00:00Z",
    xml_modified_at: null,
    xml_size_bytes: null,
    tracks: {
      added: category(),
      changed: category(),
      removed: category(2, [
        { rekordbox_track_id: "1", title: "One", artist: "A" },
        { rekordbox_track_id: "2", title: "Two", artist: "B" },
      ]),
      relinked: category(),
      notable_changed_count: 0,
    },
    playlists: { added: category(), changed: category(), removed: category() },
    references: { ...NO_REFERENCES, ...references },
  } as RefreshDiff;
}

const RATED_ONLY: Partial<RefreshReferences> = {
  referenced_track_count: 1,
  referenced_track_ids: [7],
  has_references: true,
  rated_track_count: 1,
};

function renderDialog(diff: RefreshDiff) {
  const onApply = vi.fn();
  const view = render(
    <RefreshPreviewDialog
      open
      diff={diff}
      applying={false}
      onCancel={vi.fn()}
      onApply={onApply}
    />,
  );
  const apply = () => screen.getByRole("button", { name: applyLabel(diff) });
  return { onApply, apply, view };
}

describe("RefreshPreviewDialog", () => {
  it("blocks a refresh that would lose only a rating until the box is ticked", () => {
    const { onApply, apply } = renderDialog(removing(RATED_ONLY));

    expect(screen.getByText(/1 rated or noted/)).toBeInTheDocument();
    expect(apply()).toBeDisabled();
    expect(screen.getByText("Tick the box above to continue.")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I understand this removes my own work on these tracks too",
      }),
    );
    expect(apply()).toBeEnabled();
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ confirmReferences: true });
  });

  it("asks nothing when the removed tracks carry no work of the user's", () => {
    const { onApply, apply } = renderDialog(removing({}));

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(apply()).toBeEnabled();
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ confirmReferences: false });
  });

  it("does not carry a tick over to a new preview", () => {
    const { apply, view } = renderDialog(removing(RATED_ONLY, "d1"));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(apply()).toBeEnabled();

    const next = removing({ ...RATED_ONLY, edited_track_count: 1 }, "d2");
    view.rerender(
      <RefreshPreviewDialog
        open
        diff={next}
        applying={false}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: applyLabel(next) })).toBeDisabled();
  });
});
