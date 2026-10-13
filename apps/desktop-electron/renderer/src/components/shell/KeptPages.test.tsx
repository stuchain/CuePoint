/**
 * Visited pages stay alive behind the current one.
 *
 * The harness is the shell's shape: a nav, the one `.app-main` the pages share, and an
 * Inspector outside it. Pages are small stand-ins for what matters here (local state, a
 * poll, an opening that is token-guarded, an Inspector slot), so each assertion is about
 * the keeping and not about any one screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MemoryRouter, Navigate, Route, useLocation, useNavigate, useParams } from "react-router-dom";

import { InspectorSlotOutlet, InspectorSlotProvider, useInspectorSlot } from "./inspectorSlot";
import { KeptPages, type KeptSlot } from "./KeptPages";
import { queryShown, usePageActive } from "./pageActive";
import { getSelectedTrack, setSelectedTrack } from "./selectedTrack";
import { useReportSelectedTrack } from "./useReportSelectedTrack";

function Counter({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  const active = usePageActive();
  const location = useLocation();
  return (
    <section aria-label={name}>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        bump {name}
      </button>
      <p>
        {name} count {count}
      </p>
      <p>
        {name} active {String(active)}
      </p>
      <p>
        {name} at {location.pathname}
      </p>
    </section>
  );
}

function Ticker() {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTicks((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <p>ticks {ticks}</p>;
}

const opened: string[] = [];

/** Spends an opening once per token, as Clean and Keys do. */
function Opening() {
  const location = useLocation();
  const token = (location.state as { token?: string } | null)?.token ?? null;
  const applied = useRef<string | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (token === null || applied.current === token) return;
    applied.current = token;
    opened.push(token);
    setCount((value) => value + 1);
  }, [token]);
  return <p>applied {count}</p>;
}

let rendersOfPlain = 0;

function CountedPage() {
  rendersOfPlain += 1;
  return <p>counted page</p>;
}

function Param({ name }: { name: string }) {
  const { id } = useParams();
  return (
    <p>
      {name} param {id}
    </p>
  );
}

/** Reaches a hidden page the way a context change does: it needs no effect. */
const BreakContext = createContext(false);

function Fragile() {
  if (useContext(BreakContext)) throw new Error("fragile page broke");
  return <p>fragile fine</p>;
}

function InspectorPage({ label, id }: { label: string; id: string }) {
  useInspectorSlot(<p>inspecting {label}</p>);
  useReportSelectedTrack({ id, key: "8A" });
  return <p>{label} page</p>;
}

const route = (path: string, element: ReactNode) => () => <Route path={path} element={element} />;

const SLOTS: KeptSlot[] = [
  { id: "one", paths: ["/one"], routes: route("/one", <Counter name="One" />) },
  {
    id: "two",
    paths: ["/two", "/two/:id"],
    routes: () => (
      <>
        <Route path="/two" element={<Counter name="Two" />} />
        <Route path="/two/:id" element={<Param name="Two" />} />
      </>
    ),
  },
  { id: "tick", paths: ["/tick"], routes: route("/tick", <Ticker />) },
  { id: "open", paths: ["/open"], routes: route("/open", <Opening />) },
  { id: "fragile", paths: ["/fragile"], routes: route("/fragile", <Fragile />) },
  { id: "a", paths: ["/a"], routes: route("/a", <InspectorPage label="A" id="track-a" />) },
  { id: "b", paths: ["/b"], routes: route("/b", <InspectorPage label="B" id="track-b" />) },
  { id: "plain", paths: ["/plain"], routes: route("/plain", <p>plain page</p>) },
  {
    // Prepare's shape: the destination's own path hands on to the last page it showed.
    id: "set",
    paths: ["/set", "/set/:id"],
    routes: () => (
      <>
        <Route path="/set" element={<Navigate to="/set/5" replace />} />
        <Route path="/set/:id" element={<Param name="Set" />} />
      </>
    ),
  },
  {
    id: "menu",
    paths: ["/menu"],
    routes: route(
      "/menu",
      <div role="menu" aria-label="left open">
        menu
      </div>,
    ),
  },
  { id: "counted", paths: ["/counted"], routes: () => <Route path="/counted" element={<CountedPage />} /> },
];

