/**
 * The first-run guide (RUN-1, RUN-2, DEC-132).
 *
 * Four screens, a Skip before the last, and a stray click that cannot end
 * it. The three defects the old tour had (reopening on the last screen, Escape
 * and the backdrop marking it done, storage that throws) are pinned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import illustrationsCss from "./OnboardingIllustrations.css?raw";

import { OnboardingDialog } from "./OnboardingDialog";
import { TAGLINE } from "./AboutDialog";
import { expectNoAxeViolations } from "../test/axe";

const DONE = "cuepoint-onboarding-complete";
const NOTE = "cuepoint-phase14-note-seen";

type Handler = Mock<() => void>;
interface Handlers {
  onComplete: Handler;
  onShowExport: Handler;
  onImport: Handler;
  onMatch: Handler;
  onSignIn: Handler;
}

function mount(props: { open?: boolean; covered?: boolean } = {}): Handlers & {
  rerender: (next: { open?: boolean; covered?: boolean }) => void;
} {
  const handlers: Handlers = {
    onComplete: vi.fn<() => void>(),
    onShowExport: vi.fn<() => void>(),
    onImport: vi.fn<() => void>(),
    onMatch: vi.fn<() => void>(),
    onSignIn: vi.fn<() => void>(),
  };
  const tree = (next: { open?: boolean; covered?: boolean }) => (
    <OnboardingDialog
      open={next.open ?? true}
      covered={next.covered}
      {...handlers}
    />
  );
  const view = render(tree(props));
  return { ...handlers, rerender: (next) => view.rerender(tree(next)) };
}

const heading = () => screen.getByRole("heading", { level: 3 });
const next = () => userEvent.click(screen.getByRole("button", { name: "Next" }));

/** Click Next until this screen, counting from the first. */
async function goTo(step: number) {
  for (let i = 1; i < step; i += 1) await next();
}

interface Bridge {
  trackCount?: number;
  notMatched?: number;
  auth?: "signed_in" | "signed_out" | "pasted" | "env";
}

