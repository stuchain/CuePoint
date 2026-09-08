/**
 * The Inspector's editable zone (ORG-10, DEC-057, DEC-008, DEC-015).
 *
 * Two properties are worth more than everything else here.
 *
 * The first is that **the panel never shows a value the engine refused**. Every
 * control writes optimistically, because a rating that waits for a round trip
 * is a rating a user clicks twice — and the price of that is a panel that can
 * be wrong. So each control is tested twice: once for the write, and once for
 * what is on screen after the write comes back refused.
 *
 * The second is that **a note is never lost**. It debounces, which means there
 * is always a moment where what is typed has not been sent, and the moment a
 * user leaves is exactly the moment they believe it was saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { TrackMetadata } from "../../api/cuepointBridge.types";
import { NOTES_DEBOUNCE_MS } from "./trackEdits";
import { TrackYours } from "./TrackYours";
import type { TrackTag } from "./useTrackTags";

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

/** What the engine answers with: the record, resolved as it resolves it. */
function answered(over: Partial<TrackMetadata>): { metadata: TrackMetadata } {
  const metadata = { ...BLANK, ...over };
  const effective = metadata.rating ?? metadata.rekordbox_rating;
  return {
    metadata: {
      ...metadata,
      effective_rating: effective,
      rating_source:
        metadata.rating != null
          ? "cuepoint"
          : metadata.rekordbox_rating != null
            ? "rekordbox"
            : null,
    },
  };
}

let bridge: {
  setTrackMetadata: ReturnType<typeof vi.fn>;
  getTags: ReturnType<typeof vi.fn>;
  createTag: ReturnType<typeof vi.fn>;
  assignTag: ReturnType<typeof vi.fn>;
  unassignTag: ReturnType<typeof vi.fn>;
};
let onError: ReturnType<typeof vi.fn<(message: string) => void>>;
let onSaved: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  onError = vi.fn<(message: string) => void>();
  onSaved = vi.fn<() => void>();
  bridge = {
    setTrackMetadata: vi.fn(async () => answered({})),
    getTags: vi.fn(async () => ({
      tags: [
        {
          id: 1,
          name: "Peak-time",
          category: "energy",
          colour: null,
          created_at: "2026-01-01",
          track_count: 12,
        },
        {
          id: 2,
          name: "Warm-up",
          category: null,
          colour: null,
          created_at: "2026-01-01",
          track_count: 3,
        },
      ],
      categories: ["energy"],
    })),
    createTag: vi.fn(async ({ name }: { name: string }) => ({
      tag: { id: 9, name, category: null, colour: null, created_at: "2026-09-08" },
    })),
    assignTag: vi.fn(async () => ({ changed: 1, track_ids: [12] })),
    unassignTag: vi.fn(async () => ({ changed: 1, track_ids: [12] })),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.useRealTimers();
});

function draw(metadata: Partial<TrackMetadata> = {}, tags: TrackTag[] = []) {
  return render(
    <TrackYours
      trackId={12}
      metadata={{ ...BLANK, ...metadata }}
      tags={tags}
      onError={onError}
      onSaved={onSaved}
    />,
  );
}

function star(count: number): HTMLElement {
  return screen.getByRole("radio", { name: `${count} star${count === 1 ? "" : "s"}` });
}

