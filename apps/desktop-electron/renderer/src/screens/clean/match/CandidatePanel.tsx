/**
 * The side panel of the review table: one track, straight on its Beatport candidates.
 *
 * The header is the shared panel header (C29): "Check the match" as a section heading, where the
 * track stands, "3 of 24" and the × on one line. **Your track** is the first card, labelled as
 * yours and from your library (its art, a big title, the artists, then label · key · BPM · length ·
 * year, and a play button to hear it); the name shows once, there. Under "Found on Beatport" is
 * **every candidate** the matcher scored, each with a radio to pick it, its title (the words that
 * differ from yours in orange), its artists, its facts line, why it was ruled out when it was and a
 * play button; the one the track is matched with has a green bar and an **In use** chip. Below: a
 * search box and **Search Beatport** (the in-app search, scored by the matcher like every other
 * result, with the sign-in or a failure said in words). **More** holds the rest: why a candidate
 * scored as it did, and which attempt is being looked at.
 *
 * The two decisions are pinned to the panel's foot (C242), so they never scroll out of reach:
 * **Use this match** accepts the picked candidate (which ticks the track; a double-click on a candidate does the same) and **None of these**
 * leaves the track out (unticks it). Both are grey: the review's one main action is Sync. It
 * decides nothing but through its two callbacks. Up and Down move to the previous or next track,
 * from the tab (`ReviewTab.tsx`); Esc closes, here and there. Opening the panel puts the keyboard
 * in it and closing hands it back.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import type { CandidateDifferences, MatchCandidate, MatchSearchAnswer, ReviewTrack } from "../../../api/cuepointBridge.types";
import { orderCandidates } from "./candidateOrder";
import { bridgeErrorFields } from "../../../api/bridgeError";
import { needsDesktopApp, userMessage } from "../../../api/userMessage";
import { ArtworkPlaceholder } from "../../../components/ArtworkPlaceholder";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { CloseButton } from "../../../components/CloseButton";
import { DisclosureArrow } from "../../../components/DisclosureArrow";
import { EmptyState } from "../../../components/EmptyState";
import { Hint } from "../../../components/Hint";
import { Loading } from "../../../components/Loading";
import { Notice } from "../../../components/Notice";
import { PlayButton } from "../../../components/PlayButton";
import { Select } from "../../../components/Select";
import { TextField } from "../../../components/TextField";
import { useBeatportPreview } from "../../../components/preview/useBeatportPreview";
import { formatCount } from "../../../format/counts";
import { RETRY, USE_MATCH, couldNot } from "../../../format/words";
import { formatLength } from "../../../format/durations";
import { FACTS_SEPARATOR, trackFactParts } from "../../../format/trackFacts";
import { formatMatchScore } from "../../../format/units";
import { openOnBeatport } from "../../discover/openOnBeatport";
import { toQueueItem } from "../../library/useLibraryPlayback";
import { attemptLabel } from "../cleanFormat";
import { SCORE_ROWS, scoreLine } from "../comparison";
import { useCandidateArtwork } from "../useCandidateArtwork";
import { useTrackArtwork } from "../useTrackArtwork";
import { useTrackMatches } from "../useTrackMatches";
import { statusIsQuiet, statusLabel, statusTone } from "./reviewList";

/** Said when there is no Beatport sign-in to search with. */
export const SIGN_IN_WORDS = "Sign in to Beatport in Settings to search from CuePoint.";

/** Said while a match runs: searching waits. */
const ONE_AT_A_TIME = "Wait for the match that is running";

interface CandidatePanelProps {
  row: ReviewTrack;
  /** Where this track stands in the table, for "3 of 24". */
  position: number;
  total: number;
  /** Bumped when a candidate was chosen or a match ended, so the candidates are read again. */
  version: number;
  busy: boolean;
  /** A match runs: searching waits, and says why. */
  matching: boolean;
  onClose: () => void;
  /** Use this match: accept that candidate, which ticks the track. */
  onUse: (candidateId: number) => void;
  /** None of these: untick the track. */
  onLeaveOut: () => void;
  /** A search stored a new attempt for this track: the row takes what it found, in place. */
  onSearched?: (trackId: number, answer: MatchSearchAnswer) => void;
  onMessage: (text: string) => void;
}

