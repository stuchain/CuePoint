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

describe("TextField with type=number (C25)", () => {
  function Numbers() {
    const [value, setValue] = useState("5");
    return (
      <TextField label="Pages" type="number" min={0} max={7} step={1} value={value} onChange={(event) => setValue(event.target.value)} />
    );
  }

  it("draws its own steppers in place of the browser's spin buttons", async () => {
    const user = userEvent.setup();
    render(<Numbers />);
    const field = screen.getByLabelText("Pages");
    await user.click(screen.getByRole("button", { name: "Increase Pages" }));
    expect(field).toHaveValue(6);
    await user.click(screen.getByRole("button", { name: "Decrease Pages" }));
    await user.click(screen.getByRole("button", { name: "Decrease Pages" }));
    expect(field).toHaveValue(4);
  });

  it("keeps the steppers out of the tab order and stops them at the limits", async () => {
    const user = userEvent.setup();
    render(<Numbers />);
    const up = screen.getByRole("button", { name: "Increase Pages" });
    expect(up).toHaveAttribute("tabindex", "-1");
    await user.click(up);
    await user.click(up);
    await user.click(up);
    expect(screen.getByLabelText("Pages")).toHaveValue(7);
  });

  it("greys the steppers with a disabled field", () => {
    render(<TextField label="Pages" type="number" disabled />);
    expect(screen.getByRole("button", { name: "Increase Pages" })).toBeDisabled();
  });

  it("draws no steppers on a text field", () => {
    render(<TextField label="Name" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
