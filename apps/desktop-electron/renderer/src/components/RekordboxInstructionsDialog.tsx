import { Modal } from "./Modal";
import "./RekordboxInstructionsDialog.css";

const STEPS = [
  "Open Rekordbox on your computer.",
  "Select the playlist you want to export (or your full collection for batch mode).",
  "Use File → Export collection in XML format (or export the selected playlist).",
  "Save the XML file somewhere easy to find (Downloads works well).",
  "In CuePoint inKey, browse or drag the XML onto the input panel, then start matching.",
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
          Rekordbox XML files contain playlist and track metadata CuePoint uses to search Beatport.
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
