import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { TextField } from "./TextField";
import type { Suggestion } from "./SuggestInput";

function Harness({ suggestions }: { suggestions: readonly Suggestion[] }) {
  const [value, setValue] = useState("");
  return (
    <TextField
      label="Value"
      value={value}
      suggestions={suggestions}
      onPick={setValue}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

describe("TextField with suggestions", () => {
  it("keeps focus and the typed text when suggestions arrive mid-word", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness suggestions={[]} />);
    const field = screen.getByLabelText("Value");
    await user.click(field);
    await user.keyboard("Dee");
    expect(field).toHaveFocus();

    // The facet loads while someone is typing.
    rerender(<Harness suggestions={[{ value: "Deep House" }, { value: "Dub" }]} />);
    const same = screen.getByLabelText("Value");
    expect(same).toBe(field);
    expect(same).toHaveFocus();
    expect(same).toHaveValue("Dee");

    await user.keyboard("p");
    expect(screen.getByLabelText("Value")).toHaveFocus();
    expect(screen.getByLabelText("Value")).toHaveValue("Deep");
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});
