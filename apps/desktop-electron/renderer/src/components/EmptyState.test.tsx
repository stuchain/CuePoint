import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyState, IMPORT_COLLECTION_LABEL } from "./EmptyState";
import css from "./EmptyState.css?raw";

describe("EmptyState", () => {
  it("exports the one import label", () => {
    expect(IMPORT_COLLECTION_LABEL).toBe("Import a Rekordbox file…");
  });

  it("shows the headline and the muted line", () => {
    render(<EmptyState headline="No tracks yet" description="Import a collection to begin." />);
    expect(screen.getByText("No tracks yet")).toBeInTheDocument();
    expect(screen.getByText("Import a collection to begin.")).toBeInTheDocument();
  });

  it("always draws an icon: the tick for an all-clear, the stack otherwise (area 66)", () => {
    const { container, rerender } = render(<EmptyState headline="Nothing here" />);
    expect(container.querySelector('.cp-empty-state__icon svg[data-icon="collections"]')).not.toBeNull();
    rerender(<EmptyState tone="clear" headline="No possible duplicates" />);
    expect(container.querySelector('.cp-empty-state__icon svg[data-icon="clean"]')).not.toBeNull();
    expect(container.firstElementChild).toHaveClass("cp-empty-state--clear");
    rerender(<EmptyState icon="keys" headline="No keys" />);
    expect(container.querySelector('svg[data-icon="keys"]')).not.toBeNull();
  });

  it("draws no button without an action", () => {
    render(<EmptyState headline="Nothing here" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("runs its one action", async () => {
    const onClick = vi.fn();
    render(<EmptyState headline="Empty" action={{ label: IMPORT_COLLECTION_LABEL, onClick }} />);
    await userEvent.click(screen.getByRole("button", { name: IMPORT_COLLECTION_LABEL }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is centred and the headline is sm bold", () => {
    const root = /\.cp-empty-state\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(root).toMatch(/align-items:\s*center/);
    expect(root).toMatch(/text-align:\s*center/);
    expect(css).toMatch(/headline\s*\{[^}]*font-size:\s*var\(--font-size-sm\)[^}]*font-weight:\s*700/);
  });
});
