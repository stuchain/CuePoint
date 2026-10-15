/**
 * The side panel of the review table: one track, straight on its Beatport candidates.
 *
 * **Your track** at the top, labelled as yours and from your library (its art, a big title, the
 * artists, then label · key · BPM · length · year, and a play button to hear it). Under "Found on
 * Beatport" is **every candidate** the matcher scored, each with its title (the words that differ
 * from yours in orange), its artists, its facts line, why it was ruled out when it was, a play
 * button and **Use this**; the one the track is matched with is tinted green and marked **in use**.
 * Below: a search box and **Search Beatport** (the in-app search, scored by the matcher like every
 * other result, with the sign-in or a failure said in words), and **None of these — leave it
 * out**, which unticks the track. **More** holds the rest: why a candidate scored as it did, and
 * which attempt is being looked at.
 *
 * It decides nothing but through its two callbacks: Use this accepts that candidate (which ticks
 * it), leave it out unticks. Up and Down move to the previous or next track and Esc closes, from
 * the tab (`ReviewTab.tsx`); opening the panel puts the keyboard in it and closing hands it back.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { CandidateDifferences, MatchCandidate, MatchSearchAnswer, ReviewTrack } from "../../../api/cuepointBridge.types";
import { bridgeErrorFields } from "../../../api/bridgeError";
import { userMessage } from "../../../api/userMessage";
import { ArtworkPlaceholder } from "../../../components/ArtworkPlaceholder";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { CloseButton } from "../../../components/CloseButton";
import { Hint } from "../../../components/Hint";
import { Notice } from "../../../components/Notice";
import { PixelIcon } from "../../../components/PixelIcon";
import { PlayButton } from "../../../components/PlayButton";
import { Select } from "../../../components/Select";
import { TextField } from "../../../components/TextField";
import { useBeatportPreview } from "../../../components/preview/useBeatportPreview";
import { couldNot } from "../../../format/words";
import { formatLength } from "../../../format/durations";
import { FACTS_SEPARATOR, trackFactParts } from "../../../format/trackFacts";
import { formatMatchScore } from "../../../format/units";
import { openOnBeatport } from "../../discover/openOnBeatport";
import { toQueueItem } from "../../library/useLibraryPlayback";
import { attemptLabel } from "../cleanFormat";
import { SCORE_ROWS, scoreLine } from "../comparison";
import { useTrackArtwork } from "../useTrackArtwork";
import { useTrackMatches } from "../useTrackMatches";
import { statusLabel, statusTone } from "./reviewList";

/** Said when there is no Beatport sign-in to search with. */
export const SIGN_IN_WORDS = "Sign in to Beatport in Settings to search from CuePoint.";

/** Said while a match runs: searching waits. */
const ONE_AT_A_TIME = "One match at a time: wait for the one that is running.";

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
  /** Use this: accept that candidate, which ticks the track. */
  onUse: (candidateId: number) => void;
  /** None of these — leave it out: untick the track. */
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
  busy,
  onUse,
}: {
  candidate: MatchCandidate;
  inUse: boolean;
  busy: boolean;
  onUse: () => void;
}) {
  const preview = useBeatportPreview({ kind: "candidate", id: candidate.id });
  const playing = preview.state === "playing";
  const label = [candidate.title, candidate.artists].filter(Boolean).join(" by ");
  return (
    <li className={`review-candidate${inUse ? " review-candidate--in-use" : ""}`}>
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
      </div>
      <PlayButton
        aria-label={playing ? `Stop the preview of ${label}` : `Play the Beatport preview of ${label}`}
        playing={playing}
        disabled={!preview.canPreview || preview.state === "none" || preview.state === "loading"}
        onClick={preview.toggle}
      />
      {inUse ? (
        <span className="review-candidate__use review-candidate__use--in-use">
          <PixelIcon name="clean" /> in use
        </span>
      ) : (
        <Button
          size="sm"
          className="review-candidate__use"
          disabled={busy}
          aria-label={`Use this: ${label}`}
          onClick={onUse}
        >
          Use this
        </Button>
      )}
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
  const shown = useMemo(() => [...listed].sort((a, b) => a.rank - b.rank), [listed]);
  const scoredCandidate = shown.find((entry) => entry.id === (scored ?? inUseId)) ?? shown[0] ?? null;

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
  const nothingNote =
    shown.length === 0 && !matches.loading && !found
      ? attempt?.outcome === "error"
        ? (
            // The plain sentence says it; the matcher's own reason is only in the hint.
            <>
              {couldNot("search Beatport for this track")}{" "}
              <Hint text={attempt.error ?? "No reason was recorded."} inline>
                <span className="cp-link" tabIndex={0}>Details</span>
              </Hint>
            </>
          )
        : "Beatport has no candidates for this track yet. Search below."
      : null;

  return (
    <aside
      ref={root}
      tabIndex={-1}
      className="review-panel cp-side-panel"
      aria-label={`Candidates for ${row.title}`}
      aria-busy={busy || undefined}
    >
      <header className="review-panel__header">
        <strong className="review-panel__title">{row.title}</strong>
        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
        <span className="review-panel__position">
          {position.toLocaleString()} of {total.toLocaleString()}
        </span>
        <span className="review-panel__hint">Up and Down move · Esc closes</span>
        <CloseButton onClick={onClose} />
      </header>

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
      {matches.error && <Notice kind="problem">{matches.error}</Notice>}
      {matches.loading && shown.length === 0 && <p className="review-panel__note">Reading its candidates…</p>}
      {nothingNote && <p className="review-panel__note">{nothingNote}</p>}
      {shown.length > 0 && (
        <ul className="review-candidates" aria-label="Beatport candidates">
          {shown.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              inUse={row.ticked && candidate.id === inUseId}
              busy={busy}
              onUse={() => onUse(candidate.id)}
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
      {matching && <p className="review-panel__note">{ONE_AT_A_TIME}</p>}
      {problem && <Notice kind="problem">{problem}</Notice>}
      {found?.failure && <Notice kind="problem">{found.failure}</Notice>}
      {found && !found.failure && found.candidates.length === 0 && (
        <p className="review-panel__note">{`Beatport found nothing for “${found.query}”.`}</p>
      )}

      <div className="review-panel__actions">
        <Button variant="secondary" disabled={busy || !row.ticked} onClick={onLeaveOut}>
          None of these — leave it out
        </Button>
        <Button
          variant="quiet"
          className="review-panel__more-toggle"
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? moreId : undefined}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          {moreOpen ? "Less ‹" : "More ›"}
        </Button>
      </div>

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
    </aside>
  );
}
