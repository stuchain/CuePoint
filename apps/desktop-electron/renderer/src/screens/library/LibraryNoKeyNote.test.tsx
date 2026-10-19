import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LibraryNoKeyNote } from "./LibraryNoKeyNote";

describe("LibraryNoKeyNote", () => {
  it("says how it differs from every state that has no confirmed match", () => {
    render(<LibraryNoKeyNote count={3} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 tracks have no Beatport key.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "not the same as a track with no confirmed match (Not looked up yet, To check, No match, Rejected or Search failed)",
    );
  });
});
