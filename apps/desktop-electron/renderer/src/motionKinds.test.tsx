/**
 * One test per kind of motion (PAGES-12, DEC-134): with the kind off the element has no
 * animation; with it on, the stepped one; under the system's reduced motion, none.
 *
 * The components are real and are rendered under the real `MotionProvider`, which writes the
 * `data-motion-<kind>` attributes. jsdom loads no component CSS and plays nothing, so what each
 * element "does" is read from the real stylesheets (`test/motionCss.ts`) for the attributes that
 * are on. Behavior that is script (the exit that holds an element, the ghost, the shared
 * transition, the scroll flag) is tested for what it does to the DOM.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState, type ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Badge } from "./components/Badge";
import { Button } from "./components/Button";
import { Modal } from "./components/Modal";
import { PixelSpinner } from "./components/PixelSpinner";
import { SavedTick } from "./components/SavedTick";
import { Tabs } from "./components/Tabs";
import { ToastProvider, useToast } from "./components/Toast";
import { AppShellLayout } from "./components/shell/AppShellLayout";
import { TrackTable } from "./components/table/TrackTable";
import { inMemorySource, pendingSource } from "./components/table/trackTableSource";
import type { TrackColumnDef } from "./components/table/trackTableLayout";
import { CamelotWheel } from "./components/wheel/CamelotWheel";
import { WheelButton } from "./components/wheel/WheelButton";
import { closeWheel } from "./components/wheel/wheelStore";
import { KeysCountsList } from "./screens/keys/KeysCountsList";
import { SetNotesDialog } from "./screens/prepare/SetNotesDialog";
import { DisclosureSection } from "./screens/library/DisclosureSection";
import { SettingsScreen } from "./screens/SettingsScreen";
import { MotionProvider, useMotion } from "./tokens/MotionContext";
import { MOTION_KINDS, MOTION_STORAGE_KEY, type MotionKindId } from "./tokens/motion";
import { ScaleProvider } from "./tokens/ScaleContext";
import { sharedTransition } from "./tokens/sharedTransition";
import { leaveAsGhost, useLeaveGhost } from "./tokens/useLeaveGhost";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "./tokens/ThemeContext";
import { motionOf, steps } from "./test/motionCss";

const html = document.documentElement;

type Setup = "on" | "off" | "reduced";

/** The system's Reduce motion setting, as `matchMedia` answers it. */
function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/** Every kind on, except `kind` when the setup is "off"; everything off under "reduced". */
function configure(kind: MotionKindId, setup: Setup) {
  localStorage.clear();
  if (setup === "off") localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ [kind]: false }));
  mockReducedMotion(setup === "reduced");
}

