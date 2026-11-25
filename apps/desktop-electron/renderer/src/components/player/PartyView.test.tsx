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
  CrowdScene: ({ className }: { className?: string }) => <canvas data-testid="crowd" className={className} />,
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

  it("is a pane F6 can reach, and gives the scene a whole-multiple box once measured", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 700, left: 0, top: 0 } as DOMRect);
    render(<PartyView />);
    act(() => setPartyViewOpen(true));
    const dialog = screen.getByRole("dialog", { name: "Party view" });
    expect(dialog).toHaveAttribute("data-pane", "party");
    expect(dialog.querySelector<HTMLElement>(".cp-party__stage")!.style.getPropertyValue("--party-w")).toBe("928px");
    expect(dialog.querySelector<HTMLElement>(".cp-party__stage")!.style.getPropertyValue("--party-h")).toBe("520px");
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
});
