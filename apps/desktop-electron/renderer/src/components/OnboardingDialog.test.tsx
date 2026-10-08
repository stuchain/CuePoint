/**
 * The first-run guide (RUN-1, RUN-2, DEC-132).
 *
 * Five screens, a Skip that is always there, and a stray click that cannot end
 * it. The three defects the old tour had (reopening on the last screen, Escape
 * and the backdrop marking it done, storage that throws) are pinned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
}

function mount(props: { open?: boolean; covered?: boolean } = {}): Handlers & {
  rerender: (next: { open?: boolean; covered?: boolean }) => void;
} {
  const handlers: Handlers = {
    onComplete: vi.fn<() => void>(),
    onShowExport: vi.fn<() => void>(),
    onImport: vi.fn<() => void>(),
    onMatch: vi.fn<() => void>(),
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

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the five screens", () => {
  it("walks Welcome, Rekordbox, Import, Match, Find your way around", async () => {
    mount();
    const titles: string[] = [];
    for (let step = 1; step <= 5; step += 1) {
      expect(screen.getByText(`Step ${step} of 5`)).toBeInTheDocument();
      titles.push(heading().textContent ?? "");
      if (step < 5) await next();
    }
    expect(titles).toEqual([
      "Welcome to CuePoint",
      "Get your collection out of Rekordbox",
      "Import it",
      "Match your tracks",
      "Find your way around",
    ]);
  });

  it("promises that nothing changes in Rekordbox until the user exports", () => {
    mount();
    expect(
      screen.getByText(/Nothing changes in Rekordbox until you export/),
    ).toBeInTheDocument();
  });

  it("says where Beatport's keys, genres and labels come from on the matching screen", async () => {
    mount();
    await goTo(4);
    expect(
      screen.getByText("Keys, genres and labels come from Beatport: match your tracks in Clean."),
    ).toBeInTheDocument();
  });

  it("finds its way around: Keys, Prepare, how to play, the strip and Activity", async () => {
    mount();
    await goTo(5);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Keys shows the keys of your playlists on the Camelot wheel/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Put tracks in the order you will play them/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Double-click a track to play it/)).toBeInTheDocument();
    expect(within(dialog).getByText(/The strip at the bottom shows what CuePoint is doing/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Activity lists everything it did/)).toBeInTheDocument();
  });

  it("draws a picture on every screen with pixel icons, not an image", async () => {
    mount();
    for (let step = 1; step <= 5; step += 1) {
      const picture = screen.getByRole("dialog").querySelector(".onboarding-dialog__picture");
      expect(picture, `screen ${step}`).not.toBeNull();
      expect(picture!.querySelectorAll("svg[data-icon]").length).toBeGreaterThan(0);
      expect(picture!.querySelector("img")).toBeNull();
      if (step < 5) await next();
    }
  });

  it("names Prepare once on the last screen, with the Set sentence as its text", async () => {
    mount();
    await goTo(5);
    const pages = screen.getByRole("list", { name: "Pages" });
    const prepare = within(pages).getByText("Prepare").closest("li")!;
    expect(prepare).toHaveTextContent(/Put tracks in the order you will play them/);
    expect(within(screen.getByRole("dialog")).getAllByText(/Prepare/)).toHaveLength(1);
  });

  it("keeps Back in the footer beside Next, in the same place on every screen", async () => {
    mount();
    for (let step = 1; step <= 5; step += 1) {
      const footer = screen.getByRole("dialog").querySelector(".cp-modal__footer")!;
      const names = [...footer.querySelectorAll("button")].map((b) => b.textContent);
      expect(names).toEqual(["Skip", "Back", step < 5 ? "Next" : "Get started"]);
      if (step < 5) await next();
    }
  });

  it("offers Skip on every screen and Back after the first", async () => {
    mount();
    for (let step = 1; step <= 5; step += 1) {
      expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
      // Back keeps its place on the first screen so Next and Skip never move; it is off there.
      if (step === 1) expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
      else expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
      if (step < 5) await next();
    }
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("goes back one screen at a time", async () => {
    mount();
    await goTo(3);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toHaveTextContent("Get your collection out of Rekordbox");
  });
});

describe("marking it done", () => {
  it("Skip and Get started mark the guide done, and the update note as seen", async () => {
    const skipped = mount();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(localStorage.getItem(DONE)).toBe("1");
    expect(localStorage.getItem(NOTE)).toBe("1");
    expect(skipped.onComplete).toHaveBeenCalledTimes(1);

    localStorage.clear();
    // Still mounted: Skip only asked to close.
    await goTo(5);
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
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
    await goTo(4);
    expect(heading()).toHaveTextContent("Match your tracks");

    view.rerender({ open: false });
    view.rerender({ open: true });

    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(heading()).toHaveTextContent("Welcome to CuePoint");
  });

  it("keeps its place while another dialog is shown over it", async () => {
    const view = mount();
    await goTo(2);
    view.rerender({ open: true, covered: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender({ open: true, covered: false });
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
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
    await goTo(5);
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("the actions on its screens", () => {
  it("Show me how opens the Rekordbox instructions and leaves the guide where it is", async () => {
    const { onShowExport, onComplete } = mount();
    await goTo(2);
    await userEvent.click(screen.getByRole("button", { name: "Show me how" }));
    expect(onShowExport).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(localStorage.getItem(DONE)).toBeNull();
  });

  it("Import your Rekordbox collection… closes the guide and asks for the import", async () => {
    const { onImport, onComplete } = mount();
    await goTo(3);
    await userEvent.click(screen.getByRole("button", { name: "Import your Rekordbox collection…" }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // They have seen what it had to say.
    expect(localStorage.getItem(DONE)).toBe("1");
  });

  it("Match tracks… closes the guide and opens Clean's match window", async () => {
    const { onMatch, onComplete } = mount();
    await goTo(4);
    await userEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DONE)).toBe("1");
  });

  it("puts each action on its own screen only", async () => {
    mount();
    expect(screen.queryByRole("button", { name: "Show me how" })).toBeNull();
    await next();
    expect(screen.queryByRole("button", { name: "Import your Rekordbox collection…" })).toBeNull();
    await next();
    expect(screen.queryByRole("button", { name: "Show me how" })).toBeNull();
  });
});
