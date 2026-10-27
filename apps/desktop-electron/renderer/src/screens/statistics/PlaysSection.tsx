/**
 * The Plays tab of the Statistics page (STATS-05, DEC-166, DEC-167).
 *
 * A "since" choice (in the page header beside "Which tracks", M224: `PlaysSince`), then cards: the
 * most played tracks (with their BPM and key; a double-click or Enter plays from a row, M99; and a
 * button that saves the list as a Collection), the top artists, labels and genres, and the counts
 * of never played and plays unknown.
 * Every number is the route's; every click opens exactly the tracks the number counted (a
 * since-a-date artist, label or genre says it opens more). The page's frame, loading and failed
 * states stay in `StatisticsScreen.tsx`; this is the body of its Plays tab.
 *
 * The bar behind a name is a share of the top row, drawn by `RankList`. The one motion is
 * `state`: a row whose rank moved when the list was read again steps once.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsPlays,
  StatisticsTrack,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LinkButton } from "../../components/LinkButton";
import { ShowMore } from "../../components/ShowMore";
import { Loading } from "../../components/Loading";
import { NameFolderDialog } from "../../components/NameFolderDialog";
import { Notice } from "../../components/Notice";
import { Select } from "../../components/Select";
import { KeyChip } from "../../components/wheel/KeyChip";
import { DOUBLE_CLICK_MS } from "../../hooks/useDoubleClickGrace";
import { DateField } from "../discover/DateField";
import { changedMark, useCountChanges } from "../../components/wheel/useCountChanges";
import { isEngineRefusal } from "../../api/bridgeError";
import { reportUnexpected } from "../../reporting/reporting";
import { countNoun, formatCount } from "../../format/counts";
import { RETRY, couldNot, dialogTitle, goTo, opensDialog } from "../../format/words";
import { formatBpm } from "../../format/units";
import { libraryRulesState, libraryTrackState } from "../library/libraryLink";
import { runQueueAction } from "../library/trackDetailsActions";
import { RankList, type RankRow } from "./RankList";
import {
  SINCE_OPTIONS,
  collectionName,
  FIRST_YEAR,
  isValidDay,
  localDay,
  onDay,
  onStamp,
  savePlaysChoice,
  sinceStamp,
  type PlaysChoice,
  type PlaysSince,
} from "./playsChoice";
import "../../components/table/DataTable.css";
import "./PlaysSection.css";

/** What the date field says of a day that cannot be counted from, or null when it can. */
export function sinceDateNote(draft: string, today: string): string | null {
  if (draft === "") return null;
  if (!isValidDay(draft)) return `Enter a whole date from ${FIRST_YEAR} to this year.`;
  if (draft > today) return "That date is after today, so there is nothing to count.";
  return null;
}

/**
 * The date field: the app's one day field (DateField, M39), the day written the app's way with the
 * pixel calendar. What is typed is held here and becomes the section's choice only when it is a
 * complete, real day from 1900 to this year, so a half-typed year (`0002-09-01`) is never saved or
 * sent. What is wrong with it is told to `onNote`, which the Plays tab says under the header.
 */
function SinceDate({
  saved,
  onDate,
  onNote,
}: {
  saved: string;
  onDate: (day: string) => void;
  onNote?: (note: string | null) => void;
}) {
  const [draft, setDraft] = useState(saved);
  const today = localDay(new Date());
  const note = sinceDateNote(draft, today);
  const box = useRef<HTMLSpanElement>(null);
  // The picker keeps to the range: DateField's input takes no min or max of its own.
  useLayoutEffect(() => {
    const input = box.current?.querySelector<HTMLInputElement>('input[type="date"]');
    input?.setAttribute("min", `${FIRST_YEAR}-01-01`);
    input?.setAttribute("max", today);
  });
  useEffect(() => {
    onNote?.(note);
  }, [note, onNote]);
  useEffect(() => () => onNote?.(null), [onNote]);
  return (
    <span ref={box} className="plays__date">
      <DateField
        label="Since date"
        value={draft}
        onChange={(next) => {
          setDraft(next);
          if (isValidDay(next)) onDate(next);
        }}
      />
    </span>
  );
}

