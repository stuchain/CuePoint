/**
 * One at a time: one track per screen, beside the best match Beatport found (C14).
 *
 * Two cards — **Your track** and **Best match on Beatport** — a likelihood
 * between them, the other results as chips, the values Correct will also copy
 * as ticks, and the buttons that decide: **Correct** (A), **Not this track**
 * (R), **Skip** (N) and the other results (← →). Every key has a button; the
 * keys are a way to go faster, never the only way (matchKeyboard.ts).
 *
 * **Correct accepts the match and copies the ticked values as one act**
 * (DEC-004, amended): one `correctMatch`, one batch, one Undo. The matcher's
 * own scoring stays reachable under "Why this score?" (CLN-5).
 *
 * The choice of result is this view's: it survives the candidates being read
 * again (a match ending, Health changing) as long as it is still one of them,
 * because a background reload once put it back to #1 between → and A, so A
 * corrected a result nobody chose (CLEAN-14). A new track, or another attempt,
 * starts from the default again. The key listener is a layout effect for the
 * same kind of reason: it is replaced in the commit that shows the card its
 * commands read, so a key pressed between commits is not lost (CLEAN-14).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { LibraryTrackRow, MatchCandidate } from "../../../api/cuepointBridge.types";
import { Button } from "../../../components/Button";
import { Select } from "../../../components/Select";
import { attemptLabel, decisionLine } from "../cleanFormat";
import {
  CANDIDATE_LIMIT,
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
import {
  CARD_FIELD_LABELS,
  cardRows,
  correctPlan,
  lengthOf,
  tickableRows,
  yoursOf,
  type CardField,
  type CardRow,
  type CorrectPlan,
} from "./matchCard";
import { MATCH_KEYS, matchCommand, type MatchCommand } from "./matchKeyboard";
import { StatusLine, type MatchStatus } from "./StatusLine";
import { useCandidateMedia } from "./useCandidateMedia";

interface OneAtATimeProps {
  /** The track under the cursor; null when the list is empty or still being read. */
  row: LibraryTrackRow | null;
  /** Bumped when matching ends, so the candidates are read again. */
  version: number;
  /** Where the cursor stands, for "3 of 48". */
  position: number;
  total: number;
  ticks: ReadonlySet<CardField>;
  onToggleTick: (field: CardField) => void;
  /** A decision is being sent, or the list is being read again after one. */
  busy: boolean;
  status: MatchStatus | null;
  onUndo: () => void;
  onCorrect: (candidate: MatchCandidate, plan: CorrectPlan) => void;
  onNotThis: () => void;
  onSkip: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onPlayFile: () => void;
  onSearchBeatport: () => void;
  onSearchAgain: () => void;
  /** Said in place of the cards when there is no track. */
  emptyState: ReactNode;
}

const MARKS: Record<CardRow["status"], string> = {
  same: "matches",
  changes: "would change",
  none: "Beatport has none",
  "comes-with-correct": "comes with Correct",
  "replaces-yours": "would replace yours",
};

