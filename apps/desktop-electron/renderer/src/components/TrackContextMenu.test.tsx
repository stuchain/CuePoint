/**
 * The track context menu (PLAYER-09, then ORG-11).
 *
 * Two things here are easy to write and easy to get subtly wrong, so both have
 * a test that fails if they regress: a menu that traps focus when it closes
 * (leaving the user at the top of the page), and arrow keys that walk onto a
 * disabled entry and then do nothing when Enter is pressed.
 *
 * ORG-11 added submenus, and a third: a submenu that swallows the keyboard.
 * Once one is open every key belongs to it, or the parent list moves
 * underneath while the user is reading the child — and ArrowLeft has to mean
 * "back" rather than "somewhere else entirely".
 */
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackContextMenu, useMenuButton, type TrackContextMenuItem } from "./TrackContextMenu";
import css from "./TrackContextMenu.css?raw";
import { parseRules, stripComments } from "../test/cssRules";

function items(overrides: Partial<TrackContextMenuItem>[] = []): TrackContextMenuItem[] {
  const base: TrackContextMenuItem[] = [
    { id: "play", label: "Play", onSelect: vi.fn() },
    { id: "next", label: "Play next", onSelect: vi.fn() },
    { id: "queue", label: "Add to queue", onSelect: vi.fn() },
  ];
  return base.map((item, index) => ({ ...item, ...(overrides[index] ?? {}) }));
}

function open(props: Partial<React.ComponentProps<typeof TrackContextMenu>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const menuItems = props.items ?? items();
  const view = render(
    <div>
      <button type="button" data-testid="opener">
        opener
      </button>
      <TrackContextMenu x={20} y={30} items={menuItems} onClose={onClose} {...props} />
    </div>,
  );
  return { ...view, onClose, items: menuItems };
}