beforeAll(() => {
  // The virtualizer measures its scroll element; jsdom lays nothing out (see TrackTable.test.tsx).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});

beforeEach(() => {
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const k of MOTION_KINDS) html.removeAttribute(`data-motion-${k.id}`);
  Reflect.deleteProperty(window, "matchMedia");
  vi.useRealTimers();
});

/** Renders under the provider and hands the container back. */
function mount(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ScaleProvider>
          <MotionProvider>
            <ToastProvider>{ui}</ToastProvider>
          </MotionProvider>
        </ScaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/**
 * The three states of one element: `build` mounts the ui and says which element to read.
 * On: `expectOn` holds for what the element does. Off and reduced: it does nothing.
 */
function perKind(
  kind: MotionKindId,
  name: string,
  build: () => { ui: ReactElement; target: (container: HTMLElement) => Element | null; pseudo?: string; after?: () => Promise<void> | void },
  expectOn: (motion: ReturnType<typeof motionOf>) => void,
) {
  describe(`${kind}: ${name}`, () => {
    for (const setup of ["on", "off", "reduced"] as const) {
      it(setup === "on" ? "moves in steps" : setup === "off" ? "has no animation with its switch off" : "has no animation under reduced motion", async () => {
        configure(kind, setup);
        const { ui, target, pseudo, after } = build();
        const { container } = mount(ui);
        // Not inside an act of its own: each event must flush before the next (dragOver, then drop).
        await after?.();
        const element = target(container);
        expect(element, "the element to read").not.toBeNull();
        const motion = motionOf(element!, pseudo ?? null, kind);
        if (setup === "on") expectOn(motion);
        else expect(motion).toEqual({ animation: null, transition: null });
      });
    }
  });
}

const first = (selector: string) => (container: HTMLElement) => container.querySelector(selector);

// ---- micro ----------------------------------------------------------------------------------

perKind("micro", "a button press", () => ({ ui: <Button>Go</Button>, target: first(".cp-btn") }), (m) => {
  expect(m.transition).toMatch(/^transform .*steps\(1\)$/);
});

perKind("micro", "a checkbox", () => ({ ui: <input type="checkbox" aria-label="x" />, target: first("input") }), (m) => {
  expect(steps(m.transition)).toBe(true);
});

perKind(
  "micro",
  "the Saved tick",
  () => ({ ui: <SavedTick signal={1} />, target: first(".cp-saved-tick__body") }),
  (m) => {
    // The rise steps; the fade is its own, linear animation.
    expect(m.animation).toMatch(/cp-rise [^,]*steps\(/);
    expect(m.animation).toMatch(/cp-fade-in [^,]*linear/);
  },
);

// ---- interaction ----------------------------------------------------------------------------

interface Row {
  id: number;
  title: string;
}
const COLUMNS: TrackColumnDef<Row>[] = [{ id: "title", header: "Title", defaultWidthPx: 200, render: (r) => r.title }];
const ROWS: Row[] = [1, 2, 3].map((id) => ({ id, title: `Track ${id}` }));

function table(extra: Partial<React.ComponentProps<typeof TrackTable<Row>>> = {}) {
  return (
    <TrackTable<Row>
      columns={COLUMNS}
      source={inMemorySource(ROWS)}
      getRowKey={(r) => r.id}
      onRowDragStart={() => {}}
      acceptsRowDrop={() => true}
      onRowDrop={() => {}}
      {...extra}
    />
  );
}

const transfer = () => ({ setData: () => {}, getData: () => "", effectAllowed: "move", dropEffect: "move", types: [] });

perKind(
  "interaction",
  "a row picked up lifts",
  () => ({
    ui: table(),
    target: first(".track-table__row--lifted .track-table__cell"),
    after: () => {
      const row = document.querySelector('[data-index="0"]')!;
      fireEvent.dragStart(row, { dataTransfer: transfer() });
    },
  }),
  (m) => expect(steps(m.transition)).toBe(true),
);

perKind(
  "interaction",
  "a row dropped settles",
  () => ({
    ui: table(),
    target: first(".track-table__row--settled .track-table__cell"),
    after: () => {
      const row = document.querySelector('[data-index="1"]')!;
      fireEvent.dragStart(document.querySelector('[data-index="0"]')!, { dataTransfer: transfer() });
      fireEvent.dragOver(row, { dataTransfer: transfer(), clientY: 0 });
      fireEvent.drop(row, { dataTransfer: transfer() });
    },
  }),
  (m) => expect(m.animation).toMatch(/cp-settle .*steps\(/),
);

perKind(
  "interaction",
  "a column's resize handle",
  () => ({ ui: table(), target: first(".track-table__col-resizer"), pseudo: "::after" }),
  (m) => {
    expect(m.transition).toMatch(/transform [^,]*steps\(/);
    expect(m.transition).toMatch(/opacity [^,]*linear/);
  },
);

// ---- hover ----------------------------------------------------------------------------------

perKind("hover", "a button", () => ({ ui: <Button>Go</Button>, target: first(".cp-btn") }), (m) => {
  expect(steps(m.transition)).toBe(true);
});

perKind(
  "hover",
  "a row in the table",
  () => ({ ui: table(), target: first(".track-table__row"), pseudo: "::before" }),
  (m) => expect(m.animation).toMatch(/cp-edge-in [^,]*steps\(1\)/),
);

describe("hover: the table holds still while it scrolls", () => {
  it("draws no row's bar during a scroll, and draws it again after", () => {
    vi.useFakeTimers();
    configure("hover", "on");
    const { container } = mount(table());
    const scroller = container.querySelector(".track-table__scroll")!;
    const row = container.querySelector(".track-table__row")!;
    expect(motionOf(row, "::before", "hover").animation).not.toBeNull();
    fireEvent.scroll(scroller);
    expect(scroller).toHaveAttribute("data-scrolling");
    expect(motionOf(row, "::before", "hover")).toEqual({ animation: null, transition: null });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(scroller).not.toHaveAttribute("data-scrolling");
    expect(motionOf(row, "::before", "hover").animation).not.toBeNull();
  });
});

perKind(
  "hover",
  "the focus ring",
  () => ({ ui: <Button>Go</Button>, target: first(".cp-btn") }),
  (m) => expect(m.animation).toMatch(/cp-focus-step .*steps\(/),
);

// ---- state ----------------------------------------------------------------------------------

function ChangingBadge() {
  const [on, setOn] = useState(false);
  return (
    <>
      <Badge variant={on ? "success" : "warning"}>{on ? "Done" : "Waiting"}</Badge>
      <button type="button" onClick={() => setOn(true)}>
        change
      </button>
    </>
  );
}

perKind(
  "state",
  "a badge that changes",
  () => ({
    ui: <ChangingBadge />,
    target: first(".cp-badge"),
    after: () => {
      fireEvent.click(screen.getByText("change"));
    },
  }),
  (m) => {
    expect(m.animation).toMatch(/cp-state-step-a [^,]*steps\(/);
    expect(m.animation).toMatch(/cp-state-fade-a [^,]*linear/);
  },
);

function ChangingCounts({ children }: { children: (counts: Map<string, number>) => ReactElement }) {
  const [counts, setCounts] = useState(new Map([["8A", 3], ["9A", 5]]));
  return (
    <>
      {children(counts)}
      <button type="button" onClick={() => setCounts(new Map([["8A", 4], ["9A", 5]]))}>
        recount
      </button>
    </>
  );
}
const recount = () => {
  fireEvent.click(screen.getByText("recount"));
};

perKind(
  "state",
  "a wheel segment's count that changes",
  () => ({
    ui: (
      <ChangingCounts>
        {(counts) => (
          <CamelotWheel lit={new Map()} focusCode="8A" onFocusCode={() => {}} onPick={() => {}} counts={counts} />
        )}
      </ChangingCounts>
    ),
    target: (c) => c.querySelector('[data-label-for="8A"] .cp-wheel__count'),
    after: recount,
  }),
  (m) => {
    expect(m.animation).toMatch(/cp-state-step-a [^,]*steps\(/);
    expect(m.animation).toMatch(/cp-state-fade-a [^,]*linear/);
  },
);

perKind(
  "state",
  "a count in the Keys list that changes",
  () => ({
    ui: (
      <ChangingCounts>
        {(counts) => (
          <KeysCountsList
            keys={[...counts].map(([code, count]) => ({ code, count }))}
            noKey={0}
            chosen={new Set()}
            noneChosen={false}
            lit={new Map()}
            mixKey={null}
            onPick={() => {}}
            onPickNone={() => {}}
          />
        )}
      </ChangingCounts>
    ),
    target: (c) => c.querySelector("[data-line=key] .keys-counts__count"),
    after: recount,
  }),
  (m) => {
    expect(m.animation).toMatch(/cp-state-step-a [^,]*steps\(/);
    expect(m.animation).toMatch(/cp-state-fade-a [^,]*linear/);
  },
);

it("state: a count that is only drawn, or that did not change, is not marked", () => {
  configure("state", "on");
  mount(
    <ChangingCounts>
      {(counts) => (
        <CamelotWheel lit={new Map()} focusCode="8A" onFocusCode={() => {}} onPick={() => {}} counts={counts} />
      )}
    </ChangingCounts>,
  );
  expect(document.querySelector("[data-changed]")).toBeNull();
  recount();
  expect(document.querySelector('[data-label-for="8A"] [data-changed]')).not.toBeNull();
  expect(document.querySelector('[data-label-for="9A"] [data-changed]')).toBeNull();
});

perKind(
  "state",
  "the selected tab",
  () => ({
    ui: <Tabs tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} activeId="a" onChange={() => {}} />,
    target: first(".cp-tabs__tab--active"),
  }),
  (m) => expect(m.animation).toMatch(/cp-rise [^,]*steps\(/),
);

perKind(
  "state",
  "a section of Track details opening",
  () => ({
    ui: (
      <DisclosureSection id="t" title="Details" defaultOpen={false} remember={false}>
        <p>body</p>
      </DisclosureSection>
    ),
    target: first(".cp-track-section__body"),
    after: () => {
      fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    },
  }),
  (m) => expect(m.animation).toMatch(/cp-rise [^,]*steps\(/),
);

// ---- page -----------------------------------------------------------------------------------

perKind(
  "page",
  "a page stepping in",
  () => ({
    ui: (
      <AppShellLayout pagePhase="a">
        <div className="screen">page</div>
      </AppShellLayout>
    ),
    target: first("main > .screen"),
  }),
  (m) => {
    expect(m.animation).toMatch(/cp-page-step-a [^,]*steps\(/);
    // It starts from half, so nothing on the page is ever hidden.
    expect(m.animation).toMatch(/cp-page-fade-a [^,]*linear/);
  },
);

perKind(
  "page",
  "the shell does not move",
  () => ({
    ui: (
      <AppShellLayout pagePhase="b" header={<p>header</p>} sidebar={<p>sidebar</p>} statusBar={<p>status</p>}>
        <div className="screen">page</div>
      </AppShellLayout>
    ),
    target: first("main"),
  }),
  (m) => expect(m).toEqual({ animation: null, transition: null }),
);

// ---- entrance and exit ----------------------------------------------------------------------

perKind(
  "entrance",
  "a dialog opening",
  () => ({
    ui: (
      <Modal open title="Hello" onClose={() => {}}>
        <p>x</p>
      </Modal>
    ),
    target: first(".cp-modal"),
  }),
  (m) => expect(m.animation).toMatch(/cp-rise [^,]*steps\(/),
);

perKind(
  "entrance",
  "the dialog's backdrop fades, smoothly",
  () => ({
    ui: (
      <Modal open title="Hello" onClose={() => {}}>
        <p>x</p>
      </Modal>
    ),
    target: first(".cp-modal__backdrop"),
  }),
  (m) => {
    expect(m.animation).toMatch(/cp-fade-in [^,]*linear/);
    expect(steps(m.animation)).toBe(false);
  },
);

function PushesToast() {
  const { push } = useToast();
  return (
    <button type="button" onClick={() => push("Saved it")}>
      push
    </button>
  );
}

perKind(
  "entrance",
  "a toast",
  () => ({
    ui: <PushesToast />,
    target: first(".cp-toast"),
    after: () => {
      fireEvent.click(screen.getByText("push"));
    },
  }),
  (m) => expect(m.animation).toMatch(/cp-toast-in [^,]*steps\(/),
);

perKind(
  "entrance",
  "the Inspector after a toggle",
  () => ({
    ui: <aside className="cp-inspector" data-entering="" />,
    target: first(".cp-inspector"),
  }),
  (m) => expect(m.animation).toMatch(/cp-from-edge [^,]*steps\(/),
);

// ---- scroll ---------------------------------------------------------------------------------

class FakeObserver {
  static last: FakeObserver | null = null;
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeObserver.last = this;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

describe("scroll: the Settings section links follow the scroll", () => {
  beforeEach(() => {
    FakeObserver.last = null;
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const scrollTo = () => {
    const section = document.getElementById("settings-motion")!;
    act(() => {
      FakeObserver.last!.callback(
        [{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry],
        FakeObserver.last as unknown as IntersectionObserver,
      );
    });
  };

  for (const setup of ["on", "off", "reduced"] as const) {
    it(setup === "on" ? "the link in view steps in" : `has no animation (${setup})`, () => {
      configure("scroll", setup);
      mount(<SettingsScreen />);
      const link = screen.getByRole("link", { name: "Motion" });
      if (setup !== "on") {
        // Nothing is watched, so nothing follows.
        expect(FakeObserver.last).toBeNull();
        expect(link).not.toHaveAttribute("data-current");
        expect(motionOf(link, null, "scroll")).toEqual({ animation: null, transition: null });
        return;
      }
      scrollTo();
      expect(link).toHaveAttribute("data-current");
      expect(motionOf(link, null, "scroll").transition).toMatch(/transform [^,]*steps\(/);
    });
  }

  perKind(
    "scroll",
    "a section heading settles in the scroll",
    () => ({
      ui: (
        <section className="settings-page__section">
          <h2 className="cp-panel__title">Motion</h2>
        </section>
      ),
      target: first(".cp-panel__title"),
    }),
    (m) => {
      expect(m.animation).toMatch(/cp-settle-in auto steps\(/);
      expect(m.animation).toMatch(/cp-fade-in auto linear/);
    },
  );

  it("never reaches the track tables", () => {
    configure("scroll", "on");
    const { container } = mount(table());
    for (const selector of [".track-table__scroll", ".track-table__row", ".track-table__cell", ".track-table__header"]) {
      const el = container.querySelector(selector)!;
      expect(motionOf(el).animation === null || !/cp-settle-in/.test(motionOf(el).animation!)).toBe(true);
    }
  });
});

// ---- loading --------------------------------------------------------------------------------

perKind(
  "loading",
  "the pixel spinner",
  () => ({ ui: <PixelSpinner />, target: first(".cp-spinner__cell") }),
  (m) => expect(m.animation).toMatch(/cp-spinner-hop [^,]*steps\(1, end\) infinite/),
);

perKind(
  "loading",
  "a row not yet fetched",
  () => ({
    ui: (
      <TrackTable<Row> columns={COLUMNS} source={pendingSource(50)} getRowKey={(r) => r.id} />
    ),
    target: first(".track-table__skeleton"),
  }),
  (m) => {
    expect(m.animation).toMatch(/cp-skeleton .*linear infinite/);
    // A smooth fade, not a stepped one.
    expect(steps(m.animation)).toBe(false);
  },
);

describe("loading: the table holds still while it scrolls", () => {
  it("pauses the skeleton rows during a scroll and not after", () => {
    vi.useFakeTimers();
    configure("loading", "on");
    const { container } = mount(<TrackTable<Row> columns={COLUMNS} source={pendingSource(50)} getRowKey={(r) => r.id} />);
    const scroller = container.querySelector(".track-table__scroll")!;
    const skeleton = container.querySelector(".track-table__skeleton")!;
    expect(motionOf(skeleton).animation).not.toBeNull();
    fireEvent.scroll(scroller);
    expect(scroller).toHaveAttribute("data-scrolling");
    expect(motionOf(skeleton).animation).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(scroller).not.toHaveAttribute("data-scrolling");
    expect(motionOf(skeleton).animation).not.toBeNull();
  });

  it("puts the spinner where the empty state would be while the first rows are asked for", () => {
    configure("loading", "on");
    const { container } = mount(
      <TrackTable<Row> columns={COLUMNS} source={inMemorySource([])} loading emptyState="Nothing here" />,
    );
    expect(container.querySelector(".track-table__empty .cp-spinner")).not.toBeNull();
    expect(screen.getByText("Loading tracks")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("keeps the words when loading is not asked for", () => {
    configure("loading", "on");
    mount(<TrackTable<Row> columns={COLUMNS} source={inMemorySource([])} emptyState="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("shows the spinner still, with its words, when the kind is off", () => {
    configure("loading", "off");
    const { container } = mount(<PixelSpinner label="Reading your library…" />);
    expect(screen.getByText("Reading your library…")).toBeInTheDocument();
    expect(motionOf(container.querySelector(".cp-spinner__cell")!).animation).toBeNull();
  });
});

// ---- feedback -------------------------------------------------------------------------------

perKind(
  "feedback",
  "the tick on Saved",
  () => ({ ui: <SavedTick signal={1} />, target: first(".cp-saved-tick__body > [aria-hidden]") }),
  (m) => expect(m.animation).toMatch(/cp-state-step-a [^,]*steps\(/),
);

perKind(
  "feedback",
  "a refused time shakes",
  () => ({ ui: <p className="prepare-header__refusal">Not a time</p>, target: first(".prepare-header__refusal") }),
  (m) => expect(m.animation).toMatch(/cp-shake [^,]*steps\(1, end\)/),
);

perKind(
  "feedback",
  "a refused chapter length shakes",
  () => ({ ui: <p className="prepare-dialog__problem">Too long</p>, target: first(".prepare-dialog__problem") }),
  (m) => expect(m.animation).toMatch(/cp-shake/),
);

perKind(
  "feedback",
  "new search results pulse",
  () => ({ ui: <ul className="cp-global-search__list cp-global-search__list--fresh" />, target: first("ul") }),
  (m) => {
    expect(m.animation).toMatch(/cp-rise [^,]*steps\(/);
    expect(m.animation).toMatch(/cp-pulse [^,]*linear/);
  },
);

perKind(
  "feedback",
  "a job finishing pulses the strip",
  () => ({
    ui: (
      <div className="cp-status" data-finished="1">
        <span className="cp-status__live">Ready</span>
      </div>
    ),
    target: first(".cp-status__live"),
  }),
  (m) => expect(m.animation).toMatch(/cp-pulse/),
);

// ---- shared ---------------------------------------------------------------------------------

describe("shared: the two shared-element transitions", () => {
  let started: (() => void | Promise<void>)[];
  let finish: () => void;
  beforeEach(() => {
    started = [];
    (document as unknown as { startViewTransition: unknown }).startViewTransition = (update: () => void | Promise<void>) => {
      started.push(update);
      // Like the real one, finished comes after the update has run and the animation has played.
      return { finished: new Promise<void>((resolve) => (finish = resolve)) };
    };
  });
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it("runs the update inside a view transition, naming the clicked element, when the kind is on", async () => {
    configure("shared", "on");
    mount(<p>x</p>);
    const from = document.createElement("div");
    const to = document.createElement("div");
    document.body.append(from, to);
    const update = vi.fn();
    expect(sharedTransition("cp-shared-result", from, update, () => to)).toBe(true);
    expect(from.style.getPropertyValue("view-transition-name")).toBe("cp-shared-result");
    expect(update).not.toHaveBeenCalled();
    await act(async () => {
      await started[0]!();
    });
    expect(update).toHaveBeenCalledTimes(1);
    // One name on one element at a time: it moved from the clicked element to the landing.
    expect(from.style.getPropertyValue("view-transition-name")).toBe("");
    expect(to.style.getPropertyValue("view-transition-name")).toBe("cp-shared-result");
    await act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(to.style.getPropertyValue("view-transition-name")).toBe("");
  });

  it("never waits for the landing inside the update: it looks once, and leaves the name off when it is missing", async () => {
    configure("shared", "on");
    mount(<p>x</p>);
    const from = document.createElement("div");
    document.body.append(from);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const find = vi.fn(() => null);
    sharedTransition("cp-shared-result", from, () => {}, find);
    // The update's promise settles with no frame in between (Chromium runs none there).
    await act(async () => {
      await started[0]!();
    });
    expect(find).toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();
    expect(from.style.getPropertyValue("view-transition-name")).toBe("");
    raf.mockRestore();
  });

  it("does not add listeners that take clicks away from the page", async () => {
    configure("shared", "on");
    mount(<p>x</p>);
    const from = document.createElement("div");
    document.body.append(from);
    const add = vi.spyOn(document, "addEventListener");
    sharedTransition("cp-shared-result", from, () => {}, () => null);
    expect(add.mock.calls.filter(([type]) => ["click", "dblclick", "contextmenu"].includes(type))).toEqual([]);
    add.mockRestore();
  });

  it("is not started from inside an inert or leaving copy", () => {
    configure("shared", "on");
    mount(<p>x</p>);
    for (const attr of ["inert", "data-leaving"]) {
      const holder = document.createElement("div");
      holder.setAttribute(attr, "");
      const from = document.createElement("div");
      holder.append(from);
      document.body.append(holder);
      const update = vi.fn();
      expect(sharedTransition("cp-shared-result", from, update, () => null)).toBe(false);
      expect(update).toHaveBeenCalledTimes(1);
      expect(from.style.getPropertyValue("view-transition-name")).toBe("");
    }
    expect(started).toHaveLength(0);
  });

  for (const setup of ["off", "reduced"] as const) {
    it(`just makes the change (${setup})`, () => {
      configure("shared", setup);
      mount(<p>x</p>);
      const from = document.createElement("div");
      const update = vi.fn();
      expect(sharedTransition("cp-shared-result", from, update, () => null)).toBe(false);
      expect(update).toHaveBeenCalledTimes(1);
      expect(started).toHaveLength(0);
      expect(from.style.getPropertyValue("view-transition-name")).toBe("");
    });
  }

  it("just makes the change in a browser without the API", () => {
    configure("shared", "on");
    mount(<p>x</p>);
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    const update = vi.fn();
    expect(sharedTransition("cp-shared-result", document.createElement("div"), update, () => null)).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("makes the change once, with nothing to move from", () => {
    configure("shared", "on");
    mount(<p>x</p>);
    const update = vi.fn();
    sharedTransition("cp-shared-result", null, update, () => null);
    expect(update).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(0);
  });
});

// ---- exit never holds a control -------------------------------------------------------------

function motionOfSelector(css: string, selector: string): string {
  const at = css.indexOf(selector);
  const start = css.lastIndexOf("}", at) + 1;
  return css.slice(start, css.indexOf("}", at));
}

describe("exit: a closing dialog is held only as a still, inert copy", () => {
  function Host() {
    const [open, setOpen] = useState(true);
    const [behind, setBehind] = useState(0);
    return (
      <>
        <button type="button" onClick={() => setBehind((n) => n + 1)}>
          behind {behind}
        </button>
        <Modal open={open} title="Close me" onClose={() => setOpen(false)} primaryAction={{ label: "Done", onClick: () => setOpen(false) }}>
          <p>body</p>
        </Modal>
      </>
    );
  }

  it("goes at once when no CSS plays an exit (kind off, reduced, or no animation)", async () => {
    for (const setup of ["off", "reduced", "on"] as const) {
      configure("entrance", setup);
      const { unmount } = mount(<Host />);
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      // jsdom has no stylesheet, so there is no exit to wait for in any of the three.
      expect(screen.queryByRole("dialog")).toBeNull();
      unmount();
    }
  });

  it("stays while its exit plays, inert and without pointer events, and then goes", async () => {
    configure("entrance", "on");
    const real = window.getComputedStyle;
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo);
      return el instanceof HTMLElement && el.hasAttribute("data-leaving")
        ? ({ ...style, animationName: "cp-fade-out" } as unknown as CSSStyleDeclaration)
        : style;
    });
    mount(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    const leaving = document.querySelector(".cp-modal__backdrop") as HTMLElement;
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("data-leaving");
    expect(leaving).toHaveAttribute("inert");
    // A click on the leaving backdrop does nothing, and the control behind it takes a click.
    await userEvent.click(screen.getByRole("button", { name: /behind/, hidden: true }));
    expect(screen.getByRole("button", { name: "behind 1", hidden: true })).toBeInTheDocument();
    // The animation ends and it goes.
    await act(async () => {
      fireEvent.animationEnd(leaving);
    });
    expect(document.querySelector(".cp-modal__backdrop")).toBeNull();
    spy.mockRestore();
  });

  it("keeps the closing wheel popover as an inert copy that takes no clicks, and then removes it", async () => {
    configure("entrance", "on");
    const real = window.getComputedStyle;
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo);
      return el instanceof HTMLElement && el.hasAttribute("data-leaving")
        ? ({ ...style, animationName: "cp-fade-out" } as unknown as CSSStyleDeclaration)
        : style;
    });
    mount(<WheelButton />);
    await userEvent.click(screen.getByRole("button", { name: "Camelot wheel" }));
    expect(document.querySelector(".cp-wheel-pop")).not.toHaveAttribute("data-leaving");
    await act(async () => {
      closeWheel({ restoreFocus: false });
    });
    const leaving = document.querySelector(".cp-wheel-pop") as HTMLElement;
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("data-leaving");
    expect(leaving).toHaveAttribute("inert");
    await act(async () => {
      fireEvent.animationEnd(leaving);
    });
    expect(document.querySelector(".cp-wheel-pop")).toBeNull();
    spy.mockRestore();
  });

  it("closes the wheel popover at once with the kind off", async () => {
    configure("entrance", "off");
    mount(<WheelButton />);
    await userEvent.click(screen.getByRole("button", { name: "Camelot wheel" }));
    expect(document.querySelector(".cp-wheel-pop")).not.toBeNull();
    await act(async () => {
      closeWheel({ restoreFocus: false });
    });
    expect(document.querySelector(".cp-wheel-pop")).toBeNull();
  });

  it("gives the leaving wheel popover an exit and no pointer events in the stylesheet", () => {
    const css = Object.values(import.meta.glob("./motion.css", { query: "?raw", import: "default", eager: true })).join("\n");
    expect(css).toMatch(/\.cp-wheel-pop\[data-leaving\]/);
    expect(motionOfSelector(css, ".cp-wheel-pop[data-leaving]")).toContain("pointer-events: none");
  });

  it("leaves the closing dialog's stylesheet taking no pointer events", () => {
    configure("entrance", "on");
    const css = Object.values(import.meta.glob("./motion.css", { query: "?raw", import: "default", eager: true })).join("\n");
    expect(css).toMatch(/\.cp-modal__backdrop\[data-leaving\][^{]*\{\s*pointer-events: none/);
    expect(css).toMatch(/\[data-ghost\]\s*\{\s*pointer-events: none/);
  });
});

describe("exit: a toast leaves through the same hold", () => {
  it("is removed when dismissed with no exit to play", async () => {
    configure("entrance", "on");
    vi.useFakeTimers();
    mount(<PushesToast />);
    fireEvent.click(screen.getByText("push"));
    expect(screen.getByText("Saved it")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText("Saved it")).toBeNull();
    await Promise.resolve();
  });
});

// ---- the cut-off: nothing delays input -------------------------------------------------------

describe("no motion delays input", () => {
  it("lets a click on a button through at once, with every kind on", async () => {
    configure("micro", "on");
    const onClick = vi.fn();
    mount(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// ---- the kinds all have a place --------------------------------------------------------------

describe("every kind is built somewhere", () => {
  it("has at least one gated rule in the stylesheets or a script check", () => {
    const sheets = import.meta.glob<string>("./**/*.css", { query: "?raw", import: "default", eager: true });
    const sources = import.meta.glob<string>(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx", "!./test/**"], {
      query: "?raw",
      import: "default",
      eager: true,
    });
    // Settings' own previews name every kind, so they prove nothing.
    const own = Object.entries(sheets).filter(([file]) => !file.includes("motion-settings"));
    const text = [...own.map(([, css]) => css), ...Object.values(sources)].join("\n");
    for (const kind of MOTION_KINDS) {
      const used = text.includes(`data-motion-${kind.id}`) || text.includes(`useMotion("${kind.id}")`);
      expect(used, `${kind.id} is built nowhere`).toBe(true);
    }
  });
});

describe("state: a badge drawn for the first time does not move", () => {
  it("has no change mark until it changes", () => {
    configure("state", "on");
    const { container, rerender } = mount(<Badge variant="info">New</Badge>);
    expect(container.querySelector(".cp-badge")).not.toHaveAttribute("data-changed");
    rerender(
      <MemoryRouter>
        <ThemeProvider>
          <ScaleProvider>
            <MotionProvider>
              <ToastProvider>
                <Badge variant="info">New</Badge>
              </ToastProvider>
            </MotionProvider>
          </ScaleProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
    // The same words and kind: still nothing.
    expect(container.querySelector(".cp-badge")).not.toHaveAttribute("data-changed");
  });

  it("is not marked as changed with the kind off", () => {
    configure("state", "off");
    mount(<ChangingBadge />);
    fireEvent.click(screen.getByText("change"));
    expect(document.querySelector(".cp-badge")).not.toHaveAttribute("data-changed");
  });
});

describe("entrance: what is simply unmounted leaves as a still copy", () => {
  function stubRect(el: HTMLElement) {
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect;
  }

  it("is added inert, without ids or tab stops, and takes no pointer events", () => {
    const panel = document.createElement("div");
    panel.id = "panel";
    panel.innerHTML = '<button id="b" tabindex="0">Do</button>';
    document.body.append(panel);
    stubRect(panel);
    const real = window.getComputedStyle;
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo);
      return el.hasAttribute("data-ghost") ? ({ ...style, animationName: "cp-lift-out" } as unknown as CSSStyleDeclaration) : style;
    });
    const ghost = leaveAsGhost(panel)!;
    expect(ghost).not.toBeNull();
    expect(ghost.parentElement).toBe(document.body);
    expect(ghost).toHaveAttribute("inert");
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost.querySelector("[id]")).toBeNull();
    expect(ghost.hasAttribute("id")).toBe(false);
    expect(ghost.querySelector("[tabindex]")).toBeNull();
    expect(ghost.style.position).toBe("fixed");
    expect(ghost.style.left).toBe("10px");
    fireEvent.animationEnd(ghost);
    expect(ghost.isConnected).toBe(false);
    spy.mockRestore();
    panel.remove();
  });

  it("adds no copy when the kind is switched off while the thing is still open", async () => {
    configure("entrance", "on");
    const real = window.getComputedStyle;
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo);
      return el.hasAttribute("data-ghost") ? ({ ...style, animationName: "cp-lift-out" } as unknown as CSSStyleDeclaration) : style;
    });
    function Menu() {
      const ref = useRef<HTMLDivElement>(null);
      useLeaveGhost(ref);
      const { setKind } = useMotion();
      return (
        <>
          <div ref={ref} data-testid="menu">
            menu
          </div>
          <button type="button" onClick={() => setKind("entrance", false)}>
            off
          </button>
        </>
      );
    }
    const { unmount } = mount(<Menu />);
    stubRect(screen.getByTestId("menu"));
    // The switch goes off with the menu still open: nothing leaves.
    fireEvent.click(screen.getByText("off"));
    expect(document.querySelector("[data-ghost]")).toBeNull();
    unmount();
    spy.mockRestore();
  });

  it("adds nothing when the CSS plays no exit", () => {
    const panel = document.createElement("div");
    document.body.append(panel);
    stubRect(panel);
    expect(leaveAsGhost(panel)).toBeNull();
    expect(document.querySelector("[data-ghost]")).toBeNull();
    panel.remove();
  });
});

describe("feedback: the same refusal coming back shakes again", () => {
  it("replaces the problem line when the refusal count changes, and keeps it otherwise", () => {
    configure("feedback", "on");
    const set = { name: "Friday", notes: null };
    const dialog = (key: number) => (
      <SetNotesDialog set={set} error="Too long" errorKey={key} onSave={() => {}} onClose={() => {}} />
    );
    const { rerender } = mount(dialog(1));
    const first = document.querySelector(".prepare-dialog__problem");
    expect(first).not.toBeNull();
    const wrap = (ui: ReactElement) => (
      <MemoryRouter>
        <ThemeProvider>
          <ScaleProvider>
            <MotionProvider>
              <ToastProvider>{ui}</ToastProvider>
            </MotionProvider>
          </ScaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    rerender(wrap(dialog(1)));
    expect(document.querySelector(".prepare-dialog__problem")).toBe(first);
    rerender(wrap(dialog(2)));
    expect(document.querySelector(".prepare-dialog__problem")).not.toBe(first);
  });
});
