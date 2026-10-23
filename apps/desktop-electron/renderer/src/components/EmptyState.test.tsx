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

  // P41: the headline is the section size (14, voice) and still bold.
  it("is centred and the headline is section-size bold", () => {
    const root = /\.cp-empty-state\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(root).toMatch(/align-items:\s*center/);
    expect(root).toMatch(/text-align:\s*center/);
    expect(css).toMatch(/headline\s*\{[^}]*font-size:\s*var\(--font-size-section\)[^}]*font-weight:\s*var\(--font-weight-bold\)/);
  });
});

describe("EmptyState compact and action slot (C140, C30)", () => {
  it("compact draws no icon and uses the body size", () => {
    const { container } = render(<EmptyState compact headline="No matches" />);
    expect(container.querySelector(".cp-empty-state__icon")).toBeNull();
    expect(container.firstElementChild).toHaveClass("cp-empty-state--compact");
    expect(css).toMatch(/\.cp-empty-state--compact \.cp-empty-state__headline\s*\{[^}]*font-size:\s*var\(--text-body\)/);
  });

  it("takes any element as its action slot", async () => {
    const onClick = vi.fn();
    render(<EmptyState headline="Empty" action={<button type="button" onClick={onClick}>Make one</button>} />);
    await userEvent.click(screen.getByRole("button", { name: "Make one" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("starts 12 below the header divider, whatever the page", () => {
    expect(css).toMatch(/\.cp-empty-state\s*\{[^}]*padding:\s*var\(--space-lg\)/);
  });
});
