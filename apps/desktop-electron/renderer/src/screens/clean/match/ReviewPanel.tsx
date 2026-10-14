/**
 * The panel beside the review list: one track's details, or the search for one that was not found.
 *
 * **Details**: your file beside the match Beatport found, with the art and a preview of each, the
 * other results behind **show ›**, and the three decisions, **Correct** (Enter), **Not this track**
 * (N) and **Skip** (S). **Search**: a box prefilled with "title artist", the results the matcher
 * scored with **Use this**, and **Leave unmatched** (N) and **Skip** (S). ↑ and ↓ move between
 * tracks and Esc closes (matchKeyboard.ts).
 *
 * The choice of result is this panel's: it survives the matches being read again as long as it is
 * still one of them (CLEAN-14), and a new track starts from the default. The key listener is a
 * layout effect, replaced in the commit that shows the panel the commands it reads, so a key
 * pressed between commits is not lost.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { EntityKind, MatchCandidate, MatchSearchAnswer, ReviewTrack } from "../../../api/cuepointBridge.types";
import { bridgeErrorFields } from "../../../api/bridgeError";
import { userMessage } from "../../../api/userMessage";
import { Button } from "../../../components/Button";
import { PixelIcon } from "../../../components/PixelIcon";
import { Select } from "../../../components/Select";
import { TextField } from "../../../components/TextField";
import { queryShown } from "../../../components/shell/pageActive";
import { NO_VALUE } from "../../../words";
import { openOnBeatport } from "../../discover/openOnBeatport";
import { CreditLinks } from "../../library/CreditLinks";
import { toQueueItem } from "../../library/useLibraryPlayback";
import { useTrackDetail } from "../../library/useTrackDetail";
import { formatBpm } from "../../library/trackValues";
import { attemptLabel, decisionLine } from "../cleanFormat";
import {
  SCORE_ROWS,
  defaultChoice,
  loadScoreOpen,
  saveScoreOpen,
  scoreLine,
  stepChoice,
  visibleCandidates,
} from "../comparison";
import { useTrackArtwork } from "../useTrackArtwork";
import { useTrackMatches } from "../useTrackMatches";
import { CARD_FIELD_LABELS, CARD_FIELDS, camelotOf, type CardField } from "./matchCard";
import { MATCH_KEYS, matchCommand, type MatchCommand } from "./matchKeyboard";
import { statusLabel } from "./reviewList";
import { useCandidateMedia } from "./useCandidateMedia";

export type PanelMode = "details" | "search";

interface ReviewPanelProps {
  row: ReviewTrack;
  mode: PanelMode;
  /** Where this track stands in the list as shown, for "1 of 24". */
  position: number;
  total: number;
  /** Bumped when a decision was made or a match ended, so the matches are read again. */
  version: number;
  busy: boolean;
  /** A match runs: searching again waits. */
  matching: boolean;
  ticks: ReadonlySet<CardField>;
  onToggleTick: (field: CardField) => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSkip: () => void;
  /** Correct, or Use this, for one of the track's results. */
  onCorrect: (candidateId: number) => void;
  /** Not this track, or Leave unmatched. */
  onNotThis: () => void;
  onSearchAgain: () => void;
  onMessage: (text: string) => void;
  /** Open an artist or label page from the credits of the track. */
  onOpenEntity?: (kind: EntityKind, ref: string) => void;
  /** A search stored a new attempt for this track: the row takes what it found, in place. */
  onSearched?: (trackId: number, answer: MatchSearchAnswer) => void;
}

/** Said when there is no Beatport sign-in to search with. */
export const SIGN_IN_WORDS = "Sign in to Beatport in Settings to search from CuePoint. Search Beatport myself… still works in your browser.";

