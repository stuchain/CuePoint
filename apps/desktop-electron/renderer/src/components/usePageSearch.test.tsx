import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";

import { usePageSearch } from "./usePageSearch";

function Page({ withSearch = true }: { withSearch?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  usePageSearch(withSearch ? ref : undefined);
  return <input ref={ref} aria-label="Search this page" />;
}

function ctrlF(target: Element | Window = window, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("usePageSearch (C189)", () => {
  it("focuses the registered input on Ctrl+F and keeps the browser's own find away", () => {
    render(<Page />);
    const event = ctrlF();
    expect(screen.getByRole("textbox", { name: "Search this page" })).toHaveFocus();
    expect(event.defaultPrevented).toBe(true);
  });

  it("also answers Cmd+F", () => {
    render(<Page />);
    ctrlF(window, { ctrlKey: false, metaKey: true });
    expect(screen.getByRole("textbox", { name: "Search this page" })).toHaveFocus();
  });

  it("does nothing when no input is registered", () => {
    render(<Page withSearch={false} />);
    const event = ctrlF();
    expect(screen.getByRole("textbox")).not.toHaveFocus();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing while a dialog is open", () => {
    render(
      <>
        <Page />
        <div role="dialog" aria-modal="true" aria-label="Sync" />
      </>,
    );
    const event = ctrlF();
    expect(screen.getByRole("textbox", { name: "Search this page" })).not.toHaveFocus();
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops answering once the page is gone", () => {
    const { unmount } = render(<Page />);
    unmount();
    expect(ctrlF().defaultPrevented).toBe(false);
  });

  it("goes to the page that registered last, and back when it leaves", () => {
    function Two() {
      const [second, setSecond] = useState(true);
      const a = useRef<HTMLInputElement>(null);
      const b = useRef<HTMLInputElement>(null);
      usePageSearch(a);
      usePageSearch(second ? b : undefined);
      return (
        <>
          <input ref={a} aria-label="A" />
          <input ref={b} aria-label="B" />
          <button type="button" onClick={() => setSecond(false)}>
            drop
          </button>
        </>
      );
    }
    render(<Two />);
    ctrlF();
    expect(screen.getByRole("textbox", { name: "B" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "drop" }));
    ctrlF();
    expect(screen.getByRole("textbox", { name: "A" })).toHaveFocus();
  });

  it("selects what is already typed, so the next key replaces it", () => {
    render(<Page />);
    const input = screen.getByRole("textbox", { name: "Search this page" }) as HTMLInputElement;
    input.value = "house";
    ctrlF();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });
});
