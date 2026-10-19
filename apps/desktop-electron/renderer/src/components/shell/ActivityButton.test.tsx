import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ActivityButton } from "./ActivityButton";
import { closeActivity, resetActivityForTests, useActivityOpen } from "./activityState";

function Probe() {
  return <p data-testid="open">{useActivityOpen() ? "open" : "closed"}</p>;
}

afterEach(() => resetActivityForTests());

describe("the Activity button (STR-9, C231)", () => {
  it("says what it opens and its shortcut", () => {
    render(<ActivityButton />);
    expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
      "title",
      "Activity: what CuePoint has done (Ctrl+Shift+A)",
    );
  });

  it("opens the panel through the shared state, and carries no unread badge", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ActivityButton />
        <Probe />
      </>,
    );
    const button = screen.getByRole("button", { name: "Activity" });
    expect(button).toHaveTextContent(/^Activity$/);
    expect(screen.getByTestId("open")).toHaveTextContent("closed");
    await user.click(button);
    expect(screen.getByTestId("open")).toHaveTextContent("open");
    act(() => closeActivity());
    expect(screen.getByTestId("open")).toHaveTextContent("closed");
  });
});
