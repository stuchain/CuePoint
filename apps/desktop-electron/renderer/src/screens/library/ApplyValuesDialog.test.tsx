/**
 * "Copy Beatport values": the button says how many tracks it will change, once the engine
 * has counted them, and says why it is greyed (G7 step 7).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { OverrideField } from "../../api/cuepointBridge.types";
import { ApplyValuesDialog } from "./ApplyValuesDialog";

type Preview = NonNullable<Parameters<typeof ApplyValuesDialog>[0]["preview"]>;

const COUNTS = { bpm: 212, genre: 40, label: 0, year: 1 };

/** A preview that counts by the ticked set: the union is the larger field plus a few. */
const counting = (): ReturnType<typeof vi.fn<Preview>> =>
  vi.fn<Preview>(async (fields: OverrideField[]) => ({
    tracks: fields.length === 0 ? 0 : fields.length === 1 ? COUNTS[fields[0] as "bpm"] : 230,
    fields: Object.fromEntries(fields.map((field) => [field, COUNTS[field as "bpm"]])),
  }));

function show(preview?: Preview, count = 500, onApply = vi.fn()) {
  render(
    <ApplyValuesDialog
      open
      count={count}
      onClose={vi.fn()}
      onApply={onApply}
      preview={preview}
    />,
  );
  return onApply;
}

describe("ApplyValuesDialog", () => {
  it("says what it copies and what it skips", () => {
    show();
    expect(
      screen.getByText(
        "Copies values from each track’s confirmed Beatport match. Tracks without one are skipped.",
      ),
    ).toBeInTheDocument();
  });

  it("greys the button with its reason while nothing is ticked", () => {
    show(counting());
    const button = screen.getByRole("button", { name: "Copy to 500 tracks" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Tick at least one value.");
  });

  it("asks once on open for every field and shows each count beside its tick", async () => {
    const preview = counting();
    show(preview);
    expect(await screen.findByText("· 212 tracks would change")).toBeInTheDocument();
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith(["bpm", "genre", "label", "year"]);
    expect(screen.getByText("· 40 tracks would change")).toBeInTheDocument();
    expect(screen.getByText("· 0 tracks would change")).toBeInTheDocument();
    expect(screen.getByText("· 1 track would change")).toBeInTheDocument();
    // The tick's name is still its field.
    expect(screen.getByRole("checkbox", { name: "BPM" })).toBeInTheDocument();
  });

  it("counts the ticked fields together on the button and copies them", async () => {
    const preview = counting();
    const onApply = show(preview);
    await screen.findByText("· 212 tracks would change");
    fireEvent.click(screen.getByRole("checkbox", { name: "BPM" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Genre" }));
    const button = await screen.findByRole("button", { name: "Copy to 230 tracks" });
    expect(preview).toHaveBeenLastCalledWith(["bpm", "genre"]);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onApply).toHaveBeenCalledWith(["bpm", "genre"]);
  });

  it("ignores an answer for a set that is no longer ticked", async () => {
    const answers: Array<(value: Awaited<ReturnType<Preview>>) => void> = [];
    const preview = vi.fn<Preview>(
      () => new Promise((resolve) => answers.push(resolve)),
    );
    show(preview);
    answers[0]!({ tracks: 0, fields: {} });
    fireEvent.click(screen.getByRole("checkbox", { name: "BPM" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Genre" }));
    await waitFor(() => expect(answers).toHaveLength(3));
    // The second tick's answer comes first; the first tick's answer arrives late.
    answers[2]!({ tracks: 230, fields: {} });
    await screen.findByRole("button", { name: "Copy to 230 tracks" });
    answers[1]!({ tracks: 212, fields: {} });
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "Copy to 230 tracks" })).toBeInTheDocument();
  });

  it("falls back to the selection's count while the count is unknown or fails", async () => {
    const preview = vi.fn<Preview>().mockRejectedValue(new Error("down"));
    show(preview, 7);
    fireEvent.click(screen.getByRole("checkbox", { name: "Label" }));
    expect(screen.getByRole("button", { name: "Copy to 7 tracks" })).toBeEnabled();
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Copy to 7 tracks" })).toBeEnabled();
    expect(screen.queryByText(/would change/)).toBeNull();
  });

  it("works without a preview bridge, with the selection's count", () => {
    show(undefined, 1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Year" }));
    expect(screen.getByRole("button", { name: "Copy to 1 track" })).toBeEnabled();
  });
});
