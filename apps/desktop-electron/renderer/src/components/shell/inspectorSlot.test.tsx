/**
 * The Inspector slot (LIBUI-10, DEC-024).
 *
 * The property that matters here is not what the Inspector shows — it is what
 * *does not happen* when a page fills it. Two versions of this looped:
 *
 * 1. Provider state. Setting the content re-rendered everything under the
 *    provider, the page built a fresh element, the effect set it again.
 * 2. A store, but subscribed from the shell component that renders the page.
 *    Same loop, one level up — and the tests missed it, because they rendered
 *    the Inspector as a *sibling* of the page. The app renders it in an
 *    ancestor, which is a different graph. React said so, in a packaged build:
 *    "Minified React error #185".
 *
 * So the shape below is the app's shape — `Shell` renders both the Inspector
 * and the page — and the outlet is what subscribes. Render counts are the
 * assertions, because the failure is a hang rather than a wrong pixel.
 */
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";

import {
  InspectorSlotOutlet,
  InspectorSlotProvider,
  useClearInspector,
  useInspectorContent,
  useInspectorSlot,
} from "./inspectorSlot";

function Inspector() {
  return <section aria-label="Inspector">{useInspectorContent()}</section>;
}

let pageRenders = 0;

/** A page whose Inspector content is built fresh on every render, as a real
 *  one's is — the element identity changes even when nothing else did. */
function Page({ label = "Nothing selected" }: { label?: string }) {
  pageRenders += 1;
  const [count, setCount] = useState(0);
  useInspectorSlot(
    <p>
      {label} ({count})
    </p>,
  );
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      bump
    </button>
  );
}

function mount(children: ReactNode) {
  pageRenders = 0;
  return render(
    <InspectorSlotProvider>
      {children}
      <Inspector />
    </InspectorSlotProvider>,
  );
}

let shellRenders = 0;

/** The app's arrangement: one component renders the Inspector *and* the page. */
function Shell({ children }: { children: ReactNode }) {
  shellRenders += 1;
  return (
    <>
      <section aria-label="Inspector">
        <InspectorSlotOutlet fallback={<p>Nothing to show</p>} />
      </section>
      {children}
    </>
  );
}

describe("the slot in the shell's own shape", () => {
  it("settles when the Inspector is rendered above the page", async () => {
    // The regression test for React #185. With the subscription in `Shell`
    // instead of the outlet, this never returns.
    shellRenders = 0;
    pageRenders = 0;
    render(
      <InspectorSlotProvider>
        <Shell>
          <Page />
        </Shell>
      </InspectorSlotProvider>,
    );

    expect(await screen.findByText(/Nothing selected \(0\)/)).toBeInTheDocument();
    expect(shellRenders).toBeLessThan(5);
    expect(pageRenders).toBeLessThan(5);
  });

  it("still settles when the page changes what it is showing", async () => {
    shellRenders = 0;
    pageRenders = 0;
    render(
      <InspectorSlotProvider>
        <Shell>
          <Page />
        </Shell>
      </InspectorSlotProvider>,
    );
    await screen.findByText(/Nothing selected \(0\)/);
    const settled = shellRenders;

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "bump" }));
    });

    expect(await screen.findByText(/Nothing selected \(1\)/)).toBeInTheDocument();
    // The shell does not re-render at all: the content changed below it.
    expect(shellRenders).toBe(settled);
  });

  it("shows the shell's fallback until a page fills it", () => {
    render(
      <InspectorSlotProvider>
        <Shell>{null}</Shell>
      </InspectorSlotProvider>,
    );

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });
});

describe("the Inspector slot", () => {
  it("settles after filling the Inspector, rather than re-rendering forever", async () => {
    mount(<Page />);

    expect(await screen.findByText(/Nothing selected \(0\)/)).toBeInTheDocument();
    // Two renders is React's strict-mode double invoke; the loop this guards
    // against produced thousands and never returned.
    expect(pageRenders).toBeLessThan(5);
  });

  it("does not re-render the page when the content changes", async () => {
    mount(<Page />);
    await screen.findByText(/Nothing selected \(0\)/);
    const settled = pageRenders;

    await userEvent.click(screen.getByRole("button", { name: "bump" }));

    expect(await screen.findByText(/Nothing selected \(1\)/)).toBeInTheDocument();
    // One render for the click's own state, and none caused by the slot: the
    // Inspector is downstream of the page, never upstream of it.
    expect(pageRenders - settled).toBeLessThan(4);
  });

  it("shows what the page put there", async () => {
    mount(<Page label="Track 7" />);

    const inspector = await screen.findByRole("region", { name: "Inspector" });
    expect(inspector).toHaveTextContent("Track 7");
  });

  it("empties when the page unmounts", async () => {
    const view = mount(<Page label="Track 7" />);
    await screen.findByText(/Track 7/);

    view.rerender(
      <InspectorSlotProvider>
        <Inspector />
      </InspectorSlotProvider>,
    );

    // Otherwise the Inspector keeps describing a track from a screen the user
    // has left.
    expect(screen.queryByText(/Track 7/)).toBeNull();
  });

  it("lets the last page to speak win", async () => {
    mount(
      <>
        <Page label="First" />
        <Page label="Second" />
      </>,
    );

    const inspector = await screen.findByRole("region", { name: "Inspector" });
    expect(inspector).toHaveTextContent("Second");
    expect(inspector).not.toHaveTextContent("First");
  });

  it("can be emptied by the page itself", async () => {
    function Clearer() {
      const clear = useClearInspector();
      useInspectorSlot(<p>Track 7</p>);
      return (
        <button type="button" onClick={clear}>
          clear
        </button>
      );
    }
    render(
      <InspectorSlotProvider>
        <Clearer />
        <Inspector />
      </InspectorSlotProvider>,
    );
    await screen.findByText("Track 7");

    await userEvent.click(screen.getByRole("button", { name: "clear" }));

    expect(screen.queryByText("Track 7")).toBeNull();
  });

  it("does nothing at all outside a provider", () => {
    // A page rendered on its own — in a test, or in a shell that has no
    // Inspector — must not throw for wanting one.
    function Lonely() {
      useInspectorSlot(<p>Track 7</p>);
      return <p>page</p>;
    }
    expect(() => render(<Lonely />)).not.toThrow();
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("reads as empty outside a provider", () => {
    render(<Inspector />);

    expect(screen.getByRole("region", { name: "Inspector" })).toBeEmptyDOMElement();
  });

  it("wakes the Inspector and nothing else when the content changes", async () => {
    // What the store is for: the Inspector re-renders, the page does not. The
    // earlier version of this test counted renders after re-setting the *same*
    // element and passed either way — React's own snapshot comparison did the
    // work, so it proved nothing about this file.
    let inspectorRenders = 0;
    function CountingInspector() {
      inspectorRenders += 1;
      return <section aria-label="Inspector">{useInspectorContent()}</section>;
    }
    pageRenders = 0;
    render(
      <InspectorSlotProvider>
        <Page />
        <CountingInspector />
      </InspectorSlotProvider>,
    );
    await screen.findByText(/Nothing selected \(0\)/);
    const inspectorSettled = inspectorRenders;
    const pageSettled = pageRenders;

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "bump" }));
    });

    await screen.findByText(/Nothing selected \(1\)/);
    expect(inspectorRenders).toBeGreaterThan(inspectorSettled);
    // The page's own click state re-rendered it once; the slot added nothing.
    expect(pageRenders - pageSettled).toBeLessThan(4);
  });

});
