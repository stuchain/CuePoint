/**
 * One track beside the candidates Beatport found (CLEAN-12, DEC-066, DEC-004).
 *
 * The first dense comparison in the pixel design system, redrawn from
 * `CandidateDialog`'s layout rather than kept: a track's imported values in the
 * first column, a column per candidate, and a row per field. Where a candidate
 * differs from the track the cell is marked — with a glyph and words as well as
 * a colour, because a difference told only by colour is one a colour-blind
 * reviewer cannot see. Whether it differs is the engine's answer.
 *
 * Decisions and applying are separate acts (DEC-004): accepting chooses a
 * candidate and writes no metadata; applying copies chosen fields from the
 * accepted one into CuePoint's layer (DEC-068), and is offered only once a
 * candidate is accepted.
 *
 * Artwork is the track's own, through the guarded route (DEC-076). A
 * candidate's image is on Beatport, and is said to exist rather than drawn.
 */
import { useMemo, useState } from "react";

import type {
  LibraryTrackRow,
  MatchCandidate,
  OverrideField,
} from "../../api/cuepointBridge.types";
import { Badge, type BadgeVariant } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Select } from "../../components/Select";
import { decisionLine, formatWhen } from "./cleanFormat";
import {
  APPLY_FIELD_LABELS,
  APPLY_FIELDS,
  CANDIDATE_LIMIT,
  SCORE_ROWS,
  VALUE_ROWS,
  applyValue,
  candidateBadges,
} from "./comparison";
import { REVIEW_KEYS } from "./reviewKeyboard";
import { useTrackArtwork } from "./useTrackArtwork";
import type { TrackMatchesState } from "./useTrackMatches";

export interface ComparisonPanelProps {
  row: LibraryTrackRow | null;
  matches: TrackMatchesState;
  /** The candidates drawn, in order: the page decides, so the keyboard agrees. */
  shown: readonly MatchCandidate[];
  chosenId: number | null;
  onChoose: (candidateId: number) => void;
  showAll: boolean;
  onShowAll: (showAll: boolean) => void;
  busy: boolean;
  /** The last thing done here, said where the reviewer is looking. */
  status: string | null;
  onAccept: (candidate: MatchCandidate) => void;
  onReject: () => void;
  onClear: () => void;
  onApply: (fields: OverrideField[]) => void;
  onRematch: () => void;
  onNext: () => void;
}

const BADGE_VARIANTS: Record<string, BadgeVariant> = {
  Accepted: "success",
  Rejected: "danger",
  Refused: "warning",
  Proposed: "info",
  "Matcher's pick": "info",
};

function attemptLabel(
  attempt: TrackMatchesState["matches"] extends infer M
    ? M extends { attempts: Array<infer A> }
      ? A
      : never
    : never,
  index: number,
  decidedOn: number | null,
): string {
  const outcome =
    attempt.outcome === "matched"
      ? "matched"
      : attempt.outcome === "no_match"
        ? "found nothing"
        : "failed";
  const notes = [index === 0 ? "latest" : null, attempt.id === decidedOn ? "decided" : null]
    .filter(Boolean)
    .join(", ");
  return `${formatWhen(attempt.finished_at)} — ${outcome}${notes ? ` (${notes})` : ""}`;
}