const UNOWNED = (
  <>
    <Route path="/old" element={<Navigate to="/one" replace />} />
    <Route path="*" element={<Navigate to="/one" replace />} />
  </>
);

function Nav({ onBreak, onMend }: { onBreak: () => void; onMend: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav>
      <p data-testid="at">{location.pathname}</p>
      {["one", "two", "tick", "open", "fragile", "a", "b", "plain", "set", "menu", "old", "nowhere"].map((id) => (
        <button key={id} type="button" onClick={() => navigate(`/${id}`)}>
          go {id}
        </button>
      ))}
      <button type="button" onClick={onBreak}>
        break
      </button>
      <button type="button" onClick={onMend}>
        mend
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
      <button type="button" onClick={() => navigate("/two/7")}>
        go two 7
      </button>
      <button type="button" onClick={() => navigate("/two/8")}>
        go two 8
      </button>
      <button type="button" onClick={() => navigate("/open", { state: { token: "t1" } })}>
        open t1
      </button>
      <button type="button" onClick={() => navigate("/open", { state: { token: "t2" } })}>
        open t2
      </button>
      <button type="button" onClick={() => navigate("/open", { replace: true, state: null })}>
        spend opening
      </button>
      <button type="button" onClick={() => navigate("/plain", { state: { token: "x" } })}>
        go plain with state
      </button>
    </nav>
  );
}

function Harness({ start, broken }: { start: string; broken: boolean }) {
  const [breaking, setBreaking] = useState(broken);
  return (
    <MemoryRouter initialEntries={[start]}>
      <InspectorSlotProvider>
        <BreakContext.Provider value={breaking}>
          <Nav onBreak={() => setBreaking(true)} onMend={() => setBreaking(false)} />
          <main className="app-main">
            <KeptPages slots={SLOTS} unowned={UNOWNED} />
          </main>
        </BreakContext.Provider>
        <aside aria-label="Inspector">
          <InspectorSlotOutlet fallback={<p>nothing inspected</p>} />
        </aside>
      </InspectorSlotProvider>
    </MemoryRouter>
  );
}

function mount(start = "/one", broken = false) {
  return render(<Harness start={start} broken={broken} />);
}

const go = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole("button", { name: `go ${name}` }));

/** A page behind the current one is mounted, but not drawn. */
const hidden = (element: HTMLElement) => expect(element).not.toBeVisible();

