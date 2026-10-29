/**
 * Dialog behaviour every dialog inherits (SHELL-10).
 *
 * None of this existed before: Escape did nothing, focus stayed behind on
 * whatever opened the dialog, and Tab wandered into the page underneath — which
 * `aria-modal="true"` explicitly promises does not happen. A keyboard user
 * could open a dialog and never reach it.
 */
import { useCallback, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "./Modal";
import { TrackContextMenu } from "./TrackContextMenu";
import { MotionProvider } from "../tokens/MotionContext";
import tokens from "../tokens/tokens.css?raw";
import css from "./Modal.css?raw";
import { expectNoAxeViolations } from "../test/axe";

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

  it.each(["small", "medium", "large"] as const)("draws a %s dialog at its own width", (size) => {
    open({ size });
    expect(screen.getByRole("dialog")).toHaveClass(`cp-modal--${size}`);
    expect(css).toMatch(
      new RegExp(`\\.cp-modal--${size}\\s*\\{[^}]*--modal-width:\\s*var\\(--modal-width-${size}\\)`),
    );
  });

  it("is 360, 520 and 760 at 1x, narrowed to the window by one rule (C108)", () => {
    const px = (name: string) => Number(new RegExp(`--modal-width-${name}:\\s*calc\\((\\d+)px \\* var\\(--scale\\)\\)`).exec(tokens)![1]);
    expect([px("small"), px("medium"), px("large")]).toEqual([360, 520, 760]);
    expect(css).toMatch(/\.cp-modal \{[^}]*width:\s*min\(var\(--modal-width[^;]*100vw/);
  });

  it("is a medium dialog (a form) unless told otherwise", () => {
    open();
    expect(screen.getByRole("dialog")).toHaveClass("cp-modal--medium");
  });

  it("keeps the three widths in order, each scaled with the text", () => {
    const px = (name: string) => Number(new RegExp(`--modal-width-${name}:\\s*calc\\((\\d+)px \\* var\\(--scale\\)\\)`).exec(tokens)![1]);
    expect(px("small")).toBeLessThan(px("medium"));
    expect(px("medium")).toBeLessThan(px("large"));
  });

});

describe("nested dialogs", () => {
  it("keeps the child on top when the parent re-renders with a new inline onClose", async () => {
    const parentClosed = vi.fn();
    const childClosed = vi.fn();
    function Both() {
      const [tick, setTick] = useState(0);
      const [child, setChild] = useState(false);
      // The child's handler is stable; only the parent's changes identity on a re-render.
      const closeChild = useCallback(() => childClosed(), []);
      return (
        <>
          <button type="button" onClick={() => setTick(tick + 1)}>
            rerender
          </button>
          {/* A new function every render, as an inline handler is. */}
          <Modal open title="Parent" onClose={() => parentClosed(tick)}>
            <button type="button" onClick={() => setChild(true)}>
              open child
            </button>
          </Modal>
          <Modal open={child} title="Child" onClose={closeChild}>
            <button type="button">in child</button>
          </Modal>
        </>
      );
    }
    render(<Both />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "open child" }));
    await user.keyboard("{Escape}");
    expect(childClosed).toHaveBeenCalledTimes(1);

    // The parent re-renders while the child is still open (its own close does not close it here).
    await user.click(screen.getByRole("button", { name: "rerender", hidden: true }));
    await user.keyboard("{Escape}");
    expect(childClosed).toHaveBeenCalledTimes(2);
    expect(parentClosed).not.toHaveBeenCalled();
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

describe("the footer's extra action", () => {
  it("is first (far left), then Cancel, then the main button", () => {
    open({
      primaryAction: { label: "Sync", onClick: () => {} },
      secondaryAction: { label: "Cancel", onClick: () => {} },
      extraAction: { label: "See every change", onClick: () => {} },
    });
    const footer = screen.getByRole("dialog").querySelector(".cp-modal__footer")!;
    expect([...footer.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "See every change",
      "Cancel",
      "Sync",
    ]);
    expect(screen.getByRole("button", { name: "See every change" })).toHaveClass("cp-modal__extra");
  });

  it("is pushed to the left edge by an auto margin", () => {
    expect(css).toMatch(/\.cp-modal__footer > \.cp-modal__extra \{[^}]*margin-right:\s*auto;/);
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

  describe("a greyed main button's reason", () => {
    const primary = (disabled: boolean) => ({
      label: "Copy to 3 tracks",
      onClick: () => {},
      disabled,
      disabledReason: "Tick at least one value.",
    });

    it("shows one line above the buttons, linked to the main button, while it is disabled", () => {
      open({ primaryAction: primary(true) });
      const reason = screen.getByText("Tick at least one value.");
      const button = screen.getByRole("button", { name: "Copy to 3 tracks" });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription("Tick at least one value.");
      expect(reason.compareDocumentPosition(button.closest("footer")!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(css).toMatch(/\.cp-modal__reason\s*\{[^}]*color:\s*var\(--fg-muted\)/);
    });

    it("is not shown once the button is enabled", () => {
      open({ primaryAction: primary(false) });
      expect(screen.queryByText("Tick at least one value.")).toBeNull();
      expect(screen.getByRole("button", { name: "Copy to 3 tracks" })).not.toHaveAttribute(
        "aria-describedby",
      );
    });
  });

  it("closes with an icon button named Close, not a typed cross (T10, N10)", () => {
    const { onClose } = open();
    const close = within(screen.getByRole("dialog").querySelector<HTMLElement>(".cp-modal__header")!).getByRole("button", { name: "Close" });
    expect(close).toHaveClass("cp-btn--icon");
    expect(close.querySelector('svg[data-icon="close"]')).not.toBeNull();
    expect(close.textContent).toBe("");
    expect(css).not.toMatch(/cp-modal__close/);
    close.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sets its body size, draws no line under the title or above the buttons (P11) and keeps no focus ring on the frame (T1, T2, T16)", () => {
    // P66: the dialog body is Inter at the control size (was --text-body).
    expect(css).toMatch(/\.cp-modal__body\s*\{[^}]*font-size:\s*var\(--control-font-size\)/);
    expect(css).toMatch(/\.cp-modal:focus\s*\{[^}]*outline:\s*none/);
    expect(css).not.toMatch(/--border-width/);
    // P11: the header and the footer sit on the dialog's surface, no line either side of the body.
    expect(css).toMatch(/border-bottom:\s*0;/);
    expect(css).toMatch(/border-top:\s*0;/);
  });

  it("has one scroller, the body, which grows with the window up to 80% of it (area 76, M255)", () => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(flat).toMatch(/\.cp-modal \{[^}]*max-height:\s*min\(100%, 80vh\)/);
    expect(flat).toMatch(/\.cp-modal__body \{[^}]*overflow:\s*auto/);
    // No dialog size scrolls on its own, and none sets a height cap of its own.
    expect(flat).not.toMatch(/\.cp-modal--large[^{]*\{[^}]*(max-height|overflow)/);
  });
});

describe("the one footer (area 75)", () => {
  it("offers a grey Close, never the violet main button, for a dialog that only shows or applies at once", () => {
    const onClose = vi.fn();
    render(<Modal open title="Columns" onClose={onClose} closeLabel="Close">body</Modal>);
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>(".cp-modal__footer")!;
    const close = within(footer).getByRole("button", { name: "Close" });
    expect(close).toHaveClass("cp-btn--secondary");
    expect(footer.querySelector(".cp-btn--primary")).toBeNull();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
  });

  it("puts extras at the footer's far left and one reason line above it", () => {
    render(
      <Modal open title="Edit values" onClose={() => undefined} closeLabel="Close" footerExtra={<span>3 selected</span>} reason="Pick a value first.">
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const footer = dialog.querySelector<HTMLElement>(".cp-modal__footer")!;
    expect(footer.firstElementChild).toHaveTextContent("3 selected");
    const reason = dialog.querySelector(".cp-modal__reason")!;
    expect(reason).toHaveTextContent("Pick a value first.");
    expect(reason.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Modal footer and focus (C107, C111, C112)", () => {
  // M254 (D24 A): was "one grey Close button" (C107). A dialog with no buttons of its own now
  // shows the header's × only; a footer Close is drawn only when the dialog names one.
  it("gives a dialog with no actions the header's × only, no footer Close", () => {
    const onClose = vi.fn();
    render(<Modal open title="About" onClose={onClose}>words</Modal>);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".cp-modal__footer")).toBeNull();
    const close = within(dialog.querySelector<HTMLElement>(".cp-modal__header")!).getByRole("button", { name: "Close" });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("draws a grey footer Close when the dialog names one with closeLabel", () => {
    render(<Modal open title="Columns" onClose={() => {}} closeLabel="Close">words</Modal>);
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>(".cp-modal__footer")!;
    expect(within(footer).getByRole("button", { name: "Close" })).toHaveClass("cp-btn--secondary");
  });

  it("does not add a Close when the dialog has its own buttons", () => {
    render(<Modal open title="Q" onClose={() => {}} primaryAction={{ label: "Go", onClick: () => {} }} secondaryAction={{ label: "Cancel", onClick: () => {} }}>words</Modal>);
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>(".cp-modal__footer")!;
    expect(within(footer).queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("puts focus on the element initialFocus names", () => {
    function Probe() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <Modal open title="Name" onClose={() => {}} initialFocus={ref}>
          <input ref={ref} aria-label="Name" />
        </Modal>
      );
    }
    render(<Probe />);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  });

  it("cannot be closed while closeDisabled, and says why", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Saving" onClose={onClose} closeDisabled closeReason="Wait until it has saved.">
        words
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const close = within(dialog.querySelector<HTMLElement>(".cp-modal__header")!).getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("aria-disabled", "true");
    await user.click(close);
    await user.keyboard("{Escape}");
    fireEvent.click(dialog.parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.querySelector(".cp-modal__reason")).toHaveTextContent("Wait until it has saved.");
  });
});

describe("the footer Close (S1, M254)", () => {
  // M254 (D24 A): was "is drawn for a dialog with no buttons of its own". There is no automatic
  // footer Close any more; the header's × is the way out.
  it("is not drawn by itself for a dialog with no buttons of its own", () => {
    render(
      <Modal open title="Log" onClose={() => {}}>
        words
      </Modal>,
    );
    expect(screen.getByRole("dialog").querySelector(".cp-modal__footer")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("is left out with noFooter, for a dialog that draws its own buttons", () => {
    render(
      <Modal open title="Save" onClose={() => {}} noFooter>
        <button type="button">Save to files</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".cp-modal__footer")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("is greyed while closeDisabled, and the reason line says why", () => {
    render(
      <Modal open title="Saving" onClose={() => {}} closeLabel="Close" closeDisabled closeReason="Wait until it has saved.">
        words
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const footer = dialog.querySelector<HTMLElement>(".cp-modal__footer")!;
    expect(within(footer).getByRole("button", { name: "Close" })).toBeDisabled();
    expect(dialog.querySelector(".cp-modal__reason")).toHaveTextContent("Wait until it has saved.");
  });
});

describe("Enter submits (C111)", () => {
  it("runs the one main button when Enter is pressed in a text field", async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Rename" onClose={() => {}} primaryAction={{ label: "Rename", onClick: go }}>
        <input aria-label="Name" />
      </Modal>,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "x{Enter}");
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("submits once when the field has its own Enter handler (B1)", async () => {
    // NewSetDialogs and ChapterDialog submit from the field and also name the main button.
    const go = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="New Set" onClose={() => {}} primaryAction={{ label: "Make", onClick: go }}>
        <input
          aria-label="Name"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              go();
            }
          }}
        />
      </Modal>,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "x{Enter}");
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter that confirms an IME composition (B1)", () => {
    const go = vi.fn();
    render(
      <Modal open title="Rename" onClose={() => {}} primaryAction={{ label: "Rename", onClick: go }}>
        <input aria-label="Name" />
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), { key: "Enter", isComposing: true });
    expect(go).not.toHaveBeenCalled();
  });

  it("does nothing when the main button is greyed", async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Rename" onClose={() => {}} primaryAction={{ label: "Rename", onClick: go, disabled: true }}>
        <input aria-label="Name" />
      </Modal>,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "x{Enter}");
    expect(go).not.toHaveBeenCalled();
  });

  it("leaves Enter alone in a multi-line box and on a button", async () => {
    const go = vi.fn();
    const other = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Note" onClose={() => {}} primaryAction={{ label: "Save", onClick: go }}>
        <textarea aria-label="Note" />
        <button type="button" onClick={other}>
          other
        </button>
      </Modal>,
    );
    await user.type(screen.getByRole("textbox", { name: "Note" }), "a{Enter}b");
    expect(go).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "other" }).focus();
    await user.keyboard("{Enter}");
    expect(other).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });
});

describe("Modal body look (C110, C67, C125, C121)", () => {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // P66: sections are 16 apart (was 12); the footer carries 12 of padding above the buttons.
  it("stacks the body 16 apart in prose line height, with a muted lead and no dead summary rule", () => {
    expect(flat).toMatch(/\.cp-modal__body \{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*gap:\s*var\(--space-xl\)/);
    expect(flat).toMatch(/\.cp-modal__body \{[^}]*line-height:\s*var\(--line-height-prose\)/);
    expect(flat).toMatch(/\.cp-modal__lead \{[^}]*color:\s*var\(--fg-muted\)/);
    expect(flat).not.toMatch(/cp-modal__summary/);
  });

  it("has no frame and lifts off the page with the dialog shadow (P11)", () => {
    expect(flat).toMatch(/\.cp-modal \{[^}]*border:\s*0;/);
    expect(flat).toMatch(/box-shadow:\s*var\(--shadow-dialog\)/);
  });
});

describe("footer and rhythm (M62, M63, M246, M247, M251, M255)", () => {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("pads the footer the same on every side, so the space under Cancel equals the space at its right (M62)", () => {
    expect(flat).toMatch(/\.cp-modal__footer \{[^}]*padding:\s*var\(--space-lg\);/);
    // The body's own bottom padding is the footer's job, and a footer-less body keeps its own.
    expect(flat).toMatch(/\.cp-modal__body \{[^}]*padding:\s*var\(--space-lg\) var\(--space-lg\) 0;/);
    expect(flat).toMatch(/\.cp-modal__body:last-child \{[^}]*padding-bottom:\s*var\(--space-lg\)/);
  });

  it("draws a hairline over the footer only while the body scrolls under it (M62)", () => {
    const sizes = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-modal__body") ? 500 : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-modal__body") ? 100 : 0;
    });
    try {
      render(
        <Modal open title="Long" onClose={() => {}} primaryAction={{ label: "Save", onClick: () => {} }}>
          <p>text</p>
        </Modal>,
      );
      expect(document.querySelector(".cp-modal__footer")).toHaveAttribute("data-divided");
    } finally {
      sizes.mockRestore();
      client.mockRestore();
    }
    expect(flat).toMatch(/\.cp-modal__footer\[data-divided\] \{[^}]*border-top:\s*var\(--hairline\) solid/);
  });

  it("has no hairline when the body fits", () => {
    render(
      <Modal open title="Short" onClose={() => {}} primaryAction={{ label: "Save", onClick: () => {} }}>
        <p>text</p>
      </Modal>,
    );
    expect(document.querySelector(".cp-modal__footer")).not.toHaveAttribute("data-divided");
  });

  it("lets a long name in the title wrap and keeps the × (M246)", () => {
    expect(flat).toMatch(/\.cp-modal__title \{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/);
    expect(flat).toMatch(/\.cp-modal__header > \.cp-close \{[^}]*flex:\s*none/);
  });

  it("breaks a long path in the body instead of running out of the box (M247)", () => {
    expect(flat).toMatch(/\.cp-modal__body \{[^}]*overflow-wrap:\s*anywhere/);
  });

  it("sizes the lead once, on the lead itself (M251)", () => {
    expect(flat).toMatch(/\.cp-modal__lead \{[^}]*font-size:\s*var\(--control-font-size\)/);
  });

  it("keeps a dialog that grows at a fixed top, so its title does not jump (M375)", () => {
    expect(flat).toMatch(/\.cp-modal__backdrop \{[^}]*align-items:\s*flex-start/);
  });
});

describe("while a write runs (M245)", () => {
  it("greys Cancel when its secondary action is disabled, and it does nothing", async () => {
    const cancel = vi.fn();
    render(
      <Modal
        open
        title="Delete “Warm-up”?"
        onClose={() => {}}
        primaryAction={{ label: "Delete Set", onClick: () => {}, loading: true }}
        secondaryAction={{ label: "Cancel", onClick: cancel, disabled: true }}
      >
        <p>Gone.</p>
      </Modal>,
    );
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("the footer's far-left action (M250, D24)", () => {
  it("draws a danger extra as the red outline button", () => {
    render(
      <Modal
        open
        title="Chapter"
        onClose={() => {}}
        extraAction={{ label: "Delete chapter…", onClick: () => {}, danger: true }}
        primaryAction={{ label: "Save", onClick: () => {} }}
      >
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Delete chapter…" })).toHaveClass("cp-btn--danger");
  });
});

describe("words while it closes (M248)", () => {
  it("keeps the title, body and buttons it had while its exit plays", async () => {
    const real = window.getComputedStyle;
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo);
      return el instanceof HTMLElement && el.hasAttribute("data-leaving")
        ? ({ ...style, animationName: "cp-fade-out" } as unknown as CSSStyleDeclaration)
        : style;
    });
    try {
      const ui = (open: boolean, name: string) => (
        <MotionProvider>
          <Modal
            open={open}
            title={`Freeze ${name}?`}
            onClose={() => {}}
            primaryAction={{ label: name ? `Freeze ${name}` : "Freeze", onClick: () => {} }}
          >
            <p>Freezing {name}</p>
          </Modal>
        </MotionProvider>
      );
      const view = render(ui(true, "“Peak time”"));
      view.rerender(ui(false, ""));
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveTextContent("Freeze “Peak time”?");
      expect(dialog).toHaveTextContent("Freezing “Peak time”");
      expect(within(dialog).getByRole("button", { name: "Freeze “Peak time”", hidden: true })).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Tab after the focused button is removed (M464)", () => {
  it("pulls focus back into the dialog instead of leaving it on the page behind", async () => {
    const user = userEvent.setup();
    function Host() {
      const [asking, setAsking] = useState(false);
      return (
        <>
          <button type="button">behind</button>
          <Modal open title="Activity" onClose={() => {}}>
            {asking ? (
              <button key="keep" type="button">
                Keep
              </button>
            ) : (
              <button key="undo" type="button" onClick={() => setAsking(true)}>
                Undo this batch
              </button>
            )}
          </Modal>
        </>
      );
    }
    render(<Host />);
    await user.tab();
    screen.getByRole("button", { name: "Undo this batch" }).focus();
    await user.keyboard("{Enter}");
    // The button that had focus is gone: focus fell to the body.
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(false);
    await user.tab();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});

describe("one stack of layers (M469)", () => {
  it("leaves Escape to a menu opened from the dialog, then to the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onMenuClose = vi.fn();
    function Host() {
      const [menu, setMenu] = useState(false);
      return (
        <Modal open title="Tags" onClose={onClose}>
          <button type="button" onClick={() => setMenu(true)}>
            item
          </button>
          {menu ? (
            <TrackContextMenu
              x={0}
              y={0}
              items={[{ id: "one", label: "One", onSelect: () => {} }]}
              onClose={() => {
                onMenuClose();
                setMenu(false);
              }}
            />
          ) : null}
        </Modal>
      );
    }
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "item" }));
    await user.keyboard("{Escape}");
    expect(onMenuClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Modal accessibility (HARDEN-08)", () => {
  it("has no WCAG 2.2 A or AA violations", async () => {
    render(
      <Modal open title="Test dialog" onClose={() => {}}>
        <button type="button">first</button>
      </Modal>,
    );
    await expectNoAxeViolations();
  });
});