/**
 * The facts line under a track's artists: label · key · BPM · length · year, leaving out what is
 * not there. The key is its Camelot code, the BPM and the length are written as everywhere.
 */
function factsLine(facts: {
  label?: string | null;
  key?: string | null;
  bpm?: number | null;
  seconds?: number | null;
  year?: number | null;
}): string {
  const parts = trackFactParts({ label: facts.label, key: facts.key, bpm: facts.bpm });
  if (facts.seconds != null) {
    const length = formatLength(facts.seconds);
    if (length !== "—") parts.push(length);
  }
  if (facts.year != null && facts.year !== 0) parts.push(String(facts.year));
  return parts.join(FACTS_SEPARATOR);
}

/** The names of the fields that differ, as the table says them; the engine decides which do. */
function differingOf(differs: CandidateDifferences | null): string[] {
  if (!differs) return [];
  const names: string[] = [];
  if (differs.title) names.push("title");
  if (differs.mix) names.push("remix");
  if (differs.artists) names.push("artist");
  return names;
}

/** The title with its version in brackets cut out, so only the part that differs is marked. */
function titleParts(candidate: MatchCandidate): Array<{ text: string; differs: boolean }> {
  const names = differingOf(candidate.differs);
  const title = candidate.title ?? "—";
  const mix = candidate.mix;
  const at = mix ? title.lastIndexOf(mix) : -1;
  if (!mix || at < 0) {
    return [{ text: title, differs: names.includes("title") || names.includes("remix") }];
  }
  const start = at > 0 && (title[at - 1] === "(" || title[at - 1] === "[") ? at - 1 : at;
  const close = title[at + mix.length];
  const end = close === ")" || close === "]" ? at + mix.length + 1 : at + mix.length;
  const parts = [
    { text: title.slice(0, start).trimEnd(), differs: names.includes("title") },
    { text: title.slice(start, end), differs: names.includes("remix") },
    { text: title.slice(end).trim(), differs: names.includes("title") },
  ];
  return parts.filter((part) => part.text !== "");
}

function Art({ src }: { src: string | null }) {
  return src ? (
    <img className="review-panel__art" src={src} alt="" />
  ) : (
    <ArtworkPlaceholder className="review-panel__art" label="No artwork" />
  );
}

function CandidateRow({
  candidate,
  inUse,
  picked,
  onPick,
  onUse,
}: {
  candidate: MatchCandidate;
  inUse: boolean;
  /** This candidate is the one the foot's Use this match would take. */
  picked: boolean;
  onPick: () => void;
  /** A double-click: what Use this match does for this candidate. */
  onUse: () => void;
}) {
  const preview = useBeatportPreview({ kind: "candidate", id: candidate.id });
  const playing = preview.state === "playing";
  const label = [candidate.title, candidate.artists].filter(Boolean).join(" by ");
  const cover = useCandidateArtwork(candidate.id, "row");
  return (
    <li
      className={`review-candidate${inUse ? " review-candidate--in-use" : ""}${picked ? " review-candidate--picked" : ""}`}
      data-candidate-id={candidate.id}
      onDoubleClick={(event) => {
        // The play button and the pick keep their own clicks.
        if ((event.target as HTMLElement).closest("button, input")) return;
        onUse();
      }}
    >
      <input
        type="radio"
        name="review-candidate"
        className="review-candidate__pick"
        aria-label={`Pick ${label}`}
        checked={picked}
        onChange={onPick}
      />
      {cover ? (
        <img className="review-candidate__cover" src={cover} alt="" />
      ) : (
        <ArtworkPlaceholder className="review-candidate__cover" label="No artwork" />
      )}
      <div className="review-candidate__facts">
        <p className="review-candidate__title">
          {titleParts(candidate).map((part, index) => (
            <span key={index} className={part.differs ? "review-part--differs" : undefined}>
              {index > 0 && " "}
              {part.text}
            </span>
          ))}
        </p>
        <p className={`review-candidate__artists${candidate.differs?.artists ? " review-part--differs" : ""}`}>
          {candidate.artists || "—"}
        </p>
        <p className="review-candidate__line">
          {factsLine({ label: candidate.label, key: candidate.key, bpm: candidate.bpm, year: candidate.release_year }) || "—"}
        </p>
        {!candidate.guard_ok && <p className="review-candidate__why">{scoreLine(candidate)}</p>}
        {/* Inside the facts, so every play button stays in one column (C76). */}
        {inUse && (
          <p className="review-candidate__in-use-line">
            <Badge tone="success">In use</Badge>
          </p>
        )}
      </div>
      <PlayButton
        aria-label={playing ? `Stop the preview of ${label}` : `Play the Beatport preview of ${label}`}
        playing={playing}
        disabled={!preview.canPreview || preview.state === "none" || preview.state === "loading"}
        onClick={preview.toggle}
      />
    </li>
  );
}