/** The parts of the bridge the guide ticks from; none installed means nothing ticks. */
function install({ trackCount = 0, notMatched = 0, auth = "signed_out" }: Bridge = {}) {
  let announce: ((next: { state: string }) => void) | undefined;
  (window as unknown as { cuepoint?: unknown }).cuepoint = {
    getLibraryHealth: vi.fn().mockResolvedValue({
      track_count: trackCount,
      counts: [
        { id: "not_matched", label: "Not matched", count: notMatched, rules: { match: "all", rules: [] } },
      ],
      detections: [],
      unavailable_roots: [],
    }),
    getBeatportAuth: vi
      .fn()
      .mockResolvedValue({ state: auth, masked: null, expires_at: null, secure_storage: true }),
    onBeatportAuthChanged: vi.fn((listener: (next: { state: string }) => void) => {
      announce = listener;
      return vi.fn();
    }),
  };
  return { announce: (state: string) => act(() => announce?.({ state })) };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the four screens", () => {
  it("walks Welcome, Rekordbox file, Match, Sign in", async () => {
    mount();
    const titles: string[] = [];
    for (let step = 1; step <= 4; step += 1) {
      expect(screen.getByRole("img", { name: new RegExp(`^Step ${step} of 4`) })).toBeInTheDocument();
      titles.push(heading().textContent ?? "");
      if (step < 4) await next();
    }
    expect(titles).toEqual([
      "Welcome to CuePoint",
      "Bring in your Rekordbox file",
      "Match your tracks on Beatport",
      "Sign in to Beatport (optional)",
    ]);
  });

  it("says in one line each what the screen is for", async () => {
    mount();
    // The one tagline About uses too (M445).
    expect(screen.getByText(`${TAGLINE} Rekordbox is never changed until you export.`)).toBeInTheDocument();
    await next();
    expect(
      screen.getByText("Export your collection from Rekordbox, then import that file here. Nothing in Rekordbox is changed."),
    ).toBeInTheDocument();
    await next();
    expect(screen.getByText("After importing: keys, genres and labels come from Beatport.")).toBeInTheDocument();
    await next();
    expect(screen.getByText("Discover uses it to find new music.")).toBeInTheDocument();
  });

  it("no longer tours the pages, the play tip or the background strip", async () => {
    mount();
    await goTo(4);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("list", { name: "Pages" })).toBeNull();
    expect(within(dialog).queryByText(/Double-click a track/)).toBeNull();
    expect(within(dialog).queryByText(/The strip at the bottom/)).toBeNull();
  });

  it("draws one picture on every screen, all in the same window style", async () => {
    mount();
    const single = () => screen.getByRole("dialog").querySelector(".onboarding-dialog__single");
    // 1: the app window with the logo.
    expect(single()!.querySelectorAll("svg.ob-art")).toHaveLength(1);
    expect(single()!.querySelector("image.ob-logo")).not.toBeNull();
    // 2: four drawings side by side, each with a caption.
    await next();
    const drawings = screen.getByRole("list", { name: "How to export from Rekordbox" });
    expect(drawings.querySelectorAll("li")).toHaveLength(4);
    expect(drawings.querySelectorAll("svg.ob-art")).toHaveLength(4);
    expect(drawings).toHaveTextContent("Export Collection in XML format");
    expect(drawings).toHaveTextContent("Import a Rekordbox file");
    // 3 and 4: one drawing each, never a pixel icon.
    for (let step = 3; step <= 4; step += 1) {
      await next();
      expect(single()!.querySelectorAll("svg.ob-art")).toHaveLength(1);
      expect(screen.getByRole("dialog").querySelector(".cp-modal__body svg[data-icon]")).toBeNull();
    }
  });

  it("lays every single-picture step out the same: words left, one picture right", async () => {
    mount();
    for (let step = 1; step <= 4; step += 1) {
      if (step > 1) await next();
      if (step === 2) continue;
      const body = screen.getByRole("dialog").querySelector(".onboarding-dialog")!;
      expect(body.querySelector(".onboarding-dialog__text .onboarding-dialog__title")).not.toBeNull();
      expect(body.querySelector(".onboarding-dialog__text .onboarding-dialog__body")).not.toBeNull();
      expect(body.querySelectorAll(".onboarding-dialog__single")).toHaveLength(1);
      expect(body.querySelector(".onboarding-dialog__text")!.nextElementSibling).toBe(
        body.querySelector(".onboarding-dialog__single"),
      );
    }
  });

  it("says Rekordbox, not DJ app, in the pictures, and draws no macOS window dots", async () => {
    mount();
    await next();
    const drawings = screen.getByRole("list", { name: "How to export from Rekordbox" });
    expect(drawings.textContent).not.toMatch(/DJ app/);
    expect(drawings).toHaveTextContent("Open Rekordbox");
    expect(drawings).toHaveTextContent("Rekordbox");
    for (const svg of drawings.querySelectorAll("svg.ob-art")) {
      expect(svg.querySelectorAll(".ob-dot")).toHaveLength(0);
    }
  });

  it("draws the pictures in the voice (pixel) face and lets step 1's line wrap", () => {
    const css = illustrationsCss;
    expect(css).toMatch(/\.ob-art\s*{[^}]*font-family:\s*var\(--font-voice\)/); // P2: an illustration is the voice; Inter is wider than its fixed boxes
    mount();
    const art = screen.getByRole("dialog").querySelector(".onboarding-dialog__single")!;
    // Two lines, never one cut one.
    expect(art).toHaveTextContent("Clean · Discover");
    expect(art).toHaveTextContent("Keys · Prepare");
    expect(art.textContent).not.toContain("Clean · Discover · Prepare");
  });

  it("is at least as tall as its tallest step, rounded, and its sentences are Inter at the body size (C108, C55, M251)", async () => {
    const css = (await import("./OnboardingDialog.css?raw")).default;
    // Step 2, the tallest, measures 235 at 1x with its done line beside its button; a taller step grows it.
    expect(css).toMatch(/\.onboarding-dialog\s*\{[^}]*min-height:\s*round\(nearest, calc\(240px \* var\(--scale\)\), 1px\)/);
    expect(css).toMatch(/\.onboarding-dialog__row\s*\{[^}]*flex-wrap:\s*wrap/);
    for (const selector of [".onboarding-dialog__body", ".onboarding-dialog__done"]) {
      const escaped = selector.replace(/[.]/g, "\\.");
      expect(css).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*font-family:\\s*var\\(--font-data\\)`));
    }
    // No size of its own: the Modal body's one size, and no About rules left in this sheet.
    expect(css).not.toMatch(/--text-body/);
    expect(css).not.toMatch(/\.about-dialog/);
  });

  it("sets the step title in the pixel face, like the dialog's own title, and the done line muted (M14, M325)", async () => {
    const css = (await import("./OnboardingDialog.css?raw")).default;
    expect(css).toMatch(/\.onboarding-dialog__title\s*\{[^}]*font-family:\s*var\(--font-voice\)/);
    expect(css).toMatch(/\.onboarding-dialog__done\s*\{[^}]*color:\s*var\(--fg-muted\)/);
    expect(css).not.toMatch(/success-text/);
  });

  it("is one dialog size on every step, with one violet button", async () => {
    mount();
    for (let step = 1; step <= 4; step += 1) {
      expect(screen.getByRole("dialog").className).toMatch(/cp-modal--medium/);
      const violet = within(screen.getByRole("dialog")).queryAllByRole("button").filter((b) => b.className.includes("cp-btn--primary"));
      expect(violet).toHaveLength(1);
      if (step < 4) await next();
    }
  });

  it("shows where it is as dots, named for a screen reader", async () => {
    mount();
    await next();
    // Each step is named, so "Step 2 of 4" is not mistaken for the drawings' own numbers.
    const dots = screen.getByRole("img", { name: "Step 2 of 4: Bring in your Rekordbox file" });
    expect(dots.querySelectorAll(".onboarding-dialog__dot")).toHaveLength(4);
    expect(dots.querySelectorAll('[data-current="true"]')).toHaveLength(1);
    expect(screen.queryByText(/Step \d of/)).toBeNull();
  });

  const footerButtons = () =>
    [...screen.getByRole("dialog").querySelector(".cp-modal__footer")!.querySelectorAll("button")].map((b) => b.textContent);

  it("has no Skip button and no Back on the first step: the × is Skip (M254, M259)", () => {
    mount();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(footerButtons()).toEqual(["Next"]);
  });

  it("makes the step's own action the violet button while it is to do, with Next grey beside it (M261)", async () => {
    install({ trackCount: 0 });
    mount();
    await next();
    expect(footerButtons()).toEqual(["Back", "Next", "Import a Rekordbox file…"]);
    expect(screen.getByRole("button", { name: "Import a Rekordbox file…" })).toHaveClass("cp-btn--primary");
    expect(screen.getByRole("button", { name: "Next" })).toHaveClass("cp-btn--secondary");
    await next();
    expect(footerButtons()).toEqual(["Back", "Next", "Match on Beatport…"]);
    await next();
    expect(footerButtons()).toEqual(["Back", "Done", "Sign in to Beatport"]);
    expect(screen.getByRole("button", { name: "Done" })).toHaveClass("cp-btn--secondary");
  });

  it("goes back to Next being the violet one once the step is done", async () => {
    install({ trackCount: 306 });
    mount();
    await next();
    await screen.findByText("306 tracks imported");
    expect(footerButtons()).toEqual(["Back", "Next"]);
    expect(screen.getByRole("button", { name: "Next" })).toHaveClass("cp-btn--primary");
  });

  it("offers Back after the first step only", async () => {
    mount();
    for (let step = 1; step <= 3; step += 1) {
      if (step === 1) expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
      else expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
      await next();
    }
  });

  it("puts the step dots in the footer, on the dialog's own centre", async () => {
    mount();
    const footer = screen.getByRole("dialog").querySelector(".cp-modal__footer")!;
    const dots = screen.getByRole("img", { name: /^Step 1 of 4/ });
    expect(footer.contains(dots)).toBe(true);
    const css = (await import("./OnboardingDialog.css?raw")).default;
    expect(css).toMatch(/\.onboarding-dialog__foot \.onboarding-dialog__dots\s*\{[^}]*left:\s*50%/);
  });

  it("goes back one screen at a time", async () => {
    mount();
    await goTo(3);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toHaveTextContent("Bring in your Rekordbox file");
  });
});

describe("ticking what is done", () => {
  it("reads nothing while the guide is closed", async () => {
    install({ trackCount: 5 });
    mount({ open: false });
    await act(async () => {});
    expect(window.cuepoint!.getLibraryHealth).not.toHaveBeenCalled();
    expect(window.cuepoint!.getBeatportAuth).not.toHaveBeenCalled();
  });


  it("says how many tracks are imported, once there are some", async () => {
    install({ trackCount: 306 });
    mount();
    await next();
    expect(await screen.findByText("306 tracks imported")).toBeInTheDocument();
  });

  it("says 1 track imported for one", async () => {
    install({ trackCount: 1 });
    mount();
    await next();
    expect(await screen.findByText("1 track imported")).toBeInTheDocument();
  });

  it("shows no done line on an empty library or without a bridge", async () => {
    install({ trackCount: 0 });
    mount();
    await next();
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalled());
    expect(screen.queryByText(/imported/)).toBeNull();
  });

  it("says how many are confirmed, once some are", async () => {
    install({ trackCount: 300, notMatched: 64 });
    mount();
    await goTo(3);
    expect(await screen.findByText("236 confirmed")).toBeInTheDocument();
  });

  it("shows no confirmed line while every track is still not matched", async () => {
    install({ trackCount: 10, notMatched: 10 });
    mount();
    await goTo(3);
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalled());
    expect(screen.queryByText(/confirmed$/)).toBeNull();
  });

  it("ticks the sign-in and takes its button away, for each way of being signed in", async () => {
    for (const auth of ["signed_in", "pasted", "env"] as const) {
      install({ auth });
      mount();
      await goTo(4);
      expect(await screen.findByText("Signed in")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
      cleanup();
    }
  });

  it("ticks the sign-in when main announces it while the guide is open", async () => {
    const bridge = install();
    mount();
    await goTo(4);
    await waitFor(() => expect(window.cuepoint!.getBeatportAuth).toHaveBeenCalled());
    expect(screen.queryByText("Signed in")).toBeNull();
    bridge.announce("signed_in");
    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
  });
});

describe("marking it done", () => {
  it("Done marks the guide done, and the update note as seen", async () => {
    const view = mount();
    await goTo(4);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(localStorage.getItem(DONE)).toBe("1");
    expect(localStorage.getItem(NOTE)).toBe("1");
    expect(view.onComplete).toHaveBeenCalledTimes(1);
  });

  it("Escape counts as Skip: it is remembered, so the guide does not come back (M260)", async () => {
    const { onComplete } = mount();
    await userEvent.keyboard("{Escape}");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DONE)).toBe("1");
    expect(localStorage.getItem(NOTE)).toBe("1");
  });

  it("the close button counts as Skip too (M260)", async () => {
    const { onComplete } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DONE)).toBe("1");
  });

  it("a click on the backdrop does nothing at all", () => {
    const { onComplete } = mount();
    fireEvent.click(screen.getByRole("presentation"));
    expect(onComplete).not.toHaveBeenCalled();
    expect(localStorage.getItem(DONE)).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("reopening", () => {
  it("starts at step 1 every time it opens, as Help → Getting started does", async () => {
    const view = mount();
    await goTo(3);
    expect(heading()).toHaveTextContent("Match your tracks on Beatport");

    view.rerender({ open: false });
    view.rerender({ open: true });

    expect(screen.getByRole("img", { name: /^Step 1 of 4/ })).toBeInTheDocument();
    expect(heading()).toHaveTextContent("Welcome to CuePoint");
  });

  it("keeps its place while another dialog is shown over it", async () => {
    const view = mount();
    await goTo(2);
    view.rerender({ open: true, covered: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender({ open: true, covered: false });
    expect(screen.getByRole("img", { name: /^Step 2 of 4/ })).toBeInTheDocument();
  });
});

describe("storage that throws", () => {
  beforeEach(() => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
  });

  it("still finishes: the × closes the guide", async () => {
    const { onComplete } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("still finishes from the last screen", async () => {
    const { onComplete } = mount();
    await goTo(4);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("the actions on its screens", () => {
  it("How do I get one? opens the Rekordbox instructions and leaves the guide where it is", async () => {
    const { onShowExport, onComplete } = mount();
    await goTo(2);
    await userEvent.click(screen.getByRole("button", { name: "How do I get one?" }));
    expect(onShowExport).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(localStorage.getItem(DONE)).toBeNull();
  });

  it("Import a Rekordbox file… closes the guide and asks for the import", async () => {
    const { onImport, onComplete } = mount();
    await goTo(2);
    await userEvent.click(screen.getByRole("button", { name: "Import a Rekordbox file…" }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // They have seen what it had to say.
    expect(localStorage.getItem(DONE)).toBe("1");
  });

  it("Match on Beatport… closes the guide and opens Clean's match window once a library is in", async () => {
    install({ trackCount: 10, notMatched: 10 });
    const { onMatch, onComplete } = mount();
    await goTo(3);
    const button = screen.getByRole("button", { name: "Match on Beatport…" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DONE)).toBe("1");
  });

  it("keeps Match on Beatport… off until a library is imported, and says why", async () => {
    install({ trackCount: 0 });
    const { onMatch } = mount();
    await goTo(3);
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Match on Beatport…" })).toBeDisabled();
    expect(screen.getByText("Import a Rekordbox file first (step 2).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match on Beatport…" })).toHaveAccessibleDescription(
      "Import a Rekordbox file first (step 2).",
    );
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("does not hold Match on Beatport… back while the library count is still unknown", async () => {
    // No bridge: the count never arrives, and unknown is not empty.
    const { onMatch } = mount();
    await goTo(3);
    const button = screen.getByRole("button", { name: "Match on Beatport…" });
    expect(button).toBeEnabled();
    expect(screen.queryByText("Import a Rekordbox file first (step 2).")).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it("Sign in to Beatport asks for the sign-in and leaves the guide open", async () => {
    const { onSignIn, onComplete } = mount();
    await goTo(4);
    await userEvent.click(screen.getByRole("button", { name: "Sign in to Beatport" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(localStorage.getItem(DONE)).toBeNull();
  });

  it("puts each action on its own screen only", async () => {
    mount();
    expect(screen.queryByRole("button", { name: "How do I get one?" })).toBeNull();
    await next();
    expect(screen.queryByRole("button", { name: "Match tracks…" })).toBeNull();
    await next();
    expect(screen.queryByRole("button", { name: "Import a Rekordbox file…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
  });
});

describe("the first-run guide accessibility (HARDEN-08)", () => {
  it.each([1, 2, 3, 4])("has no WCAG 2.2 A or AA violations on screen %i", async (step) => {
    mount();
    await goTo(step);
    await expectNoAxeViolations();
  });
});
