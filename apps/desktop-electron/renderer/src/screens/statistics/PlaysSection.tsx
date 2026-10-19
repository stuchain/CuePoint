/**
 * The Plays tab of the Statistics page (STATS-05, DEC-166, DEC-167).
 *
 * A "since" choice, then cards: the most played tracks (with their key and BPM, a play button
 * at each row's end, and a button that keeps the list as a Collection), the top artists, labels
 * and genres, and the counts of never played and plays unknown.
 * Every number is the route's; every click opens exactly the tracks the number counted (a
 * since-a-date artist, label or genre says it opens more). The page's frame, loading and failed
 * states stay in `StatisticsScreen.tsx`; this is the body of its Plays tab.
 *
 * The bar behind a name is a share of the top row, drawn by `RankList`. The one motion is
 * `state`: a row whose rank moved when the list was read again steps once.
 */
import { useMemo, useState } from "react";
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
import { Notice } from "../../components/Notice";
import { PlayButton } from "../../components/PlayButton";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import { KeyChip } from "../../components/wheel/KeyChip";
import { changedMark, useCountChanges } from "../../components/wheel/useCountChanges";
import { isEngineRefusal } from "../../api/bridgeError";
import { reportUnexpected } from "../../reporting/reporting";
import { countNoun, formatCount } from "../../format/counts";
import { trackIdentity } from "../../format/trackFacts";
import { RETRY, couldNot, goTo } from "../../format/words";
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
import "./PlaysSection.css";

/**
 * The date field. What is typed is held here and becomes the section's choice only when it is
 * a complete, real day from 1900 to this year, so a half-typed year (`0002-09-01`) is never
 * saved or sent.
 */
