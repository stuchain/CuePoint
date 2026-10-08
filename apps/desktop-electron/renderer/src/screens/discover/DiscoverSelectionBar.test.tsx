/**
 * The bar on Discover's pages gathers a group's entries when its button is pressed
 * (FLW-8); the gathering can fail, and the page can be left while it runs.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { reportUnexpected } from "../../reporting/reporting";
import { DiscoverSelectionBar } from "./DiscoverSelectionBar";

vi.mock("../../reporting/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../reporting/reporting")>()),
  reportUnexpected: vi.fn(() => null),
}));

function bar(itemsFor: () => Promise<{ id: string; label: string; onSelect: () => void }[]>) {
  return (
    <DiscoverSelectionBar
      groups={["play", "explore"]}
      total={5}
      selected={1}
      itemsFor={itemsFor}
      onClear={vi.fn()}
      onSelectAll={vi.fn()}
      onColumns={vi.fn()}
    />
  );
}

describe("DiscoverSelectionBar", () => {
  it("opens a group's entries as a menu named for the group", async () => {
    render(bar(async () => [{ id: "play", label: "Play", onSelect: vi.fn() }]));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    const menu = await screen.findByRole("menu", { name: "Play" });
    expect(within(menu).getByRole("menuitem", { name: "Play" })).toBeInTheDocument();
  });

  it("reports a failed gathering and opens nothing", async () => {
    const failure = new Error("could not read the tracks");
    render(bar(async () => Promise.reject(failure)));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(reportUnexpected).toHaveBeenCalledWith(failure));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens nothing once the page has been left", async () => {
    let finish: (items: { id: string; label: string; onSelect: () => void }[]) => void = () => {};
    const gathering = new Promise<{ id: string; label: string; onSelect: () => void }[]>((resolve) => {
      finish = resolve;
    });
    const { unmount } = render(bar(() => gathering));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    unmount();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    finish([{ id: "play", label: "Play", onSelect: vi.fn() }]);
    await gathering;
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    errors.mockRestore();
  });
});
