import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenHeader } from "./ScreenHeader";
import rawCss from "./ScreenHeader.css?raw";
import { stripComments } from "../../test/cssRules";

const css = stripComments(rawCss);

describe("ScreenHeader", () => {
  it("renders exactly one h1 holding the title", () => {
    render(<ScreenHeader title="Library" />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Library");
  });

  it("puts the slots in order: crumb, title and beside, summary, tabs", () => {
    const { container } = render(
      <ScreenHeader
        title="Prepare"
        crumb={<span>Sets</span>}
        beside={<span>Picker</span>}
        summary="12 tracks"
        actions={<button type="button">Export</button>}
        tabs={<span>Tabs here</span>}
        status={<span>Draft</span>}
      />,
    );
    const root = container.querySelector(".cp-screen-header")!;
    const order = [
      ".cp-screen-header__crumb",
      ".cp-screen-header__main",
      ".cp-screen-header__summary",
      ".cp-screen-header__tabs",
    ].map((selector) => root.querySelector(selector));
    order.forEach((node) => expect(node).not.toBeNull());
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const main = root.querySelector<HTMLElement>(".cp-screen-header__main")!;
    expect(within(main).getByText("Export")).toBeInTheDocument();
    const row = root.querySelector<HTMLElement>(".cp-screen-header__title-row")!;
    expect(within(row).getByText("Picker")).toBeInTheDocument();
    expect(within(row).getByText("Draft")).toBeInTheDocument();
  });

  it("keeps the page name in the h1 when display replaces it, visually hidden", () => {
    const { container } = render(<ScreenHeader title="Library" display="Friday set" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Library");
    expect(h1).toHaveClass("cp-screen-header__title--hidden");
    expect(container.querySelector(".cp-screen-header__display")).toHaveTextContent("Friday set");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each([false, "", null, undefined])("treats display=%j as absent", (display) => {
    const { container } = render(<ScreenHeader title="Keys" display={display} />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("cp-screen-header__title--hidden");
    expect(container.querySelector(".cp-screen-header__display")).toBeNull();
  });

  it("does not hide the h1 without display", () => {
    render(<ScreenHeader title="Keys" />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("cp-screen-header__title--hidden");
  });

  it("is sticky, with one divider under all and an xl title", () => {
    const root = /\.cp-screen-header\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(root).toMatch(/position:\s*sticky/);
    expect(root).toMatch(/border-bottom:\s*var\(--divider\)/);
    expect((css.match(/var\(--divider\)/g) ?? []).length).toBe(1);
    expect(css).toMatch(/\.cp-screen-header__title,[\s\S]*?font-size:\s*var\(--font-size-xl\)/);
  });
});
