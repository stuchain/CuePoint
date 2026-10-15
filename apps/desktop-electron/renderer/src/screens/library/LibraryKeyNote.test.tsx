/**
 * "No tracks have a Beatport key yet." (DEC-201, PAGES-05).
 *
 * Under DEC-201 a library nobody has matched has no keys at all, and a Key
 * column of dashes with no explanation reads as a broken import. The notice
 * line says why; matching is the bar's Beatport ▸ Match on Beatport…. It is read from
 * the engine, not guessed: a library whose tracks do have keys never shows it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LibraryKeyNote } from "./LibraryKeyNote";
import { rememberKeyNoteDismissal } from "./libraryNoticeMemory";

let getLibraryFacet: ReturnType<typeof vi.fn>;

function facet(values: Array<{ value: string | null; count: number }>) {
  getLibraryFacet.mockResolvedValue({
    field: "key",
    values,
    truncated: false,
    total_values: values.length,
    range: null,
  });
}

beforeEach(() => {
  sessionStorage.clear();
  getLibraryFacet = vi.fn();
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryFacet };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the key note", () => {
  it("says keys come from matching when no track has one, with no Match button of its own", async () => {
    facet([{ value: null, count: 3880 }]);
    render(<LibraryKeyNote trackCount={3880} />);

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("No tracks have a Beatport key yet. Keys come from matching.");
    expect(screen.queryByRole("button", { name: "Match on Beatport…" })).toBeNull();
  });

  it("asks the engine about the whole library, by the key field", async () => {
    facet([{ value: null, count: 5 }]);
    render(<LibraryKeyNote trackCount={5} />);

    await screen.findByRole("status");
    expect(getLibraryFacet).toHaveBeenCalledWith(
      expect.objectContaining({ field: "key", playlistId: null, collectionId: null }),
    );
  });

  it("shows when a Key filter found nothing, even after it was dismissed, with no Dismiss", async () => {
    facet([{ value: null, count: 5 }]);
    rememberKeyNoteDismissal();
    render(<LibraryKeyNote trackCount={5} asked />);

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("No tracks have a Beatport key yet. Keys come from matching.");
    expect(screen.queryByRole("button", { name: "Dismiss this note" })).toBeNull();
  });

  it("is silent when any track has a key", async () => {
    facet([
      { value: "8A", count: 12 },
      { value: null, count: 30 },
    ]);
    render(<LibraryKeyNote trackCount={42} />);

    await waitFor(() => expect(getLibraryFacet).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is silent for a library with no tracks, which has a bigger thing to say", async () => {
    facet([]);
    render(<LibraryKeyNote trackCount={0} />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getLibraryFacet).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is silent when the engine cannot say", async () => {
    getLibraryFacet.mockRejectedValue(new Error("down"));
    render(<LibraryKeyNote trackCount={10} />);

    await waitFor(() => expect(getLibraryFacet).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can be dismissed", async () => {
    facet([{ value: null, count: 3 }]);
    render(<LibraryKeyNote trackCount={3} />);
    await screen.findByRole("status");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss this note" }));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays dismissed for the session", async () => {
    facet([{ value: null, count: 3 }]);
    const { unmount } = render(<LibraryKeyNote trackCount={3} />);
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this note" }));
    unmount();

    render(<LibraryKeyNote trackCount={3} />);
    await waitFor(() => expect(getLibraryFacet).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
