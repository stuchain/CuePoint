/**
 * What making a playlist on Beatport did, as a notice with a way to open the playlist and a
 * close mark (C21, C88). Discover and the Artist and Label pages show it the same way.
 */
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";

/** The outcome of a playlist push, as the pages keep it until it is closed. */
export interface PlaylistOutcome {
  text: string;
  url: string | null;
  tone: "success" | "warning";
}

interface PlaylistNoticeProps {
  outcome: PlaylistOutcome;
  onOpen: (url: string) => void;
  onDismiss: () => void;
}

export function PlaylistNotice({ outcome, onOpen, onDismiss }: PlaylistNoticeProps) {
  const { url } = outcome;
  return (
    <Notice
      kind={outcome.tone === "warning" ? "warning" : "info"}
      aria-label="Beatport playlist"
      onDismiss={onDismiss}
      action={
        url ? (
          <Button variant="secondary" onClick={() => onOpen(url)}>
            Open the playlist
          </Button>
        ) : undefined
      }
    >
      {outcome.text}
    </Notice>
  );
}
