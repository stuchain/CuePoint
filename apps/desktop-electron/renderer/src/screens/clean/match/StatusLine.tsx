/**
 * The last thing done in the Match area, said where the reviewer is looking (C14).
 *
 * "Corrected “Place”. [Undo]": Undo is the batch revert of that one act, and is
 * offered only when the act changed something (`batchId`). Older decisions are
 * undone from Track details → History.
 */
import { Button } from "../../../components/Button";

/** The last thing done; Undo only when something changed. */
export interface MatchStatus {
  text: string;
  /** The batch to revert, when the act changed something. */
  batchId: string | null;
  /** What Undo says once it has reverted the batch. */
  undoText?: string;
  /** How many tracks the act checked, so Undo can take them back off the count. */
  tracks?: number;
}

interface StatusLineProps {
  status: MatchStatus | null;
  busy: boolean;
  onUndo: () => void;
}

export function StatusLine({ status, busy, onUndo }: StatusLineProps) {
  if (!status) return null;
  return (
    <p className="match-status" role="status">
      {status.text}
      {status.batchId && (
        <>
          {" "}
          <Button variant="secondary" disabled={busy} onClick={onUndo}>
            Undo
          </Button>
        </>
      )}
    </p>
  );
}
