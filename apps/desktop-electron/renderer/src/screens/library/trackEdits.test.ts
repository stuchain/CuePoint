/**
 * What the Inspector's editable zone says (ORG-10, DEC-057, DEC-008).
 *
 * These are the sentences the two-layer model is made of. A label reading
 * "Yours" over a value Rekordbox supplied, or a clear control that does not
 * say what it would fall back to, is not a cosmetic mistake — it is the panel
 * lying about which of two stored values a user is looking at, which is the
 * one thing DEC-057 spent a whole table preventing.
 */
import { describe, expect, it } from "vitest";

import type { TrackFieldChange, TrackMetadata } from "../../api/cuepointBridge.types";
import {
  RATING_STARS,
  clearRatingLabel,
  describeRatingSource,
  historyLine,
  historySourceLabel,
  nextRating,
  normalizeNotes,
  ratingText,
  starLabel,
  withRating,
} from "./trackEdits";

const BLANK: TrackMetadata = {
  track_id: 12,
  rating: null,
  rekordbox_rating: null,
  effective_rating: null,
  rating_source: null,
  favorite: false,
  notes: null,
  created_at: null,
  updated_at: null,
};

function change(over: Partial<TrackFieldChange> = {}): TrackFieldChange {
  return {
    id: 1,
    track_id: 12,
    field: "cuepoint_rating",
    old_value: null,
    new_value: 4,
    source: "cuepoint",
    changed_at: "2026-09-08T10:00:00Z",
    batch_id: null,
    ...over,
  };
}

describe("a rating as text", () => {
  it("reads a missing rating as absent, not as zero", () => {
    expect(ratingText(null)).toBe("—");
  });

  it("reads a zero as a rating, because it is one", () => {
    // DEC-034 keeps "never rated" and "rated zero" apart, and this is the
    // sentence where they would collapse: "unrated" is what a chip says, and
    // it reads as absence in the middle of "Rekordbox's is …".
    expect(ratingText(0)).toBe("zero stars");
  });

  it("draws stars for the rest", () => {
    expect(ratingText(3)).toBe("★★★");
    expect(ratingText(RATING_STARS)).toBe("★★★★★");
  });
});

describe("which layer the stars are showing", () => {
  it("says yours, and what is underneath it", () => {
    expect(describeRatingSource({ rating: 5, rekordbox_rating: 3 })).toBe(
      "Yours — Rekordbox's is ★★★",
    );
  });

  it("says yours, when there is nothing underneath", () => {
    expect(describeRatingSource({ rating: 5, rekordbox_rating: null })).toBe(
      "Yours — Rekordbox never rated it",
    );
  });

  it("says Rekordbox's, when you have not overridden it", () => {
    expect(describeRatingSource({ rating: null, rekordbox_rating: 3 })).toBe("Rekordbox's");
  });

  it("says nothing is rated when nothing is", () => {
    expect(describeRatingSource({ rating: null, rekordbox_rating: null })).toBe("Not rated");
  });

  it("does not call a zero underneath it absent", () => {
    expect(describeRatingSource({ rating: 4, rekordbox_rating: 0 })).toBe(
      "Yours — Rekordbox's is zero stars",
    );
  });
});

describe("the clear control", () => {
  it("is not offered when there is nothing of yours to clear", () => {
    expect(clearRatingLabel({ rating: null, rekordbox_rating: 4 })).toBeNull();
    expect(clearRatingLabel({ rating: null, rekordbox_rating: null })).toBeNull();
  });

  it("calls itself an override only when it is covering something", () => {
    // "Clear override" over nothing would name a layer that is not there, and
    // the user cannot tell what clearing would leave behind.
    expect(clearRatingLabel({ rating: 2, rekordbox_rating: 4 })).toBe("Clear override");
    expect(clearRatingLabel({ rating: 2, rekordbox_rating: null })).toBe("Clear rating");
  });
});

describe("clicking a star", () => {
  it("sets that rating", () => {
    expect(nextRating(null, 4)).toBe(4);
    expect(nextRating(2, 4)).toBe(4);
  });

  it("clears yours when it is the one already chosen", () => {
    expect(nextRating(4, 4)).toBeNull();
  });

  it("adopts Rekordbox's value as your own rather than doing nothing", () => {
    // The comparison is against *your* rating. With Rekordbox's four showing
    // and no override, clicking the fourth star says "I have decided this is a
    // four" — which is what keeps it a four when the next refresh disagrees.
    expect(nextRating(null, 4)).toBe(4);
  });
});

describe("the stars have names", () => {
  it("counts one and several differently", () => {
    expect(starLabel(1)).toBe("1 star");
    expect(starLabel(4)).toBe("4 stars");
  });
});