function SinceDate({ saved, onDate }: { saved: string; onDate: (day: string) => void }) {
  const [draft, setDraft] = useState(saved);
  const today = localDay(new Date());
  const bad = draft !== "" && !isValidDay(draft);
  const afterToday = !bad && draft !== "" && draft > today;
  return (
    <div className="plays__date">
      <TextField
        label="Since date"
        type="date"
        value={draft}
        min={`${FIRST_YEAR}-01-01`}
        max={today}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (isValidDay(next)) onDate(next);
        }}
      />
      {bad && (
        <p className="statistics-note" role="status">
          Enter a whole date from {FIRST_YEAR} to this year.
        </p>
      )}
      {afterToday && (
        <p className="statistics-note" role="status">
          That date is after today, so there is nothing to count.
        </p>
      )}
    </div>
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
}: PlaysSectionProps) {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [kept, setKept] = useState<Kept | null>(null);
  const [keepFailed, setKeepFailed] = useState<string | null>(null);
  const [staleList, setStaleList] = useState(false);

  const change = (next: PlaysChoice) => {
    savePlaysChoice(next);
    setKept(null);
    setKeepFailed(null);
    setStaleList(false);
    onChoice(next);
  };

  const dateChosen = choice.since.startsWith("date:");
  const sinceValue = dateChosen ? "date" : choice.since;

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
  const keep = async () => {
    const create = window.cuepoint?.createCollectionFrom;
    if (!create || data.tracks.length === 0) return;
    setKeeping(true);
    setKeepFailed(null);
    setStaleList(false);
    setKept(null);
    try {
      const made = await create({ name, parent_id: null, track_ids: data.tracks.map((t) => t.id) });
      setKept({ id: made.collection.id, name: made.collection.name, tracks: data.tracks.length });
    } catch (cause) {
      // A refusal (a track gone since the list was read) is the person's to act on, not a bug.
      if (isEngineRefusal(cause)) {
        setStaleList(true);
        setKeepFailed(
          "A track in the list is no longer in your library. Read the list again and keep it.",
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

  return (
    <div className={`plays${stale ? " plays--stale" : ""}`} aria-busy={stale || undefined}>
      <div className="plays__controls">
        <Select
          label="Since"
          hint={footer(data)}
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
          />
        )}
      </div>

      {stale && <Loading what="plays" />}
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

      {!noRefresh && (
        <div className="statistics-panels">
            <Card
              className="statistics-panel statistics-panel--wide plays__tracks"
              title="Most played tracks"
              unit={`top ${choice.limit}`}
              bodyClassName="statistics-panel__body"
              aria-label="Most played tracks"
            >
              {data.tracks.length === 0 ? (
                <EmptyState compact headline={emptyWords} />
              ) : (
                <>
                  <div
                    className={`plays__columns-head${canPreview ? " plays__columns-head--play" : ""}`}
                    aria-hidden="true"
                  >
                    <span className="rank__hash">#</span>
                    <span>Title</span>
                    <span>Key</span>
                    <span className="rank__number">BPM</span>
                    <span className="rank__number">Plays</span>
                  </div>
                  <ol className="plays__list" aria-label="Most played tracks">
                    {data.tracks.map((track, index) => (
                      <li
                        key={track.id}
                        className="plays__item"
                        data-changed={changedMark(marks, String(track.id))}
                      >
                        <button
                          type="button"
                          className="plays__row"
                          aria-label={`${index + 1}. ${track.title} by ${track.artist}, ${playsWord(track.plays)}`}
                          onClick={() => navigate("/library", { state: libraryTrackState(track.id) })}
                        >
                          <span className="rank__hash statistics-figure" aria-hidden="true">
                            {index + 1}
                          </span>
                          <span className="plays__what" aria-hidden="true">
                            <span className="plays__name">{trackIdentity(track.title, track.artist)}</span>
                          </span>
                          <span className="plays__key" aria-hidden="true">
                            <KeyChip value={track.key} />
                          </span>
                          <span className="rank__number statistics-figure" aria-hidden="true">
                            {formatBpm(track.bpm)}
                          </span>
                          <span
                            className="rank__number rank__number--main statistics-figure"
                            aria-hidden="true"
                          >
                            {count(track.plays)}
                          </span>
                        </button>
                        {canPreview && (
                          <PlayButton
                            className="plays__play"
                            aria-label={`Play ${track.title} by ${track.artist}`}
                            onClick={() => void preview(index)}
                          />
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {message && (
                <p className="statistics-note" role="status">
                  {message}
                </p>
              )}

              <div className="plays__keep">
                {canKeep && (
                  <Button
                    variant="secondary"
                    disabled={data.tracks.length === 0 || keeping || stale}
                    loading={keeping}
                    onClick={() => void keep()}
                  >
                    Keep as Collection
                  </Button>
                )}
                {canKeep && data.tracks.length > 0 && (
                  <span className="statistics-note">Will be named “{name}”</span>
                )}
                {((biggerList && data.tracks.length >= choice.limit) || choice.limit > 10) && (
                  <span className="plays__more">
                    <ShowMore
                      total={25}
                      expanded={!biggerList}
                      onToggle={() => change({ ...choice, limit: biggerList ? 25 : 10 })}
                    />
                  </span>
                )}
              </div>
              {kept && (
                <p className="statistics-note" role="status">
                  Kept {tracksWord(kept.tracks)} in rank order as “{kept.name}”, in Collections in
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

            <RankList
              title="Top genres"
              unit="plays"
              columns={["plays"]}
              rows={data.genres.map((row) => rankRow(row.genre_key, row))}
              empty="No plays to rank"
              onOpen={open}
            />
            <RankList
              title="Top artists"
              unit="tracks · plays"
              columns={["tracks", "plays"]}
              rows={data.artists.map((row) => rankRow(row.name_key, row))}
              empty="No plays to rank"
              onOpen={open}
            />
            <RankList
              title="Top labels"
              unit="tracks · plays"
              columns={["tracks", "plays"]}
              rows={data.labels.map((row) => rankRow(row.label_key, row))}
              empty="No plays to rank"
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
                  ["Plays unknown", data.unknown],
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

/** "From your Rekordbox play counts · history since Mar 3, 2026 · last refresh Oct 14". */
function footer(data: StatisticsPlays): string {
  if (!data.last_read || !data.history_from) {
    return "From your Rekordbox play counts · no refresh recorded yet";
  }
  return `From your Rekordbox play counts · history since ${sinceStamp(data.history_from)} · last refresh ${sinceStamp(data.last_read)}`;
}
