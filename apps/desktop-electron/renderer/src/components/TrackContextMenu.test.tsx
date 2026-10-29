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

import { TrackContextMenu, starsItem, useMenuButton, type TrackContextMenuItem } from "./TrackContextMenu";
import css from "./TrackContextMenu.css?raw";
import tokensCss from "../tokens/tokens.css?raw";
import { parseRules, stripComments } from "../test/cssRules";
import { expectNoAxeViolations } from "../test/axe";

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
      <TrackContextMenu x={20} y={30} items={menuItems} onClose={onClose} keyboard {...props} />
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

  it("walks onto a greyed entry so its reason can be read, but never runs it (M458)", async () => {
    // A greyed entry the arrows skipped could never say why it was greyed. It takes focus (and so
    // its hint), and Enter on it does nothing.
    const queue = vi.fn();
    const reveal = vi.fn();
    const { onClose } = open({
      items: [
        { id: "play", label: "Play", onSelect: vi.fn() },
        { id: "reveal", label: "Show in folder", disabled: true, reason: "Select one track", onSelect: reveal },
        { id: "queue", label: "Add to queue", onSelect: queue },
      ],
    });

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Show in folder" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(reveal).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

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
          // The list the entry is in: its right edge is where a submenu starts (M291).
          return rect(parentRight - 200, 0, 200, 160);
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
        // Level with the entry, moved up only by the overflow (M291): 900 less the 4 px margin
        // less its 300 px height, not the old bottom-to-bottom 580.
        laidOut(220, 850);
        render(<TrackContextMenu x={20} y={850} items={withSubmenu} onClose={vi.fn()} />);

        await userEvent.click(screen.getByRole("menuitem", { name: "Rate" }));

        const top = parseFloat(screen.getByRole("menu", { name: "Rate" }).style.top);
        expect(top).toBe(900 - 4 - 300);
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
    it("highlights the current item with one visible grey step, not the selected-row look or the accent (M289)", () => {
      const active = body('.cp-track-menu__item--active:not([aria-disabled="true"])');
      expect(active).toMatch(/background:\s*var\(--menu-active-fill\)/);
      // M289: the fill is a token now (tokens.css), shared by every list's active option.
      expect(stripComments(tokensCss)).toMatch(/--menu-active-fill:\s*color-mix\(in srgb, var\(--fg-primary\) 16%, var\(--bg-panel\)\)/);
      expect(body(".cp-track-menu")).not.toMatch(/--menu-active-fill:/);
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

describe("highlight and focus (M293, M458, M481)", () => {
  const rateItems: TrackContextMenuItem[] = [
    { id: "play", label: "Play", onSelect: vi.fn() },
    { id: "queue", label: "Add to queue", onSelect: vi.fn() },
    {
      id: "rate",
      label: "Rate",
      onSelect: vi.fn(),
      items: [
        { id: "one", label: "One star", onSelect: vi.fn() },
        { id: "two", label: "Two stars", onSelect: vi.fn() },
      ],
    },
  ];

  it("highlights nothing when the pointer opened it, and the first entry when a key did (M293)", () => {
    const { unmount } = render(<TrackContextMenu x={0} y={0} items={items()} onClose={vi.fn()} keyboard={false} />);
    expect(document.querySelector(".cp-track-menu__item--active")).toBeNull();
    unmount();
    render(<TrackContextMenu x={0} y={0} items={items()} onClose={vi.fn()} keyboard />);
    expect(screen.getByRole("menuitem", { name: "Play" })).toHaveClass("cp-track-menu__item--active");
  });

  it("lands on the first entry from either arrow when nothing is highlighted (M293)", async () => {
    const onSelect = vi.fn();
    render(<TrackContextMenu x={0} y={0} items={items([{ onSelect }])} onClose={vi.fn()} keyboard={false} />);
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Play" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("moves real focus with the arrows and keeps one entry in the tab order (M458)", async () => {
    open();
    await userEvent.keyboard("{ArrowDown}");
    const second = screen.getByRole("menuitem", { name: "Play next" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("menuitem", { name: "Play" })).toHaveAttribute("tabindex", "-1");
  });

  it("closes on Tab and hands focus back (M458)", async () => {
    const { onClose } = open();
    await userEvent.keyboard("{Tab}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("jumps to the entry that starts with the typed letters (M481)", async () => {
    const onSelect = vi.fn();
    open({ items: items([{}, {}, { onSelect }]) });
    await userEvent.keyboard("add");
    expect(screen.getByRole("menuitem", { name: "Add to queue" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("opens a submenu when the pointer rests on its parent, with nothing lit inside (M292, M293)", async () => {
    render(<TrackContextMenu x={0} y={0} items={rateItems} onClose={vi.fn()} keyboard={false} />);
    await userEvent.hover(screen.getByRole("menuitem", { name: "Rate" }));
    const submenu = screen.getByRole("menu", { name: "Rate" });
    expect(submenu).toBeInTheDocument();
    expect(submenu.querySelector(".cp-track-menu__item--active")).toBeNull();
    // Moving to a plain entry closes it again.
    await userEvent.hover(screen.getByRole("menuitem", { name: "Play" }));
    expect(screen.queryByRole("menu", { name: "Rate" })).toBeNull();
  });

  it("opens a submenu with the arrow key and lights its first entry (M292)", async () => {
    render(<TrackContextMenu x={0} y={0} items={rateItems} onClose={vi.fn()} keyboard />);
    await userEvent.keyboard("{ArrowUp}{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "One star" })).toHaveFocus();
  });
});

describe("placement under a button (M290, M69)", () => {
  const original = window.innerHeight;
  afterEach(() => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: original });
    vi.restoreAllMocks();
  });

  function box(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  }

  it("opens above its button, not over it, when there is no room below", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 735 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("aria-expanded") === "true") return box(20, 670, 60, 25);
      if (this.getAttribute("role") === "menu") return box(0, 0, 200, 300);
      return box(0, 0, 0, 0);
    });
    render(
      <>
        <button type="button" aria-expanded="true" aria-haspopup="menu">
          More
        </button>
        <TrackContextMenu x={20} y={695} items={items()} onClose={vi.fn()} />
      </>,
    );
    // The button's top (670), less the gap, less the menu's 300: it ends just above the button.
    expect(parseFloat(screen.getByRole("menu").style.top)).toBe(670 - 2 - 300);
  });

  it("leaves a gap under its button when there is room (M69)", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("aria-expanded") === "true") return box(20, 100, 60, 25);
      if (this.getAttribute("role") === "menu") return box(0, 0, 200, 150);
      return box(0, 0, 0, 0);
    });
    render(
      <>
        <button type="button" aria-expanded="true" aria-haspopup="menu">
          More
        </button>
        <TrackContextMenu x={20} y={125} items={items()} onClose={vi.fn()} />
      </>,
    );
    expect(parseFloat(screen.getByRole("menu").style.top)).toBe(127);
  });
});

describe("glyphs and hints (M298)", () => {
  it("draws an entry's glyph in a slot before its label, and keeps the slot for entries without one", () => {
    open({ items: items([{ icon: "folder" }, {}, {}]) });
    const play = screen.getByRole("menuitem", { name: "Play" });
    const slot = play.querySelector(".cp-track-menu__icon");
    expect(slot?.querySelector('svg[data-icon="folder"]')).not.toBeNull();
    expect(slot?.nextElementSibling).toHaveClass("cp-track-menu__label");
    // The neighbours keep an empty slot, so the three labels line up.
    const next = screen.getByRole("menuitem", { name: "Play next" });
    expect(next.querySelector(".cp-track-menu__icon")).not.toBeNull();
    expect(next.querySelector(".cp-track-menu__icon svg")).toBeNull();
  });

  it("adds no slot to a list where no entry has a glyph", () => {
    open();
    expect(document.querySelector(".cp-track-menu__icon")).toBeNull();
  });

  it("draws a hint as a muted line under the label, said as the entry's description", () => {
    open({ items: items([{ hint: "A list you fill by hand" }, {}, {}]) });
    const play = screen.getByRole("menuitem", { name: "Play" });
    const hint = play.querySelector(".cp-track-menu__hint");
    expect(hint).toHaveTextContent("A list you fill by hand");
    expect(hint?.previousElementSibling).toHaveClass("cp-track-menu__label");
    expect(play).toHaveAccessibleDescription("A list you fill by hand");
    const rule = parseRules(stripComments(css)).find((r) => r.selector.trim() === ".cp-track-menu__hint")!;
    expect(rule.body).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(rule.body).toMatch(/font-size:\s*var\(--font-size-label\)/);
  });
});

describe("inline stars (M299)", () => {
  function rateMenu(value: number | null, onRate = vi.fn()) {
    const onClose = vi.fn();
    render(
      <TrackContextMenu
        x={0}
        y={0}
        keyboard
        onClose={onClose}
        items={[starsItem({ id: "rate", label: "Rate", value, onRate }), { id: "play", label: "Play", onSelect: vi.fn() }]}
      />,
    );
    return { onRate, onClose };
  }

  it("draws five star toggles and a clear button on one row, the rating filled", () => {
    rateMenu(3);
    const row = screen.getByRole("group", { name: "Rate" });
    const stars = Array.from(row.querySelectorAll('[role="menuitemradio"]'));
    expect(stars).toHaveLength(5);
    expect(stars.map((star) => star.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false", "false"]);
    expect(stars.map((star) => star.querySelector("svg")?.getAttribute("data-icon"))).toEqual([
      "star",
      "star",
      "star",
      "star-outline",
      "star-outline",
    ]);
    expect(screen.getByRole("menuitem", { name: "Clear rating" })).toBeInTheDocument();
  });

  it("rates with a click and closes the menu", async () => {
    const { onRate, onClose } = rateMenu(null);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "4 stars" }));
    expect(onRate).toHaveBeenCalledWith(4);
    expect(onClose).toHaveBeenCalled();
  });

  it("moves between the stars with the arrows and rates with Enter", async () => {
    const { onRate } = rateMenu(2);
    // The row is the first entry, and the arrows start from its rating.
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitemradio", { name: "3 stars" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitemradio", { name: "4 stars" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("menuitemradio", { name: "3 stars" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onRate).toHaveBeenCalledWith(3);
  });

  it("clears with the button after the stars", async () => {
    const { onRate } = rateMenu(5);
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "Clear rating" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onRate).toHaveBeenCalledWith(0);
  });

  it("is one entry for the up and down arrows", async () => {
    rateMenu(null);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Play" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: "1 star" })).toHaveFocus();
  });
});

describe("a mixed tick (M194)", () => {
  it("is the dash, centred in the tick slot", () => {
    open({ items: items([{ checked: "mixed" }]) });
    const slot = screen.getByRole("menuitemcheckbox", { name: "Play" }).querySelector(".cp-track-menu__check");
    expect(slot?.querySelector('svg[data-icon="dash"]')).not.toBeNull();
    expect(slot?.querySelector('svg[data-icon="dot-half"]')).toBeNull();
  });
});

describe("placement mark (M380)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks a menu that opens above its point with data-placement=top, one below with bottom", () => {
    const original = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "menu") return { left: 0, top: 0, width: 200, height: 150, right: 200, bottom: 150, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    const low = render(<TrackContextMenu x={20} y={350} items={items()} onClose={vi.fn()} />);
    expect(screen.getByRole("menu")).toHaveAttribute("data-placement", "top");
    low.unmount();
    render(<TrackContextMenu x={20} y={20} items={items()} onClose={vi.fn()} />);
    expect(screen.getByRole("menu")).toHaveAttribute("data-placement", "bottom");
    Object.defineProperty(window, "innerHeight", { configurable: true, value: original });
  });
});

describe("a long name (M295)", () => {
  it("is cut with an ellipsis inside a capped menu, not allowed to widen it", () => {
    const flat = stripComments(css);
    expect(flat).toMatch(
      /\.cp-track-menu \{[^}]*max-width:\s*min\(calc\(360px \* var\(--scale\)\), calc\(100vw - 2 \* var\(--space-lg\)\)\)/,
    );
    expect(flat).toMatch(/\.cp-track-menu__label \{[^}]*text-overflow:\s*ellipsis/);
    open({ items: items([{ label: "Remove from “a playlist with a very long name indeed”" }]) });
    expect(document.querySelector(".cp-track-menu__label")).toHaveAttribute("data-cut-hint");
  });
});

describe("TrackContextMenu accessibility (HARDEN-08)", () => {
  it("has no WCAG 2.2 A or AA violations", async () => {
    open();
    await expectNoAxeViolations();
  });
});
