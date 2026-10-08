/**
 * The shell header (HDR-6, PAGES-10's slot).
 *
 * It holds the search and the Camelot wheel's button; the
 * `search` landmark belongs to the search field's container, so the wheel is not
 * inside it.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../Toast";
import { ShellHeader } from "./ShellHeader";

function mount() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <ShellHeader />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("ShellHeader", () => {
  it("holds the library search", () => {
    mount();
    expect(screen.getByRole("combobox", { name: /search library/i })).toBeInTheDocument();
  });

  it("puts the wheel button in its slot, outside the search landmark", () => {
    const { container } = mount();
    const slot = container.querySelector("[data-slot='wheel']") as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot).toContainElement(screen.getByRole("button", { name: "Camelot wheel" }));
    expect(screen.getByRole("search")).not.toContainElement(slot);
  });

  it("has exactly one search landmark, and it is the search field's own", () => {
    const { container } = mount();
    expect(container.querySelectorAll("[role='search']")).toHaveLength(1);
    expect(screen.getByRole("search")).toContainElement(
      screen.getByRole("combobox", { name: /search library/i }),
    );
  });

  it("centers its row, as the search always was", () => {
    const { container } = mount();
    expect(container.firstElementChild).toHaveClass("cp-shell-header");
    expect(container.querySelector(".cp-shell-header__row")).not.toBeNull();
  });
});