function Value({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <span className={muted ? "match-card__empty" : undefined}>{children}</span>;
}

function theirCell(entry: CardRow): ReactNode {
  switch (entry.status) {
    case "none":
      return <Value muted>—</Value>;
    case "same":
      return (
        <span>
          {entry.theirs} <span aria-hidden>✓</span>
          <span className="match-visually-hidden"> ({MARKS.same})</span>
        </span>
      );
    case "comes-with-correct":
      return (
        <span>
          {entry.theirs} <span aria-hidden>✓</span>
          <span className="match-card__note"> {MARKS["comes-with-correct"]}</span>
        </span>
      );
    default:
      return (
        <span className="match-card__changes" data-changes="true">
          {entry.yours ?? "empty"} <span aria-hidden>→</span>
          <span className="match-visually-hidden"> becomes</span> {entry.theirs}
        </span>
      );
  }
}

/**
 * The cover art, small beside the title so the decide buttons stay in view. A
 * click shows the same image larger; a second click or Escape closes it. No art
 * is a plain placeholder, not a button.
 */
function ArtThumb({ src, caption }: { src: string | null; caption: string }) {
  const [open, setOpen] = useState(false);
  const largerId = useId();

  useEffect(() => {
    setOpen(false);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    // Capture phase: Escape closes the larger art before the page's own handler
    // (which would take it to stop a preview) sees it.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  if (!src) {
    return (
      <figure className="match-card__figure">
        <div className="match-card__art match-card__art--none" aria-hidden />
        <figcaption className="match-card__caption">{caption}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="match-card__figure">
      <button
        type="button"
        className="match-card__art-button"
        aria-label="Show the cover art larger"
        aria-expanded={open}
        aria-controls={open ? largerId : undefined}
        onClick={() => setOpen(!open)}
      >
        <img className="match-card__art" src={src} alt="" />
      </button>
      {open && (
        <figure id={largerId} className="match-card__art-larger" aria-label="Cover art, larger">
          <img className="match-card__art-larger-image" src={src} alt="" />
        </figure>
      )}
      <figcaption className="match-card__caption">{caption}</figcaption>
    </figure>
  );
}

export function OneAtATime({
  row,
  version,
  position,
  total,
  ticks,
  onToggleTick,
  busy,
  status,
  onUndo,
  onCorrect,
  onNotThis,
  onSkip,
  onPreviousTrack,
  onNextTrack,
  onPlayFile,
  onSearchBeatport,
  onSearchAgain,
  emptyState,
}: OneAtATimeProps) {
  const trackId = row?.id ?? null;
  const matches = useTrackMatches(trackId, version);
  const artwork = useTrackArtwork(trackId, "inspector");
  const payload = matches.matches;
  const state = payload?.state ?? null;
  const attempt = payload?.attempts.find((entry) => entry.id === matches.attemptId) ?? null;

  const [chosenId, setChosenId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(loadScoreOpen);

  const choiceAttempt = useRef<number | null>(null);
  useEffect(() => {
    const sameAttempt = choiceAttempt.current === matches.attemptId;
    choiceAttempt.current = matches.attemptId;
    setChosenId((current) =>
      sameAttempt &&
      current != null &&
      matches.candidates.some((candidate) => candidate.id === current)
        ? current
        : defaultChoice(state, matches.candidates),
    );
  }, [matches.attemptId, matches.candidates, state]);

  useEffect(() => {
    setShowAll(false);
  }, [trackId]);

  const shown = useMemo(
    () => visibleCandidates(matches.candidates, showAll, chosenId),
    [chosenId, matches.candidates, showAll],
  );
  const chosen = shown.find((candidate) => candidate.id === chosenId) ?? null;
  const media = useCandidateMedia(chosen?.id ?? null);
  const rows = useMemo(() => (row ? cardRows(row, chosen) : []), [row, chosen]);
  const plan = useMemo(() => correctPlan(ticks, rows), [ticks, rows]);
  const tickable = useMemo(() => tickableRows(rows), [rows]);

  const { stopPreview, togglePreview } = media;
  // One guard per decision, shared by its button and its key: a key must not do
  // what the button beside it would refuse.
  const canCorrect = !busy && chosen !== null;
  const canNotThis = !busy && payload !== null && payload.attempts.length > 0;
  const canSkip = !busy;
  const canPreview = chosen !== null && media.canPreview && media.preview !== "loading";
  const playFile = () => {
    stopPreview();
    onPlayFile();
  };

  const command = (which: MatchCommand): boolean => {
    switch (which) {
      case "previous-track":
        onPreviousTrack();
        return true;
      case "next-track":
        onNextTrack();
        return true;
      case "skip":
        if (canSkip) onSkip();
        return true;
      case "previous-candidate":
        setChosenId(stepChoice(shown, chosenId, -1));
        return true;
      case "next-candidate":
        setChosenId(stepChoice(shown, chosenId, 1));
        return true;
      case "correct":
        if (chosen && canCorrect) onCorrect(chosen, plan);
        return true;
      case "not-this":
        if (row && canNotThis) onNotThis();
        return true;
      case "play-preview":
        if (canPreview) togglePreview();
        return true;
      case "play-file":
        if (row) playFile();
        return true;
      case "stop-preview":
        // Esc belongs to whatever else wants it unless a preview is sounding.
        if (media.preview === "idle" || media.preview === "none") return false;
        stopPreview();
        return true;
    }
  };

  // A layout effect, not a passive one: the listener is replaced in the same
  // commit that shows the card its commands read. As a passive effect it was
  // replaced only after that commit, and a key pressed in between reached the
  // previous listener (CLEAN-14). The latest closure is kept in a ref so the
  // listener itself is not rebuilt by every render.
  const latest = useRef(command);
  latest.current = command;
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // A dialog of the page — the match window, a menu — owns the keys while it is open.
      if (document.querySelector('[role="dialog"], dialog[open], [role="menu"]')) return;
      const which = matchCommand(event, "one");
      if (!which) return;
      if (latest.current(which)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (row == null) {
    return (
      <section className="match-one" aria-label="One at a time">
        {emptyState}
        {/* The last track decided leaves nothing to show, but its Undo must stay. */}
        <StatusLine key="status" status={status} busy={busy} onUndo={onUndo} />
      </section>
    );
  }

  const yours = yoursOf(row);
  const length = lengthOf(row);
  const candidateCount = matches.candidates.length;
  const best = chosen !== null && chosen.rank === 0;
  const refused = chosen !== null && !chosen.guard_ok;

  return (
    <section className="match-one" aria-label="One at a time" aria-busy={busy || undefined}>
      <div className="match-one__cards">
        <section className="match-card" aria-label="Your track">
          <h2 className="match-card__eyebrow">Your track</h2>
          <div className="match-card__body">
            <ArtThumb src={artwork} caption="your art" />
            <div className="match-card__facts">
              <h3 className="match-card__title">{row.title}</h3>
              <p className="match-card__artist">{row.artist}</p>
              <dl className="match-card__rows">
                {rows.map((entry) => (
                  <div key={entry.id} className="match-card__row">
                    <dt>{entry.label}</dt>
                    <dd>{yours[entry.id] ?? <Value muted>empty</Value>}</dd>
                  </div>
                ))}
                <div className="match-card__row">
                  <dt>Length</dt>
                  <dd>{length ?? <Value muted>empty</Value>}</dd>
                </div>
              </dl>
              <Button variant="secondary" onClick={playFile}>
                Play your file <kbd className="match-key" aria-hidden>{MATCH_KEYS["play-file"]}</kbd>
              </Button>
            </div>
          </div>
        </section>

        <div className="match-one__score" aria-live="polite">
          {chosen ? (
            <>
              <span
                className={`match-one__likely${refused ? " match-one__likely--refused" : ""}`}
                data-testid="likelihood"
              >
                {scoreLine(chosen)}
              </span>
              {!refused && <span className="match-one__likely-word">Beatport match</span>}
            </>
          ) : null}
        </div>

        <section className="match-card" aria-label="Best match on Beatport">
          <h2 className="match-card__eyebrow">
            {chosen && !best ? `Result ${chosen.rank + 1} on Beatport` : "Best match on Beatport"}
          </h2>
          {state && (
            <p className="match-card__state" data-testid="decision">
              {decisionLine(state)}
            </p>
          )}
          {matches.error && (
            <p className="match-card__problem" role="alert">
              {matches.error}
            </p>
          )}
          {!payload && matches.loading && <p className="match-card__hint">Reading its matches…</p>}
          {payload && payload.attempts.length === 0 && (
            <p className="match-card__hint">This track has not been matched on Beatport yet.</p>
          )}
          {attempt && attempt.outcome !== "matched" && candidateCount === 0 && (
            <p className="match-card__hint">
              {attempt.outcome === "error"
                ? `This attempt failed: ${attempt.error ?? "no reason was recorded"}.`
                : "Beatport found nothing for this attempt."}
            </p>
          )}
          {chosen && (
            <div className="match-card__body">
              <ArtThumb src={media.artwork} caption="Beatport art" />
              <div className="match-card__facts">
                <h3 className="match-card__title">
                  {chosen.title ?? "—"}
                  {chosen.mix && !(chosen.title ?? "").includes(chosen.mix) ? ` (${chosen.mix})` : ""}
                </h3>
                <p className="match-card__artist">{chosen.artists}</p>
                <dl className="match-card__rows">
                  {rows.map((entry) => (
                    <div key={entry.id} className="match-card__row">
                      <dt>{entry.label}</dt>
                      <dd>{theirCell(entry)}</dd>
                    </div>
                  ))}
                </dl>
                <Button
                  variant="secondary"
                  disabled={!canPreview}
                  onClick={togglePreview}
                >
                  {media.preview === "playing"
                    ? "Stop preview"
                    : media.preview === "loading"
                      ? "Getting the preview…"
                      : "Play Beatport preview"}{" "}
                  <kbd className="match-key" aria-hidden>{MATCH_KEYS["play-preview"]}</kbd>
                </Button>
                {media.preview === "none" && (
                  <p className="match-card__hint" role="status">
                    No preview is available for this result.
                  </p>
                )}
              </div>
            </div>
          )}
          {payload && payload.attempts.length > 1 && (
            <Select
              className="match-card__attempts"
              label="Attempt"
              id="match-attempt"
              value={String(matches.attemptId ?? "")}
              onChange={(event) => matches.chooseAttempt(Number(event.target.value))}
              options={payload.attempts.map((entry, index) => ({
                value: String(entry.id),
                label: attemptLabel(entry, index, state?.attempt_id ?? null),
              }))}
            />
          )}
        </section>
      </div>

      <div className="match-one__results" role="group" aria-label="Other results">
        <span className="match-one__results-label">Other results:</span>
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
              {why && <span className="match-visually-hidden">: {why}</span>}
            </button>
          );
        })}
        {candidateCount > CANDIDATE_LIMIT && (
          <Button variant="secondary" onClick={() => setShowAll(!showAll)}>
            {showAll ? `Show the first ${CANDIDATE_LIMIT}` : `Show all ${candidateCount} results`}
          </Button>
        )}
        <Button variant="secondary" onClick={onSearchBeatport}>
          Search Beatport myself…
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onSearchAgain}>
          Search again
        </Button>
      </div>

      {chosen && (
        <div className="match-one__why">
          <Button
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
            <table className="match-one__score-table">
              <caption className="match-visually-hidden">How the matcher scored this result</caption>
              <tbody>
                {SCORE_ROWS.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">{entry.label}</th>
                    <td className={entry.id === "guard" && refused ? "match-one__refused" : undefined}>
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
          {tickable.length === 0 && (
            <span className="match-ticks__none">nothing: the values already match</span>
          )}
          {tickable.map((entry) => (
            <label key={entry.id} className="match-ticks__field">
              <input
                type="checkbox"
                checked={ticks.has(entry.id)}
                disabled={busy}
                onChange={() => onToggleTick(entry.id)}
              />
              <span>
                {CARD_FIELD_LABELS[entry.id]} {entry.yours ?? "empty"} → {entry.theirs}
                {entry.id === "key" ? " (replaces yours)" : ""}
              </span>
            </label>
          ))}
          <span className="match-ticks__note">Rekordbox keeps its own values</span>
        </fieldset>
      )}

      <div className="match-one__actions" role="group" aria-label="Decide">
        <Button
          className="match-action match-action--correct"
          disabled={!canCorrect}
          onClick={() => chosen && onCorrect(chosen, plan)}
        >
          Correct <kbd className="match-key" aria-hidden>{MATCH_KEYS.correct}</kbd>
        </Button>
        <Button
          variant="danger"
          disabled={!canNotThis}
          onClick={onNotThis}
        >
          Not this track <kbd className="match-key" aria-hidden>{MATCH_KEYS["not-this"]}</kbd>
        </Button>
        <Button variant="secondary" disabled={!canSkip} onClick={onSkip}>
          Skip for now <kbd className="match-key" aria-hidden>{MATCH_KEYS.skip}</kbd>
        </Button>
        <Button
          variant="secondary"
          aria-label="Previous result"
          disabled={shown.length < 2 || chosenId === shown[0]?.id}
          onClick={() => setChosenId(stepChoice(shown, chosenId, -1))}
        >
          ← <kbd className="match-key" aria-hidden>{MATCH_KEYS["previous-candidate"]}</kbd>
        </Button>
        <Button
          variant="secondary"
          aria-label="Next result"
          disabled={shown.length < 2 || chosenId === shown[shown.length - 1]?.id}
          onClick={() => setChosenId(stepChoice(shown, chosenId, 1))}
        >
          → <kbd className="match-key" aria-hidden>{MATCH_KEYS["next-candidate"]}</kbd>
        </Button>
        <span className="match-one__position">
          <span className="match-visually-hidden">Position in the list: </span>
          {position.toLocaleString()} of {total.toLocaleString()}
        </span>
      </div>

      <StatusLine key="status" status={status} busy={busy} onUndo={onUndo} />
    </section>
  );
}