interface PlaysSinceProps {
  choice: PlaysChoice;
  onChoice: (choice: PlaysChoice) => void;
  /** An earlier choice's answer is showing while the new one is read: the spinner sits in this row (M384). */
  stale?: boolean;
  /** What the date field says is wrong with a typed day, or null. */
  onNote?: (note: string | null) => void;
}

/**
 * "Since", in the page header beside "Which tracks" while Plays is shown (M224): the one scope row.
 * A date field follows it when "A date" is chosen, and the spinner while a new choice is read (M384).
 */
export function PlaysSince({ choice, onChoice, stale = false, onNote }: PlaysSinceProps) {
  const dateChosen = choice.since.startsWith("date:");
  const sinceValue = dateChosen ? "date" : choice.since;
  const change = (next: PlaysChoice) => {
    savePlaysChoice(next);
    onChoice(next);
  };
  return (
    <>
      <Select
        label="Since"
        inlineLabel
        className="plays__since"
        value={sinceValue}
        options={SINCE_OPTIONS.map((option) => ({ ...option }))}
        onChange={(event) => {
          const value = event.target.value;
          change({
            ...choice,
            since: (value === "date"
              ? `date:${dateChosen ? choice.since.slice(5) : ""}`
              : value) as PlaysSince,
          });
        }}
      />
      {dateChosen && (
        <SinceDate
          saved={choice.since.slice(5)}
          onDate={(day) => change({ ...choice, since: `date:${day}` })}
          onNote={onNote}
        />
      )}
      {stale && <Loading what="plays" className="plays__reading" />}
    </>
  );
}

const count = (n: number): string => formatCount(n);
const playsWord = (n: number): string => countNoun(n, "play");
const tracksWord = (n: number): string => countNoun(n, "track");

interface PlaysSectionProps {
  data: StatisticsPlays;
  choice: PlaysChoice;
  onChoice: (choice: PlaysChoice) => void;
  /** An earlier choice's answer is showing while the new one is read. */
  stale?: boolean;
  /** The last read failed; `data` is the earlier answer. */
  failed?: boolean;
  onRetry?: () => void;
  /** What the header's date field says is wrong with the typed day (M224), said here. */
  dateNote?: string | null;
  /** The page already says there is nothing to show (no history yet): no empty card of its own (M222). */
  pageEmpty?: boolean;
}

interface Kept {
  id: number;
  name: string;
  tracks: number;
}