/** "126 BPM · 8A", leaving out what is not there. */
function valueLine(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

function Art({ src, caption }: { src: string | null; caption: string }) {
  return src ? (
    <img className="review-panel__art" src={src} alt="" data-caption={caption} />
  ) : (
    <div className="review-panel__art review-panel__art--none" aria-hidden />
  );
}

export function ReviewPanel({
  row,
  mode,
  position,
  total,
  version,
  busy,
  matching,
  ticks,
  onToggleTick,
  onClose,
  onPrevious,
  onNext,
  onSkip,
  onCorrect,
  onNotThis,
  onSearchAgain,
  onMessage,
  onOpenEntity,
  onSearched,
}: ReviewPanelProps) {
  const trackId = row.track_id;
  const root = useRef<HTMLElement>(null);
  // The track the panel is on now, for an answer that arrives after it has moved on.
  const asked = useRef(row.track_id);
  asked.current = row.track_id;
  // Opening the panel puts the keyboard in it; closing hands it back to the row (ReviewRun).
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  const matches = useTrackMatches(trackId, version);
  const credits = useTrackDetail(mode === "details" && onOpenEntity ? trackId : null).detail?.credits;
  const yourArt = useTrackArtwork(trackId, "inspector");
  const payload = matches.matches;
  const state = payload?.state ?? null;
  const attempt = payload?.attempts.find((entry) => entry.id === matches.attemptId) ?? null;

  const [chosenId, setChosenId] = useState<number | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(loadScoreOpen);
  const [words, setWords] = useState(`${row.title} ${row.artist}`.trim());
  // What searching Beatport from here found: its own results, scored against the track.
  const [found, setFound] = useState<{ candidates: MatchCandidate[]; failure: string | null; query: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choiceAttempt = useRef<number | null>(null);
  useEffect(() => {
    const sameAttempt = choiceAttempt.current === matches.attemptId;
    choiceAttempt.current = matches.attemptId;
    setChosenId((current) =>
      sameAttempt && current != null && matches.candidates.some((candidate) => candidate.id === current)
        ? current
        : defaultChoice(state, matches.candidates),
    );
  }, [matches.attemptId, matches.candidates, state]);

  // Another track, or the other kind of panel: start again.
  useEffect(() => {
    setResultsOpen(false);
    setWords(`${row.title} ${row.artist}`.trim());
    setFound(null);
    setProblem(null);
    setSearching(false);
  }, [trackId, mode, row.title, row.artist]);

  const shown = useMemo(
    () => visibleCandidates(matches.candidates, resultsOpen, chosenId),
    [chosenId, matches.candidates, resultsOpen],
  );
  const chosen = matches.candidates.find((candidate) => candidate.id === chosenId) ?? null;
  const media = useCandidateMedia(chosen?.id ?? null);
  const { stopPreview, togglePreview } = media;
  const others = matches.candidates.filter((candidate) => candidate.id !== chosenId);

  // One guard per decision, shared by its button and its key.
  const canCorrect = !busy && chosen !== null;
  const canNotThis = !busy;
  const canPreview = chosen !== null && media.canPreview && media.preview !== "loading";

  const playFile = () => {
    stopPreview();
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

  /** Search Beatport from CuePoint: scored and stored by the engine, shown here with Use this. */
  const searchHere = () => {
    const search = window.cuepoint?.searchMatch;
    const query = words.trim();
    if (!search) {
      searchBeatport();
      return;
    }
    if (!query || matching) return;
    setSearching(true);
    setProblem(null);
    // The answer to a search made on another track must not land on this one.
    const stillHere = () => asked.current === trackId;
    void search({ track_id: trackId, query })
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

  const searchBeatport = () => {
    const text = encodeURIComponent(words.trim() || `${row.title} ${row.artist}`.trim());
    void openOnBeatport([`https://www.beatport.com/search?q=${text}`]).then((problem) => {
      if (problem) onMessage(problem);
    });
  };

  const command = (which: MatchCommand): boolean => {
    switch (which) {
      case "previous-track":
        onPrevious();
        return true;
      case "next-track":
        onNext();
        return true;
      case "skip":
        if (!busy) onSkip();
        return true;
      case "previous-candidate":
        setChosenId(stepChoice(shown, chosenId, -1));
        return true;
      case "next-candidate":
        setChosenId(stepChoice(shown, chosenId, 1));
        return true;
      case "correct":
        if (mode === "details" && chosen && canCorrect) onCorrect(chosen.id);
        return true;
      case "not-this":
        if (canNotThis) onNotThis();
        return true;
      case "play-preview":
        if (canPreview) togglePreview();
        return true;
      case "play-file":
        playFile();
        return true;
      case "stop-preview":
        // Esc stops a sounding preview first; with none, it closes the panel.
        if (media.preview === "playing" || media.preview === "loading") {
          stopPreview();
        } else {
          onClose();
        }
        return true;
    }
  };

  const latest = useRef(command);
  latest.current = command;
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // A dialog of the page, or a menu, owns the keys while it is open.
      if (queryShown('[role="dialog"], dialog[open], [role="menu"]')) return;
      const which = matchCommand(event);
      if (!which) return;
      if (latest.current(which)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const resultsId = useId();
  const yours = payload?.track ?? null;
  const yourKey = camelotOf(yours?.key);
  const theirKey = camelotOf(chosen?.key);
  const refused = chosen !== null && !chosen.guard_ok;

  const header = (
    <header className="review-panel__header">
      <span className={`review-status review-status--${row.status}`}>{statusLabel(row.status)}</span>
      <strong className="review-panel__title">{row.title}</strong>
      <span className="review-panel__position">
        {position.toLocaleString()} of {total.toLocaleString()}
      </span>
      <span className="review-panel__hint">Up and Down move · Esc closes</span>
      <button type="button" className="review-panel__close" aria-label="Close" onClick={onClose}>
        <PixelIcon name="close" />
      </button>
    </header>
  );

  const decisions =
    mode === "details" ? (
      <div className="review-panel__actions" role="group" aria-label="Decide">
        <Button className="match-action match-action--correct" disabled={!canCorrect} onClick={() => chosen && onCorrect(chosen.id)}>
          Correct <kbd className="match-key" aria-hidden>{MATCH_KEYS.correct}</kbd>
        </Button>
        <Button variant="danger" disabled={!canNotThis} onClick={onNotThis}>
          Not this track <kbd className="match-key" aria-hidden>{MATCH_KEYS["not-this"]}</kbd>
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onSkip}>
          Skip <kbd className="match-key" aria-hidden>{MATCH_KEYS.skip}</kbd>
        </Button>
      </div>
    ) : (
      <div className="review-panel__actions" role="group" aria-label="Decide">
        <Button variant="secondary" disabled={!canNotThis} onClick={onNotThis}>
          Leave unmatched <kbd className="match-key" aria-hidden>{MATCH_KEYS["not-this"]}</kbd>
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onSkip}>
          Skip <kbd className="match-key" aria-hidden>{MATCH_KEYS.skip}</kbd>
        </Button>
      </div>
    );

  const attemptNote =
    attempt && attempt.outcome !== "matched" && matches.candidates.length === 0 ? (
      <p className="review-panel__note">
        {attempt.outcome === "error"
          ? `This attempt failed: ${attempt.error ?? "no reason was recorded"}.`
          : "Beatport found nothing for this attempt."}
      </p>
    ) : null;

  // Results the person searched for replace the ones the last match found.
  const resultsShown = found ? found.candidates : matches.candidates;

  if (mode === "search") {
    return (
      <aside ref={root} tabIndex={-1} className="review-panel" aria-label="Search for this track">
        {header}
        <form
          className="review-panel__search"
          onSubmit={(event) => {
            event.preventDefault();
            searchHere();
          }}
        >
          <TextField
            label="Search Beatport for"
            value={words}
            onChange={(event) => setWords(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={searching || busy || matching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
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
        {matches.error && (
          <p className="review-panel__note" role="alert">
            {matches.error}
          </p>
        )}
        {!found && attemptNote}
        {resultsShown.length > 0 && (
          <ul className="review-panel__results" aria-label="Results">
            {resultsShown.map((candidate) => (
              <li key={candidate.id} className="review-panel__result">
                <span className="review-panel__result-title">
                  {[candidate.title, candidate.artists, candidate.bpm != null ? `${formatBpm(candidate.bpm)} BPM` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {!candidate.guard_ok && <span className="review-panel__result-why">{scoreLine(candidate)}</span>}
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => onCorrect(candidate.id)}>
                  Use this
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="review-panel__more">
          <Button variant="secondary" disabled={busy || matching} onClick={onSearchAgain}>
            Search again
          </Button>
          <Button variant="secondary" onClick={searchBeatport}>
            Search Beatport myself…
          </Button>
          {matching && <span className="review-panel__note">one match at a time</span>}
        </div>
        {decisions}
      </aside>
    );
  }

  return (
    <aside
      ref={root}
      tabIndex={-1}
      className="review-panel"
      aria-label="Track details"
      aria-busy={busy || undefined}
    >
      {header}
      {matches.error && (
        <p className="review-panel__note" role="alert">
          {matches.error}
        </p>
      )}
      <div className="review-panel__cards">
        <section className="review-card" aria-label="Your file">
          <h3 className="review-card__eyebrow">Your file</h3>
          <div className="review-card__body">
            <Art src={yourArt} caption="your art" />
            <div className="review-card__facts">
              <p className="review-card__title">{yours?.title ?? row.title}</p>
              <p className="review-card__line">
                {onOpenEntity && credits && credits.artists.length > 0 ? (
                  <CreditLinks credit={yours?.artist ?? row.artist} links={credits.artists} onOpen={onOpenEntity} />
                ) : (
                  (yours?.artist ?? row.artist)
                )}
                {" · "}
                {valueLine([yours?.bpm != null ? `${formatBpm(yours.bpm)} BPM` : null, yourKey]) || NO_VALUE}
              </p>
              {onOpenEntity && credits?.label && (
                <p className="review-card__line">
                  <CreditLinks credit={credits.label.name} links={[credits.label]} onOpen={onOpenEntity} />
                </p>
              )}
              <Button size="sm" variant="secondary" aria-label="Play your file" onClick={playFile}>
                <span aria-hidden>▶</span> yours
              </Button>
            </div>
          </div>
        </section>
        <section className="review-card" aria-label="Beatport">
          <h3 className="review-card__eyebrow">Beatport</h3>
          {state && (
            <p className="review-card__state" data-testid="decision">
              {decisionLine(state)}
            </p>
          )}
          {chosen ? (
            <div className="review-card__body">
              <Art src={media.artwork} caption="Beatport art" />
              <div className="review-card__facts">
                <p className="review-card__title">
                  {chosen.title ?? "—"}
                  {chosen.mix && !(chosen.title ?? "").includes(chosen.mix) ? ` (${chosen.mix})` : ""}
                </p>
                <p className="review-card__line">
                  {valueLine([
                    chosen.artists,
                    chosen.bpm != null ? `${formatBpm(chosen.bpm)} BPM` : null,
                    theirKey,
                  ]) || NO_VALUE}
                </p>
                <p className={`review-card__score${refused ? " review-card__score--refused" : ""}`} data-testid="likelihood">
                  {scoreLine(chosen)}
                </p>
                <Button size="sm" variant="secondary" disabled={!canPreview} onClick={togglePreview}>
                  <span aria-hidden>▶</span>{" "}
                  {media.preview === "playing"
                    ? "stop"
                    : media.preview === "loading"
                      ? "getting it…"
                      : "preview"}{" "}
                  <kbd className="match-key" aria-hidden>{MATCH_KEYS["play-preview"]}</kbd>
                </Button>
                {media.preview === "none" && (
                  <p className="review-card__line" role="status">
                    No preview is available for this result.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="review-panel__note">
              {matches.loading ? "Reading its matches…" : (attemptNote ?? "Beatport has no match for this track yet.")}
            </p>
          )}
        </section>
      </div>
      {chosen && attemptNote}

      {others.length > 0 && (
        <div className="review-panel__others">
          <span className="review-panel__others-label">Other results:</span>
          {!resultsOpen && (
            <span className="review-panel__others-names">
              {others
                .slice(0, 2)
                .map((candidate) => candidate.mix ?? candidate.title ?? "Result")
                .join(" · ")}
            </span>
          )}
          <button
            type="button"
            className="review-panel__show"
            aria-expanded={resultsOpen}
            aria-controls={resultsOpen ? resultsId : undefined}
            onClick={() => setResultsOpen(!resultsOpen)}
          >
            {resultsOpen ? "hide ›" : "show ›"}
          </button>
          {resultsOpen && (
            <div id={resultsId} className="review-panel__chips" role="group" aria-label="Other results">
              {shown.map((candidate) => {
                const picked = candidate.id === chosenId;
                const why = candidate.guard_ok ? undefined : scoreLine(candidate);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className="match-chip"
                    aria-pressed={picked}
                    title={why}
                    data-refused={candidate.guard_ok ? undefined : "true"}
                    onClick={() => setChosenId(candidate.id)}
                  >
                    {candidate.rank + 1} · {candidate.mix ?? candidate.title ?? "Result"} ·{" "}
                    {candidate.guard_ok ? `${Math.round(candidate.score)}%` : "ruled out"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {payload && payload.attempts.length > 1 && (
        <Select
          className="review-panel__attempts"
          label="Attempt"
          id="review-attempt"
          value={String(matches.attemptId ?? "")}
          onChange={(event) => matches.chooseAttempt(Number(event.target.value))}
          options={payload.attempts.map((entry, index) => ({
            value: String(entry.id),
            label: attemptLabel(entry, index, state?.attempt_id ?? null),
          }))}
        />
      )}

      {chosen && (
        <div className="review-panel__why">
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={scoreOpen}
            onClick={() => {
              setScoreOpen(!scoreOpen);
              saveScoreOpen(!scoreOpen);
            }}
          >
            Why this score?
          </Button>
          {scoreOpen && (
            <table className="review-panel__score-table">
              <caption className="match-visually-hidden">How the matcher scored this result</caption>
              <tbody>
                {SCORE_ROWS.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">{entry.label}</th>
                    <td className={entry.id === "guard" && refused ? "review-card__score--refused" : undefined}>
                      {entry.candidate(chosen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {chosen && (
        <fieldset className="match-ticks">
          <legend className="match-ticks__legend">When I say “Correct”, also update</legend>
          {CARD_FIELDS.map((field) => (
            <label key={field} className="match-ticks__field">
              <input
                type="checkbox"
                checked={ticks.has(field)}
                disabled={busy}
                onChange={() => onToggleTick(field)}
              />
              <span>{field === "key" ? `${CARD_FIELD_LABELS[field]} (replaces yours)` : CARD_FIELD_LABELS[field]}</span>
            </label>
          ))}
          <span className="match-ticks__note">Rekordbox keeps its own values</span>
        </fieldset>
      )}

      {decisions}
      <div className="review-panel__more">
        <Button size="sm" variant="secondary" onClick={searchBeatport}>
          Search Beatport myself…
        </Button>
        <Button size="sm" variant="secondary" disabled={busy || matching} onClick={onSearchAgain}>
          Search again
        </Button>
      </div>
    </aside>
  );
}