describe("the rating", () => {
  it("is a named radio group, not five buttons nobody can address", () => {
    draw();
    expect(screen.getByRole("radiogroup", { name: "Your rating" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("sets a rating of yours", async () => {
    draw();

    fireEvent.click(star(4));

    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, rating: 4 }),
    );
  });

  it("lights the stars before the engine has answered", async () => {
    let settle: (value: { metadata: TrackMetadata }) => void = () => undefined;
    bridge.setTrackMetadata.mockImplementationOnce(
      () => new Promise((resolve) => (settle = resolve)),
    );
    draw();

    fireEvent.click(star(4));

    expect(star(4)).toHaveAttribute("aria-checked", "true");
    await act(async () => settle(answered({ rating: 4 })));
  });

  it("clears yours when the chosen star is clicked again", async () => {
    draw({ rating: 3, effective_rating: 3, rating_source: "cuepoint" });

    fireEvent.click(star(3));

    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, rating: null }),
    );
  });

  it("adopts Rekordbox's rating as yours rather than treating it as already chosen", async () => {
    draw({ rekordbox_rating: 4, effective_rating: 4, rating_source: "rekordbox" });

    fireEvent.click(star(4));

    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, rating: 4 }),
    );
  });

  it("says which layer it is showing", () => {
    draw({ rekordbox_rating: 4, effective_rating: 4, rating_source: "rekordbox" });
    expect(screen.getByText("Rekordbox's")).toBeInTheDocument();
  });

  it("offers no clear when there is nothing of yours to clear", () => {
    draw({ rekordbox_rating: 4, effective_rating: 4, rating_source: "rekordbox" });
    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();
  });

  it("offers a clear that names what it is covering", async () => {
    draw({
      rating: 2,
      rekordbox_rating: 4,
      effective_rating: 2,
      rating_source: "cuepoint",
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear override" }));

    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, rating: null }),
    );
  });

  it("falls back rather than writing a zero when it is cleared", async () => {
    bridge.setTrackMetadata.mockResolvedValueOnce(answered({ rekordbox_rating: 4 }));
    draw({
      rating: 2,
      rekordbox_rating: 4,
      effective_rating: 2,
      rating_source: "cuepoint",
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear override" }));

    await waitFor(() => expect(screen.getByText("Rekordbox's")).toBeInTheDocument());
    expect(star(4)).toHaveAttribute("aria-checked", "true");
  });

  it("puts the old rating back when the engine refuses, and says why", async () => {
    bridge.setTrackMetadata.mockRejectedValueOnce(new Error("Rating must be 0-5 stars"));
    draw({ rating: 2, effective_rating: 2, rating_source: "cuepoint" });

    fireEvent.click(star(5));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Rating must be 0-5 stars"));
    expect(star(2)).toHaveAttribute("aria-checked", "true");
    expect(star(5)).toHaveAttribute("aria-checked", "false");
  });

  it("moves and chooses with the arrow keys", async () => {
    draw({ rating: 2, effective_rating: 2, rating_source: "cuepoint" });

    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Your rating" }), {
      key: "ArrowRight",
    });

    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, rating: 3 }),
    );
  });

  it("reaches both ends with Home and End", async () => {
    draw({ rating: 3, effective_rating: 3, rating_source: "cuepoint" });
    const group = screen.getByRole("radiogroup", { name: "Your rating" });

    fireEvent.keyDown(group, { key: "Home" });
    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, rating: 1 }),
    );

    fireEvent.keyDown(group, { key: "End" });
    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, rating: 5 }),
    );
  });

  it("is one tab stop, on the chosen star", () => {
    draw({ rating: 3, effective_rating: 3, rating_source: "cuepoint" });
    const stops = screen
      .getAllByRole("radio")
      .filter((radio) => radio.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName("3 stars");
  });

  it("is reachable when nothing is chosen at all", () => {
    draw();
    expect(star(1)).toHaveAttribute("tabindex", "0");
  });
});