describe("the record with a rating applied", () => {
  it("resolves to yours and says so", () => {
    const after = withRating({ ...BLANK, rekordbox_rating: 2 }, 5);
    expect(after.rating).toBe(5);
    expect(after.effective_rating).toBe(5);
    expect(after.rating_source).toBe("cuepoint");
  });

  it("falls back to Rekordbox's when yours is cleared", () => {
    const after = withRating({ ...BLANK, rekordbox_rating: 2, rating: 5 }, null);
    expect(after.effective_rating).toBe(2);
    expect(after.rating_source).toBe("rekordbox");
  });

  it("resolves to nothing when there is nothing to fall back to", () => {
    const after = withRating({ ...BLANK, rating: 5 }, null);
    expect(after.effective_rating).toBeNull();
    expect(after.rating_source).toBeNull();
  });

  it("keeps a zero of yours rather than falling through it", () => {
    const after = withRating({ ...BLANK, rekordbox_rating: 4 }, 0);
    expect(after.effective_rating).toBe(0);
    expect(after.rating_source).toBe("cuepoint");
  });
});

describe("a note on its way to the engine", () => {
  it("is nothing when it is only spaces", () => {
    // A row holding "" and a row holding nothing look identical to a reader
    // and different in the database; the engine stores one of them.
    expect(normalizeNotes("   ")).toBeNull();
    expect(normalizeNotes("")).toBeNull();
  });

  it("is trimmed", () => {
    expect(normalizeNotes("  intro is long  ")).toBe("intro is long");
  });
});

describe("who made a change", () => {
  it("names the three the engine writes", () => {
    expect(historySourceLabel("cuepoint")).toBe("You");
    expect(historySourceLabel("rekordbox")).toBe("Rekordbox");
    expect(historySourceLabel("beatport")).toBe("Beatport");
  });

  it("shows an unknown source rather than hiding it", () => {
    expect(historySourceLabel("somewhere-else")).toBe("somewhere-else");
  });
});

describe("a history entry as a line", () => {
  it("marks your own changes apart from an import's", () => {
    expect(historyLine(change({ source: "cuepoint" })).mine).toBe(true);
    expect(historyLine(change({ source: "rekordbox" })).mine).toBe(false);
    expect(historyLine(change({ source: "rekordbox" })).who).toBe("Rekordbox");
  });

  it("never calls your rating and Rekordbox's the same thing", () => {
    // The whole value of the history in a two-layer library is being able to
    // tell them apart, and two rows both labelled "Rating" destroy it exactly
    // where it matters.
    expect(historyLine(change({ field: "cuepoint_rating" })).title).toBe("Your rating");
    expect(historyLine(change({ field: "rating" })).title).toBe("Rekordbox rating");
  });

  it("shows a rating as stars on both sides", () => {
    const line = historyLine(change({ old_value: 2, new_value: 5 }));
    expect(line.from).toBe("★★");
    expect(line.to).toBe("★★★★★");
  });

  it("shows a cleared rating as absent", () => {
    expect(historyLine(change({ old_value: 3, new_value: null })).to).toBe("—");
  });

  it("says what a tag change was, rather than diffing a null", () => {
    expect(
      historyLine(change({ field: "tag", old_value: null, new_value: "Peak-time" })).title,
    ).toBe("Tagged Peak-time");
    expect(
      historyLine(change({ field: "tag", old_value: "Peak-time", new_value: null })).title,
    ).toBe("Untagged Peak-time");
  });

  it("shows a tag change with no from and no to", () => {
    const line = historyLine(change({ field: "tag", old_value: null, new_value: "Warm-up" }));
    expect(line.from).toBeNull();
    expect(line.to).toBeNull();
  });

  it("says what a favorite change was", () => {
    expect(historyLine(change({ field: "favorite", new_value: true })).title).toBe(
      "Favorited",
    );
    expect(historyLine(change({ field: "favorite", new_value: false })).title).toBe(
      "Unfavorited",
    );
  });

  it("cuts a note rather than filling the panel with one", () => {
    const long = "x".repeat(200);
    const line = historyLine(change({ field: "notes", old_value: null, new_value: long }));
    expect(line.to!.length).toBeLessThan(60);
    expect(line.to!.endsWith("…")).toBe(true);
  });

  it("shows a field nobody has named rather than dropping the entry", () => {
    expect(historyLine(change({ field: "energy" })).title).toBe("energy");
  });

  it("shows an unparseable timestamp as it was written", () => {
    // "Invalid Date" where a date belongs says less than the raw value does.
    expect(historyLine(change({ changed_at: "whenever" })).when).toBe("whenever");
  });
});
