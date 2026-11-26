import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryRouter, useNavigate } from "react-router-dom";

import { useLayerStack } from "../../hooks/useLayerStack";
import { PartyView } from "./PartyView";
import partyCss from "./party-view.css?raw";
import { CROWD_SETTING_KEY, resetCrowdSettingForTests } from "./crowdSetting";
import { closePartyView, resetPartyViewStateForTests, setPartyViewOpen, usePartyViewOpen } from "./partyViewState";

// The scene is step 4's; its own tests cover the drawing. Here it only has to be there or not.
vi.mock("../crowd/CrowdScene", () => ({
  CrowdScene: ({ className, width, height }: { className?: string; width?: number; height?: number }) => (
    <canvas data-testid="crowd" className={className} data-width={width} data-height={height} />
  ),
}));

beforeEach(() => {
  localStorage.clear();
  resetCrowdSettingForTests();
  resetPartyViewStateForTests();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetPartyViewStateForTests();
  resetCrowdSettingForTests();
  localStorage.clear();
});

function Probe() {
  return <span data-testid="open">{String(usePartyViewOpen())}</span>;
}

describe("the Party view", () => {
  it("mounts nothing while closed, the scene included", () => {
    render(<PartyView />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("crowd")).toBeNull();
  });

  it("is a non-modal dialog named Party view, with the crowd in it, while open", () => {
    render(<PartyView />);
    act(() => setPartyViewOpen(true));
    const dialog = screen.getByRole("dialog", { name: "Party view" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toContainElement(screen.getByTestId("crowd"));
  });

  it("closes on Escape, and removes its listener once closed", () => {
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    render(
      <>
        <PartyView />
        <Probe />
      </>,
    );
    act(() => setPartyViewOpen(true));
    const handler = added.mock.calls.find(([type]) => type === "keydown")?.[1];
    expect(handler).toBeTypeOf("function");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(removed.mock.calls.some(([type, fn]) => type === "keydown" && fn === handler)).toBe(true);
  });

  it("leaves Escape to a newer layer: one press closes only that layer", () => {
    const closed = vi.fn();
    function Layer() {
      const [open, setOpen] = useState(true);
      const isTop = useLayerStack(open);
      useEffect(() => {
        if (!open) return undefined;
        // Like a menu: answers Escape if it is newest, and does not prevent the default.
        const onKey = (event: KeyboardEvent) => {
          if (event.key !== "Escape" || !isTop()) return;
          closed();
          setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [open, isTop]);
      return open ? <div data-testid="layer" /> : null;
    }
    render(
      <>
        <PartyView />
        <Probe />
      </>,
    );
    act(() => setPartyViewOpen(true));
    render(<Layer />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("layer")).toBeNull();
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByTestId("open")).toHaveTextContent("false");
  });

  it("moves focus to its close button on opening", () => {
    render(<PartyView />);
    act(() => setPartyViewOpen(true));
    expect(screen.getByRole("button", { name: "Close party view" })).toHaveFocus();
  });

  it("returns focus to what opened it when the close button is pressed", () => {
    render(
      <>
        <button type="button">Opener</button>
        <PartyView />
      </>,
    );
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();
    act(() => setPartyViewOpen(true));
    expect(screen.getByRole("button", { name: "Close party view" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close party view" }));
    expect(opener).toHaveFocus();
  });

  it("closes when the route changes", () => {
    function Go() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate("/keys")}>Go</button>;
    }
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <PartyView />
        <Go />
        <Probe />
      </MemoryRouter>,
    );
    act(() => setPartyViewOpen(true));
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a pane F6 can reach, and fills the stage: a whole-multiple box and a floor as wide as the stage", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1650, height: 700, left: 0, top: 0 } as DOMRect);
    render(<PartyView />);
    act(() => setPartyViewOpen(true));
    const dialog = screen.getByRole("dialog", { name: "Party view" });
    expect(dialog).toHaveAttribute("data-pane", "party");
    const stage = dialog.querySelector<HTMLElement>(".cp-party__stage")!;
    // Height sets 5x; the club is 1650 / 5 = 330 across and 700 / 5 = 140 down: no bars.
    expect(stage.style.getPropertyValue("--party-w")).toBe("1650px");
    expect(stage.style.getPropertyValue("--party-h")).toBe("700px");
    expect(screen.getByTestId("crowd")).toHaveAttribute("data-width", "330");
    expect(screen.getByTestId("crowd")).toHaveAttribute("data-height", "140");
  });

  it("makes the crowd again only once a resize has settled", () => {
    vi.useFakeTimers();
    let width = 1650;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 700, left: 0, top: 0 }) as DOMRect);
    render(<PartyView />);
    act(() => setPartyViewOpen(true));
    expect(screen.getByTestId("crowd")).toHaveAttribute("data-width", "330");
    width = 1400;
    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByTestId("crowd")).toHaveAttribute("data-width", "330");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId("crowd")).toHaveAttribute("data-width", "280");
    vi.useRealTimers();
  });

  it("leaves Escape alone in a text field and when something else used it", () => {
    render(
      <>
        <PartyView />
        <input aria-label="Search" />
        <Probe />
      </>,
    );
    act(() => setPartyViewOpen(true));
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Escape" });
    expect(screen.getByTestId("open")).toHaveTextContent("true");

    const swallowed = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    swallowed.preventDefault();
    document.body.dispatchEvent(swallowed);
    expect(screen.getByTestId("open")).toHaveTextContent("true");
  });

  it("closes from its close button", () => {
    render(<PartyView />);
    act(() => setPartyViewOpen(true));
    fireEvent.click(screen.getByRole("button", { name: "Close party view" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes, and shows nothing, once the setting is turned off", () => {
    render(
      <>
        <PartyView />
        <Probe />
      </>,
    );
    act(() => setPartyViewOpen(true));
    act(() => {
      localStorage.setItem(CROWD_SETTING_KEY, "off");
      window.dispatchEvent(new StorageEvent("storage", { key: CROWD_SETTING_KEY, newValue: "off" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    act(() => closePartyView());
  });

  it("takes its colours from tokens and does not flash", () => {
    expect(partyCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(partyCss).not.toMatch(/@keyframes|animation/);
  });

  it("does not letterbox: the box covers the stage but for under one logical pixel, whatever the size or ratio", () => {
    for (const [w, h, dpr] of [[1013, 677, 1], [1650, 702, 1.5], [1280, 800, 2]] as const) {
      Object.defineProperty(window, "devicePixelRatio", { value: dpr, configurable: true });
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: w, height: h, left: 0, top: 0 } as DOMRect);
      const { unmount } = render(<PartyView />);
      act(() => setPartyViewOpen(true));
      const stage = screen.getByRole("dialog").querySelector<HTMLElement>(".cp-party__stage")!;
      const boxW = parseFloat(stage.style.getPropertyValue("--party-w"));
      const boxH = parseFloat(stage.style.getPropertyValue("--party-h"));
      const unit = Math.floor(Math.min((w * dpr) / 232, (h * dpr) / 130)) / dpr;
      expect(boxW).toBeLessThanOrEqual(w + 1e-6);
      expect(boxH).toBeLessThanOrEqual(h + 1e-6);
      expect(w - boxW).toBeLessThan(unit);
      expect(h - boxH).toBeLessThan(unit);
      act(() => closePartyView());
      unmount();
      vi.restoreAllMocks();
    }
    Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
  });

  it("has no stage padding or max-width, and sits the scene at the stage's top left", () => {
    expect(partyCss).not.toMatch(/padding:/);
    expect(partyCss).not.toMatch(/max-width/);
    expect(partyCss).toMatch(/align-items: flex-start/);
    expect(partyCss).toMatch(/justify-content: flex-start/);
  });
});

describe("full screen", () => {
  let fullscreenElement: Element | null;
  let request: ReturnType<typeof vi.fn>;
  let exit: ReturnType<typeof vi.fn>;
  let clock: number;

  function setFullscreen(element: Element | null) {
    fullscreenElement = element;
    document.dispatchEvent(new Event("fullscreenchange"));
  }

  beforeEach(() => {
    fullscreenElement = null;
    clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { get: () => fullscreenElement, configurable: true });
    request = vi.fn(function (this: Element) {
      act(() => setFullscreen(this));
      return Promise.resolve();
    });
    exit = vi.fn(() => {
      act(() => setFullscreen(null));
      return Promise.resolve();
    });
    (HTMLElement.prototype as unknown as { requestFullscreen: unknown }).requestFullscreen = request;
    (document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit;
  });
  afterEach(() => {
    delete (document as { fullscreenEnabled?: unknown }).fullscreenEnabled;
    delete (document as { fullscreenElement?: unknown }).fullscreenElement;
    delete (document as { exitFullscreen?: unknown }).exitFullscreen;
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });

  function open() {
    render(
      <>
        <PartyView />
        <Probe />
      </>,
    );
    act(() => setPartyViewOpen(true));
  }

  it("is hidden where the document cannot go full screen", () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
    open();
    expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close party view" })).toBeTruthy();
  });

  it("asks for full screen on the view's own element and says so in its name and aria-pressed", () => {
    open();
    const button = screen.getByRole("button", { name: "Full screen" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(screen.getByRole("dialog", { name: "Party view" }));
    // The name stays "Full screen"; aria-pressed says it is on.
    const leave = screen.getByRole("button", { name: "Full screen" });
    expect(leave).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Leave full screen" })).toBeNull();
    fireEvent.click(leave);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Full screen" })).toHaveAttribute("aria-pressed", "false");
  });

  it("sits next to the close button", () => {
    open();
    const corner = screen.getByRole("button", { name: "Full screen" }).closest(".cp-party__corner");
    expect(corner).toContainElement(screen.getByRole("button", { name: "Close party view" }));
  });

  it("leaves full screen on Escape and keeps the view open; the next Escape closes it", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(exit).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBeNull();
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    expect(screen.getByRole("dialog", { name: "Party view" })).toBeTruthy();
    clock += 1000;
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByTestId("open")).toHaveTextContent("false");
  });

  it("treats an Escape right after the browser left full screen as that Escape: the view stays", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    // The browser took the Escape and left full screen itself; the key reaches the page a moment later.
    act(() => setFullscreen(null));
    clock += 50;
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    // A later one closes it.
    clock += 500;
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByTestId("open")).toHaveTextContent("false");
  });

  it("leaves full screen when focus moves outside the view (a search or dialog opened over it)", () => {
    render(
      <>
        <PartyView />
        <input aria-label="Search" />
      </>,
    );
    act(() => setPartyViewOpen(true));
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    // Focus inside the view keeps it.
    fireEvent.focusIn(screen.getByRole("button", { name: "Close party view" }));
    expect(exit).not.toHaveBeenCalled();
    fireEvent.focusIn(screen.getByLabelText("Search"));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBeNull();
    // Not in full screen: nothing to leave.
    fireEvent.focusIn(screen.getByLabelText("Search"));
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("leaves full screen first when the view is closed", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Close party view" }));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves full screen when the page changes", () => {
    function Go() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate("/keys")}>Go</button>;
    }
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <PartyView />
        <Go />
      </MemoryRouter>,
    );
    act(() => setPartyViewOpen(true));
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBeNull();
  });
});
