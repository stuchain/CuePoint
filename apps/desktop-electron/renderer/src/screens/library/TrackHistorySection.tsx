/**
 * What has happened to one track (ORG-10, DEC-008).
 *
 * DEC-008 chose per-field history over an undo stack, and the argument for
 * that choice only pays off if someone can read it. This is where: what
 * changed, what it was, and — the part that matters most in a two-layer
 * model — whether it was you or an import that changed it.
 *
 * Read-only in this phase, deliberately. `REVERTABLE_FIELDS` covers the
 * Rekordbox-owned columns, because reverting one means writing an attribute
 * back onto a `LibraryTrack`; CuePoint's fields live in another table and are
 * not in that set. A revert button that worked for four fields and refused for
 * three would teach the wrong thing about what history is, so there is none.
 */
import type { TrackFieldChange } from "../../api/cuepointBridge.types";
import { historyLine } from "./trackEdits";

export interface TrackHistorySectionProps {
  changes: readonly TrackFieldChange[];
  loading: boolean;
  error: string | null;
  /** This build's bridge has no history route — say nothing rather than "none". */
  unavailable: boolean;
}

export function TrackHistorySection({
  changes,
  loading,
  error,
  unavailable,
}: TrackHistorySectionProps) {
  if (unavailable) return null;

  return (
    <section className="cp-track-history">
      <h3 className="cp-track-detail__subtitle">History</h3>
      {error && <p className="cp-track-history__note">{error}</p>}
      {!error && loading && changes.length === 0 && (
        <p className="cp-track-history__note">Reading the history…</p>
      )}
      {!error && !loading && changes.length === 0 && (
        <p className="cp-track-history__note">Nothing has changed about this track yet.</p>
      )}
      <ul className="cp-track-history__list">
        {changes.map((change, index) => {
          const line = historyLine(change);
          return (
            <li
              // A history row has an id, except when it does not: the engine's
              // shape allows null, and two entries written in the same
              // transaction are otherwise indistinguishable.
              key={change.id ?? `${change.field}-${change.changed_at}-${index}`}
              className={`cp-track-history__entry${
                line.mine ? " cp-track-history__entry--mine" : ""
              }`}
            >
              <span className="cp-track-history__what">{line.title}</span>
              {line.from !== null && line.to !== null && (
                <span className="cp-track-history__values">
                  {line.from} → {line.to}
                </span>
              )}
              <span className="cp-track-history__who">
                {line.who} · {line.when}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
