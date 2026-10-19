import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { ActivityButton } from "./ActivityButton";
import { closeActivity, resetActivityForTests, useActivityOpen } from "./activityState";
import { Sidebar } from "./Sidebar";

function Probe() {
  return <p data-testid="open">{useActivityOpen() ? "open" : "closed"}</p>;
}

afterEach(() => {
  resetActivityForTests();
  localStorage.clear();
});

describe("the Activity button (STR-9, C231)", () => {
  it("says what it opens and its shortcut", () => {
    render(<ActivityButton collapsed={false} />);
    expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
      "title",
      "Activity: what CuePoint has done (Ctrl+Shift+A)",
    );
  });

  it("shows the word expanded and the icon alone in the rail", () => {
    const { rerender } = render(<ActivityButton collapsed={false} />);
    expect(screen.getByRole("button", { name: "Activity" })).toHaveTextContent(/^Activity$/);
    rerender(<ActivityButton collapsed />);
    const button = screen.getByRole("button", { name: "Activity" });
    expect(button).toHaveTextContent("");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("opens the panel through the shared state", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ActivityButton collapsed={false} />
        <Probe />
      </>,
    );
    expect(screen.getByTestId("open")).toHaveTextContent("closed");
    await user.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.getByTestId("open")).toHaveTextContent("open");
    act(() => closeActivity());
    expect(screen.getByTestId("open")).toHaveTextContent("closed");
  });

  it("sits in the sidebar's pinned foot, above Settings", () => {
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Sidebar />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    const foot = nav.querySelector(".cp-sidebar__foot") as HTMLElement;
    const names = [...foot.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label"));
    expect(names.indexOf("Activity")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Activity")).toBeLessThan(names.indexOf("Settings"));
  });
});
