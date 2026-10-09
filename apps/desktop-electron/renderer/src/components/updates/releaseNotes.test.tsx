/**
 * The release notes renderer (DIST-07): untrusted text from the network, shown with simple
 * formatting and nothing else.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { installUpdates, updateState } from "../../test/updatesBridge";
import { MAX_NOTES_LENGTH } from "./releaseNotesLimits";
import { renderReleaseNotes } from "./releaseNotes";

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

function show(markdown: string) {
  return render(<div data-testid="notes">{renderReleaseNotes(markdown)}</div>);
}

describe("renderReleaseNotes", () => {
  it("renders headings", () => {
    show("# One\n\n## Two\n\n### Three");
    expect(screen.getByRole("heading", { name: "One" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Two" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Three" })).toBeInTheDocument();
  });

  it("renders bullet and numbered lists", () => {
    const { container } = show("- Fixes the table\n* Faster start\n\n1. First\n2. Second");
    const lists = container.querySelectorAll("ul, ol");
    expect(lists).toHaveLength(2);
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(screen.getByText("Faster start")).toBeInTheDocument();
  });

  it("renders paragraphs, emphasis and code", () => {
    const { container } = show("A **bold** word, an *em* one, an _under_ one and `code`.\n\nSecond paragraph");
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect([...container.querySelectorAll("em")].map((e) => e.textContent)).toEqual(["em", "under"]);
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("keeps snake_case words as they are", () => {
    const { container } = show("Renamed some_file_name today");
    expect(container.querySelector("em")).toBeNull();
    expect(container.textContent).toContain("some_file_name");
  });

  it("renders an https link as a link role with no address to navigate to, and opens it through the bridge", async () => {
    const fake = installUpdates(updateState());
    const { container } = show("See [the release](https://github.com/stuchain/CuePoint/releases/tag/v1.0.1).");
    const link = screen.getByRole("link", { name: "the release" });
    // No href: a middle click, a drag or a drop has nothing to load.
    expect(container.querySelector("a")).toBeNull();
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("tabindex", "0");
    expect(link).toHaveAttribute("draggable", "false");
    const click = createEvent.click(link);
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    expect(fake.bridge.openLink).toHaveBeenCalledWith("https://github.com/stuchain/CuePoint/releases/tag/v1.0.1");
  });

  it("does nothing on a middle click, and stops the browser acting on it", () => {
    const fake = installUpdates(updateState());
    show("[go](https://github.com/a/b)");
    const link = screen.getByRole("link", { name: "go" });
    const aux = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    link.dispatchEvent(aux);
    expect(aux.defaultPrevented).toBe(true);
    expect(fake.bridge.openLink).not.toHaveBeenCalled();
  });

  it("does not let the link be dragged", () => {
    show("[go](https://github.com/a/b)");
    const drag = createEvent.dragStart(screen.getByRole("link", { name: "go" }));
    fireEvent(screen.getByRole("link", { name: "go" }), drag);
    expect(drag.defaultPrevented).toBe(true);
  });

  it.each(["{Enter}", " "])("opens a link from the keyboard exactly once: %j", async (key) => {
    const fake = installUpdates(updateState());
    show("[go](https://github.com/a/b)");
    screen.getByRole("link", { name: "go" }).focus();
    await userEvent.keyboard(key);
    expect(fake.bridge.openLink).toHaveBeenCalledTimes(1);
  });

  it("keeps balanced parentheses in an address", async () => {
    const fake = installUpdates(updateState());
    show("[w](https://github.com/a/b_(c)) after");
    await userEvent.click(screen.getByRole("link", { name: "w" }));
    expect(fake.bridge.openLink).toHaveBeenCalledWith("https://github.com/a/b_(c)");
    expect(screen.getByText(/after/)).toBeInTheDocument();
  });

  it("shows raw HTML as text and creates no element for it", () => {
    const { container } = show("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<b>hi</b>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it.each([
    ["javascript:", "[click](javascript:alert(1))"],
    ["data:", "[click](data:text/html,hi)"],
    ["http:", "[click](http://github.com/a)"],
    ["relative", "[click](/releases)"],
    ["mixed case javascript", "[click](JaVaScRiPt:alert(1))"],
    ["file:", "[click](file:///etc/passwd)"],
  ])("shows a %s link as its words, not a link", (_what, markdown) => {
    const { container } = show(markdown);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("click");
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });

  it("does not turn an image into an element", () => {
    const { container } = show("![logo](https://github.com/logo.png)");
    expect(container.querySelector("img")).toBeNull();
  });

  it("reads no more than the cap", () => {
    const { container } = show(`${"a ".repeat(MAX_NOTES_LENGTH)}END`);
    expect(container.textContent).not.toContain("END");
  });

  it.each([
    ["open brackets", "[".repeat(20_000)],
    ["open bold", "**a".repeat(6_000)],
    ["open code", "`a".repeat(9_000)],
    ["open emphasis", "*a ".repeat(6_000)],
    ["open links", "[a](".repeat(5_000)],
  ])("renders %s quickly", (_what, text) => {
    const started = performance.now();
    show(text);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("copes with deep emphasis and odd input without throwing", () => {
    expect(() => show("**".repeat(500) + "[".repeat(500) + "\n" + "- ".repeat(500))).not.toThrow();
    expect(() => show("")).not.toThrow();
  });
});