export function ComparisonPanel({
  row,
  matches,
  shown,
  chosenId,
  onChoose,
  showAll,
  onShowAll,
  busy,
  status,
  onAccept,
  onReject,
  onClear,
  onApply,
  onRematch,
  onNext,
}: ComparisonPanelProps) {
  const trackId = row?.id ?? null;
  const artwork = useTrackArtwork(trackId, "inspector");
  const [unpicked, setUnpicked] = useState<ReadonlySet<OverrideField>>(() => new Set());

  const payload = matches.matches;
  const state = payload?.state ?? null;
  const chosen = shown.find((candidate) => candidate.id === chosenId) ?? null;
  const accepted = state?.state === "accepted" ? payload?.candidate ?? null : null;
  const attempt = payload?.attempts.find((entry) => entry.id === matches.attemptId) ?? null;

  const applicable = useMemo(
    () =>
      accepted
        ? APPLY_FIELDS.filter((field) => applyValue(field, accepted) != null && !unpicked.has(field))
        : [],
    [accepted, unpicked],
  );

  if (row == null) {
    return (
      <section className="clean-compare" aria-label="Comparison">
        <p className="clean-compare__empty">
          Choose a track to compare it with what Beatport found.
        </p>
      </section>
    );
  }

  const decidedByUser = state?.decided_by === "user";
  const alreadyAccepted = state?.state === "accepted" && state.candidate_id === chosen?.id;

  return (
    <section className="clean-compare" aria-label="Comparison">
      <header className="clean-compare__header">
        {artwork ? (
          <img className="clean-compare__art" src={artwork} alt="" />
        ) : (
          <div className="clean-compare__art clean-compare__art--none" aria-hidden />
        )}
        <div className="clean-compare__heading">
          <h2 className="clean-compare__title">{row.title}</h2>
          <p className="clean-compare__artist">{row.artist}</p>
          {state && (
            <p className="clean-compare__state" data-testid="decision">
              {decisionLine(state)}
            </p>
          )}
        </div>
        {payload && payload.attempts.length > 1 && (
          <Select
            className="clean-compare__attempts"
            label="Attempt"
            id="clean-compare-attempt"
            value={String(matches.attemptId ?? "")}
            onChange={(event) => matches.chooseAttempt(Number(event.target.value))}
            options={payload.attempts.map((entry, index) => ({
              value: String(entry.id),
              label: attemptLabel(entry, index, state?.attempt_id ?? null),
            }))}
          />
        )}
      </header>

      {matches.error && (
        <p className="clean-compare__problem" role="alert">
          {matches.error}
        </p>
      )}
      {!payload && matches.loading && <p className="clean-compare__empty">Reading its matches…</p>}
      {payload && payload.attempts.length === 0 && (
        <p className="clean-compare__empty">This track has not been matched on Beatport yet.</p>
      )}
      {attempt && attempt.outcome !== "matched" && matches.candidates.length === 0 && (
        <p className="clean-compare__empty">
          {attempt.outcome === "error"
            ? `This attempt failed: ${attempt.error ?? "no reason was recorded"}.`
            : "Beatport found nothing for this attempt."}
        </p>
      )}

      {payload && shown.length > 0 && (
        <div className="clean-compare__scroll">
          <table className="clean-compare__table">
            <caption className="clean-visually-hidden">
              This track beside the candidates Beatport found
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="clean-visually-hidden">Field</span>
                </th>
                <th scope="col" className="clean-compare__track-head">
                  This track
                </th>
                {shown.map((candidate) => {
                  const picked = candidate.id === chosenId;
                  return (
                    <th
                      key={candidate.id}
                      scope="col"
                      className={`clean-compare__candidate-head${picked ? " clean-compare__col--chosen" : ""}`}
                    >
                      <button
                        type="button"
                        className="clean-compare__pick"
                        aria-pressed={picked}
                        onClick={() => onChoose(candidate.id)}
                      >
                        #{candidate.rank + 1} · {candidate.score.toFixed(1)}
                      </button>
                      <span className="clean-compare__badges">
                        {candidateBadges(candidate, state).map((badge) => (
                          <Badge key={badge} variant={BADGE_VARIANTS[badge] ?? "default"}>
                            {badge}
                          </Badge>
                        ))}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Artwork</th>
                <td>{artwork ? "Yes" : "—"}</td>
                {shown.map((candidate) => (
                  <td
                    key={candidate.id}
                    className={candidate.id === chosenId ? "clean-compare__col--chosen" : undefined}
                  >
                    {candidate.artwork_url ? "On Beatport" : "—"}
                  </td>
                ))}
              </tr>
              {VALUE_ROWS.map((valueRow) => (
                <tr key={valueRow.id}>
                  <th scope="row">{valueRow.label}</th>
                  <td>{valueRow.track(payload.track)}</td>
                  {shown.map((candidate) => {
                    const differs =
                      valueRow.differs !== undefined &&
                      candidate.differs?.[valueRow.differs] === true;
                    const classes = [
                      differs ? "clean-compare__cell--differs" : "",
                      candidate.id === chosenId ? "clean-compare__col--chosen" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td
                        key={candidate.id}
                        className={classes || undefined}
                        data-differs={differs ? "true" : undefined}
                      >
                        {differs && (
                          <span className="clean-compare__mark" aria-hidden>
                            ≠{" "}
                          </span>
                        )}
                        {valueRow.candidate(candidate)}
                        {differs && (
                          <span className="clean-visually-hidden"> (differs from this track)</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {SCORE_ROWS.map((scoreRow) => (
                <tr key={scoreRow.id} className="clean-compare__score-row">
                  <th scope="row">{scoreRow.label}</th>
                  <td aria-hidden />
                  {shown.map((candidate) => {
                    const refused = scoreRow.id === "guard" && !candidate.guard_ok;
                    const classes = [
                      refused ? "clean-compare__cell--refused" : "",
                      candidate.id === chosenId ? "clean-compare__col--chosen" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td key={candidate.id} className={classes || undefined}>
                        {scoreRow.candidate(candidate)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matches.candidates.length > CANDIDATE_LIMIT && (
        <Button variant="secondary" onClick={() => onShowAll(!showAll)}>
          {showAll
            ? `Show the first ${CANDIDATE_LIMIT}`
            : `Show all ${matches.candidates.length} candidates`}
        </Button>
      )}

      <div className="clean-compare__actions" role="group" aria-label="Decide">
        <Button
          onClick={() => chosen && onAccept(chosen)}
          disabled={busy || !chosen || alreadyAccepted}
        >
          {chosen ? `Accept #${chosen.rank + 1}` : "Accept"}
        </Button>
        <Button
          variant="secondary"
          onClick={onReject}
          disabled={busy || !payload || payload.attempts.length === 0}
        >
          Reject
        </Button>
        <Button variant="secondary" onClick={onClear} disabled={busy || !decidedByUser}>
          Clear decision
        </Button>
        <Button variant="secondary" onClick={onRematch} disabled={busy}>
          Re-match
        </Button>
        <Button variant="secondary" onClick={onNext}>
          Next
        </Button>
      </div>

      {accepted && (
        <fieldset className="clean-compare__apply">
          <legend>Apply from the accepted match</legend>
          {APPLY_FIELDS.map((field) => {
            const value = applyValue(field, accepted);
            return (
              <label key={field} className="clean-compare__apply-field">
                <input
                  type="checkbox"
                  checked={value != null && !unpicked.has(field)}
                  disabled={value == null || busy}
                  onChange={(event) =>
                    setUnpicked((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.delete(field);
                      else next.add(field);
                      return next;
                    })
                  }
                />
                {APPLY_FIELD_LABELS[field]}
                <span className="clean-compare__apply-value">{value ?? "—"}</span>
              </label>
            );
          })}
          <Button onClick={() => onApply(applicable)} disabled={busy || applicable.length === 0}>
            {applicable.length === 1 ? "Apply 1 field" : `Apply ${applicable.length} fields`}
          </Button>
        </fieldset>
      )}

      <p className="clean-compare__keys">
        {REVIEW_KEYS.accept} accept · {REVIEW_KEYS.reject} reject · {REVIEW_KEYS.skip} next ·
        ← → candidate · ↑ ↓ track
      </p>
      {status && (
        <p className="clean-compare__status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
