/**
 * The save bar (G4 step 4): one line saying how many tracks hold values the audio
 * files do not, with the way in to the save window.
 *
 * It shows only when there is something to save, and it only says so: the window
 * is opened by whoever mounts the bar (G4 step 8), with the tracks it counted.
 */
import { Button } from "../Button";
import { SAVE_TO_FILES, SEE_CHANGES, barSentence } from "./saveBarWords";
import { useUnsavedValues } from "./useUnsavedValues";
import "./SaveToFilesBar.css";

interface SaveToFilesBarProps {
  /** Open the window on its list of changes, for this many tracks. */
  onSeeChanges: (tracks: number) => void;
  /** Open the window on its choices, for this many tracks. */
  onSave: (tracks: number) => void;
}

export function SaveToFilesBar({ onSeeChanges, onSave }: SaveToFilesBarProps) {
  const { unsaved } = useUnsavedValues();
  if (!unsaved || unsaved.tracks <= 0) return null;
  const tracks = unsaved.tracks;
  return (
    <section className="save-bar" aria-label="Save to files">
      <p className="save-bar__text cp-status--done">
        <span className="save-bar__tick" aria-hidden="true">
          ✓
        </span>
        <span className="save-bar__sentence">{barSentence(tracks)}</span>
      </p>
      <div className="save-bar__actions">
        <Button variant="secondary" size="sm" onClick={() => onSeeChanges(tracks)}>
          {SEE_CHANGES}
        </Button>
        <Button variant="primary" size="sm" onClick={() => onSave(tracks)}>
          {SAVE_TO_FILES}
        </Button>
      </div>
    </section>
  );
}
