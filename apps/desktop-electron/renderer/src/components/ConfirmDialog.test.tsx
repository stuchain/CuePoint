import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("shows Cancel and the act, and runs each", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Delete “Warm-up”?" confirmLabel="Delete Set" onConfirm={onConfirm} onCancel={onCancel} danger>
        This cannot be undone.
      </ConfirmDialog>,
    );
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>(".cp-modal__footer")!;
    within(footer).getByRole("button", { name: "Delete Set" }).click();
    within(footer).getByRole("button", { name: "Cancel" }).click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("while loading, shows the act busy and does not let the dialog be left", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open loading title="Delete “Warm-up”?" confirmLabel="Delete Set" onConfirm={() => {}} onCancel={onCancel}>
        This cannot be undone.
      </ConfirmDialog>,
    );
    const act = screen.getByRole("button", { name: "Delete Set" });
    expect(act).toHaveAttribute("aria-busy", "true");
    expect(act).toBeDisabled();
    const header = screen.getByRole("dialog").querySelector<HTMLElement>(".cp-modal__header")!;
    expect(within(header).getByRole("button", { name: "Close" })).toHaveAttribute("aria-disabled", "true");
  });
});