describe("the menu", () => {
  it("shows its entries and takes focus", () => {
    open();

    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
    ]);
    expect(screen.getByRole("menu")).toHaveFocus();
  });

  it("draws a danger entry in the danger colour", () => {
    open({ items: items([{}, {}, { danger: true }]) });
    expect(screen.getByRole("menuitem", { name: "Add to queue" })).toHaveClass("cp-track-menu__item--danger");
    expect(screen.getByRole("menuitem", { name: "Play" })).not.toHaveClass("cp-track-menu__item--danger");
    expect(css).toMatch(/\.cp-track-menu__item--danger[^{]*\{[^}]*var\(--danger-text\)/);
  });

  it("runs an entry and closes", async () => {
    const chosen = vi.fn();
    const { onClose } = open({ items: items([{ onSelect: chosen }]) });

    await userEvent.click(screen.getByRole("menuitem", { name: "Play" }));

    expect(chosen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and gives focus back to whatever had it", async () => {
    // The reason this matters: the table opens the menu, and a user who
    // dismisses it expects to still be in the table — not at the top of the
    // document with their place lost.
    render(
      <button type="button" data-testid="table">
        table
      </button>,
    );
    const table = screen.getByTestId("table");
    table.focus();

    const onClose = vi.fn();
    const view = render(<TrackContextMenu x={0} y={0} items={items()} onClose={onClose} />);
    expect(screen.getByRole("menu")).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    // The parent unmounts it in response; that is when focus goes home.
    view.unmount();
    expect(table).toHaveFocus();
  });

  it("closes when something else is clicked", async () => {
    const { onClose } = open();

    await userEvent.click(screen.getByTestId("opener"));

    expect(onClose).toHaveBeenCalled();
  });

  it("walks with the arrows and wraps", async () => {
    const chosen = vi.fn();
    open({ items: items([{}, {}, { onSelect: chosen }]) });

    // Up from the first entry lands on the last one.
    await userEvent.keyboard("{ArrowUp}{Enter}");

    expect(chosen).toHaveBeenCalledTimes(1);
  });

  it("steps over a disabled entry rather than onto it", async () => {
    // Arrowing onto a disabled entry and pressing Enter would do nothing, and
    // look like a broken menu rather than an unavailable action.
    const queue = vi.fn();
    open({
      items: [
        { id: "play", label: "Play", onSelect: vi.fn() },
        { id: "reveal", label: "Show in folder", disabled: true, onSelect: vi.fn() },
        { id: "queue", label: "Add to queue", onSelect: queue },
      ],
    });

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("does not run a disabled entry that is clicked", async () => {
    const reveal = vi.fn();
    const { onClose } = open({
      items: [{ id: "reveal", label: "Show in folder", disabled: true, onSelect: reveal }],
    });

    await userEvent.click(screen.getByRole("menuitem", { name: "Show in folder" }));

    expect(reveal).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays on screen when it opens against an edge", () => {
    // jsdom reports zero-sized rects, so the menu is given a size to be clamped
    // against — otherwise this asserts nothing.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 160,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <TrackContextMenu
        x={window.innerWidth - 10}
        y={window.innerHeight - 10}
        items={items()}
        onClose={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu");
    expect(parseFloat(menu.style.left)).toBeLessThanOrEqual(window.innerWidth - 200);
    expect(parseFloat(menu.style.top)).toBeLessThanOrEqual(window.innerHeight - 160);
    vi.restoreAllMocks();
  });

  describe("a submenu against an edge (ORG-13)", () => {
    /**
     * jsdom lays nothing out, so every box would be zero and every placement
     * would be "there is room". Each element is given the size its stylesheet
     * implies, keyed off what it is.
     */
    function laidOut(parentRight: number, parentTop: number) {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        function (this: HTMLElement) {
          const submenu = this.classList.contains("cp-track-menu__submenu");
          const item = this.getAttribute("role") === "menuitem";
          if (submenu) return rect(0, 0, 140, 300);
          if (item) return rect(parentRight - 200, parentTop, 200, 30);
          return rect(0, 0, 200, 160);
        },
      );
    }

    function rect(left: number, top: number, width: number, height: number): DOMRect {
      return {
        width,
        height,
        left,
        top,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    }

    const withSubmenu: TrackContextMenuItem[] = [
      { id: "play", label: "Play", onSelect: vi.fn() },
      {
        id: "rate",
        label: "Rate",
        onSelect: () => undefined,
        items: [
          { id: "rate-4", label: "★★★★", onSelect: vi.fn() },
          { id: "rate-5", label: "★★★★★", onSelect: vi.fn() },
        ],
      },
    ];

    it("opens to the left when there is no room on the right", async () => {
      // The menu is clamped against the edge, so the submenu's usual side is
      // off screen — and a list drawn off screen cannot be clicked at all.
      laidOut(window.innerWidth, 10);
      render(
        <TrackContextMenu
          x={window.innerWidth}
          y={10}
          items={withSubmenu}
          onClose={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("menuitem", { name: "Rate" }));

      const submenu = screen.getByRole("menu", { name: "Rate" });
      expect(parseFloat(submenu.style.left)).toBe(window.innerWidth - 200 - 140);
      vi.restoreAllMocks();
    });

    it("opens to the right when there is room", async () => {
      laidOut(220, 10);
      render(<TrackContextMenu x={20} y={10} items={withSubmenu} onClose={vi.fn()} />);

      await userEvent.click(screen.getByRole("menuitem", { name: "Rate" }));

      expect(parseFloat(screen.getByRole("menu", { name: "Rate" }).style.left)).toBe(220);
      vi.restoreAllMocks();
    });

    it("never starts below the bottom of the window", async () => {
      // A menu long enough to scroll has entries near the bottom, and a child
      // that began at its parent's top would begin off screen.
      laidOut(220, window.innerHeight - 20);
      render(
        <TrackContextMenu
          x={20}
          y={window.innerHeight - 20}
          items={withSubmenu}
          onClose={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("menuitem", { name: "Rate" }));

      const top = parseFloat(screen.getByRole("menu", { name: "Rate" }).style.top);
      expect(top + 300).toBeLessThanOrEqual(window.innerHeight);
      vi.restoreAllMocks();
    });

    describe("at 1440x900 (W4)", () => {
      const size = { width: window.innerWidth, height: window.innerHeight };
      beforeEach(() => {
        Object.assign(window, { innerWidth: 1440, innerHeight: 900 });
      });
      afterEach(() => {
        Object.assign(window, { innerWidth: size.width, innerHeight: size.height });
        vi.restoreAllMocks();
      });

      it("lines its bottom up with the entry's when there is not room below", async () => {
        // Sliding it up to fit left it covering the main menu; its bottom edge
        // meets the entry's bottom edge instead, so the entry stays in view.
        laidOut(220, 850);
        render(<TrackContextMenu x={20} y={850} items={withSubmenu} onClose={vi.fn()} />);

        await userEvent.click(screen.getByRole("menuitem", { name: "Rate" }));

        const top = parseFloat(screen.getByRole("menu", { name: "Rate" }).style.top);
        expect(top).toBe(850 + 30 - 300);
        expect(parseFloat(screen.getByRole("menu", { name: "Rate" }).style.left)).toBe(220);
      });

      it("still starts level with the entry when there is room below", async () => {
        laidOut(220, 400);
        render(<TrackContextMenu x={20} y={400} items={withSubmenu} onClose={vi.fn()} />);

        await userEvent.click(screen.getByRole("menuitem", { name: "Rate" }));

        expect(parseFloat(screen.getByRole("menu", { name: "Rate" }).style.top)).toBe(400);
      });
    });
  });

  it("describes what it acts on", () => {
    open({ label: "Actions for 3 tracks" });

    expect(screen.getByRole("menu", { name: "Actions for 3 tracks" })).toBeInTheDocument();
  });
});

describe("a submenu (ORG-11)", () => {
  function withRate() {
    const onRate = vi.fn();
    const menuItems: TrackContextMenuItem[] = [
      { id: "play", label: "Play", onSelect: vi.fn() },
      {
        id: "rate",
        label: "Rate",
        onSelect: vi.fn(),
        items: [
          { id: "one", label: "★", onSelect: () => onRate(1) },
          { id: "two", label: "★★", onSelect: () => onRate(2) },
          { id: "clear", label: "Clear rating", onSelect: () => onRate(null) },
        ],
      },
    ];
    const view = open({ items: menuItems });
    return { ...view, onRate };
  }

  it("is closed until it is asked for", () => {
    withRate();
    expect(screen.queryByRole("menuitem", { name: "★★" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Rate/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("says it has one, so a screen reader can say so too", () => {
    withRate();
    expect(screen.getByRole("menuitem", { name: /Rate/ })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("opens when the parent is clicked, and does not close the menu", async () => {
    const { onClose } = withRate();

    await userEvent.click(screen.getByRole("menuitem", { name: /Rate/ }));

    expect(screen.getByRole("menuitem", { name: "★★" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("runs a child and closes the whole menu", async () => {
    const { onRate, onClose } = withRate();

    await userEvent.click(screen.getByRole("menuitem", { name: /Rate/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "★★" }));

    expect(onRate).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it("opens with ArrowRight and chooses with Enter", async () => {
    const { onRate } = withRate();
    const menu = screen.getByRole("menu", { name: "Track actions" });

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    expect(menu).toBeDefined();
    expect(onRate).toHaveBeenCalledWith(2);
  });

  it("keeps the arrows inside it while it is open", async () => {
    withRate();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowDown}");

    // The parent's highlight has not moved: the keys belong to the child.
    expect(screen.getByRole("menuitem", { name: /Rate/ }).className).toContain("--active");
  });

  it("closes only the submenu on ArrowLeft", async () => {
    const { onClose } = withRate();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowLeft}");

    expect(screen.queryByRole("menuitem", { name: "★★" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes only the submenu on the first Escape", async () => {
    const { onClose } = withRate();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menuitem", { name: "★★" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes what it opened when the pointer moves to a plain entry", async () => {
    withRate();

    await userEvent.click(screen.getByRole("menuitem", { name: /Rate/ }));
    await userEvent.hover(screen.getByRole("menuitem", { name: "Play" }));

    expect(screen.queryByRole("menuitem", { name: "★★" })).not.toBeInTheDocument();
  });

  it("is named after the entry that opened it", async () => {
    withRate();
    await userEvent.click(screen.getByRole("menuitem", { name: /Rate/ }));
    expect(screen.getByRole("menu", { name: "Rate" })).toBeInTheDocument();
  });
});

describe("a submenu inside a submenu (FLW-8)", () => {
  function nested() {
    const onRate = vi.fn();
    const onTag = vi.fn();
    const view = open({
      items: [
        { id: "play", label: "Play", onSelect: vi.fn() },
        {
          id: "organize",
          label: "Organize",
          onSelect: vi.fn(),
          items: [
            { id: "tag", label: "Add tag", onSelect: onTag },
            {
              id: "rate",
              label: "Rate",
              onSelect: vi.fn(),
              items: [
                { id: "one", label: "★", onSelect: () => onRate(1) },
                { id: "two", label: "★★", onSelect: () => onRate(2) },
              ],
            },
          ],
        },
      ],
    });
    return { ...view, onRate, onTag };
  }

  it("opens a second level with the pointer, and runs its entry", async () => {
    const { onRate, onClose } = nested();
    await userEvent.click(screen.getByRole("menuitem", { name: /Organize/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Rate/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "★★" }));
    expect(onRate).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it("goes in with ArrowRight and back out one level at a time", async () => {
    const { onRate, onClose } = nested();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    expect(screen.getByRole("menu", { name: "Rate" })).toBeInTheDocument();

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.queryByRole("menu", { name: "Rate" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Organize" })).toBeInTheDocument();

    await userEvent.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(onRate).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it("takes Escape one level at a time", async () => {
    const { onClose } = nested();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{ArrowDown}{ArrowRight}");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Rate" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Organize" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  describe("stylesheet (T1, T14, T10)", () => {
    const rules = parseRules(stripComments(css));
    const body = (selector: string) => rules.find((r) => r.selector === selector)?.body ?? "";

    it("draws the submenu chevron at the small icon size", () => {
      expect(body(".cp-track-menu__arrow .cp-pixel-icon")).toMatch(/var\(--icon-size-sm\)/);
    });

    it("sets the item font size to the control size", () => {
      expect(body(".cp-track-menu__item")).toMatch(/font-size:\s*var\(--control-font-size\)/);
    });

    // P55: the row under the pointer is a hover (--row-hover), not the selected-row gradient.
    it("highlights the current item with the row hover, not the selected-row look or the accent", () => {
      const active = body('.cp-track-menu__item--active:not([aria-disabled="true"])');
      expect(active).toMatch(/background:\s*var\(--row-hover\)/);
      expect(active).not.toMatch(/selected-row-background/);
      expect(active).toMatch(/color:\s*var\(--fg-primary\)/);
      expect(active).not.toMatch(/accent-primary|fg-on-accent/);
    });
  });

  it("draws a submenu's arrow as a chevron icon, not a typed glyph (T10)", () => {
    const { container } = render(
      <TrackContextMenu
        x={0}
        y={0}
        onClose={vi.fn()}
        items={[{ id: "org", label: "Organize", onSelect: vi.fn(), items: [{ id: "x", label: "X", onSelect: vi.fn() }] }]}
      />,
    );
    const arrow = container.querySelector(".cp-track-menu__arrow");
    expect(arrow?.querySelector('svg[data-icon="chevron-right"]')).not.toBeNull();
    expect(arrow?.textContent).toBe("");
  });
});

describe("tickable entries (K12)", () => {
  it("are menu checkboxes that say whether they are ticked", () => {
    open({
      items: items([{ checked: true }, { checked: false }]),
    });
    const boxes = screen.getAllByRole("menuitemcheckbox");
    expect(boxes.map((node) => node.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    // The third is an ordinary entry.
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual(["Add to queue"]);
  });

  it("run and leave the menu open, so several can be changed", async () => {
    const chosen = vi.fn();
    const { onClose } = open({ items: items([{ checked: false, onSelect: chosen }]) });
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Play" }));
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("toggle with Enter or Space and keep the menu open", async () => {
    const chosen = vi.fn();
    const { onClose } = open({ items: items([{ checked: false, onSelect: chosen }]) });
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(chosen).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("return focus to the opener on Escape", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    function Host() {
      const [shown, setShown] = React.useState(true);
      return shown ? (
        <TrackContextMenu x={0} y={0} items={items([{ checked: true }])} onClose={() => setShown(false)} />
      ) : null;
    }
    render(<Host />);
    expect(screen.getByRole("menu")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});

describe("shortcut labels (C127)", () => {
  it("shows an entry's shortcut after its name, and keeps the name as the accessible name", () => {
    open({ items: items([{ shortcut: "Enter" }, {}, {}]) });
    const play = screen.getByRole("menuitem", { name: "Play" });
    expect(play.querySelector(".cp-track-menu__shortcut")).toHaveTextContent("Enter");
  });

  it("sets the shortcut right-aligned, muted, in the data face", () => {
    const rule = parseRules(stripComments(css)).find((r) => r.selector.trim() === ".cp-track-menu__shortcut")!;
    expect(rule.body).toMatch(/margin-inline-start:\s*auto/);
    expect(rule.body).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(rule.body).toMatch(/font-family:\s*var\(--font-data\)/);
  });
});

describe("danger entries (C16)", () => {
  it("are sorted last after a divider, whatever order they were given in", () => {
    open({
      items: [
        { id: "delete", label: "Delete", danger: true, onSelect: vi.fn() },
        { id: "play", label: "Play", onSelect: vi.fn() },
        { id: "rename", label: "Rename", onSelect: vi.fn() },
      ],
    });
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual(["Play", "Rename", "Delete"]);
    const delete_ = screen.getByRole("menuitem", { name: "Delete" });
    expect(delete_.closest(".cp-track-menu__group")!.previousElementSibling).toHaveAttribute("role", "separator");
  });

  it("walk in that order with the arrow keys", async () => {
    const del = vi.fn();
    open({
      items: [
        { id: "delete", label: "Delete", danger: true, onSelect: del },
        { id: "play", label: "Play", onSelect: vi.fn() },
      ],
    });
    await userEvent.keyboard("{End}{Enter}");
    expect(del).toHaveBeenCalledTimes(1);
  });
});

describe("a ticked entry (C126)", () => {
  it("draws the check icon in its slot when checked, nothing when not", () => {
    open({
      items: [
        { id: "a", label: "A", checked: true, onSelect: vi.fn() },
        { id: "b", label: "B", checked: false, onSelect: vi.fn() },
      ],
    });
    expect(screen.getByRole("menuitemcheckbox", { name: "A" }).querySelector('svg[data-icon="check"]')).not.toBeNull();
    expect(screen.getByRole("menuitemcheckbox", { name: "B" }).querySelector("svg")).toBeNull();
  });
});

describe("useMenuButton (C113)", () => {
  function Harness({ onClosed }: { onClosed?: () => void }) {
    const menu = useMenuButton();
    return (
      <div>
        <button type="button" {...menu.buttonProps}>
          More
        </button>
        {menu.open ? (
          <TrackContextMenu
            x={10}
            y={10}
            items={items()}
            anchor={menu.anchor}
            onClose={() => {
              menu.close();
              onClosed?.();
            }}
          />
        ) : null}
      </div>
    );
  }

  it("opens on a click and closes on the next click on the same button", async () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "More" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not close the menu on mousedown on its own button", async () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "More" });
    await userEvent.click(button);
    fireEvent.mouseDown(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("placement (C106)", () => {
  it("keeps the menu above the player bar", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 160, bottom: 200, width: 160, height: 200, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    document.documentElement.style.setProperty("--shell-bottom-inset", "100px");
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    try {
      open();
      expect(parseFloat(screen.getByRole("menu").style.top)).toBeLessThanOrEqual(600 - 100 - 200 - 4);
    } finally {
      spy.mockRestore();
      document.documentElement.style.removeProperty("--shell-bottom-inset");
    }
  });

  it("is one floating surface (P12): the popover border and shadow, even padding, 140 minimum, capped height", () => {
    const flat = stripComments(css);
    expect(flat).toMatch(/\.cp-track-menu \{[^}]*min-width:\s*calc\(140px \* var\(--scale\)\)/);
    expect(flat).toMatch(/\.cp-track-menu \{[^}]*padding:\s*var\(--space-xs\);/);
    expect(flat).toMatch(/\.cp-track-menu \{[^}]*max-height:\s*min\(60vh, calc\(480px \* var\(--scale\)\)\)/);
    expect(flat).toMatch(/\.cp-track-menu \{[^}]*border:\s*var\(--popover-border\)/);
    expect(flat).toMatch(/\.cp-track-menu \{[^}]*box-shadow:\s*var\(--shadow-popover\)/);
  });
});
