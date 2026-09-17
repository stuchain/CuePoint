/**
 * What has happened to one track (ORG-10, DEC-008, then CLEAN-13).
 *
 * DEC-008 chose per-field history over an undo stack, and the argument for
 * that choice only pays off if someone can read it. This is where: what
 * changed, what it was, and — the part that matters most in a two-layer
 * model — whether it was you or an import that changed it.
 *
 * ORG-10 left it read-only, because reverting then meant writing an attribute
 * back onto the imported record and CuePoint's own fields were not in that
 * set. CLEAN-06 built the second path, so **CuePoint's own changes now offer
 * Revert** — ratings, favorites, notes, tags, your five values and match
 * decisions. Rekordbox's changes stay read-only, as the imported record is
 * (DEC-047). A revert that would throw away a later change is refused by the
 * engine, and its sentence says which.
 *
 * Collection membership writes no history (ORG-04), so it has no row here to
 * revert; its batches say so in Activity, where they are recorded.
 *
 * **What CuePoint wrote into the file** is listed below the history, from the
 * file-write record, and never as a finished write when the engine did not see
 * it finish (CLEAN-10).
 */
import type { TrackFieldChange } from "../../api/cuepointBridge.types";
import { canRevertChange, writesLine } from "./libraryClean";
import { historyLine } from "./trackEdits";
import type { TrackWritesState } from "./useTrackWrites";

export interface TrackHistorySectionProps {
  changes: readonly TrackFieldChange[];
  loading: boolean;
  error: string | null;
  /** This build's bridge has no history route — say nothing rather than "none". */
  unavailable: boolean;
  /** Revert one change. Absent in a build that cannot, which then offers none. */
  onRevert?: (change: TrackFieldChange) => void;
  /** The change being reverted, while it is. */
  reverting?: number | null;
  /** What was written into the file, when the build can say. */
  writes?: TrackWritesState;
  /** Restore every value written into this file. */
  onRestore?: () => void;
  restoring?: boolean;
}

export function TrackHistorySection({
  changes,
  loading,
  error,
  unavailable,
  onRevert,
  reverting = null,
  writes,
  onRestore,
  restoring = false,
}: TrackHistorySectionProps) {
  if (unavailable) return null;

  const showWrites = writes && !writes.unavailable && writes.restorable > 0;

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
          const revertable = onRevert && canRevertChange(change);
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
              {revertable && (
                <button
                  type="button"
                  className="cp-track-history__revert"
                  disabled={reverting !== null}
                  aria-label={`Revert: ${line.title}, ${line.when}`}
                  onClick={() => onRevert(change)}
                >
                  {reverting === change.id ? "Reverting…" : "Revert"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {showWrites && (
        <div
          className={`cp-track-history__writes${
            writes.unconfirmed > 0 ? " cp-track-history__writes--unfinished" : ""
          }`}
        >
          <p className="cp-track-history__note">
            <strong>Tags written to the file.</strong> {writesLine(writes.restorable, writes.unconfirmed)}
          </p>
          {onRestore && (
            <button
              type="button"
              className="cp-track-history__revert"
              disabled={restoring}
              onClick={onRestore}
            >
              {restoring ? "Restoring…" : "Restore the file's tags"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
