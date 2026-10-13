/**
 * The save bar (G4 step 4): shown only when tracks hold values the files do not,
 * with the two ways in to the save window.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { announceLibraryChange } from "../../api/libraryChanges";
import { SaveToFilesBar } from "./SaveToFilesBar";

function bridge(answers: Array<{ tracks: number }>) {
  const getUnsavedValues = vi.fn();
  for (const answer of answers) getUnsavedValues.mockResolvedValueOnce({ ...answer, fields: {} });
  getUnsavedValues.mockResolvedValue({ ...answers[answers.length - 1], fields: {} });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getUnsavedValues };
  return getUnsavedValues;
}

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("SaveToFilesBar", () => {
  it("is not there when no track has a new value", async () => {
    const read = bridge([{ tracks: 0 }]);
    const { container } = render(<SaveToFilesBar onSeeChanges={vi.fn()} onSave={vi.fn()} />);
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many tracks have new values, in the app's words", async () => {
    bridge([{ tracks: 47 }]);
    render(<SaveToFilesBar onSeeChanges={vi.fn()} onSave={vi.fn()} />);
    expect(
      await screen.findByText("47 tracks have new values that aren't in your files yet."),
    ).toBeInTheDocument();
  });

  it("opens the list of changes from See changes and the choices from Save to files", async () => {
    bridge([{ tracks: 47 }]);
    const onSeeChanges = vi.fn();
    const onSave = vi.fn();
    render(<SaveToFilesBar onSeeChanges={onSeeChanges} onSave={onSave} />);
    await userEvent.click(await screen.findByRole("button", { name: "See changes" }));
    expect(onSeeChanges).toHaveBeenCalledWith(47);
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save to files…" }));
    expect(onSave).toHaveBeenCalledWith(47);
  });

  it("reads again when the library changes, and goes away at 0", async () => {
    const read = bridge([{ tracks: 5 }, { tracks: 0 }]);
    render(<SaveToFilesBar onSeeChanges={vi.fn()} onSave={vi.fn()} />);
    expect(await screen.findByText(/5 tracks have new values/)).toBeInTheDocument();
    act(() => announceLibraryChange());
    await waitFor(() => expect(screen.queryByText(/have new values/)).toBeNull());
    expect(read).toHaveBeenCalledTimes(2);
  });
});
