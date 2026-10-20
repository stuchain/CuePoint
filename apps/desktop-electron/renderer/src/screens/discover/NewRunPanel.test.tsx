/**
 * New dig's scope fields and its dig bar: saved artist and label lists, the
 * editor that changes them, and the bar that starts the dig.
 *
 * Against a faked bridge that keeps lists the way the engine does (a name is
 * unique within its kind, members in order), so the flows are the real ones:
 * pick a list, edit it, make a new one, rename and delete, and see the dig ask
 * for the list's names.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type {
  DiscoverAnswer,
  DiscoverList,
  DiscoverListKind,
  DiscoverOptions,
  DiscoverRunRequest,
} from "../../api/cuepointBridge.types";
import { ScaleProvider } from "../../tokens/ScaleContext";
import fixture from "./discoverPage.fixture.json";
import { NewRunPanel } from "./NewRunPanel";
import { formatIsoRange } from "./discoverFormat";
import css from "./discover.css?raw";
import { resetIncludeUserChartsForTests, saveIncludeUserCharts } from "./includeUserCharts";

const OPTIONS = fixture.options_ok.value as unknown as DiscoverOptions;

const ok = <T,>(value: T): DiscoverAnswer<T> => ({ value, refusal: null });
const refused = <T,>(code: string, message: string): DiscoverAnswer<T> =>
  ({
    value: null,
    refusal: { code, message, reason: null, retry_after: null, job_id: null, job_type: null },
  }) as unknown as DiscoverAnswer<T>;

let stored: DiscoverList[];
let nextId: number;
let bridge: Record<string, ReturnType<typeof vi.fn>>;

function list(kind: DiscoverListKind, name: string, members: string[]): DiscoverList {
  return {
    id: nextId++,
    kind,
    name,
    members,
    created_at: "2026-10-14T10:00:00+00:00",
    updated_at: "2026-10-14T10:00:00+00:00",
  };
}

function install(initial: DiscoverList[]) {
  stored = initial;
  bridge = {
    getDiscoverLists: vi.fn(async () => ok({ lists: [...stored] })),
    createDiscoverList: vi.fn(
      async (p: { kind: DiscoverListKind; name: string; members: string[] }) => {
        if (stored.some((l) => l.kind === p.kind && l.name.toLowerCase() === p.name.trim().toLowerCase())) {
          return refused("DISCOVER_LIST_NAME_TAKEN", 'Another list of this kind already has that name');
        }
        const made = list(p.kind, p.name.trim(), p.members);
        stored = [...stored, made];
        return ok(made);
      },
    ),
    updateDiscoverList: vi.fn(
      async (p: { list_id: number; name?: string; members?: string[] }) => {
        const found = stored.find((l) => l.id === p.list_id);
        if (!found) return refused("DISCOVER_LIST_NOT_FOUND", `No saved list ${p.list_id}`);
        if (
          p.name !== undefined &&
          stored.some(
            (l) => l.id !== found.id && l.kind === found.kind && l.name.toLowerCase() === p.name!.toLowerCase(),
          )
        ) {
          return refused("DISCOVER_LIST_NAME_TAKEN", 'Another list of this kind already has that name');
        }
        const changed = { ...found, name: p.name ?? found.name, members: p.members ?? found.members };
        stored = stored.map((l) => (l.id === found.id ? changed : l));
        return ok(changed);
      },
    ),
    deleteDiscoverList: vi.fn(async (p: { list_id: number }) => {
      stored = stored.filter((l) => l.id !== p.list_id);
      return ok({ id: p.list_id, deleted: true });
    }),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

const onStart = vi.fn(async (_request: DiscoverRunRequest) => null);

async function renderPanel(props: { busy?: boolean; usable?: boolean } = {}) {
  render(
    <ScaleProvider>
      <NewRunPanel
        options={OPTIONS}
        usable={props.usable ?? true}
        unusableReason={props.usable === false ? "Sign in to Beatport." : null}
        busy={props.busy ?? false}
        onStart={onStart}
      />
    </ScaleProvider>,
  );
  await waitFor(() => expect(bridge.getDiscoverLists).toHaveBeenCalled());
  return screen.getByRole("region", { name: "New dig" });
}

const group = (panel: HTMLElement, name: "Artists" | "Labels") =>
  within(panel).getByRole("group", { name });

beforeEach(() => {
  nextId = 1;
  onStart.mockClear();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  localStorage.clear();
  resetIncludeUserChartsForTests();
});

describe("charts by regular Beatport users", () => {
  it("are left out of the dig by default, and the note says so", async () => {
    install([]);
    const panel = await renderPanel();
    expect(within(panel).getByText(/reads charts by artists\. Settings/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "House" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(onStart.mock.calls[0]![0]).not.toHaveProperty("include_user_charts");
  });

  it("go with the dig request once Settings includes them", async () => {
    install([]);
    saveIncludeUserCharts(true);
    const panel = await renderPanel();
    expect(within(panel).getByText(/by artists and by regular Beatport users/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "House" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({ genre_ids: [5], include_user_charts: true }),
      ),
    );
  });
});

describe("the dig bar", () => {
  it("sits under the form, saying in a sentence what the dig covers", async () => {
    install([]);
    const panel = await renderPanel();
    const bar = within(panel).getByRole("group", { name: "Start a dig" });
    expect(bar).toHaveTextContent(
      "Look for charts in 0 genres, releases by 3 artists and 2 labels from the last 30 days.",
    );
    expect(bar).toHaveTextContent("Dates");
    expect(bar).toContainElement(within(panel).getByRole("button", { name: "Start looking" }));
    // Not pinned to the window's foot: it follows the form inside the scrolling body.
    expect(panel.lastElementChild).not.toBe(bar);
    const grid = panel.querySelector(".discover-new__grid");
    expect(grid?.compareDocumentPosition(bar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("is one line pinned at the foot of the form: the sentence cut short, the dates and Start", async () => {
    install([]);
    const panel = await renderPanel();
    const bar = within(panel).getByRole("group", { name: "Start a dig" });
    const summary = bar.querySelector(".discover-new__summary") as HTMLElement;
    // Cut with an ellipsis: the app hint shows the whole sentence, so no native title is set.
    expect(summary).toHaveAttribute("data-cut-hint");
    expect(summary).not.toHaveAttribute("title");
    expect(summary.textContent).toContain("Look for charts in 0 genres");
    expect(css).toMatch(/\.discover-new__bar \{[^}]*position: sticky[^}]*bottom: 0/);
    // Flush with the bottom of the scroller (a sticky bar stops at the scroller's padding edge, so
    // the body has none), and the page's one panel bar: no accent tint, no raw border.
    const body = /\.discover-new__body \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(body).toMatch(/padding: 0;/);
    expect(body).not.toMatch(/padding-bottom|padding: 0 0 var/);
    const barRule = /\.discover-new__bar \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(barRule).toContain("background: var(--bg-panel)");
    expect(barRule).toContain("min-height: var(--toolbar-height)");
    expect(barRule).not.toMatch(/accent|color-mix|border: 1px/);
    expect(css).toMatch(/\.discover-new__summary \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/);
    expect(bar).toContainElement(within(panel).getByLabelText("From"));
    expect(bar).toContainElement(within(panel).getByLabelText("To"));
    expect(bar).toHaveTextContent("Dates");
  });

  it("leaves out the releases it will not look for, and follows the dates", async () => {
    install([]);
    const panel = await renderPanel();
    const bar = within(panel).getByRole("group", { name: "Start a dig" });
    fireEvent.click(within(panel).getByRole("radio", { name: "No artists" }));
    expect(bar).toHaveTextContent("Look for charts in 0 genres, releases by 2 labels from the last 30 days.");
    fireEvent.click(within(panel).getByRole("radio", { name: "No labels" }));
    // Only charts are looked for, and the window is still said.
    expect(bar).toHaveTextContent(/^Look for charts in 0 genres from the last 30 days\.Dates/);
    fireEvent.click(within(panel).getByRole("radio", { name: "Every label in your library (2)" }));
    fireEvent.change(within(panel).getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.change(within(panel).getByLabelText("To"), { target: { value: "2026-09-30" } });
    // Text content is read with its spaces made plain; the range holds no-break ones (new L).
    expect(bar).toHaveTextContent(`from ${formatIsoRange("2026-09-01", "2026-09-30").replace(/\u00a0/g, " ")}.`);
  });

  it("counts a genre as the box is ticked, and says one in the singular", async () => {
    install([]);
    const panel = await renderPanel();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "House" }));
    expect(within(panel).getByRole("group", { name: "Start a dig" })).toHaveTextContent(
      "Look for charts in 1 genre, releases by 3 artists and 2 labels",
    );
  });

  it("holds one From and To pick in the bar, and the old fields are gone", async () => {
    install([]);
    const panel = await renderPanel();
    const bar = within(panel).getByRole("group", { name: "Start a dig" });
    const from = within(panel).getByLabelText("From");
    const to = within(panel).getByLabelText("To");
    expect(from).toHaveValue(OPTIONS.defaults.charts_from);
    expect(to).toHaveValue(OPTIONS.defaults.charts_to);
    expect(bar).toContainElement(from);
    expect(bar).toContainElement(to);
    expect(within(panel).queryByText("More options")).toBeNull();
    expect(within(panel).queryByLabelText("Charts from")).toBeNull();
    expect(within(panel).queryByLabelText("Releases from the last (days)")).toBeNull();
  });

  it("edits the dates with no genre chosen, and sends one window for charts and releases", async () => {
    install([]);
    const panel = await renderPanel();
    const from = within(panel).getByLabelText("From");
    expect(from).toBeEnabled();
    expect(within(panel).getByLabelText("To")).toBeEnabled();
    fireEvent.change(from, { target: { value: "2026-09-01" } });
    fireEvent.change(within(panel).getByLabelText("To"), { target: { value: "2026-09-30" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    const request = onStart.mock.calls[0][0];
    expect(request).toMatchObject({ releases_from: "2026-09-01", releases_to: "2026-09-30" });
    expect(request).not.toHaveProperty("new_releases_days");
    expect(request).not.toHaveProperty("charts_from");

    fireEvent.click(within(panel).getByRole("checkbox", { name: "House" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(2));
    expect(onStart.mock.calls[1][0]).toMatchObject({
      charts_from: "2026-09-01",
      charts_to: "2026-09-30",
      releases_from: "2026-09-01",
      releases_to: "2026-09-30",
    });
  });

  it("refuses dates the engine would, beside the button", async () => {
    install([]);
    const panel = await renderPanel();
    fireEvent.change(within(panel).getByLabelText("From"), { target: { value: "" } });
    expect(within(panel).getByText("Give both dates as dates.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Start looking" })).toBeDisabled();
  });

  it("says why it cannot start, and that a dig is already running", async () => {
    install([]);
    const panel = await renderPanel({ usable: false });
    expect(within(panel).getByText("Sign in to Beatport.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Start looking" })).toBeDisabled();
  });
});

describe("saved lists in the scope fields", () => {
  it("offers every, a saved list and none, for artists and for labels", async () => {
    install([list("artist", "Peak time", ["Kiko", "DJEFF"]), list("label", "Small labels", ["Cold Room"])]);
    const panel = await renderPanel();
    for (const [name, noun] of [
      ["Artists", "artist"],
      ["Labels", "label"],
    ] as const) {
      const field = group(panel, name);
      expect(within(field).getByRole("radio", { name: `Every ${noun} in your library (${noun === "artist" ? 3 : 2})` })).toBeChecked();
      expect(within(field).getByRole("radio", { name: "A saved list:" })).not.toBeChecked();
      expect(within(field).getByRole("radio", { name: `No ${noun}s` })).not.toBeChecked();
      expect(within(field).getByRole("button", { name: `New ${noun} list` })).toBeInTheDocument();
      expect(within(field).queryByRole("radio", { name: /Only the/ })).toBeNull();
    }
  });

  it("names each field's buttons apart, so a screen reader can tell them", async () => {
    install([]);
    const panel = await renderPanel();
    for (const name of ["Edit artist list", "Edit label list", "New artist list", "New label list"]) {
      expect(within(panel).getAllByRole("button", { name })).toHaveLength(1);
    }
  });

  it("shows only its own kind's lists, each with its count", async () => {
    install([
      list("artist", "Peak time", ["Kiko", "DJEFF"]),
      list("artist", "Warm-up", ["Mara Veil"]),
      list("label", "Small labels", ["Cold Room"]),
    ]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    await waitFor(() => expect(within(artists).getByRole("option", { name: "Peak time · 2" })).toBeInTheDocument());
    expect(within(artists).getByRole("option", { name: "Warm-up · 1" })).toBeInTheDocument();
    expect(within(artists).queryByRole("option", { name: /Small labels/ })).toBeNull();
    expect(within(group(panel, "Labels")).getByRole("option", { name: "Small labels · 1" })).toBeInTheDocument();
  });

  it("says there are none yet, and keeps Edit… for a list that exists", async () => {
    install([]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    expect(within(artists).getByRole("option", { name: "No saved lists yet" })).toBeInTheDocument();
    expect(within(artists).getByRole("combobox", { name: "Saved artist list" })).toBeDisabled();
    expect(within(artists).getByRole("button", { name: "Edit artist list" })).toBeDisabled();
  });

  it("chooses the first list with the radio, and asks the engine for that list's names", async () => {
    install([list("artist", "Peak time", ["Kiko", "DJEFF"])]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    await waitFor(() => expect(within(artists).getByRole("combobox")).toBeEnabled());
    fireEvent.click(within(artists).getByRole("radio", { name: "A saved list:" }));
    expect(within(panel).getByRole("group", { name: "Start a dig" })).toHaveTextContent(
      "Look for charts in 0 genres, releases by 2 artists and 2 labels",
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        genre_ids: [],
        releases_from: OPTIONS.defaults.charts_from,
        releases_to: OPTIONS.defaults.charts_to,
        artists: ["Kiko", "DJEFF"],
        labels: null,
      }),
    );
  });

  it("switches to the saved list when one is picked from the drop-down", async () => {
    install([list("label", "A", ["Cold Room"]), list("label", "B", ["NIGHTFALL-AUDIO", "Cold Room"])]);
    const panel = await renderPanel();
    const labels = group(panel, "Labels");
    await waitFor(() => expect(within(labels).getByRole("combobox")).toBeEnabled());
    fireEvent.change(within(labels).getByRole("combobox"), { target: { value: "2" } });
    expect(within(labels).getByRole("radio", { name: "A saved list:" })).toBeChecked();
    expect(within(panel).getByRole("group", { name: "Start a dig" })).toHaveTextContent("2 labels");
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({ artists: null, labels: ["NIGHTFALL-AUDIO", "Cold Room"] }),
      ),
    );
  });

  it("asks for no artists as an empty list", async () => {
    install([]);
    const panel = await renderPanel();
    fireEvent.click(within(group(panel, "Artists")).getByRole("radio", { name: "No artists" }));
    expect(within(panel).getByRole("group", { name: "Start a dig" })).toHaveTextContent("releases by 2 labels");
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ artists: [] })));
  });

  it("will not start on a saved list scope with no list or an empty one", async () => {
    install([list("artist", "Empty", [])]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    await waitFor(() => expect(within(artists).getByRole("combobox")).toBeEnabled());
    fireEvent.click(within(artists).getByRole("radio", { name: "A saved list:" }));
    expect(within(panel).getByText("That list has no artists. Add some, or look for every one.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Start looking" })).toBeDisabled();
  });
});

describe("when the lists cannot be read", () => {
  it("says so in the field, not that there are none yet", async () => {
    install([]);
    bridge.getDiscoverLists!.mockResolvedValue(refused("INVALID_REQUEST", "The library is busy"));
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    expect(await within(artists).findByText("The library is busy")).toBeInTheDocument();
    expect(within(artists).getByRole("option", { name: "Saved lists could not be read" })).toBeInTheDocument();
    expect(within(artists).queryByRole("option", { name: "No saved lists yet" })).toBeNull();
  });

  it("says so when the read throws", async () => {
    install([]);
    bridge.getDiscoverLists!.mockRejectedValue(new Error("Engine offline"));
    const panel = await renderPanel();
    expect(await within(group(panel, "Labels")).findByText("Engine offline")).toBeInTheDocument();
  });
});

describe("the list editor", () => {
  async function openNew(panel: HTMLElement, name: "Artists" | "Labels") {
    fireEvent.click(
      within(group(panel, name)).getByRole("button", {
        name: name === "Artists" ? "New artist list" : "New label list",
      }),
    );
    return screen.findByRole("dialog", { name: name === "Artists" ? "New artist list" : "New label list" });
  }

  it("makes a new list from the library's names, saves it and chooses it", async () => {
    install([]);
    const panel = await renderPanel();
    const dialog = await openNew(panel, "Artists");
    expect(within(dialog).queryByRole("button", { name: "Delete list" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("List name"), { target: { value: "  Peak time " } });
    fireEvent.change(within(dialog).getByLabelText("Find artists"), { target: { value: "ki" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Kiko/ }));
    fireEvent.change(within(dialog).getByLabelText("Find artists"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /DJEFF/ }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("2 artists chosen");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(bridge.createDiscoverList).toHaveBeenCalledWith({
        kind: "artist",
        name: "  Peak time ",
        // The library's order, not the order clicked.
        members: ["DJEFF", "Kiko"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const artists = group(panel, "Artists");
    expect(within(artists).getByRole("radio", { name: "A saved list:" })).toBeChecked();
    expect(within(artists).getByRole("option", { name: "Peak time · 2" })).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: "Start a dig" })).toHaveTextContent("2 artists");
  });

  it("makes a label list in the same chooser, over the labels", async () => {
    install([]);
    const panel = await renderPanel();
    const dialog = await openNew(panel, "Labels");
    fireEvent.change(within(dialog).getByLabelText("List name"), { target: { value: "Dark" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Cold Room/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(bridge.createDiscoverList).toHaveBeenCalledWith({
        kind: "label",
        name: "Dark",
        members: ["Cold Room"],
      }),
    );
  });

  it("edits the list shown: its name and its members start as saved", async () => {
    install([list("artist", "Peak time", ["Kiko"])]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    await waitFor(() => expect(within(artists).getByRole("combobox")).toBeEnabled());
    fireEvent.click(within(artists).getByRole("radio", { name: "A saved list:" }));
    fireEvent.click(within(artists).getByRole("button", { name: "Edit artist list" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit artist list" });
    expect(within(dialog).getByLabelText("List name")).toHaveValue("Peak time");
    expect(within(dialog).getByRole("checkbox", { name: /Kiko/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /DJEFF/ })).not.toBeChecked();

    fireEvent.change(within(dialog).getByLabelText("List name"), { target: { value: "Closing" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Mara Veil/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(bridge.updateDiscoverList).toHaveBeenCalledWith({
        list_id: 1,
        name: "Closing",
        members: ["Kiko", "Mara Veil"],
      }),
    );
    await waitFor(() => expect(within(artists).getByRole("option", { name: "Closing · 2" })).toBeInTheDocument());
    expect(bridge.createDiscoverList).not.toHaveBeenCalled();
  });

  it("keeps a name already in the list that the library's list no longer carries", async () => {
    install([list("artist", "Old", ["Kiko", "Left The Library"])]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    await waitFor(() => expect(within(artists).getByRole("combobox")).toBeEnabled());
    fireEvent.click(within(artists).getByRole("radio", { name: "A saved list:" }));
    fireEvent.click(within(artists).getByRole("button", { name: "Edit artist list" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit artist list" });
    expect(within(dialog).getByRole("checkbox", { name: /Left The Library/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(bridge.updateDiscoverList).toHaveBeenCalledWith({
        list_id: 1,
        name: "Old",
        members: ["Kiko", "Left The Library"],
      }),
    );
  });

  it("shows the engine's words when the name is taken, and stays open", async () => {
    install([list("artist", "Peak time", ["Kiko"])]);
    const panel = await renderPanel();
    const dialog = await openNew(panel, "Artists");
    fireEvent.change(within(dialog).getByLabelText("List name"), { target: { value: "peak time" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Another list of this kind already has that name",
    );
    expect(screen.getByRole("dialog", { name: "New artist list" })).toBeInTheDocument();
  });

  it("deletes a list after asking, and the dig must choose another list", async () => {
    install([list("artist", "Peak time", ["Kiko"])]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    await waitFor(() => expect(within(artists).getByRole("combobox")).toBeEnabled());
    fireEvent.click(within(artists).getByRole("radio", { name: "A saved list:" }));
    fireEvent.click(within(artists).getByRole("button", { name: "Edit artist list" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit artist list" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete list" }));
    expect(bridge.deleteDiscoverList).not.toHaveBeenCalled();
    const sure = await screen.findByRole("dialog", { name: "Delete list?" });
    expect(within(sure).getByText(/The list “Peak time” goes\./)).toBeInTheDocument();
    fireEvent.click(within(sure).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete list?" })).toBeNull());
    expect(within(dialog).getByRole("button", { name: "Delete list" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete list" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Delete list?" })).getByRole("button", {
        name: "Delete list",
      }),
    );
    await waitFor(() => expect(bridge.deleteDiscoverList).toHaveBeenCalledWith({ list_id: 1 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Still "a saved list", with none chosen: Start asks for one rather than widening the dig.
    expect(within(artists).getByRole("radio", { name: "A saved list:" })).toBeChecked();
    expect(within(artists).getByRole("option", { name: "No saved lists yet" })).toBeInTheDocument();
    expect(
      within(panel).getByText("Choose a saved list of artists, or look for every one."),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Start looking" })).toBeDisabled();
  });

  it("leaves the scope alone when a list is edited while every artist is chosen", async () => {
    install([list("artist", "Peak time", ["Kiko"])]);
    const panel = await renderPanel();
    const artists = group(panel, "Artists");
    await waitFor(() => expect(within(artists).getByRole("combobox")).toBeEnabled());
    fireEvent.change(within(artists).getByRole("combobox"), { target: { value: "1" } });
    fireEvent.click(within(artists).getByRole("radio", { name: /Every artist/ }));
    fireEvent.click(within(artists).getByRole("button", { name: "Edit artist list" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit artist list" });
    fireEvent.change(within(dialog).getByLabelText("List name"), { target: { value: "Closing" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bridge.updateDiscoverList).toHaveBeenCalled();
    expect(within(artists).getByRole("radio", { name: /Every artist/ })).toBeChecked();
    expect(within(panel).getByRole("group", { name: "Start a dig" })).toHaveTextContent("3 artists");
  });

  it("cancels without saving anything", async () => {
    install([]);
    const panel = await renderPanel();
    const dialog = await openNew(panel, "Artists");
    fireEvent.change(within(dialog).getByLabelText("List name"), { target: { value: "Nope" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bridge.createDiscoverList).not.toHaveBeenCalled();
  });
});
