/**
 * The shared parts the consistency build added (areas 1-27): the close button, the chip's
 * siblings (notice, loading, missing value, artwork stand-in, empty state), the search field, the
 * key cap, the play button, the legend, the disclosure arrow and the link button. Each is one
 * component with one look; these pin the markup and the words that look depends on.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArtworkPlaceholder } from "./ArtworkPlaceholder";
import { CloseButton } from "./CloseButton";
import { ConfirmDialog } from "./ConfirmDialog";
import { DisclosureArrow } from "./DisclosureArrow";
import { EmptyState } from "./EmptyState";
import { Fieldset } from "./Fieldset";
import { Hint, HINT_HOVER_DELAY_MS } from "./Hint";
import { Kbd } from "./Kbd";
import { LinkButton } from "./LinkButton";
import { Loading, loadingWords } from "./Loading";
import { MISSING_VALUE, MissingValue, valueOrMissing } from "./MissingValue";
import { Modal } from "./Modal";
import { Callout, Notice } from "./Notice";
import { OverflowHintHost } from "./OverflowHintHost";
import { PixelIcon } from "./PixelIcon";
import { PlayButton } from "./PlayButton";
import { SearchField, searchPlaceholder } from "./SearchField";
import { onMac, shortcutLabel } from "./shell/platformKeys";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CloseButton", () => {
  it("is the standard bordered icon button, named Close, with a pixel cross", async () => {
    const onClick = vi.fn();
    render(<CloseButton onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button).toHaveClass("cp-btn", "cp-btn--icon", "cp-close");
    expect(button.querySelector("svg[data-icon='close']")).not.toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("can be named for what it closes", () => {
    render(<CloseButton aria-label="Close message" />);
    expect(screen.getByRole("button", { name: "Close message" })).toBeInTheDocument();
  });

  it("is the close button of a dialog", () => {
    render(
      <Modal open title="T" onClose={() => undefined}>
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("cp-close");
  });
});

describe("Notice", () => {
  it("has three looks: a problem and a field error alert, a warning is a status", () => {
    render(
      <>
        <Notice kind="problem" title="Could not read the file">
          Try another one.
        </Notice>
        <Notice kind="warning">Check the key first.</Notice>
        <Notice kind="field-error">Enter a time.</Notice>
      </>,
    );
    const problem = screen.getByText("Try another one.").closest(".cp-notice")!;
    expect(problem).toHaveClass("cp-notice--problem");
    expect(problem).toHaveAttribute("role", "alert");
    expect(within(problem as HTMLElement).getByText("Could not read the file")).toHaveClass("cp-notice__title");
    expect(screen.getByText("Check the key first.").closest(".cp-notice")).toHaveAttribute("role", "status");
    expect(screen.getByText("Enter a time.").closest(".cp-notice")).toHaveClass("cp-notice--field-error");
  });

  it("puts an action beside a problem, and none beside a field error", () => {
    render(
      <>
        <Notice action={<button type="button">Try again</button>}>Failed.</Notice>
        <Notice kind="field-error" action={<button type="button">Nope</button>}>
          Bad.
        </Notice>
      </>,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nope" })).toBeNull();
  });

  it("is also called Callout", () => {
    expect(Callout).toBe(Notice);
  });
});

describe("Loading", () => {
  it("says Loading <what>… in one pattern", () => {
    expect(loadingWords("tracks")).toBe("Loading tracks…");
    expect(loadingWords()).toBe("Loading…");
    render(<Loading what="your Library" centered />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your Library…");
    expect(document.querySelector(".cp-loading--centered")).not.toBeNull();
  });
});

describe("MissingValue", () => {
  it("is one muted dash", () => {
    render(<MissingValue />);
    expect(screen.getByText(MISSING_VALUE)).toHaveClass("cp-missing");
    expect(MISSING_VALUE).toBe("—");
  });

  it("stands in for an empty value and leaves a real one", () => {
    const { container } = render(
      <p>
        {valueOrMissing(null)}|{valueOrMissing("  ")}|{valueOrMissing("Techno")}|{valueOrMissing(0)}
      </p>,
    );
    expect(container.textContent).toBe("—|—|Techno|0");
  });
});

describe("ArtworkPlaceholder", () => {
  it("is one quiet square, named No artwork", () => {
    render(<ArtworkPlaceholder />);
    expect(screen.getByRole("img", { name: "No artwork" })).toHaveClass("cp-artwork-placeholder");
  });
});

describe("EmptyState", () => {
  it("draws the page's icon above the line when it has one", () => {
    const { container } = render(<EmptyState icon="keys" headline="No keys yet" />);
    expect(container.querySelector(".cp-empty-state__icon svg[data-icon='keys']")).not.toBeNull();
  });
});

describe("SearchField", () => {
  it("has a search icon, the placeholder Search <thing>…, and a clear × only while there is text", async () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<SearchField thing="tracks" value="" onValueChange={onValueChange} />);
    const field = screen.getByRole("searchbox", { name: "Search tracks" });
    expect(field).toHaveAttribute("placeholder", "Search tracks…");
    expect(searchPlaceholder("Collections")).toBe("Search Collections…");
    expect(document.querySelector(".cp-search-field__icon svg[data-icon='search']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    rerender(<SearchField thing="tracks" value="abc" onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("reports what is typed, and Escape clears a field that has text", async () => {
    const onValueChange = vi.fn();
    const onClear = vi.fn();
    render(<SearchField thing="logs" value="err" onValueChange={onValueChange} onClear={onClear} />);
    await userEvent.type(screen.getByRole("searchbox"), "o");
    expect(onValueChange).toHaveBeenCalledWith("erro");
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(onValueChange).toHaveBeenLastCalledWith("");
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("lets a caller name it and give it combobox attributes", () => {
    render(<SearchField thing="library" label="Find" value="" onValueChange={() => undefined} role="combobox" />);
    expect(screen.getByRole("combobox", { name: "Find" })).toBeInTheDocument();
  });
});

describe("shortcutLabel and Kbd", () => {
  it("writes Ctrl on Windows and Linux", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    expect(onMac()).toBe(false);
    expect(shortcutLabel("Mod+Shift+K")).toBe("Ctrl+Shift+K");
    expect(shortcutLabel("Space")).toBe("Space");
    render(<Kbd keys="Mod+K" />);
    expect(screen.getByText("Ctrl+K").tagName).toBe("KBD");
  });

  it("writes the Command and Shift signs on a Mac", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(shortcutLabel("Mod+Shift+K")).toBe("⌘⇧K");
    expect(shortcutLabel("Alt+Click")).toBe("⌥Click");
    render(<Kbd keys="Mod+B" />);
    expect(screen.getByText("⌘B")).toHaveClass("cp-kbd");
  });
});

describe("PlayButton", () => {
  it("is a round outline button with a play mark, named for the track", async () => {
    const onClick = vi.fn();
    render(<PlayButton aria-label="Play Strobe" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Play Strobe" });
    expect(button).toHaveClass("cp-play-btn");
    expect(button.querySelector("svg[data-icon='play']")).not.toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it("shows pause while its row plays", () => {
    render(<PlayButton aria-label="Pause Strobe" playing />);
    const button = screen.getByRole("button", { name: "Pause Strobe" });
    expect(button).toHaveClass("cp-play-btn--playing");
    expect(button.querySelector("svg[data-icon='pause']")).not.toBeNull();
  });
});

describe("Fieldset, DisclosureArrow and LinkButton", () => {
  it("names a group by its legend", () => {
    render(
      <Fieldset legend="Tables">
        <input type="checkbox" aria-label="Color keys" />
      </Fieldset>,
    );
    expect(screen.getByRole("group", { name: "Tables" })).toHaveClass("cp-fieldset");
  });

  it("draws one arrow, right when closed and down when open", () => {
    const { container, rerender } = render(<DisclosureArrow open={false} />);
    expect(container.querySelector("svg[data-icon='chevron-right']")).not.toBeNull();
    rerender(<DisclosureArrow open />);
    expect(container.querySelector("svg[data-icon='chevron-down']")).not.toBeNull();
  });

  it("is a link that is a button, with the arrow for a go-to", async () => {
    const onClick = vi.fn();
    render(
      <>
        <LinkButton onClick={onClick}>Show log</LinkButton>
        <LinkButton go>Open Keys</LinkButton>
      </>,
    );
    expect(screen.getByRole("button", { name: "Show log" })).toHaveClass("cp-link");
    expect(screen.getByRole("button", { name: "Show log" })).not.toHaveClass("cp-link--go");
    expect(screen.getByRole("button", { name: "Open Keys" })).toHaveClass("cp-link", "cp-link--go");
    await userEvent.click(screen.getByRole("button", { name: "Show log" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("PixelIcon sizes", () => {
  it("has three sizes and no other: sm, md and the default lg", () => {
    const { container } = render(
      <>
        <PixelIcon name="play" size="sm" />
        <PixelIcon name="play" size="md" />
        <PixelIcon name="play" />
      </>,
    );
    const icons = [...container.querySelectorAll("svg")];
    expect(icons.map((icon) => icon.getAttribute("data-size"))).toEqual(["sm", "md", "lg"]);
    expect(icons[0]).toHaveClass("cp-pixel-icon--sm");
    expect(icons[1]).toHaveClass("cp-pixel-icon--md");
    expect(icons[2]).not.toHaveClass("cp-pixel-icon--sm", "cp-pixel-icon--md");
  });

  it("has its own remove, move and repeat-after icons, apart from the cross", () => {
    const { container } = render(
      <>
        <PixelIcon name="remove" />
        <PixelIcon name="move" />
        <PixelIcon name="repeat-after" />
      </>,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });
});

describe("Hint with a shortcut", () => {
  it("says the words and draws the shortcut as a key cap, with both in the title", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    vi.useFakeTimers();
    render(
      <Hint text="Search" shortcut="Mod+K">
        <button type="button">Go</button>
      </Hint>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("title", "Search (Ctrl+K)");
    fireEvent.pointerEnter(screen.getByRole("button").parentElement!);
    act(() => {
      vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Search Ctrl+K");
    expect(tip.querySelector("kbd.cp-kbd")).toHaveTextContent("Ctrl+K");
  });
});

describe("ConfirmDialog and the newest dialog", () => {
  it("asks in the app with a narrow dialog, and a danger one has a red main button", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Clear logs?" danger confirmLabel="Clear logs" onConfirm={onConfirm} onCancel={onCancel}>
        This cannot be undone.
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Clear logs?" });
    expect(dialog).toHaveClass("cp-modal--narrow", "cp-modal--danger");
    const confirm = within(dialog).getByRole("button", { name: "Clear logs" });
    expect(confirm).toHaveClass("cp-btn--danger-confirm");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("closes only the newest dialog on Escape", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Modal open title="Outer" onClose={outer}>
          <p>a</p>
        </Modal>
        <Modal open title="Inner" onClose={inner}>
          <p>b</p>
        </Modal>
      </>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("has three widths: narrow, normal (the default) and wide", () => {
    const { rerender } = render(
      <Modal open title="W" size="wide" onClose={() => undefined}>
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("cp-modal--wide");
    rerender(
      <Modal open title="W" onClose={() => undefined}>
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).not.toHaveClass("cp-modal--wide", "cp-modal--narrow");
  });
});

describe("OverflowHintHost", () => {
  it("shows the whole value of a cut-off text after a rest, and nothing for a text that fits", () => {
    vi.useFakeTimers();
    render(
      <>
        <OverflowHintHost />
        <span data-testid="cut" data-cut-hint="">
          A very long title that does not fit
        </span>
        <span data-testid="fits" data-cut-hint="">
          Short
        </span>
      </>,
    );
    const cut = screen.getByTestId("cut");
    Object.defineProperty(cut, "scrollWidth", { configurable: true, value: 300 });
    Object.defineProperty(cut, "clientWidth", { configurable: true, value: 100 });

    fireEvent.pointerOver(screen.getByTestId("fits"));
    act(() => {
      vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerOver(cut);
    act(() => {
      vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("A very long title that does not fit");

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
