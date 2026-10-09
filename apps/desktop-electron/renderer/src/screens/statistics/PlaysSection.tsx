/**
 * The Plays section of the Statistics page (STATS-05, DEC-166, DEC-167).
 *
 * Most played tracks with a length and a "since" choice, the top artists and labels, the
 * counts of never played and plays unknown, and a button that keeps the list as a Collection.
 * Every number is the route's; every click opens exactly the tracks the number counted (a
 * since-a-date artist or label says it opens more). The page's frame, loading and failed
 * states stay in `StatisticsScreen.tsx`; this is the body of its Plays section.
 *
 * The bar on a row is whole blocks of the interface unit (`PixelBars` draws a sized chart in an
 * SVG, which does not fit a list row), so it scales and themes with everything else. The one
 * motion is `state`: a row whose rank moved when the list was read again steps once.
 */
import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsArtist,
  StatisticsLabel,
  StatisticsPlays,
  StatisticsTrack,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { PixelIcon } from "../../components/PixelIcon";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import { changedMark, useCountChanges } from "../../components/wheel/useCountChanges";
import { isEngineRefusal } from "../../api/bridgeError";
import { reportUnexpected } from "../../reporting/reporting";
import { libraryRulesState, libraryTrackState } from "../library/libraryLink";
import { runQueueAction } from "../library/trackDetailsActions";
import {
  PLAYS_LIMITS,
  SINCE_OPTIONS,
  collectionName,
  dayWords,
  FIRST_YEAR,
  isValidDay,
  localDay,
  savePlaysChoice,
  stampWords,
  type PlaysChoice,
  type PlaysLimit,
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

/** How many artists and labels are listed. */
const TOP_ROWS = 10;
/** The longest bar, in blocks. */
const BAR_BLOCKS = 24;

function count(n: number): string {
  return n.toLocaleString("en-US");
}

function playsWord(n: number): string {
  return `${count(n)} ${n === 1 ? "play" : "plays"}`;
}

function tracksWord(n: number): string {
  return `${count(n)} ${n === 1 ? "track" : "tracks"}`;
}

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
  const ids = useId();
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

  const topPlays = data.tracks[0]?.plays ?? 0;
  const windowed = choice.since !== "all" && !(dateChosen && choice.since === "date:");
  const noHistory = data.history_from === null;
  const open = (rules: FilterRuleSet) => navigate("/library", { state: libraryRulesState(rules) });

  const preview = async (track: StatisticsTrack) => {
    setMessage(null);
    try {
      const detail = await window.cuepoint?.getLibraryTrack?.({ trackId: track.id });
      if (!detail) {
        setMessage("That track could not be read.");
        return;
      }
      const outcome = await runQueueAction("play", [detail.track]);
      if (outcome) setMessage(outcome.message);
    } catch (cause) {
      if (!isEngineRefusal(cause)) reportUnexpected(cause);
      setMessage("That track could not be read.");
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
    ? "No plays are recorded for that yet."
    : windowed
      ? "No plays were recorded in that time."
      : "None of these tracks has been played yet.";

  return (
    <div className={`plays${stale ? " plays--stale" : ""}`} aria-busy={stale || undefined}>
      <div className="plays__controls">
        <Select
          label="Top"
          value={String(choice.limit)}
          options={PLAYS_LIMITS.map((n) => ({ value: String(n), label: `Top ${n}` }))}
          onChange={(event) =>
            change({ ...choice, limit: Number(event.target.value) as PlaysLimit })
          }
        />
        <Select
          label="Since"
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

      {stale && (
        <p className="statistics-note" role="status">
          Reading…
        </p>
      )}
      {failed && (
        <div className="plays__failed" role="alert">
          <p className="statistics-note">
            These plays could not be read, so what is shown is the earlier list.
          </p>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}

      {data.since_clamped && data.history_from && (
        <p className="statistics-note" role="status">
          Your play history starts on {stampWords(data.history_from)}, so the counts begin there
          rather than on {data.since ? dayWords(data.since) : "that day"}.
        </p>
      )}
      {choice.since === "refresh" && data.last_read && data.history_from === data.last_read && (
        <p className="statistics-note">
          There has been no refresh since the import, so there is nothing to count yet.
        </p>
      )}

      {noRefresh && (
        <p className="statistics-note">
          There is no refresh to count from yet. Choose another
          time, or refresh from Rekordbox.
        </p>
      )}

      {!noRefresh && (
      <>
      <h3 className="plays__title" id={`${ids}-tracks`}>
        Most played
      </h3>
      {data.tracks.length === 0 ? (
        <p className="statistics-note">{emptyWords}</p>
      ) : (
        <ol className="plays__list" aria-labelledby={`${ids}-tracks`}>
          {data.tracks.map((track, index) => {
            const blocks = Math.max(1, Math.round((track.plays / Math.max(1, topPlays)) * BAR_BLOCKS));
            return (
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
                  <span className="plays__rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="plays__what" aria-hidden="true">
                    <span className="plays__name">{track.title}</span>
                    <span className="plays__artist">{track.artist}</span>
                  </span>
                  <span className="plays__bar" aria-hidden="true">
                    <span className="plays__fill" style={{ ["--blocks" as string]: blocks }} />
                  </span>
                  <span className="plays__count" aria-hidden="true">
                    {count(track.plays)}
                  </span>
                </button>
                {canPreview && (
                  <button
                    type="button"
                    className="plays__preview"
                    aria-label={`Preview ${track.title} by ${track.artist}`}
                    onClick={() => void preview(track)}
                  >
                    <PixelIcon name="play" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
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
          onClick={() => void keep()}
        >
          Keep as Collection
        </Button>
        {data.tracks.length > 0 && (
          <span className="statistics-note">Will be named “{name}”.</span>
        )}
      </div>
      )}
      {kept && (
        <p className="statistics-note" role="status">
          Kept {tracksWord(kept.tracks)} in rank order as “{kept.name}”, in Collections in the
          Library.{" "}
          <button type="button" className="plays__link" onClick={() => openKept(kept)}>
            Open it in the Library
          </button>
        </p>
      )}
      {keepFailed && (
        <p className="statistics-note" role="alert">
          {keepFailed}{" "}
          {staleList && onRetry && (
            <button type="button" className="plays__link" onClick={onRetry}>
              Read the list again
            </button>
          )}
        </p>
      )}

      <div className="plays__pair">
        <Ranking
          title="Top artists"
          rows={data.artists.slice(0, TOP_ROWS).map((a: StatisticsArtist) => ({
            id: a.name_key,
            name: a.name,
            plays: a.plays,
            tracks: a.tracks,
            rules: a.rules,
            opensMore: a.opens_more,
          }))}
          onOpen={open}
        />
        <Ranking
          title="Top labels"
          rows={data.labels.slice(0, TOP_ROWS).map((l: StatisticsLabel) => ({
            id: l.label_key,
            name: l.name,
            plays: l.plays,
            tracks: l.tracks,
            rules: l.rules,
            opensMore: l.opens_more,
          }))}
          onOpen={open}
        />
      </div>

      <div className="plays__unplayed">
        <Button
          variant="secondary"
          disabled={data.never_played.count === 0}
          onClick={() => open(data.never_played.rules)}
        >
          {`Never played: ${count(data.never_played.count)}`}
        </Button>
        <Button
          variant="secondary"
          disabled={data.unknown.count === 0}
          onClick={() => open(data.unknown.rules)}
        >
          {`Plays unknown: ${count(data.unknown.count)}`}
        </Button>
      </div>
      </>
      )}

      <p className="statistics-note plays__footer">{footer(data)}</p>
    </div>
  );
}

/** "Counts from your refresh on Nov 2. History since Oct 8." */
function footer(data: StatisticsPlays): string {
  if (!data.last_read || !data.history_from) {
    return "No refresh has been recorded yet. The counts are the ones in your library.";
  }
  return `Counts from your refresh on ${stampWords(data.last_read)}. History since ${stampWords(data.history_from)}.`;
}

interface RankingRow {
  id: string;
  name: string;
  plays: number;
  tracks: number;
  rules: FilterRuleSet;
  opensMore: boolean;
}

function Ranking({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: RankingRow[];
  onOpen: (rules: FilterRuleSet) => void;
}) {
  const id = useId();
  return (
    <div className="plays__ranking">
      <h3 className="plays__title" id={id}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="statistics-note">No plays to rank.</p>
      ) : (
        <ol className="plays__list" aria-labelledby={id}>
          {rows.map((row, index) => (
            <li key={row.id} className="plays__item plays__item--stack">
              <button
                type="button"
                className="plays__row"
                aria-label={`${index + 1}. ${row.name}, ${playsWord(row.plays)}, ${tracksWord(row.tracks)}${row.opensMore ? `. Shows all of ${row.name}'s played tracks` : ""}`}
                onClick={() => onOpen(row.rules)}
              >
                <span className="plays__rank" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="plays__what" aria-hidden="true">
                  <span className="plays__name">{row.name}</span>
                  <span className="plays__artist">
                    {tracksWord(row.tracks)}
                    {row.opensMore ? ` · Shows all of ${row.name}'s played tracks` : ""}
                  </span>
                </span>
                <span className="plays__count" aria-hidden="true">
                  {count(row.plays)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
