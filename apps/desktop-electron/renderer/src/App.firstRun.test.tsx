/**
 * The first run, wired (PAGES-11): a fresh install shows the guide, its actions
 * reach the Library's import and Clean's match window, a second start does not
 * show it, and someone who finished the old tour is told once what changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";

type Send = (id: string) => void;
let send: Send;
let bridge: Record<string, unknown>;

const guide = () => screen.queryByRole("dialog", { name: "Getting started" });
const note = () => screen.queryByRole("dialog", { name: "What changed" });

async function toScreen(step: number) {
  for (let i = 1; i < step; i += 1) await userEvent.click(screen.getByRole("button", { name: "Next" }));
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
  bridge = {
    menu: {
      setSizeState: vi.fn().mockResolvedValue(undefined),
      onCommand: vi.fn((callback: Send) => {
        send = callback;
        return vi.fn();
      }),
    },
    openXmlFileDialog: vi.fn().mockResolvedValue({ canceled: true }),
    startLibraryImport: vi.fn(),
    getLibraryHealth: vi.fn().mockResolvedValue({
      track_count: 12,
      counts: [{ id: "missing_key", label: "No Beatport key", count: 4, rules: { match: "all", rules: [] } }],
      detections: [],
      unavailable_roots: [],
    }),
    getBeatportTokenStatus: vi.fn().mockResolvedValue({ configured: false, masked: null }),
    getBeatportAuth: vi
      .fn()
      .mockResolvedValue({ state: "signed_out", masked: null, expires_at: null, secure_storage: true }),
    onBeatportAuthChanged: vi.fn(() => vi.fn()),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  localStorage.clear();
  delete document.documentElement.dataset.scale;
});

describe("a fresh install", () => {
  it("shows the guide, and not the update note", async () => {
    render(<App />);
    expect(guide()).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Step 1 of 4" })).toBeInTheDocument();
    expect(note()).toBeNull();
  });

  it("Import a Rekordbox file… reaches the Library's import", async () => {
    render(<App />);
    await toScreen(2);
    await userEvent.click(within(guide()!).getByRole("button", { name: "Import a Rekordbox file…" }));
    expect(guide()).toBeNull();
    await waitFor(() => expect(bridge.openXmlFileDialog).toHaveBeenCalledTimes(1));
    expect(window.location.hash).toBe("#/library");
  });

  it("Match tracks… opens Clean", async () => {
    render(<App />);
    await toScreen(3);
    const match = screen.getByRole("button", { name: "Match on Beatport…" });
    await waitFor(() => expect(match).toBeEnabled());
    await userEvent.click(match);
    expect(guide()).toBeNull();
    await waitFor(() => expect(window.location.hash).toBe("#/clean"));
  });

  it("Sign in to Beatport starts the sign-in and leaves the guide open", async () => {
    const signIn = vi.fn().mockResolvedValue({ state: "signed_in" });
    bridge.beatportSignIn = signIn;
    render(<App />);
    await toScreen(4);
    await userEvent.click(screen.getByRole("button", { name: "Sign in to Beatport" }));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(guide()).toBeInTheDocument();
  });

  it("Sign in to Beatport swallows a failed sign-in: Settings reports it", async () => {
    bridge.beatportSignIn = vi.fn().mockRejectedValue(new Error("closed"));
    render(<App />);
    await toScreen(4);
    await userEvent.click(screen.getByRole("button", { name: "Sign in to Beatport" }));
    expect(guide()).toBeInTheDocument();
  });

  it("Sign in to Beatport opens Settings when the bridge cannot sign in", async () => {
    render(<App />);
    await toScreen(4);
    await userEvent.click(screen.getByRole("button", { name: "Sign in to Beatport" }));
    expect(guide()).toBeNull();
    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
  });

  it("How do I get one? opens the Rekordbox instructions over the guide, which comes back where it was", async () => {
    render(<App />);
    await toScreen(2);
    await userEvent.click(within(guide()!).getByRole("button", { name: "How do I get one?" }));
    expect(await screen.findByRole("dialog", { name: "How to get your Rekordbox file" })).toBeInTheDocument();
    expect(guide()).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("dialog", { name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Step 2 of 4" })).toBeInTheDocument();
  });

  it("Escape closes it for now and it is back on the next start", async () => {
    const first = render(<App />);
    await userEvent.keyboard("{Escape}");
    expect(guide()).toBeNull();
    first.unmount();
    render(<App />);
    expect(guide()).toBeInTheDocument();
  });

  it("Skip ends it for good, and the next start shows neither the guide nor the note", async () => {
    const first = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(guide()).toBeNull();
    first.unmount();
    render(<App />);
    expect(guide()).toBeNull();
    await act(async () => {});
    expect(note()).toBeNull();
  });
});

describe("Help → Getting started", () => {
  it("opens the guide at the start, whatever screen it was last on", async () => {
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    localStorage.setItem("cuepoint-phase14-note-seen", "1");
    render(<App />);
    expect(guide()).toBeNull();
    act(() => send("getting-started"));
    expect(await screen.findByRole("img", { name: "Step 1 of 4" })).toBeInTheDocument();
    await toScreen(3);
    await userEvent.keyboard("{Escape}");
    act(() => send("getting-started"));
    expect(await screen.findByRole("img", { name: "Step 1 of 4" })).toBeInTheDocument();
  });
});

describe("someone who finished the old tour", () => {
  beforeEach(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));

  it("sees the note once, with the size and the key count", async () => {
    const first = render(<App />);
    expect(guide()).toBeNull();
    expect(await screen.findByRole("dialog", { name: "What changed" })).toBeInTheDocument();
    expect(screen.getByText("Keys now come only from Beatport. 8 of your tracks have a key.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    first.unmount();

    render(<App />);
    await act(async () => {});
    expect(note()).toBeNull();
    expect(guide()).toBeNull();
  });

  it("Change size opens Settings", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Change size" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/settings");
    await waitFor(() => expect(screen.getByLabelText("Size of text and controls")).toHaveFocus());
  });

  it("Match tracks… opens Clean", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Match tracks…" }));
    await waitFor(() => expect(window.location.hash).toBe("#/clean"));
  });
});
