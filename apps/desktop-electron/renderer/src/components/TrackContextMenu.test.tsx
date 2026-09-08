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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TrackContextMenu, type TrackContextMenuItem } from "./TrackContextMenu";

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
