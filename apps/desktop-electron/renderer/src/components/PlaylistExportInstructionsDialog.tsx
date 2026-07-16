import { Modal } from "./Modal";
import "./PlaylistExportInstructionsDialog.css";

const STEPS = [
  "Open Rekordbox and go to the Playlist view.",
  "Select the playlist you want to export.",
  "Right-click the playlist and choose an option like “Export playlist”, “Export as M3U”, or “Save as M3U”. Save the file as .m3u or .m3u8.",
  "In CuePoint, switch to “Playlist file (M3U)”, then use Browse to select your exported .m3u/.m3u8 file and start matching.",
] as const;

export interface PlaylistExportInstructionsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PlaylistExportInstructionsDialog({
  open,
  onClose,
}: PlaylistExportInstructionsDialogProps) {
  return (
    <Modal
      open={open}
      title="Export M3U/M3U8 from Rekordbox"
      onClose={onClose}
      secondaryAction={{ label: "Close", onClick: onClose }}
    >
      <div className="playlist-export-instructions">
        <p>
          An M3U/M3U8 file lists the paths to audio files. CuePoint can use it to
          process tracks without loading the full Rekordbox collection XML.
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

