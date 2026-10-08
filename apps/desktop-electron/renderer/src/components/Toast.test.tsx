import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider, useToast } from "./Toast";

let push: ReturnType<typeof useToast>["push"];
function Grab() {
  push = useToast().push;
  return null;
}

describe("a toast with an action", () => {
  it("shows the action, runs it once, and goes", async () => {
    const undo = vi.fn();
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => push("Appearance reset to defaults.", "info", { label: "Undo", onClick: undo }));
    expect(screen.getByText("Appearance reset to defaults.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Appearance reset to defaults.")).toBeNull();
  });

  it("has no button when it has no action", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => push("Saved.", "success"));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
