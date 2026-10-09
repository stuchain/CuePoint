/**
 * The note for someone who updates (DEC-207).
 *
 * Shown once, on the first start of the version that ships Phase 14, and only to
 * someone who finished the old tour: a new user has just seen the new guide.
 * The size line is for someone who never chose a size; the key line says how
 * many tracks keep a key now that Beatport's is the only one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { LibraryHealth } from "../api/cuepointBridge.types";
import { phase14NoteDue, markPhase14NoteSeen } from "./firstRunMemory";
import { Phase14Note } from "./Phase14Note";

const DONE = "cuepoint-onboarding-complete";
const SEEN = "cuepoint-phase14-note-seen";
const SIZE = "cuepoint-ui-lab-scale";

function health(trackCount: number, noKey: number): LibraryHealth {
  return {
    track_count: trackCount,
    counts: [
      { id: "not_matched", label: "Not matched", count: 3, rules: { match: "all", rules: [] } },
      { id: "missing_key", label: "No Beatport key", count: noKey, rules: { match: "all", rules: [] } },
    ],
    detections: [],
    unavailable_roots: [],
  };
}

let getLibraryHealth: ReturnType<typeof vi.fn>;

function install(result: LibraryHealth | Error) {
  getLibraryHealth = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryHealth };
}

function mount() {
  const handlers = { onClose: vi.fn(), onChangeSize: vi.fn(), onMatch: vi.fn() };
  render(<Phase14Note open {...handlers} />);
  return handlers;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  localStorage.clear();
});

describe("who is due the note", () => {
  it("is someone who finished the old tour and has not seen the note", () => {
    localStorage.setItem(DONE, "1");
    expect(phase14NoteDue()).toBe(true);
  });

  it("is not a new user, who has not finished any tour", () => {
    expect(phase14NoteDue()).toBe(false);
  });

  it("is not someone who has seen it once", () => {
    localStorage.setItem(DONE, "1");
    markPhase14NoteSeen();
    expect(localStorage.getItem(SEEN)).toBe("1");
    expect(phase14NoteDue()).toBe(false);
  });

  it("is not anyone when storage throws, and marking never throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(phase14NoteDue()).toBe(false);
    expect(() => markPhase14NoteSeen()).not.toThrow();
  });
});

describe("what it says", () => {
  it("names the new size and how many tracks have a Beatport key", async () => {
    install(health(12, 4));
    mount();
    expect(await screen.findByText("CuePoint is now Medium size (1.5×).")).toBeInTheDocument();
    expect(
      screen.getByText("Keys now come only from Beatport. 8 of your tracks have a key."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match tracks…" })).toBeInTheDocument();
  });

  it("says 'has a key' for a single track", async () => {
    install(health(5, 4));
    mount();
    expect(
      await screen.findByText("Keys now come only from Beatport. 1 of your tracks has a key."),
    ).toBeInTheDocument();
  });

  it("counts only Beatport's keys, not the user's own corrections", async () => {
    // Health's missing_key is "No Beatport key": a track with only a key the user
    // typed in is still counted as missing, and the sentence says "from Beatport".
    install(health(12, 4));
    mount();
    expect(await screen.findByText(/8 of your tracks have a key/)).toBeInTheDocument();
    expect(screen.queryByText(/have one/)).toBeNull();
  });

  it("shows the size line at once and fills the key line in when Health answers", async () => {
    let answer: (h: LibraryHealth) => void = () => {};
    getLibraryHealth = vi.fn(() => new Promise<LibraryHealth>((resolve) => (answer = resolve)));
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryHealth };
    mount();
    expect(screen.getByText("CuePoint is now Medium size (1.5×).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    expect(screen.queryByText(/Keys now come only/)).toBeNull();
    await act(async () => answer(health(12, 4)));
    expect(
      await screen.findByText("Keys now come only from Beatport. 8 of your tracks have a key."),
    ).toBeInTheDocument();
  });

  it("leaves the size line out for someone who chose a size", async () => {
    localStorage.setItem(SIZE, "2");
    install(health(12, 4));
    mount();
    await screen.findByText(/Keys now come only from Beatport/);
    expect(screen.queryByText(/Medium size/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Change size" })).toBeNull();
  });

  it("says the key sentence without a number when the count cannot be read", async () => {
    install(new Error("not ready"));
    mount();
    expect(await screen.findByText("Keys now come only from Beatport.")).toBeInTheDocument();
    expect(screen.queryByText(/of your tracks/)).toBeNull();
  });

  it("leaves the key line out when there are no tracks", async () => {
    install(health(0, 0));
    mount();
    await screen.findByText("CuePoint is now Medium size (1.5×).");
    expect(screen.queryByText(/Keys now come only/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Match tracks…" })).toBeNull();
  });

  it("shows nothing, and marks itself seen, when it has nothing to say", async () => {
    localStorage.setItem(SIZE, "1");
    install(health(0, 0));
    const { onClose } = mount();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(SEEN)).toBe("1");
  });

  it("uses no word the user does not know", async () => {
    install(health(12, 4));
    mount();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).not.toMatch(/\b(engine|jobs?)\b/i);
  });
});

describe("what it does", () => {
  it("Change size closes it, marks it seen and opens Settings at the size", async () => {
    install(health(12, 4));
    const { onChangeSize, onClose } = mount();
    await userEvent.click(await screen.findByRole("button", { name: "Change size" }));
    expect(onChangeSize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SEEN)).toBe("1");
  });

  it("Match tracks… closes it, marks it seen and opens Clean's match window", async () => {
    install(health(12, 4));
    const { onMatch, onClose } = mount();
    await userEvent.click(await screen.findByRole("button", { name: "Match tracks…" }));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SEEN)).toBe("1");
  });

  it("Got it, Escape and the close button all mark it seen, so it shows once", async () => {
    install(health(12, 4));
    const { onClose } = mount();
    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(localStorage.getItem(SEEN)).toBe("1");
    expect(onClose).toHaveBeenCalledTimes(1);

    localStorage.clear();
    await userEvent.keyboard("{Escape}");
    expect(localStorage.getItem(SEEN)).toBe("1");

    localStorage.clear();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(localStorage.getItem(SEEN)).toBe("1");
  });

  it("closes even when storage throws", async () => {
    install(health(12, 4));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const { onClose } = mount();
    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
