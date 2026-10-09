import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LibraryNoKeyNote } from "./LibraryNoKeyNote";

describe("LibraryNoKeyNote", () => {
  it("says how it differs from Not matched", () => {
    render(<LibraryNoKeyNote count={3} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 tracks have no Beatport key.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "so this is not the same as Not matched",
    );
  });
});
