/** The confirmation's button names what the batch does, not just "Apply" (G7 step 7). */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { BatchConfirmDialog } from "./BatchConfirmDialog";
import type { BatchAction } from "./libraryBatch";
import type { LibraryBatchController } from "./useLibraryBatch";

function ask(action: BatchAction, count: number) {
  const batch: LibraryBatchController = {
    pending: { action, selection: { track_ids: [1] }, count },
    question: "Sure?",
    busy: false,
    start: vi.fn(),
    run: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  };
  render(<BatchConfirmDialog batch={batch} />);
}

describe("BatchConfirmDialog", () => {
  it("says Copy to N tracks for applying Beatport's values", () => {
    ask({ kind: "apply_match", value: ["bpm"], target: "BPM" }, 4213);
    expect(screen.getByRole("button", { name: "Copy to 4,213 tracks" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Copy to 4,213 tracks?" })).toBeInTheDocument();
  });

  it.each(["set_override", "add_tag", "set_rating", "accept_match"] as const)(
    "says Change N tracks for %s",
    (kind) => {
      ask({ kind, target: "x" }, 1);
      expect(screen.getByRole("button", { name: "Change 1 track" })).toBeInTheDocument();
    },
  );
});
