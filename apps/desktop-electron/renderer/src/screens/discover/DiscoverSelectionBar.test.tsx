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

function bar(
  itemsFor: () => Promise<{ id: string; label: string; onSelect: () => void }[]>,
  selected = 1,
  onClear = vi.fn(),
) {
  return (
    <DiscoverSelectionBar groups={["play", "more"]} selected={selected} itemsFor={itemsFor} onClear={onClear} />
  );
}

describe("DiscoverSelectionBar", () => {
  it("draws nothing while nothing is selected, so no empty band sits above the list (C215)", () => {
    const { container } = render(bar(async () => [], 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many are selected, the Library's way, with a close button that clears them (C9)", () => {
    const onClear = vi.fn();
    render(bar(async () => [], 3, onClear));
    expect(screen.getByRole("toolbar", { name: "Selection" })).toHaveTextContent("3 selected");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

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
