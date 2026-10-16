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

import { OnboardingDialog } from "./OnboardingDialog";

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
      expect(screen.getByRole("img", { name: `Step ${step} of 4` })).toBeInTheDocument();
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
    expect(
      screen.getByText(
        "Tidies your Rekordbox library, finds new music, plans sets. Rekordbox is never changed until you export.",
      ),
    ).toBeInTheDocument();
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

  it("draws a picture on every screen: the real logo, the export drawings, pixel icons", async () => {
    mount();
    const picture = () => screen.getByRole("dialog").querySelector(".onboarding-dialog__picture");
    // 1: the logo image, not the pixel icon.
    expect(picture()!.querySelector("img.onboarding-dialog__logo")).not.toBeNull();
    expect(picture()!.querySelector("svg[data-icon]")).toBeNull();
    // 2: four drawings side by side, each with a caption.
    await next();
    const drawings = screen.getByRole("list", { name: "How to export from Rekordbox" });
    expect(drawings.querySelectorAll("li")).toHaveLength(4);
    expect(drawings.querySelectorAll("svg.ob-art")).toHaveLength(4);
    expect(drawings).toHaveTextContent("Export Collection in xml format");
    expect(drawings).toHaveTextContent("Import a Rekordbox file");
    // 3 and 4: pixel icons.
    for (let step = 3; step <= 4; step += 1) {
      await next();
      expect(picture()!.querySelectorAll("svg[data-icon]").length).toBeGreaterThan(0);
    }
  });

  it("is the wide dialog for the four drawings only", async () => {
    mount();
    expect(screen.getByRole("dialog").className).not.toMatch(/wide/);
    await next();
    expect(screen.getByRole("dialog").className).toMatch(/wide/);
    await next();
    expect(screen.getByRole("dialog").className).not.toMatch(/wide/);
  });

  it("shows where it is as dots, named for a screen reader", async () => {
    mount();
    await next();
    const dots = screen.getByRole("img", { name: "Step 2 of 4" });
    expect(dots.querySelectorAll(".onboarding-dialog__dot")).toHaveLength(4);
    expect(dots.querySelectorAll('[data-current="true"]')).toHaveLength(1);
    expect(screen.queryByText(/Step \d of/)).toBeNull();
  });

  it("keeps Skip, Back and Next in the same place before the last screen", async () => {
    mount();
    for (let step = 1; step <= 3; step += 1) {
      const footer = screen.getByRole("dialog").querySelector(".cp-modal__footer")!;
      expect([...footer.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
        "Skip",
        "Back",
        "Next",
      ]);
      await next();
    }
  });

  it("offers Skip before the last screen and Back after the first", async () => {
    mount();
    for (let step = 1; step <= 3; step += 1) {
      expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
      // Back keeps its place on the first screen so Next and Skip never move; it is off there.
      if (step === 1) expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
      else expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
      await next();
    }
  });

  it("ends on Done, with no Skip and no Next", async () => {
    mount();
    await goTo(4);
    const footer = screen.getByRole("dialog").querySelector(".cp-modal__footer")!;
    expect([...footer.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Back", "Done"]);
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
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
    expect(await screen.findByText("✓ 306 tracks imported")).toBeInTheDocument();
  });

  it("says 1 track imported for one", async () => {
    install({ trackCount: 1 });
    mount();
    await next();
    expect(await screen.findByText("✓ 1 track imported")).toBeInTheDocument();
  });

  it("shows no done line on an empty library or without a bridge", async () => {
    install({ trackCount: 0 });
    mount();
    await next();
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalled());
    expect(screen.queryByText(/imported/)).toBeNull();
  });

  it("says how many are matched, once some are", async () => {
    install({ trackCount: 300, notMatched: 64 });
    mount();
    await goTo(3);
    expect(await screen.findByText("✓ 236 matched")).toBeInTheDocument();
  });

  it("shows no matched line while every track is still not matched", async () => {
    install({ trackCount: 10, notMatched: 10 });
    mount();
    await goTo(3);
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalled());
    expect(screen.queryByText(/matched$/)).toBeNull();
  });

  it("ticks the sign-in and takes its button away, for each way of being signed in", async () => {
    for (const auth of ["signed_in", "pasted", "env"] as const) {
      install({ auth });
      mount();
      await goTo(4);
      expect(await screen.findByText("✓ Signed in")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
      cleanup();
    }
  });

  it("ticks the sign-in when main announces it while the guide is open", async () => {
    const bridge = install();
    mount();
    await goTo(4);
    await waitFor(() => expect(window.cuepoint!.getBeatportAuth).toHaveBeenCalled());
    expect(screen.queryByText("✓ Signed in")).toBeNull();
    bridge.announce("signed_in");
    expect(await screen.findByText("✓ Signed in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
  });
});

describe("marking it done", () => {
  it("Skip and Done mark the guide done, and the update note as seen", async () => {
    const skipped = mount();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(localStorage.getItem(DONE)).toBe("1");
    expect(localStorage.getItem(NOTE)).toBe("1");
    expect(skipped.onComplete).toHaveBeenCalledTimes(1);

    localStorage.clear();
    // Still mounted: Skip only asked to close.
    await goTo(4);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(localStorage.getItem(DONE)).toBe("1");
  });

  it("Escape closes it without marking it done", async () => {
    const { onComplete } = mount();
    await userEvent.keyboard("{Escape}");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DONE)).toBeNull();
    expect(localStorage.getItem(NOTE)).toBeNull();
  });

  it("the close button closes it without marking it done", async () => {
    const { onComplete } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DONE)).toBeNull();
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

    expect(screen.getByRole("img", { name: "Step 1 of 4" })).toBeInTheDocument();
    expect(heading()).toHaveTextContent("Welcome to CuePoint");
  });

  it("keeps its place while another dialog is shown over it", async () => {
    const view = mount();
    await goTo(2);
    view.rerender({ open: true, covered: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender({ open: true, covered: false });
    expect(screen.getByRole("img", { name: "Step 2 of 4" })).toBeInTheDocument();
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

  it("still finishes: Skip closes the guide", async () => {
    const { onComplete } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
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
  it("How? opens the Rekordbox instructions and leaves the guide where it is", async () => {
    const { onShowExport, onComplete } = mount();
    await goTo(2);
    await userEvent.click(screen.getByRole("button", { name: "How?" }));
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
    install({ trackCount: 10 });
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
    expect(screen.queryByRole("button", { name: "How?" })).toBeNull();
    await next();
    expect(screen.queryByRole("button", { name: "Match tracks…" })).toBeNull();
    await next();
    expect(screen.queryByRole("button", { name: "Import a Rekordbox file…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
  });
});