export function CandidatePanel({
  row,
  position,
  total,
  version,
  busy,
  matching,
  onClose,
  onUse,
  onLeaveOut,
  onSearched,
  onMessage,
}: CandidatePanelProps) {
  const trackId = row.track_id;
  const root = useRef<HTMLElement>(null);
  // The track the panel is on now, for an answer that arrives after it has moved on.
  const asked = useRef(trackId);
  asked.current = trackId;
  // Opening the panel puts the keyboard in it; closing hands it back to the row (ReviewTab).
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  const matches = useTrackMatches(trackId, version);
  const yourArt = useTrackArtwork(trackId, "inspector");
  const yourPreview = useBeatportPreview(null);
  const payload = matches.matches;
  const yours = payload?.track ?? null;
  // Your track's length is not in the match payload: read the library's track for it.
  const [yourSeconds, setYourSeconds] = useState<number | null>(null);
  useEffect(() => {
    setYourSeconds(null);
    const read = window.cuepoint?.getLibraryTrack;
    if (!read) return;
    let cancelled = false;
    void read({ trackId })
      .then(({ track }) => {
        if (!cancelled) setYourSeconds(track.duration_seconds ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const [words, setWords] = useState(`${row.title} ${row.artist}`.trim());
  // What searching Beatport from here found: its own results, scored against the track.
  const [found, setFound] = useState<{ candidates: MatchCandidate[]; failure: string | null; query: string } | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scored, setScored] = useState<number | null>(null);
  const moreId = useId();

  // Another track: start again.
  useEffect(() => {
    setWords(`${row.title} ${row.artist}`.trim());
    setFound(null);
    setProblem(null);
    setSearching(false);
    setScored(null);
  }, [trackId, row.title, row.artist]);

  const inUseId = row.candidate?.id ?? null;
  // Results the person searched for replace the ones the last match found.
  const listed = found ? found.candidates : matches.candidates;
  const shown = useMemo(() => orderCandidates(listed, inUseId), [listed, inUseId]);
  const scoredCandidate = shown.find((entry) => entry.id === (scored ?? inUseId)) ?? shown[0] ?? null;
  // The candidate the foot's Use this match takes: the one picked, else the best one not in use yet.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [trackId]);
  // An unticked track starts on the match it has, so Use this match never silently takes another.
  const inUseShown = inUseId !== null && shown.some((entry) => entry.id === inUseId) ? inUseId : null;
  const otherId =
    shown.find((entry) => entry.id !== inUseId && entry.guard_ok)?.id ??
    shown.find((entry) => entry.id !== inUseId)?.id ??
    null;
  const pickedId =
    picked !== null && shown.some((entry) => entry.id === picked)
      ? picked
      : row.ticked
        ? (otherId ?? inUseShown)
        : (inUseShown ?? otherId);
  const pickedInUse = pickedId !== null && row.ticked && pickedId === inUseId;

  const playFile = () => {
    yourPreview.stop();
    const read = window.cuepoint?.getLibraryTrack;
    const player = window.cuepoint?.player;
    if (!read || !player?.playQueue) return;
    void read({ trackId })
      .then(({ track }) =>
        player.playQueue([toQueueItem(track)], 0),
      )
      .then((result) => {
        if (result && !result.ok) onMessage(result.error);
      })
      .catch(() => undefined);
  };

  const searchBeatport = () => {
    const text = encodeURIComponent(words.trim() || `${row.title} ${row.artist}`.trim());
    void openOnBeatport([`https://www.beatport.com/search?q=${text}`]).then((failure) => {
      if (failure) onMessage(failure);
    });
  };

  /** Search Beatport from CuePoint: scored and stored by the engine, shown here with Use this. */
  const search = () => {
    const run = window.cuepoint?.searchMatch;
    const query = words.trim();
    if (!run) {
      searchBeatport();
      return;
    }
    if (!query || matching) return;
    setSearching(true);
    setProblem(null);
    // The answer to a search made on another track must not land on this one.
    const stillHere = () => asked.current === trackId;
    void run({ track_id: trackId, query })
      .then((answer) => {
        // The attempt is stored for the track searched, wherever the panel is now.
        onSearched?.(trackId, answer);
        if (stillHere()) setFound({ candidates: answer.candidates, failure: answer.failure_message, query: answer.query });
      })
      .catch((cause: unknown) => {
        if (stillHere()) {
          setProblem(bridgeErrorFields(cause).code === "BEATPORT_SIGN_IN_NEEDED" ? SIGN_IN_WORDS : userMessage(cause));
        }
      })
      .finally(() => {
        if (stillHere()) setSearching(false);
      });
  };

  const payloadAttempts = payload?.attempts ?? [];
  const state = payload?.state ?? null;
  const attempt = payloadAttempts.find((entry) => entry.id === matches.attemptId) ?? null;
  const nothingNote: { headline: string; description: ReactNode } | null =
    shown.length === 0 && !matches.loading && !found
      ? attempt?.outcome === "error"
        ? {
            headline: couldNot("search Beatport for this track").replace(/[.]$/, ""),
            // The plain sentence says it; the matcher's own reason is only in the hint.
            description: (
              <Hint text={attempt.error ?? "No reason was recorded"} inline>
                <span className="cp-link" tabIndex={0}>Details</span>
              </Hint>
            ),
          }
        : { headline: "Beatport has no candidates for this track yet", description: "Search below" }
      : null;

  return (
    <aside
      ref={root}
      tabIndex={-1}
      className="review-panel cp-side-panel"
      aria-label={`Candidates for ${row.title}`}
      aria-busy={busy || undefined}
      onKeyDown={(event) => {
        // Esc closes the panel from inside it too (C29); a field keeps its own Esc.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // A radio or a tick is not a text field: Esc from a candidate's radio closes the panel.
        if ((event.target as HTMLElement).closest("textarea, select, input:not([type=radio]):not([type=checkbox])")) return;
        event.preventDefault();
        onClose();
      }}
    >
      <header className="cp-panel-header review-panel__header">
        <h3 className="cp-panel-header__title">Check the match</h3>
        {statusIsQuiet(row.status) ? (
          <span className="cp-quiet-ok">{statusLabel(row.status)}</span>
        ) : (
          <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
        )}
        <span className="review-panel__position">
          {formatCount(position)} of {formatCount(total)}
        </span>
        <CloseButton onClick={onClose} />
      </header>

      <div className="review-panel__scroll">
        <p className="review-panel__hint">Up and Down move · Double-click uses a match · Esc closes</p>

        <section className="review-card" aria-label="Your track">
          <Art src={yourArt} />
          <div className="review-card__facts">
            <p className="cp-text-label review-card__eyebrow">Your track · from your library</p>
            <p className="review-card__title">{yours?.title ?? row.title}</p>
            <p className="review-card__artists">{yours?.artist ?? row.artist}</p>
            <p className="review-card__line">
              {factsLine({
                label: yours?.label,
                key: yours?.key,
                bpm: yours?.bpm,
                seconds: yourSeconds,
                year: yours?.year,
              })}
            </p>
          </div>
          <PlayButton aria-label="Play your track" playing={false} onClick={playFile} />
        </section>

        <h3 className="cp-text-label review-panel__eyebrow">Found on Beatport · pick the right one</h3>
        {matches.error && (
          <Notice
            kind="danger"
            action={
              matches.error === needsDesktopApp() ? undefined : (
                <Button variant="secondary" onClick={matches.reload}>
                  {RETRY}
                </Button>
              )
            }
          >
            {matches.error}
          </Notice>
        )}
        {matches.loading && shown.length === 0 && <Loading what="its candidates" />}
        {nothingNote && <EmptyState compact headline={nothingNote.headline} description={nothingNote.description} />}
        {shown.length > 0 && (
          <ul className="review-candidates" role="radiogroup" aria-label="Beatport candidates">
            {shown.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                inUse={row.ticked && candidate.id === inUseId}
                picked={candidate.id === pickedId}
                onPick={() => setPicked(candidate.id)}
                onUse={() => {
                  if (busy || (row.ticked && candidate.id === inUseId)) return;
                  setPicked(candidate.id);
                  onUse(candidate.id);
                }}
              />
            ))}
          </ul>
        )}

        <form
          className="review-panel__search"
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
        >
          <TextField label="Search Beatport for" value={words} onChange={(event) => setWords(event.target.value)} />
          <Hint text={matching ? ONE_AT_A_TIME : undefined}>
            <Button type="submit" variant="secondary" disabled={searching || matching}>
              {searching ? "Searching…" : "Search Beatport"}
            </Button>
          </Hint>
        </form>
        {problem && <Notice kind="danger">{problem}</Notice>}
        {found?.failure && <Notice kind="danger">{found.failure}</Notice>}
        {found && !found.failure && found.candidates.length === 0 && (
          <p className="review-panel__note">{`Beatport found nothing for “${found.query}”`}</p>
        )}

        <Button
          variant="quiet"
          className="review-panel__more-toggle"
          icon={<DisclosureArrow open={moreOpen} />}
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? moreId : undefined}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          More
        </Button>

        {moreOpen && (
          <div id={moreId} className="review-panel__more">
            {payloadAttempts.length > 1 && (
              <Select
                className="review-panel__attempts"
                label="Attempt"
                id="review-attempt"
                value={String(matches.attemptId ?? "")}
                onChange={(event) => {
                  setFound(null);
                  matches.chooseAttempt(Number(event.target.value));
                }}
                options={payloadAttempts.map((entry, index) => ({
                  value: String(entry.id),
                  label: attemptLabel(entry, index, state?.attempt_id ?? null),
                }))}
              />
            )}
            {shown.length > 0 && scoredCandidate && (
              <>
                <Select
                  label="Why this score?"
                  id="review-score-candidate"
                  value={String(scoredCandidate.id)}
                  onChange={(event) => setScored(Number(event.target.value))}
                  options={shown.map((entry) => ({
                    value: String(entry.id),
                    label: `${entry.rank + 1} · ${entry.mix ?? entry.title ?? "Result"} · ${
                      entry.guard_ok ? formatMatchScore(entry.score) : "ruled out"
                    }`,
                  }))}
                />
                <table className="review-panel__score-table">
                  <caption className="match-visually-hidden">How the matcher scored this candidate</caption>
                  <tbody>
                    {SCORE_ROWS.map((entry) => (
                      <tr key={entry.id}>
                        <th scope="row">{entry.label}</th>
                        <td className={entry.id === "guard" && !scoredCandidate.guard_ok ? "review-card__score--refused" : undefined}>
                          {entry.candidate(scoredCandidate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>

      {/* The two decisions, pinned to the foot so they never scroll out of reach (C242). */}
      <footer className="review-panel__foot cp-button-row">
        <Hint text={pickedId === null ? "No candidate to use" : pickedInUse ? "This match is already in use" : undefined}>
          <Button
            variant="secondary"
            disabled={busy || pickedId === null || pickedInUse}
            onClick={() => pickedId !== null && onUse(pickedId)}
          >
            {USE_MATCH}
          </Button>
        </Hint>
        <Hint text={!row.ticked ? "This track is already left out" : undefined}>
          <Button variant="secondary" disabled={busy || !row.ticked} onClick={onLeaveOut}>
            None of these, leave it out
          </Button>
        </Hint>
      </footer>
    </aside>
  );
}