export function PlaysSection({
  data,
  choice,
  onChoice,
  stale = false,
  failed = false,
  onRetry,
  dateNote = null,
  pageEmpty = false,
}: PlaysSectionProps) {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [naming, setNaming] = useState(false);
  const [kept, setKept] = useState<Kept | null>(null);
  const [keepFailed, setKeepFailed] = useState<string | null>(null);
  const [staleList, setStaleList] = useState(false);

  // A new choice (made here or in the header's Since) is a new list: what was saved of the last one
  // is no longer said.
  const [seenChoice, setSeenChoice] = useState(choice);
  if (seenChoice !== choice) {
    setSeenChoice(choice);
    setKept(null);
    setKeepFailed(null);
    setStaleList(false);
  }

  const change = (next: PlaysChoice) => {
    savePlaysChoice(next);
    onChoice(next);
  };

  const dateChosen = choice.since.startsWith("date:");

  const ranks = useMemo(
    () => new Map(data.tracks.map((track, index) => [String(track.id), index + 1])),
    [data.tracks],
  );
  const marks = useCountChanges(ranks);

  const windowed = choice.since !== "all" && !(dateChosen && choice.since === "date:");
  const noHistory = data.history_from === null;
  const open = (rules: FilterRuleSet) => navigate("/library", { state: libraryRulesState(rules) });

  // Playing a row queues the rest of the list from it, that row first, as the Library does for the
  // view it plays from (C192). A later track that cannot be read is left out of the queue; the
  // clicked one failing is said.
  const preview = async (from: number) => {
    setMessage(null);
    const read = window.cuepoint?.getLibraryTrack;
    try {
      const reads = await Promise.allSettled(
        data.tracks.slice(from).map((track: StatisticsTrack) => read?.({ trackId: track.id })),
      );
      const [clicked] = reads;
      if (clicked?.status === "rejected") throw clicked.reason;
      if (!clicked?.value) {
        setMessage(couldNot("read the track"));
        return;
      }
      const rows = reads.flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value.track] : [],
      );
      const outcome = await runQueueAction("play", rows);
      if (outcome) setMessage(outcome.message);
    } catch (cause) {
      if (!isEngineRefusal(cause)) reportUnexpected(cause);
      setMessage(couldNot("read the track"));
    }
  };
  const canPreview = Boolean(window.cuepoint?.player?.playQueue && window.cuepoint?.getLibraryTrack);

  const name = collectionName(choice, data);
  const canKeep = Boolean(window.cuepoint?.createCollectionFrom);
  const keep = async (named: string) => {
    const create = window.cuepoint?.createCollectionFrom;
    if (!create || data.tracks.length === 0) return;
    setNaming(false);
    setKeeping(true);
    setKeepFailed(null);
    setStaleList(false);
    setKept(null);
    try {
      const made = await create({ name: named, parent_id: null, track_ids: data.tracks.map((t) => t.id) });
      setKept({ id: made.collection.id, name: made.collection.name, tracks: data.tracks.length });
    } catch (cause) {
      // A refusal (a track gone since the list was read) is the person's to act on, not a bug.
      if (isEngineRefusal(cause)) {
        setStaleList(true);
        setKeepFailed(
          "A track in the list is no longer in your library. Read the list again and save it.",
        );
      } else {
        reportUnexpected(cause);
        setKeepFailed("The Collection could not be made. Nothing was saved.");
      }
    } finally {
      setKeeping(false);
    }
  };

  const openKept = (collection: Kept) =>
    open({
      match: "all",
      rules: [{ field: "collection", operator: "in_collection", value: collection.id }],
    });

  // "Your last refresh" with no read in the history has nothing to count; all-time numbers
  // under that choice would be the wrong answer to the question asked.
  const noRefresh = choice.since === "refresh" && data.last_read_id === null;

  const emptyWords = noHistory && windowed
    ? "No plays are recorded for that yet"
    : windowed
      ? "No plays were recorded in that time"
      : "None of these tracks has been played yet";

  /** A row of a ranked list: the name's plays, tracks and what opens them. */
  function rankRow(
    id: string,
    row: { name: string; plays: number; tracks: number; rules: FilterRuleSet; opens_more: boolean },
  ): RankRow {
    return {
      id,
      name: row.name,
      plays: row.plays,
      tracks: row.tracks,
      weight: row.plays,
      rules: row.rules,
      note: row.opens_more ? "opens all its played tracks" : undefined,
      label: `${row.name}, ${playsWord(row.plays)}, ${tracksWord(row.tracks)}${row.opens_more ? `. Shows all of ${row.name}'s played tracks` : ""}`,
    };
  }

  const biggerList = choice.limit === 10;

  // Mouse: a click opens the track in the Library once a double-click is ruled out, and a double-click
  // plays from the row (D12 A, M99). Keys: Enter plays, Space opens.
  const opening = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (opening.current !== null) clearTimeout(opening.current);
  }, []);
  const openTrack = (id: number) => navigate("/library", { state: libraryTrackState(id) });
  const clickRow = (id: number, detail: number) => {
    if (opening.current !== null) {
      clearTimeout(opening.current);
      opening.current = null;
    }
    if (!canPreview || detail === 0) {
      openTrack(id);
      return;
    }
    if (detail > 1) return;
    opening.current = setTimeout(() => {
      opening.current = null;
      openTrack(id);
    }, DOUBLE_CLICK_MS);
  };
  const playRow = (index: number) => {
    if (opening.current !== null) {
      clearTimeout(opening.current);
      opening.current = null;
    }
    void preview(index);
  };

  const noTracks = data.tracks.length === 0;

  return (
    <div className={`plays${stale ? " plays--stale" : ""}`} aria-busy={stale || undefined} data-stale={stale || undefined}>
      {/* Where the counts come from, one short line that never wraps at a field's width (M206, M431). */}
      <div className="plays__controls">
        <p className="statistics-note plays__source">{playsSource(data)}</p>
        {dateNote && (
          <p className="statistics-note" role="status">
            {dateNote}
          </p>
        )}
      </div>

      {failed && (
        <Notice
          action={
            onRetry ? (
              <Button variant="secondary" onClick={onRetry}>
                {RETRY}
              </Button>
            ) : undefined
          }
        >
          These plays could not be read, so what is shown is the earlier list.
        </Notice>
      )}

      {data.since_clamped && data.history_from && (
        <p className="statistics-note" role="status">
          Your play history starts {onStamp(data.history_from)}, so the counts begin there
          rather than {data.since ? onDay(data.since) : "on that day"}.
        </p>
      )}
      {choice.since === "refresh" && data.last_read && data.history_from === data.last_read && (
        <p className="statistics-note">
          There has been no refresh since the import, so there is nothing to count yet.
        </p>
      )}

      {noRefresh && (
        <p className="statistics-note">
          There is no refresh to count from yet. Choose another time, or refresh from Rekordbox.
        </p>
      )}

      {/* No plays: one empty state, the page's own when it has one, and no empty cards (M222). What
          is not played is still counted, in its own card. */}
      {!noRefresh && noTracks && !pageEmpty && <EmptyState compact headline={emptyWords} />}

      {!noRefresh && (
        <div className="statistics-panels">
            {!noTracks && (
            <Card
              className="statistics-panel statistics-panel--wide plays__tracks"
              title="Most played tracks"
              unit={`top ${choice.limit}`}
              bodyClassName="statistics-panel__body"
              aria-label="Most played tracks"
            >
              <>
                  {/* The shared order (D12, M87): # · Title · Artist · BPM · Key · Plays. */}
                  <div className="cp-data-grid__head plays__columns-head" aria-hidden="true">
                    <span className="rank__hash">#</span>
                    <span>Title</span>
                    <span>Artist</span>
                    <span className="rank__number">BPM</span>
                    <span>Key</span>
                    <span className="rank__number">Plays</span>
                  </div>
                  <ol className="cp-data-grid__list" aria-label="Most played tracks">
                    {data.tracks.map((track, index) => (
                      <li
                        key={track.id}
                        className="cp-data-grid__item plays__item"
                        data-changed={changedMark(marks, String(track.id))}
                      >
                        <button
                          type="button"
                          className="cp-data-grid__row plays__row"
                          aria-label={`${index + 1}. ${track.title} by ${track.artist}, ${playsWord(track.plays)}`}
                          aria-description={canPreview ? "Double-click or Enter plays from here" : undefined}
                          onClick={(event) => clickRow(track.id, event.detail)}
                          onDoubleClick={canPreview ? () => playRow(index) : undefined}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" || !canPreview) return;
                            event.preventDefault();
                            playRow(index);
                          }}
                        >
                          <span className="rank__hash statistics-figure" aria-hidden="true">
                            {index + 1}
                          </span>
                          <span className="plays__name" aria-hidden="true">
                            {track.title}
                          </span>
                          <span className="plays__name plays__artist" aria-hidden="true">
                            {track.artist}
                          </span>
                          <span className="rank__number rank__number--main statistics-figure" aria-hidden="true">
                            {formatBpm(track.bpm)}
                          </span>
                          <span className="plays__key" aria-hidden="true">
                            <KeyChip value={track.key} />
                          </span>
                          <span
                            className="rank__number rank__number--main statistics-figure"
                            aria-hidden="true"
                          >
                            {count(track.plays)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
              </>
              {message && (
                <p className="statistics-note" role="status">
                  {message}
                </p>
              )}

              {canKeep && (
                <div className="plays__keep">
                  <Button
                    variant="secondary"
                    disabled={data.tracks.length === 0 || keeping || stale}
                    loading={keeping}
                    onClick={() => setNaming(true)}
                  >
                    {opensDialog(SAVE_AS_COLLECTION)}
                  </Button>
                </div>
              )}
              {/* Show all sits in the card's one foot, as every card's does (M213). */}
              {((biggerList && data.tracks.length >= choice.limit) || choice.limit > 10) && (
                <div className="statistics-panel__foot">
                  <ShowMore
                    total={25}
                    expanded={!biggerList}
                    onToggle={() => change({ ...choice, limit: biggerList ? 25 : 10 })}
                  />
                </div>
              )}
              <NameFolderDialog
                open={naming}
                title={dialogTitle(SAVE_AS_COLLECTION)}
                lead={`The ${tracksWord(data.tracks.length)} in rank order, as a Collection in the Library.`}
                initialName={name}
                folders={NO_FOLDERS}
                submitLabel="Save"
                busy={keeping}
                onSubmit={(named) => void keep(named)}
                onClose={() => setNaming(false)}
              />
              {kept && (
                <p className="statistics-note" role="status">
                  Saved {tracksWord(kept.tracks)} in rank order as “{kept.name}”, in Collections in
                  the Library.{" "}
                  <LinkButton go onClick={() => openKept(kept)}>
                    Open it in the Library
                  </LinkButton>
                </p>
              )}
              {keepFailed && (
                <p className="statistics-note" role="alert">
                  {keepFailed}{" "}
                  {staleList && onRetry && (
                    <LinkButton onClick={onRetry}>Read the list again</LinkButton>
                  )}
                </p>
              )}
            </Card>
            )}

            <RankList
              title="Top genres"
              unit="plays"
              columns={["plays"]}
              rows={data.genres.map((row) => rankRow(row.genre_key, row))}
              empty="No plays to rank"
              hideWhenEmpty
              onOpen={open}
            />
            <RankList
              title="Top artists"
              unit="tracks · plays"
              columns={["tracks", "plays"]}
              rows={data.artists.map((row) => rankRow(row.name_key, row))}
              empty="No plays to rank"
              hideWhenEmpty
              onOpen={open}
            />
            <RankList
              title="Top labels"
              unit="tracks · plays"
              columns={["tracks", "plays"]}
              rows={data.labels.map((row) => rankRow(row.label_key, row))}
              empty="No plays to rank"
              hideWhenEmpty
              onOpen={open}
            />
            <Card
              className="statistics-panel plays__unplayed"
              title="Not played"
              bodyClassName="statistics-panel__body"
              aria-label="Not played"
            >
              {(
                [
                  ["Never played", data.never_played],
                  ["No play count", data.unknown],
                ] as const
              ).map(([label, found]) => (
                <div key={label} className="plays__unplayed-row">
                  <span className="plays__unplayed-label">{label}</span>
                  <span className="plays__unplayed-count statistics-figure">{count(found.count)}</span>
                  {found.count > 0 ? (
                    <LinkButton
                      go
                      className="plays__unplayed-open"
                      aria-label={`${goTo("Library")}: ${label}`}
                      onClick={() => open(found.rules)}
                    >
                      {goTo("Library")}
                    </LinkButton>
                  ) : (
                    <span className="plays__unplayed-open" aria-hidden="true" />
                  )}
                </div>
              ))}
            </Card>
        </div>
      )}
    </div>
  );
}

/** The one Collection-making verb (M409). */
const SAVE_AS_COLLECTION = "Save as a Collection";

/** Plays' Collection goes to the top level: there are no folders to offer here. */
const NO_FOLDERS: never[] = [];

/**
 * Where the counts come from (M431): "Rekordbox play counts · refreshed Oct 14", and the history's
 * start only when it is later than the Since chosen, so it matters to the counts.
 */
export function playsSource(data: StatisticsPlays): string {
  if (!data.last_read) return "Rekordbox play counts · no refresh recorded yet";
  const line = `Rekordbox play counts · refreshed ${sinceStamp(data.last_read)}`;
  const from = data.history_from;
  const later = from !== null && data.since !== null && Date.parse(from) > Date.parse(data.since);
  return later ? `${line} · history from ${sinceStamp(from)}` : line;
}
