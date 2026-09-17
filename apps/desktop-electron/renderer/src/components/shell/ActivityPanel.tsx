import { useCallback, useEffect, useState } from "react";
import { Modal } from "../Modal";
import type { ActivityFeed } from "../../api/cuepointBridge.types";
import {
  formatEventDetail,
  formatEventTime,
  formatEventType,
  sortNewestFirst,
} from "./activityFormat";
import { ActivityOffer } from "./ActivityOffer";
import "./ActivityPanel.css";

export interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
}

type Status = "loading" | "ready" | "unavailable" | "error";

/**
 * The activity feed (SHELL-08, DEC-026).
 *
 * FOUNDATION-08 has recorded activity into an append-only table since Phase 1;
 * this is the first thing to read it back out.
 *
 * Called **Activity**, never History. "History" already means something else in
 * this app — the past-searches panel, which lists exported match-run CSVs — and
 * two features sharing that word would be a lasting confusion.
 *
 * Since CLEAN-13 an entry can be acted on where it is recorded: a batch offers
 * "Revert this batch", disabled with its reason for Collection membership, and
 * a tag write offers Restore — saying first how many of its writes may not
 * have finished, and never calling those done.
 */
export function ActivityPanel({ open, onClose }: ActivityPanelProps) {
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((quiet = false) => {
    const read = window.cuepoint?.getRecentActivity;
    if (!read) {
      setStatus("unavailable");
      return;
    }
    // A reload after an action keeps the list on screen, so what the entry
    // said about the action stays readable while the feed catches up.
    if (!quiet) setStatus("loading");
    void read({ limit: 50 })
      .then((result) => {
        setFeed(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      });
  }, []);

  // Loaded when opened rather than kept live: this is a log someone consults,
  // not a display that has to keep up, and a modal that polls in the
  // background is load nobody asked for.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const events = feed ? sortNewestFirst(feed.events) : [];

  return (
    <Modal
      open={open}
      title="Activity"
      onClose={onClose}
      size="wide"
      secondaryAction={{ label: "Refresh", onClick: () => load() }}
    >
      <div className="cp-activity">
        {status === "loading" && <p className="cp-activity__note">Loading activity…</p>}

        {status === "unavailable" && (
          <p className="cp-activity__note">
            Activity needs the CuePoint engine, which is not connected.
          </p>
        )}

        {status === "error" && (
          <p className="cp-activity__note cp-activity__note--error" role="alert">
            Could not load activity: {error}
          </p>
        )}

        {status === "ready" && events.length === 0 && (
          <p className="cp-activity__note">
            Nothing has happened yet. Imports, backups and edits will be listed here.
          </p>
        )}

        {status === "ready" && events.length > 0 && (
          <>
            <p className="cp-activity__summary">
              {events.length === feed?.total
                ? `${feed?.total} ${feed?.total === 1 ? "event" : "events"}`
                : `Showing ${events.length} of ${feed?.total}`}
            </p>
            <ul className="cp-activity__list">
              {events.map((event) => {
                const detail = formatEventDetail(event.detail);
                return (
                  <li className="cp-activity__row" key={event.id ?? `${event.created_at}-${event.summary}`}>
                    <span className="cp-activity__time">{formatEventTime(event.created_at)}</span>
                    <span className="cp-activity__type">{formatEventType(event.type)}</span>
                    <span className="cp-activity__summary-text">
                      {event.summary}
                      {detail && <span className="cp-activity__detail"> {detail}</span>}
                      <ActivityOffer event={event} onDone={() => load(true)} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
