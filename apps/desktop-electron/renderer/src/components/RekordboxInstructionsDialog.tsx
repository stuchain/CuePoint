import { Modal } from "./Modal";
import "./RekordboxInstructionsDialog.css";

const STEPS = [
  "Open Rekordbox on your computer.",
  "Use File → Export Collection in xml format.",
  "Save the XML file somewhere easy to find (Downloads works well).",
  "In CuePoint's Library, choose Import a collection… and pick the XML file.",
  "To match on Beatport, open Clean and match a playlist, a Collection or the whole library.",
];

interface RekordboxInstructionsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function RekordboxInstructionsDialog({ open, onClose }: RekordboxInstructionsDialogProps) {
  return (
    <Modal
      open={open}
      title="Export XML from Rekordbox"
      onClose={onClose}
      secondaryAction={{ label: "Close", onClick: onClose }}
    >
      <div className="rekordbox-instructions">
        <p>
          A Rekordbox XML export holds your collection and playlists. CuePoint imports it into its
          library, and matches tracks on Beatport from there.
        </p>
        <ol>
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
