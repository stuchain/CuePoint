import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInRouterContext, useNavigate } from "react-router-dom";
import { Button } from "../Button";
import { LinkButton } from "../LinkButton";
import { Loading } from "../Loading";
import { Modal } from "../Modal";
import { Select } from "../Select";
import type { ActivityFeed } from "../../api/cuepointBridge.types";
import {
  EVENT_FAMILIES,
  eventDestination,
  formatEventDetail,
  formatEventFamily,
  formatEventSummary,
  formatEventTime,
  formatEventType,
  groupByDay,
  sortNewestFirst,
} from "./activityFormat";
import { countNoun, formatCount } from "../../format/counts";
import { couldNot } from "../../format/words";
import { ActivityOffer } from "./ActivityOffer";
import { reportUnexpected } from "../../reporting/reporting";
import "./ActivityPanel.css";
import { userMessage } from "../../api/userMessage";

interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
}

type Status = "loading" | "ready" | "unavailable" | "error";

/** How many entries one read brings, and how many "Show 50 more" adds (M270). */
export const ACTIVITY_PAGE = 50;

/** How often the open list reads again, so it needs no Refresh button (M269). */
export const ACTIVITY_REFRESH_MS = 5000;

const ALL_KINDS = "all";

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
 * "Undo all of these", disabled with its reason for Collection membership, and
 * a tag write offers Undo — saying first how many of its writes may not
 * have finished, and never calling those done.
 *
 * The list keeps itself current while it is open and filters by kind; older entries (and their
 * Undo) are a "Show 50 more" away (M269, M270). A kind is quiet text, not a coloured chip.
 */
export function ActivityPanel({ open, onClose }: ActivityPanelProps) {
  // Rows link to their page only inside the app's router (a bare panel in a test has none).
  const routed = useInRouterContext();
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(ACTIVITY_PAGE);
  const [kind, setKind] = useState(ALL_KINDS);

  // Read through refs so `load` stays one function: the effects below restart on opening and on the
  // page size, not on every answer.
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const load = useCallback(
    (quiet = false, take = limitRef.current) => {
      const read = window.cuepoint?.getRecentActivity;
      if (!read) {
        setStatus("unavailable");
        return;
      }
      // A reload after an action keeps the list on screen, so what the entry
      // said about the action stays readable while the feed catches up.
      if (!quiet) setStatus("loading");
      void read({ limit: take })
        .then((result) => {
          setFeed(result);
          setStatus("ready");
        })
        .catch((cause: unknown) => {
          reportUnexpected(cause);
          // A failed quiet read keeps the list that is showing; only a first read tells the failure.
          if (quiet && feedRef.current) return;
          setError(userMessage(cause));
          setStatus("error");
        });
    },
    [],
  );

  // Read when opened, and again at each page size (Show 50 more) and every few seconds while open.
  useEffect(() => {
    if (!open) {
      setLimit(ACTIVITY_PAGE);
      setKind(ALL_KINDS);
      return;
    }
    load(feedRef.current !== null && limit > ACTIVITY_PAGE);
  }, [open, limit, load]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => load(true), ACTIVITY_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, load]);

  const events = useMemo(() => (feed ? sortNewestFirst(feed.events) : []), [feed]);
  const shown = useMemo(
    () => (kind === ALL_KINDS ? events : events.filter((event) => formatEventFamily(event.type) === kind)),
    [events, kind],
  );
  const families = useMemo(() => {
    const present = new Set(events.map((event) => formatEventFamily(event.type)));
    return EVENT_FAMILIES.filter((family) => present.has(family));
  }, [events]);
  const total = feed?.total ?? 0;
  const moreToShow = events.length < total;

  return (
    <Modal open={open} title="Activity" onClose={onClose} size="large">
      <div className="cp-activity">
        {status === "loading" && <Loading what="activity" className="cp-activity__note" />}

        {status === "unavailable" && (
          <p className="cp-activity__note">
            Activity will show once CuePoint has finished starting.
          </p>
        )}

        {status === "error" && (
          // The reason is a line of its own and there is a button to try again: nothing is told by
          // hover alone (M348).
          <div className="cp-activity__note cp-activity__note--error" role="alert">
            <p className="cp-activity__failure">{couldNot("load the list")}</p>
            {error && <p className="cp-activity__reason-line">{error}</p>}
            <Button variant="secondary" size="sm" onClick={() => load()}>
              Try again
            </Button>
          </div>
        )}

        {status === "ready" && events.length === 0 && (
          <p className="cp-activity__note">
            Nothing has happened yet. Imports, backups and edits will be listed here.
          </p>
        )}

        {status === "ready" && events.length > 0 && (
          <>
            <div className="cp-activity__bar">
              <p className="cp-activity__summary">
                {kind !== ALL_KINDS
                  ? countNoun(shown.length, "event")
                  : moreToShow
                    ? `Showing ${formatCount(events.length)} of ${formatCount(total)}`
                    : countNoun(total, "event")}
              </p>
              {families.length > 1 && (
                <Select
                  label="Kind"
                  hideLabel
                  inlineLabel
                  width="short"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                  options={[
                    { value: ALL_KINDS, label: "All kinds" },
                    ...families.map((family) => ({ value: family, label: family })),
                  ]}
                />
              )}
            </div>
            {shown.length === 0 && (
              <p className="cp-activity__note">Nothing of this kind among the entries shown.</p>
            )}
            <div className="cp-activity__list">
              {groupByDay(shown).map((group) => (
                <section className="cp-activity__day" key={group.heading}>
                  <h3 className="cp-activity__day-heading">{group.heading}</h3>
                  <ul className="cp-activity__rows">
                    {group.events.map((event) => {
                      const summary = formatEventSummary(event.type, event.summary);
                      const detail = formatEventDetail(event.detail, summary);
                      const word = formatEventType(event.type);
                      return (
                        <li
                          className="cp-activity__row"
                          key={event.id ?? `${event.created_at}-${event.summary}`}
                        >
                          <span className="cp-activity__time">
                            {formatEventTime(event.created_at)}
                          </span>
                          {word && <span className="cp-activity__type">{word}</span>}
                          <span className="cp-activity__summary-text">
                            {routed ? (
                              <SummaryLink type={event.type} onGo={onClose}>
                                {summary}
                              </SummaryLink>
                            ) : (
                              summary
                            )}
                            {detail && <span className="cp-activity__detail"> {detail}</span>}
                            <ActivityOffer event={event} onDone={() => load(true)} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            {moreToShow && (
              <Button variant="quiet" onClick={() => setLimit((current) => current + ACTIVITY_PAGE)}>
                Show {ACTIVITY_PAGE} more
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * An entry's summary, as a link to the page that holds what it recorded (M269): a match opens
 * Clean, an edit the Library, a dig Discover. The dialog closes first. An entry with nowhere to go
 * stays plain words.
 */
function SummaryLink({ type, onGo, children }: { type: string; onGo: () => void; children: ReactNode }) {
  const navigate = useNavigate();
  const to = eventDestination(type);
  if (!to) return <>{children}</>;
  return (
    <LinkButton
      className="cp-activity__open"
      aria-description={to.label}
      onClick={() => {
        onGo();
        navigate(to.path, to.state ? { state: to.state } : undefined);
      }}
    >
      {children}
    </LinkButton>
  );
}
