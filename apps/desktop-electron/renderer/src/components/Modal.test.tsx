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

describe("the backdrop", () => {
  it("closes the dialog on a click, as it always has", async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a click when the dialog says a stray click must not end it", async () => {
    const user = userEvent.setup();
    const { onClose } = open({ closeOnBackdrop: false });
    await user.click(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
    // Escape and the close button still work.
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the footer", () => {
  it("puts a back action between the secondary and the primary one", () => {
    open({
      primaryAction: { label: "Next", onClick: () => {} },
      secondaryAction: { label: "Skip", onClick: () => {} },
      backAction: { label: "Back", onClick: () => {}, disabled: true },
    });
    const footer = screen.getByRole("dialog").querySelector(".cp-modal__footer")!;
    expect([...footer.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Skip",
      "Back",
      "Next",
    ]);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });
});

describe("the title", () => {
  it("names each dialog by its own title when two are on the page at once", () => {
    // One dialog playing its exit while the next opens (PAGES-12) puts two on the page. A
    // shared title id named both after the first, so the new one read as the old one.
    render(
      <>
        <Modal open title="Notes for “Friday”" onClose={() => {}}>
          <textarea aria-label="Set notes" />
        </Modal>
        <Modal open title="Chapter “Warm-up”" onClose={() => {}}>
          <textarea aria-label="Chapter notes" />
        </Modal>
      </>,
    );
    const notes = screen.getByRole("dialog", { name: "Notes for “Friday”" });
    const chapter = screen.getByRole("dialog", { name: "Chapter “Warm-up”" });
    expect(notes).toContainElement(screen.getByLabelText("Set notes"));
    expect(chapter).toContainElement(screen.getByLabelText("Chapter notes"));
  });
});
