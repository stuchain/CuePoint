/**
 * The side panel of the review table: one track, straight on its Beatport candidates.
 *
 * Your file at the top (its art, and ▶ to hear it), then **every candidate** the matcher scored,
 * each with ▶, its title and version, artists, BPM, key and year, and **Use this**; the one the
 * track is matched with is marked **✓ in use**. Below: a search box and **Search Beatport** (the
 * in-app search, scored by the matcher like every other result, with the sign-in or a failure said
 * in words), and **None of these — leave it out**, which unticks the track. **More** holds the
 * rest: why a candidate scored as it did, and which attempt is being looked at.
 *
 * It decides nothing but through its two callbacks: Use this accepts that candidate (which ticks
 * it), leave it out unticks. Up and Down move to the previous or next track and Esc closes, from
 * the tab (`ReviewTab.tsx`); opening the panel puts the keyboard in it and closing hands it back.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { CandidateDifferences, MatchCandidate, MatchSearchAnswer, ReviewTrack } from "../../../api/cuepointBridge.types";
import { bridgeErrorFields } from "../../../api/bridgeError";
import { userMessage } from "../../../api/userMessage";
import { Button } from "../../../components/Button";
import { PixelIcon } from "../../../components/PixelIcon";
import { Select } from "../../../components/Select";
import { TextField } from "../../../components/TextField";
import { useBeatportPreview } from "../../../components/preview/useBeatportPreview";
import { openOnBeatport } from "../../discover/openOnBeatport";
import { toQueueItem } from "../../library/useLibraryPlayback";
import { formatBpm } from "../../library/trackValues";
import { attemptLabel } from "../cleanFormat";
import { SCORE_ROWS, scoreLine } from "../comparison";
import { useTrackArtwork } from "../useTrackArtwork";
import { useTrackMatches } from "../useTrackMatches";
import { camelotOf } from "./matchCard";
import { statusLabel } from "./reviewList";

/** Said when there is no Beatport sign-in to search with. */
export const SIGN_IN_WORDS =
  "Sign in to Beatport in Settings to search from CuePoint. Search Beatport myself… still works in your browser.";

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

/** "126 · 8A · 1999", leaving out what is not there. */
function valueLine(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
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
    <div className="review-panel__art review-panel__art--none" aria-hidden />
  );
}

function PlayButton({
  label,
  playing,
  disabled,
  onClick,
}: {
  label: string;
  playing: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="review-preview"
      aria-label={label}
      aria-pressed={playing}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden>{playing ? "■" : "▶"}</span>
    </button>
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
  const key = camelotOf(candidate.key);
  const label = [candidate.title, candidate.artists].filter(Boolean).join(" by ");
  return (
    <li className={`review-candidate${inUse ? " review-candidate--in-use" : ""}`}>
      <PlayButton
        label={playing ? `Stop the preview of ${label}` : `Play the Beatport preview of ${label}`}
        playing={playing}
        disabled={!preview.canPreview || preview.state === "none" || preview.state === "loading"}
        onClick={preview.toggle}
      />
      <div className="review-candidate__facts">
        <p className="review-candidate__title">
          {titleParts(candidate).map((part, index) => (
            <span key={index} className={part.differs ? "review-part--differs" : undefined}>
              {index > 0 && " "}
              {part.text}
            </span>
          ))}
        </p>
        <p className="review-candidate__line">
          {valueLine([
            candidate.artists,
            candidate.bpm != null ? `${formatBpm(candidate.bpm)} BPM` : null,
            key,
            candidate.release_year != null ? String(candidate.release_year) : null,
          ]) || "—"}
        </p>
        {!candidate.guard_ok && <p className="review-candidate__why">{scoreLine(candidate)}</p>}
      </div>
      {inUse ? (
        <span className="review-candidate__use review-candidate__use--in-use">
          <PixelIcon name="clean" /> in use
        </span>
      ) : (
        <Button size="sm" className="review-candidate__use" disabled={busy} aria-label={`Use ${label}`} onClick={onUse}>
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
      .then(({ track }) => player.playQueue([toQueueItem(track)], 0))
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
        ? `This attempt failed: ${attempt.error ?? "no reason was recorded"}.`
        : "Beatport has no candidates for this track yet. Search below."
      : null;
  const yourKey = camelotOf(yours?.key);

  return (
    <aside ref={root} tabIndex={-1} className="review-panel" aria-label="Track details" aria-busy={busy || undefined}>
      <header className="review-panel__header">
        <strong className="review-panel__title">{row.title}</strong>
        <span className={`review-status review-status--${row.status}`}>{statusLabel(row.status)}</span>
        <span className="review-panel__position">
          {position.toLocaleString()} of {total.toLocaleString()}
        </span>
        <span className="review-panel__hint">Up and Down move · Esc closes</span>
        <button type="button" className="review-panel__close" aria-label="Close" onClick={onClose}>
          <PixelIcon name="close" />
        </button>
      </header>

      <section className="review-card" aria-label="Your file">
        <Art src={yourArt} />
        <div className="review-card__facts">
          <p className="review-card__title">Your file</p>
          <p className="review-card__line">
            {valueLine([
              yours?.artist ?? row.artist,
              yours?.bpm != null ? `${formatBpm(yours.bpm)} BPM` : null,
              yourKey,
            ])}
          </p>
        </div>
        <PlayButton label="Play your file" playing={false} onClick={playFile} />
      </section>

      <h3 className="review-panel__eyebrow">Beatport candidates · pick the right one</h3>
      {matches.error && (
        <p className="review-panel__note" role="alert">
          {matches.error}
        </p>
      )}
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
        <Button type="submit" variant="secondary" disabled={searching || matching} title={matching ? "One match at a time: wait for the one that is running." : undefined}>
          {searching ? "Searching…" : "Search Beatport"}
        </Button>
      </form>
      {matching && <p className="review-panel__note">One match at a time: wait for the one that is running.</p>}
      {problem && (
        <p className="review-panel__note" role="alert">
          {problem}
        </p>
      )}
      {found?.failure && (
        <p className="review-panel__note" role="alert">
          {found.failure}
        </p>
      )}
      {found && !found.failure && found.candidates.length === 0 && (
        <p className="review-panel__note">{`Beatport found nothing for “${found.query}”.`}</p>
      )}

      <div className="review-panel__actions">
        <Button variant="secondary" disabled={busy || !row.ticked} onClick={onLeaveOut}>
          None of these — leave it out
        </Button>
        <button
          type="button"
          className="review-panel__more-toggle"
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? moreId : undefined}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          {moreOpen ? "Less ‹" : "More ›"}
        </button>
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
                    entry.guard_ok ? `${Math.round(entry.score)}%` : "ruled out"
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
