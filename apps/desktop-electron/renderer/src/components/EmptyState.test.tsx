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
  it("is centred and the headline is a section-size pixel line at the regular weight (M19, D1)", () => {
    const root = /\.cp-empty-state\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(root).toMatch(/align-items:\s*center/);
    expect(root).toMatch(/text-align:\s*center/);
    expect(css).toMatch(/headline\s*\{[^}]*font-size:\s*var\(--font-size-section\)[^}]*font-weight:\s*var\(--font-weight-regular\)/);
  });

  it("sets its sentence at the body size with a rounded line height, like the rows around it (M18, M19)", () => {
    expect(css).toMatch(/__description\s*\{[^}]*font-size:\s*var\(--text-body\)/);
    expect(css).toMatch(/__description\s*\{[^}]*line-height:\s*round\(nearest,/);
  });

  it("starts a third of the free room down, on every page, with Loading starting on the same line (M353, M372)", async () => {
    const third = /flex:\s*0 0 max\(0px, calc\(100% \/ 3 - 2 \* var\(--space-2xl\)\)\)/;
    expect(css).toMatch(third);
    const loading = (await import("./Loading.css?raw")).default;
    expect(loading).toMatch(third);
  });

  it("gives its button no margin of its own, so a link in the slot sits where a button does (M350)", () => {
    expect(css).not.toMatch(/\.cp-empty-state \.cp-btn\s*\{/);
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