describe("the favorite", () => {
  it("is its own flag, not five stars", async () => {
    draw();

    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, favorite: true }),
    );
  });

  it("turns off again", async () => {
    draw({ favorite: true });

    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() =>
      expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, favorite: false }),
    );
  });

  it("says whether it is on", () => {
    draw({ favorite: true });
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("goes back to what it was when the engine refuses", async () => {
    bridge.setTrackMetadata.mockRejectedValueOnce(new Error("No track with id 12"));
    draw({ favorite: true });

    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("No track with id 12"));
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("the note", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function type(text: string) {
    fireEvent.change(screen.getByLabelText("Your notes"), { target: { value: text } });
  }

  it("sends one request for a burst of typing", async () => {
    draw();

    type("i");
    type("in");
    type("intro is long");
    await act(async () => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS);
    });

    expect(bridge.setTrackMetadata).toHaveBeenCalledTimes(1);
    expect(bridge.setTrackMetadata).toHaveBeenCalledWith({
      trackId: 12,
      notes: "intro is long",
    });
  });

  it("waits for the typing to stop, rather than firing on a schedule", async () => {
    // Without the timer being reset by each keystroke this is a throttle: the
    // first one fires on time and sends half a sentence, and the rest of what
    // was typed goes in the request after it — or, if the burst ends first, not
    // at all until something else saves.
    draw();

    type("intro");
    act(() => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS - 100);
    });
    type("intro is long");
    await act(async () => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS - 100);
    });

    expect(bridge.setTrackMetadata).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(bridge.setTrackMetadata).toHaveBeenCalledTimes(1);
    expect(bridge.setTrackMetadata).toHaveBeenCalledWith({
      trackId: 12,
      notes: "intro is long",
    });
  });

  it("sends nothing while the typing is still going", () => {
    draw();

    type("intro");
    act(() => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS - 50);
    });

    expect(bridge.setTrackMetadata).not.toHaveBeenCalled();
  });

  it("says it is saving, and then that it saved", async () => {
    draw();

    type("intro is long");
    await act(async () => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS);
    });

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("sends what is waiting when the field is left", async () => {
    draw();

    type("intro is long");
    await act(async () => {
      fireEvent.blur(screen.getByLabelText("Your notes"));
    });

    expect(bridge.setTrackMetadata).toHaveBeenCalledWith({
      trackId: 12,
      notes: "intro is long",
    });
  });

  it("sends what is waiting when the panel goes away", async () => {
    // The "it looked saved" bug in its most common form: type a note, click
    // the next track, and the timer never fires because nothing is left to
    // fire it.
    const view = draw();

    type("intro is long");
    await act(async () => {
      view.unmount();
    });

    expect(bridge.setTrackMetadata).toHaveBeenCalledWith({
      trackId: 12,
      notes: "intro is long",
    });
  });

  it("sends a pending note against the track it was typed against", async () => {
    const view = draw();

    type("intro is long");
    await act(async () => {
      view.rerender(
        <TrackYours
          trackId={13}
          metadata={{ ...BLANK, track_id: 13 }}
          tags={[]}
          onError={onError}
          onSaved={onSaved}
        />,
      );
    });

    expect(bridge.setTrackMetadata).toHaveBeenCalledWith({
      trackId: 12,
      notes: "intro is long",
    });
  });

  it("stores an empty note as nothing at all", async () => {
    draw({ notes: "old" });

    type("   ");
    await act(async () => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS);
    });

    expect(bridge.setTrackMetadata).toHaveBeenCalledWith({ trackId: 12, notes: null });
  });

  it("puts the saved note back when the engine refuses", async () => {
    bridge.setTrackMetadata.mockRejectedValueOnce(new Error("A note may be at most 10000"));
    draw({ notes: "the note the engine has" });

    type("something far too long");
    await act(async () => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS);
    });

    expect(onError).toHaveBeenCalledWith("A note may be at most 10000");
    expect(screen.getByLabelText("Your notes")).toHaveValue("the note the engine has");
  });
});

