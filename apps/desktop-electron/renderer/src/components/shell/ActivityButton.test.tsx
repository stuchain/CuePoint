import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { ActivityButton } from "./ActivityButton";
import { closeActivity, resetActivityForTests, useActivityOpen } from "./activityState";
import { Sidebar } from "./Sidebar";
import { StatusStrip } from "./StatusStrip";

function Probe() {
  return <p data-testid="open">{useActivityOpen() ? "open" : "closed"}</p>;
}

afterEach(() => {
  resetActivityForTests();
  localStorage.clear();
});

describe("the Activity button (STR-9, M273)", () => {
  it("says what it opens and its shortcut", () => {
    render(<ActivityButton />);
    expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
      "title",
      "Activity: what CuePoint has done (Ctrl+Shift+A)",
    );
  });

  it("shows the word", () => {
    render(<ActivityButton />);
    expect(screen.getByRole("button", { name: "Activity" })).toHaveTextContent(/^Activity$/);
  });

  it("opens the panel through the shared state", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ActivityButton />
        <Probe />
      </>,
    );
    expect(screen.getByTestId("open")).toHaveTextContent("closed");
    await user.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.getByTestId("open")).toHaveTextContent("open");
    act(() => closeActivity());
    expect(screen.getByTestId("open")).toHaveTextContent("closed");
  });

  it("is in the status strip, and not in the sidebar's list of pages (M273, D25)", () => {
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Sidebar />
        <StatusStrip />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    expect(nav.querySelector('[aria-label="Activity"]')).toBeNull();
    const strip = document.querySelector(".cp-status") as HTMLElement;
    expect(strip.querySelector('[aria-label="Activity"]')).not.toBeNull();
  });
});
