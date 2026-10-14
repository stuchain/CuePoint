/**
 * The screen once every track of a review is decided: what was decided, and the ways out.
 *
 * It is announced as a status, and focus moves to **Save** (or, with nothing to save, the way
 * back), because the card the keyboard was on has just gone.
 */
import { useEffect, useRef } from "react";

import { Button } from "../../../components/Button";

interface ReviewDoneProps {
  headline: string;
  detail: string;
  /** Values ready to save; the Save button shows only when there are some and the page can save. */
  saveCount: number;
  onSave?: () => void;
  onBack: () => void;
  /** Look at the list again, for a review that is already done. */
  onAgain?: () => void;
  againLabel?: string;
}

export function ReviewDone({
  headline,
  detail,
  saveCount,
  onSave,
  onBack,
  onAgain,
  againLabel = "Go through them again",
}: ReviewDoneProps) {
  const actions = useRef<HTMLDivElement>(null);
  // The first button there is: Save when there is something to save, else the way back.
  useEffect(() => {
    actions.current?.querySelector("button")?.focus();
  }, []);
  const canSave = saveCount > 0 && onSave !== undefined;
  return (
    <div className="match-review-done" role="status">
      <p className="match-review-done__headline">{headline}</p>
      <p className="match-review-done__detail">{detail}</p>
      <div ref={actions} className="match-review-done__actions">
        {canSave && (
          <Button className="playlists__save" onClick={onSave}>
            {`Save ${saveCount.toLocaleString()} to files…`}
          </Button>
        )}
        {onAgain && (
          <Button variant="secondary" onClick={onAgain}>
            {againLabel}
          </Button>
        )}
        <Button variant="secondary" icon="chevron-left" onClick={onBack}>
          Back to playlists
        </Button>
      </div>
    </div>
  );
}
