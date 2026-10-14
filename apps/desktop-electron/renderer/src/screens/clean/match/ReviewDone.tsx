/**
 * The screen after the last track of a review (C22): what the search did, and the two ways out.
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
  /** When tracks were skipped: go through them again. */
  onAgain?: () => void;
}

export function ReviewDone({ headline, detail, saveCount, onSave, onBack, onAgain }: ReviewDoneProps) {
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
            Go through the skipped ones again
          </Button>
        )}
        <Button variant="secondary" icon="chevron-left" onClick={onBack}>
          Back to playlists
        </Button>
      </div>
    </div>
  );
}