describe("KeptPages", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    opened.length = 0;
    rendersOfPlain = 0;
    setSelectedTrack(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not draw a hidden page again when the shell is drawn", async () => {
    const user = userEvent.setup();
    mount("/counted");
    await go(user, "one");
    const before = rendersOfPlain;

    // The harness draws again, handing KeptPages fresh slots.
    await user.click(screen.getByRole("button", { name: "break" }));

    expect(rendersOfPlain).toBe(before);
  });

  it("keeps a visited page's local state across a round trip", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "bump One" }));
    await user.click(screen.getByRole("button", { name: "bump One" }));

    await go(user, "plain");
    hidden(screen.getByText("One count 2"));
    await go(user, "one");

    expect(screen.getByText("One count 2")).toBeVisible();
  });

  it("does not mount a destination until it is first opened", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByText("plain page")).toBeNull();

    await go(user, "plain");

    expect(screen.getByText("plain page")).toBeVisible();
  });

  it("stops a hidden page's poll and starts it again when the page is shown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount("/tick");
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText("ticks 3")).toBeVisible();

    await go(user, "plain");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByText("ticks 3")).toBeInTheDocument();

    await go(user, "tick");
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByText("ticks 5")).toBeVisible();
  });

  it("says whether the page is the one on screen", async () => {
    const user = userEvent.setup();
    mount();
    await go(user, "two");

    expect(screen.getByText("Two active true")).toBeVisible();
    expect(screen.getByText("One active false")).toBeInTheDocument();
    hidden(screen.getByText("One active false"));

    await go(user, "one");
    expect(screen.getByText("One active true")).toBeVisible();
    expect(screen.getByText("Two active false")).toBeInTheDocument();
  });

  it("counts a page rendered outside any slot as shown", () => {
    function Probe() {
      return <p>probe {String(usePageActive())}</p>;
    }
    render(<Probe />);
    expect(screen.getByText("probe true")).toBeInTheDocument();
  });

  it("gives a hidden page the location it last had, not the app's", async () => {
    const user = userEvent.setup();
    mount();
    await go(user, "two");
    await go(user, "one");

    expect(screen.getByText("Two at /two")).toBeInTheDocument();
    expect(screen.getByTestId("at")).toHaveTextContent("/one");
  });

  it("keeps a page's params while it is hidden", async () => {
    const user = userEvent.setup();
    mount("/two/7");
    expect(screen.getByText("Two param 7")).toBeVisible();

    await go(user, "one");

    expect(screen.getByText("Two param 7")).toBeInTheDocument();
    hidden(screen.getByText("Two param 7"));
    await go(user, "two 8");
    expect(screen.getByText("Two param 8")).toBeVisible();
    expect(screen.queryByText("Two param 7")).toBeNull();
  });

  it("applies an opening sent to a mounted page once, and not again when it is shown", async () => {
    const user = userEvent.setup();
    mount("/plain");
    await go(user, "open");
    expect(screen.getByText("applied 0")).toBeVisible();

    await go(user, "plain");
    await user.click(screen.getByRole("button", { name: "open t1" }));
    expect(screen.getByText("applied 1")).toBeVisible();

    await go(user, "plain");
    await go(user, "open");
    expect(screen.getByText("applied 1")).toBeVisible();
    expect(opened).toEqual(["t1"]);

    await go(user, "plain");
    await user.click(screen.getByRole("button", { name: "open t2" }));
    expect(screen.getByText("applied 2")).toBeVisible();
    expect(opened).toEqual(["t1", "t2"]);
  });

  describe("scroll", () => {
    let top = 0;
    let main: HTMLElement;

    function track() {
      main = document.querySelector(".app-main") as HTMLElement;
      top = 0;
      Object.defineProperty(main, "scrollTop", {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          top = value;
        },
      });
    }

    const scrollTo = (value: number) => {
      top = value;
      act(() => {
        main.dispatchEvent(new Event("scroll"));
      });
    };

    it("starts a first visit at the top", async () => {
      const user = userEvent.setup();
      mount();
      track();
      scrollTo(300);

      await go(user, "plain");

      expect(main.scrollTo).toHaveBeenLastCalledWith(0, 0);
      expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
    });

    it("puts the position back on return", async () => {
      const user = userEvent.setup();
      mount();
      track();
      scrollTo(300);
      await go(user, "plain");
      top = 0;
      await go(user, "one");

      expect(top).toBe(300);
    });

    it("keeps each page's own position", async () => {
      const user = userEvent.setup();
      mount();
      track();
      scrollTo(300);
      await go(user, "plain");
      scrollTo(40);
      await go(user, "one");
      expect(top).toBe(300);
      await go(user, "plain");
      expect(top).toBe(40);
    });

    it("starts at the top when a navigation carries state", async () => {
      const user = userEvent.setup();
      mount("/plain");
      track();
      await go(user, "one");
      scrollTo(300);
      await go(user, "plain");
      scrollTo(120);
      await go(user, "one");
      (main.scrollTo as ReturnType<typeof vi.fn>).mockClear();

      await go(user, "plain with state");

      expect(main.scrollTo).toHaveBeenLastCalledWith(0, 0);
    });

    it("leaves the position alone when an opening's state is only cleared", async () => {
      const user = userEvent.setup();
      mount("/open");
      track();
      await user.click(screen.getByRole("button", { name: "open t1" }));
      scrollTo(200);
      (main.scrollTo as ReturnType<typeof vi.fn>).mockClear();

      await user.click(screen.getByRole("button", { name: "spend opening" }));

      expect(main.scrollTo).not.toHaveBeenCalled();
      expect(top).toBe(200);
    });

    it("starts at the top on another page of the same destination, and finds each again", async () => {
      const user = userEvent.setup();
      mount("/two/7");
      track();
      scrollTo(300);
      (main.scrollTo as ReturnType<typeof vi.fn>).mockClear();

      await go(user, "two 8");
      expect(main.scrollTo).toHaveBeenLastCalledWith(0, 0);
      scrollTo(50);

      await go(user, "two 7");
      expect(top).toBe(300);
    });

    it("finds the place again when the destination's own path hands on to its last page", async () => {
      const user = userEvent.setup();
      mount("/set/5");
      track();
      scrollTo(300);
      await go(user, "one");
      top = 0;

      await go(user, "set");

      expect(screen.getByTestId("at")).toHaveTextContent("/set/5");
      expect(top).toBe(300);
    });

    it("puts the position back on Back to a page that was opened with state", async () => {
      const user = userEvent.setup();
      mount("/one");
      track();
      await go(user, "plain with state");
      scrollTo(250);
      await go(user, "one");
      top = 0;

      await user.click(screen.getByRole("button", { name: "back" }));

      expect(screen.getByTestId("at")).toHaveTextContent("/plain");
      expect(top).toBe(250);
    });
  });

  describe("a page that throws", () => {
    it("gets a fresh try when it is opened again, and leaves no error screen behind", async () => {
      const user = userEvent.setup();
      mount("/fragile", true);
      expect(screen.getByTestId("error-screen")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "mend" }));
      await go(user, "one");
      expect(screen.queryByTestId("error-screen")).toBeNull();

      await go(user, "fragile");
      expect(screen.getByText("fragile fine")).toBeVisible();
    });

    it("does not blank the shown page, and shows its error screen when shown", async () => {
      const user = userEvent.setup();
      mount("/fragile");
      expect(screen.getByText("fragile fine")).toBeVisible();
      await go(user, "one");

      await user.click(screen.getByRole("button", { name: "break" }));
      expect(screen.getByText("One count 0")).toBeVisible();
      expect(screen.getByTestId("error-screen")).not.toBeVisible();

      await go(user, "fragile");
      expect(screen.getByTestId("error-screen")).toBeVisible();
      await go(user, "one");
      expect(screen.getByText("One count 0")).toBeVisible();
      expect(screen.getByTestId("error-screen")).not.toBeVisible();
    });

    it("keeps the shown page when another one is already broken", async () => {
      const user = userEvent.setup();
      mount("/fragile", true);
      expect(screen.getByTestId("error-screen")).toBeVisible();

      await go(user, "one");
      expect(screen.getByText("One count 0")).toBeVisible();
      expect(screen.getByTestId("error-screen")).not.toBeVisible();
    });
  });

  describe("what is on screen", () => {
    it("does not count a menu left open in a hidden page", async () => {
      const user = userEvent.setup();
      mount("/menu");
      expect(queryShown('[role="menu"]')).not.toBeNull();

      await go(user, "one");
      expect(document.querySelector('[role="menu"]')).not.toBeNull();
      expect(queryShown('[role="menu"]')).toBeNull();
    });
  });

  describe("the Inspector", () => {
    it("clears on hide and comes back on show, with the selected track", async () => {
      const user = userEvent.setup();
      mount("/a");
      expect(screen.getByText("inspecting A")).toBeVisible();
      expect(getSelectedTrack()).toEqual({ id: "track-a", key: "8A" });

      await go(user, "b");
      expect(screen.queryByText("inspecting A")).toBeNull();
      expect(screen.getByText("inspecting B")).toBeVisible();
      expect(getSelectedTrack()).toEqual({ id: "track-b", key: "8A" });

      await go(user, "plain");
      expect(screen.getByText("nothing inspected")).toBeVisible();
      expect(getSelectedTrack()).toBeNull();

      await go(user, "a");
      expect(screen.getByText("inspecting A")).toBeVisible();
      expect(screen.queryByText("inspecting B")).toBeNull();
      expect(getSelectedTrack()).toEqual({ id: "track-a", key: "8A" });
    });
  });

  describe("paths no destination owns", () => {
    it("redirects a retired path and an unknown one", async () => {
      const user = userEvent.setup();
      mount("/plain");
      await go(user, "old");
      expect(screen.getByTestId("at")).toHaveTextContent("/one");
      await go(user, "plain");
      await go(user, "nowhere");
      expect(screen.getByTestId("at")).toHaveTextContent("/one");
      expect(screen.getByText("One count 0")).toBeVisible();
    });

    it("sends an address under a destination that matches none of its routes home", async () => {
      mount("/two/7/extra");
      expect(await screen.findByText("One count 0")).toBeVisible();
      expect(screen.getByTestId("at")).toHaveTextContent("/one");
    });
  });
});