describe("the tags", () => {
  it("shows the ones the track carries", () => {
    draw({}, [{ id: 1, name: "Peak-time", category: "energy", colour: null }]);
    expect(screen.getByText("Peak-time")).toBeInTheDocument();
  });

  it("says when there are none rather than showing an empty row", () => {
    draw();
    expect(screen.getByText("No tags yet")).toBeInTheDocument();
  });

  it("adds one by typing a name", async () => {
    draw();

    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "Closer" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(bridge.createTag).toHaveBeenCalledWith({ name: "Closer" }));
    expect(bridge.assignTag).toHaveBeenCalledWith({ tag_id: 9, track_ids: [12] });
    expect(await screen.findByText("Closer")).toBeInTheDocument();
  });

  it("adds on Enter, because that is what typing a name into a field means", async () => {
    draw();

    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "Closer" } });
    fireEvent.keyDown(screen.getByLabelText("Add a tag"), { key: "Enter" });

    await waitFor(() => expect(bridge.createTag).toHaveBeenCalledWith({ name: "Closer" }));
  });

  it("leaves creating-or-reusing to the engine rather than deciding here", async () => {
    // `create_or_get` matches ignoring case against a unique index. A renderer
    // that searched its own vocabulary first would answer from a copy that is
    // seconds old, and would answer differently.
    draw();

    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "peak-TIME" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(bridge.createTag).toHaveBeenCalledWith({ name: "peak-TIME" }));
  });

  it("does not ask twice for a tag the track already carries", async () => {
    draw({}, [{ id: 1, name: "Peak-time", category: null, colour: null }]);

    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "peak-time" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await act(async () => undefined);
    expect(bridge.createTag).not.toHaveBeenCalled();
  });

  it("adds nothing for an empty name", () => {
    draw();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("takes one off", async () => {
    draw({}, [{ id: 1, name: "Peak-time", category: null, colour: null }]);

    fireEvent.click(screen.getByRole("button", { name: "Remove tag Peak-time" }));

    await waitFor(() =>
      expect(bridge.unassignTag).toHaveBeenCalledWith({ tag_id: 1, track_ids: [12] }),
    );
    expect(screen.queryByText("Peak-time")).not.toBeInTheDocument();
  });

  it("takes a chip back off when the engine refuses to assign it", async () => {
    // The tag exists by then — `create_or_get` answered — but this track does
    // not carry it, and a chip that stays is the panel claiming otherwise.
    bridge.assignTag.mockRejectedValueOnce(new Error("No track with id 12"));
    draw();

    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "Closer" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("No track with id 12"));
    expect(screen.queryByText("Closer")).not.toBeInTheDocument();
  });

  it("puts a tag back when the engine refuses to take it off", async () => {
    bridge.unassignTag.mockRejectedValueOnce(new Error("No tag with id 1"));
    draw({}, [{ id: 1, name: "Peak-time", category: null, colour: null }]);

    fireEvent.click(screen.getByRole("button", { name: "Remove tag Peak-time" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("No tag with id 1"));
    expect(screen.getByText("Peak-time")).toBeInTheDocument();
  });

  it("suggests the library's tags, minus the ones already on the track", async () => {
    const { container } = draw({}, [
      { id: 1, name: "Peak-time", category: null, colour: null },
    ]);

    await waitFor(() => expect(bridge.getTags).toHaveBeenCalled());
    const options = [...container.querySelectorAll("datalist option")].map(
      (option) => (option as HTMLOptionElement).value,
    );
    expect(options).toEqual(["Warm-up"]);
  });

  it("still lets a name be typed when the vocabulary cannot be read", async () => {
    bridge.getTags.mockRejectedValueOnce(new Error("Engine offline"));
    draw();

    await waitFor(() => expect(bridge.getTags).toHaveBeenCalled());
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Add a tag")).toBeEnabled();
  });
});

describe("a record read again", () => {
  it("replaces what is on screen, draft and all", async () => {
    // The same track, read again — which is what a batch edit elsewhere will
    // produce (ORG-11). The engine's answer is newer than anything held here,
    // including a note nobody finished typing.
    const view = draw({ notes: "what it said before" });
    expect(screen.getByLabelText("Your notes")).toHaveValue("what it said before");

    await act(async () => {
      view.rerender(
        <TrackYours
          trackId={12}
          metadata={{
            ...BLANK,
            notes: "what a batch wrote",
            rating: 4,
            effective_rating: 4,
            rating_source: "cuepoint",
          }}
          tags={[]}
          onError={onError}
          onSaved={onSaved}
        />,
      );
    });

    expect(screen.getByLabelText("Your notes")).toHaveValue("what a batch wrote");
    expect(star(4)).toHaveAttribute("aria-checked", "true");
  });
});

describe("every write tells the panel", () => {
  it("so the history can re-read rather than guess what was recorded", async () => {
    // Re-saving the same note records nothing at all, so a locally appended
    // entry would be one the engine never wrote.
    draw();

    fireEvent.click(star(4));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("says nothing when the write failed", async () => {
    bridge.setTrackMetadata.mockRejectedValueOnce(new Error("nope"));
    draw();

    fireEvent.click(star(4));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("a build with no bridge", () => {
  it("says so rather than looking as though it saved", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    draw();

    fireEvent.click(star(4));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("This build cannot edit tracks."),
    );
  });

  it("says so about tags too", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    draw();

    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "Closer" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("This build cannot edit tags."));
  });
});
