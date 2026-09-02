/**
 * Dialog behaviour every dialog inherits (SHELL-10).
 *
 * None of this existed before: Escape did nothing, focus stayed behind on
 * whatever opened the dialog, and Tab wandered into the page underneath — which
 * `aria-modal="true"` explicitly promises does not happen. A keyboard user
 * could open a dialog and never reach it.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "./Modal";

function open(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <>
      <button type="button">outside</button>
      <Modal open title="Test dialog" onClose={onClose} {...props}>
        <button type="button">first</button>
        <button type="button">second</button>
      </Modal>
    </>,
  );
  return { onClose, ...utils };
}

describe("Modal", () => {
  it("moves focus into the dialog when it opens", () => {
    // The dialog, not its first control: the title gets announced, and the
    // user does not start out on the close button.
    open();
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("focuses the dialog even when it holds no controls", () => {
    render(
      <Modal open title="Empty" onClose={() => {}}>
        <p>Nothing to press</p>
      </Modal>,
    );

    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("reaches the dialog's controls on the first Tab", async () => {
    const user = userEvent.setup();
    open();

    await user.tab();

    expect(document.activeElement?.textContent).not.toBe("outside");
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click", async () => {
    const user = userEvent.setup();
    const { onClose, container } = open();

    await user.click(container.querySelector(".cp-modal__backdrop")!);

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when the dialog itself is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.click(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    open();

    // first -> second -> close -> back to first, never reaching "outside".
    const visited: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      visited.push(document.activeElement?.textContent ?? "?");
    }

    expect(visited).not.toContain("outside");
  });

  it("wraps backwards from the first control to the last", async () => {
    const user = userEvent.setup();
    open();

    await user.tab({ shift: true });

    expect(document.activeElement?.textContent).not.toBe("outside");
  });

  it("returns focus to whatever opened it", async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Modal open={open} title="Test" onClose={() => setOpen(false)}>
            <button type="button">inside</button>
          </Modal>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(opener).toHaveFocus();
  });

  it("renders a wide dialog when asked", () => {
    open({ size: "wide" });
    expect(screen.getByRole("dialog")).toHaveClass("cp-modal--wide");
  });

  it("is a default-width dialog otherwise", () => {
    open();
    expect(screen.getByRole("dialog")).not.toHaveClass("cp-modal--wide");
  });
});
