/**
 * Activity panel (SHELL-08, DEC-026).
 *
 * The empty feed is the normal state for now — FOUNDATION-08 records nothing
 * yet — so "empty" gets as much attention here as "populated", and the empty
 * message has to say what will appear rather than leaving a blank box.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ACTIVITY_REFRESH_MS, ActivityPanel } from "./ActivityPanel";
import type { ActivityEvent, ActivityFeed } from "../../api/cuepointBridge.types";

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 1,
    type: "library.imported",
    summary: "Imported 120 tracks",
    detail: { tracks: 120 },
    created_at: "2026-09-02T10:00:00Z",
    ...overrides,
  };
}

function feed(overrides: Partial<ActivityFeed> = {}): ActivityFeed {
  return { events: [], total: 0, limit: 50, ...overrides };
}

let getRecentActivity: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getRecentActivity = vi.fn().mockResolvedValue(feed());
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getRecentActivity };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("ActivityPanel", () => {
  it("renders nothing while closed, and does not ask the engine", () => {
    render(<ActivityPanel open={false} onClose={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getRecentActivity).not.toHaveBeenCalled();
  });

  it("loads when opened", async () => {
    render(<ActivityPanel open onClose={() => {}} />);

    await waitFor(() => expect(getRecentActivity).toHaveBeenCalledWith({ limit: 50 }));
  });

  it("is called Activity, not History", () => {
    // "History" already means the past-searches panel, which lists exported
    // match-run CSVs. Two features sharing that word is a lasting confusion.
    render(<ActivityPanel open onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: /activity/i })).toBeInTheDocument();
    expect(screen.queryByText(/history/i)).not.toBeInTheDocument();
  });

  it("says what will appear when the feed is empty", async () => {
    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText(/Nothing has happened yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Imports, backups and edits will be listed here/i)).toBeInTheDocument();
  });

  it("lists events with their summary, type and detail", async () => {
    getRecentActivity.mockResolvedValue(
      feed({ events: [event({ detail: { tracks: 120, playlists: 4 } })], total: 1 }),
    );

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText("Imported 120 tracks")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
    expect(screen.getByText(/Playlists: 4/)).toBeInTheDocument();
  });

  it("writes a kind as muted text, not a coloured chip (M269)", async () => {
    getRecentActivity.mockResolvedValue(
      feed({
        events: [
          event({ id: 1, summary: "Imported 120 tracks" }),
          event({ id: 2, type: "clean.match.interrupted", summary: "Stopped matching" }),
        ],
        total: 2,
      }),
    );

    render(<ActivityPanel open onClose={() => {}} />);

    const imported = await screen.findByText("Import");
    expect(imported).toHaveClass("cp-activity__type");
    expect(imported).not.toHaveClass("cp-badge");
    expect(screen.getByText("Match stopped")).toHaveClass("cp-activity__type");
    expect(document.querySelector(".cp-activity .cp-badge")).toBeNull();
  });

  it("shows newest first even if the engine returned them out of order", async () => {
    getRecentActivity.mockResolvedValue(
      feed({
        events: [
          event({ id: 1, summary: "Older", created_at: "2026-09-02T09:00:00Z" }),
          event({ id: 2, summary: "Newer", created_at: "2026-09-02T11:00:00Z" }),
        ],
        total: 2,
      }),
    );

    render(<ActivityPanel open onClose={() => {}} />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Newer");
    expect(rows[1]).toHaveTextContent("Older");
  });

  it("counts the events when the page holds all of them", async () => {
    getRecentActivity.mockResolvedValue(feed({ events: [event()], total: 1 }));

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText("1 event")).toBeInTheDocument();
  });

  it("writes the count in sentence case", async () => {
    getRecentActivity.mockResolvedValue(
      feed({ events: [event({ id: 1 }), event({ id: 2 })], total: 2 }),
    );
    render(<ActivityPanel open onClose={() => {}} />);
    expect(await screen.findByText("2 events")).toBeInTheDocument();
  });

  it("says how many of the total are shown when paged", async () => {
    getRecentActivity.mockResolvedValue(feed({ events: [event()], total: 320 }));

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText("Showing 1 of 320")).toBeInTheDocument();
  });

  it("keeps itself current while open, with no Refresh button (M269)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ActivityPanel open onClose={() => {}} />);
      await waitFor(() => expect(getRecentActivity).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();

      getRecentActivity.mockResolvedValue(feed({ events: [event({ id: 9, summary: "Backed up" })], total: 1 }));
      await vi.advanceTimersByTimeAsync(ACTIVITY_REFRESH_MS + 100);

      expect(await screen.findByText("Backed up")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reaches older entries with Show 50 more (M270)", async () => {
    const user = userEvent.setup();
    const many = (n: number) => Array.from({ length: n }, (_, i) => event({ id: i + 1, summary: `Event ${i + 1}`, created_at: `2026-09-02T10:${String(59 - (i % 60)).padStart(2, "0")}:00Z` }));
    getRecentActivity.mockImplementation(async ({ limit }: { limit: number }) => feed({ events: many(Math.min(limit, 120)), total: 120, limit }));

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText("Showing 50 of 120")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(await screen.findByText("Showing 100 of 120")).toBeInTheDocument();
    expect(getRecentActivity).toHaveBeenLastCalledWith({ limit: 100 });
    await user.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(await screen.findByText("120 events")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show 50 more" })).not.toBeInTheDocument();
  });

  it("filters by kind (M269)", async () => {
    const user = userEvent.setup();
    getRecentActivity.mockResolvedValue(
      feed({
        events: [
          event({ id: 1, type: "library.imported", summary: "Imported 120 tracks" }),
          event({ id: 2, type: "clean.match", summary: "Matched 32 tracks" }),
        ],
        total: 2,
      }),
    );
    render(<ActivityPanel open onClose={() => {}} />);
    await screen.findByText("Imported 120 tracks");

    await user.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "Clean");

    expect(screen.queryByText("Imported 120 tracks")).not.toBeInTheDocument();
    expect(screen.getByText("Matched 32 tracks")).toBeInTheDocument();
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });

  it("calls a dig a dig (M398)", async () => {
    getRecentActivity.mockResolvedValue(
      feed({
        events: [event({ id: 3, type: "discovery.ran", summary: "Discovery found 6 tracks in 1 chart and 0 releases" })],
        total: 1,
      }),
    );
    render(<ActivityPanel open onClose={() => {}} />);
    expect(await screen.findByText(/Dig found 6 tracks in 1 chart/)).toBeInTheDocument();
    expect(screen.queryByText(/^Discovery found/)).not.toBeInTheDocument();
  });

  it("says so in plain words when the bridge is absent (STR-8)", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    render(<ActivityPanel open onClose={() => {}} />);

    expect(
      await screen.findByText("Activity will show once CuePoint has finished starting."),
    ).toBeInTheDocument();
  });

  it("surfaces a failed load rather than looking empty", async () => {
    // An empty panel and a broken one look identical otherwise, and they need
    // very different responses from whoever is looking at it.
    getRecentActivity.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:51234"));

    render(<ActivityPanel open onClose={() => {}} />);

    const alert = await screen.findByRole("alert");
    // The sentence, then the reason as a muted line of its own, then a button: no hover needed (M348).
    expect(alert.querySelector(".cp-activity__failure")).toHaveTextContent("Could not load the list.");
    expect(alert.querySelector(".cp-activity__reason-line")).toBeInTheDocument();
    expect(alert).not.toHaveAttribute("title");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing has happened yet/i)).not.toBeInTheDocument();

    getRecentActivity.mockResolvedValue(feed({ events: [event()], total: 1 }));
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Imported 120 tracks")).toBeInTheDocument();
  });

  it("offers no way to revert anything", async () => {
    // DEC-008 supports reverting a field change, but nothing can edit a field
    // yet; a revert button here would act on nothing.
    getRecentActivity.mockResolvedValue(feed({ events: [event()], total: 1 }));

    render(<ActivityPanel open onClose={() => {}} />);
    await screen.findByText("Imported 120 tracks");

    expect(screen.queryByRole("button", { name: /revert|undo/i })).not.toBeInTheDocument();
  });

  it("closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ActivityPanel open onClose={onClose} />);

    // The footer's grey Close (the title bar has its own ×).
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>(".cp-modal__footer")!;
    await user.click(within(footer).getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("groups rows under day headings instead of a date on every row (STR-8)", async () => {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12);
    const earlier = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 9, 12);
    getRecentActivity.mockResolvedValue(
      feed({
        events: [
          event({ id: 1, summary: "Now", created_at: today.toISOString() }),
          event({ id: 2, summary: "Before", created_at: yesterday.toISOString() }),
          event({ id: 3, summary: "Long ago", created_at: earlier.toISOString() }),
        ],
        total: 3,
      }),
    );

    render(<ActivityPanel open onClose={() => {}} />);

    await screen.findByText("Now");
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(["Today", "Yesterday"]);
    expect(headings[2]).toMatch(/^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/);
    // The time on a row carries no date.
    expect(screen.queryAllByText(/[A-Z][a-z]{2} \d{1,2}\s+\d{1,2}:\d{2}/)).toHaveLength(0);
  });

  it("never prints raw key: value lines (R3-6)", async () => {
    getRecentActivity.mockResolvedValue(
      feed({
        events: [
          event({
            type: "engine.started",
            summary: "CuePoint started (v1.0.0)",
            detail: { version: "1.0.0", port: 51234, ready: true },
          }),
        ],
        total: 1,
      }),
    );

    render(<ActivityPanel open onClose={() => {}} />);

    await screen.findByText("CuePoint started (v1.0.0)");
    expect(screen.getByText("App started")).toBeInTheDocument();
    expect(screen.queryByText(/port/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ready|true/)).not.toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
  });

  it("does not repeat a count the summary already says", async () => {
    getRecentActivity.mockResolvedValue(feed({ events: [event()], total: 1 }));
    render(<ActivityPanel open onClose={() => {}} />);
    await screen.findByText("Imported 120 tracks");
    expect(screen.queryByText(/Tracks: 120/)).not.toBeInTheDocument();
  });

  it("shows no type badge for a type it has no word for", async () => {
    getRecentActivity.mockResolvedValue(
      feed({ events: [event({ type: "something.new_later", summary: "Did a thing" })], total: 1 }),
    );
    render(<ActivityPanel open onClose={() => {}} />);
    await screen.findByText("Did a thing");
    expect(document.querySelector(".cp-activity__type")).toBeNull();
  });
});
