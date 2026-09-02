/**
 * Activity panel (SHELL-08, DEC-026).
 *
 * The empty feed is the normal state for now — FOUNDATION-08 records nothing
 * yet — so "empty" gets as much attention here as "populated", and the empty
 * message has to say what will appear rather than leaving a blank box.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ActivityPanel } from "./ActivityPanel";
import type { ActivityEvent, ActivityFeed } from "../../api/cuepointBridge.types";

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 1,
    type: "library.import",
    summary: "Imported 120 tracks",
    detail: { count: 120 },
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
    getRecentActivity.mockResolvedValue(feed({ events: [event()], total: 1 }));

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText("Imported 120 tracks")).toBeInTheDocument();
    expect(screen.getByText("import")).toBeInTheDocument();
    expect(screen.getByText(/count: 120/)).toBeInTheDocument();
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

  it("says how many of the total are shown when paged", async () => {
    getRecentActivity.mockResolvedValue(feed({ events: [event()], total: 320 }));

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText("Showing 1 of 320")).toBeInTheDocument();
  });

  it("reloads on demand", async () => {
    const user = userEvent.setup();
    render(<ActivityPanel open onClose={() => {}} />);
    await waitFor(() => expect(getRecentActivity).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(getRecentActivity).toHaveBeenCalledTimes(2));
  });

  it("says so when the engine bridge is absent", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByText(/engine, which is not connected/i)).toBeInTheDocument();
  });

  it("surfaces a failed load rather than looking empty", async () => {
    // An empty panel and a broken one look identical otherwise, and they need
    // very different responses from whoever is looking at it.
    getRecentActivity.mockRejectedValue(new Error("engine offline"));

    render(<ActivityPanel open onClose={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/engine offline/);
    expect(screen.queryByText(/Nothing has happened yet/i)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });
});
