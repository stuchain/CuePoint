import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { markPhase14NoteSeen } from "./firstRunMemory";
import { hasStoredScale } from "../tokens/scale";
import "./OnboardingDialog.css";

interface Phase14NoteProps {
  open: boolean;
  onClose: () => void;
  /** Open Settings at the size control. */
  onChangeSize: () => void;
  /** Open Clean's match window. */
  onMatch: () => void;
}

/**
 * How many tracks have a Beatport key, from Library Health (no new route): every
 * track less those with "No Beatport key". Null when it cannot be read, and 0
 * tracks reads as "nothing to say".
 */
type KeyCount = { tracks: number; withKey: number | null } | "unread";

/**
 * The one note someone who updates sees (DEC-207): the app is now Medium size, and
 * keys now come only from Beatport. Each line is shown only when it applies, and a
 * note with no line says nothing at all.
 */
export function Phase14Note({ open, onClose, onChangeSize, onMatch }: Phase14NoteProps) {
  // Read once, before anything on this screen could change the stored size.
  const [sizeLine] = useState(() => !hasStoredScale());
  const [keys, setKeys] = useState<KeyCount | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const read = window.cuepoint?.getLibraryHealth;
    if (!read) {
      setKeys("unread");
      return;
    }
    read()
      .then((health) => {
        if (cancelled) return;
        const missing = health.counts.find((count) => count.id === "missing_key")?.count;
        setKeys({
          tracks: health.track_count,
          withKey: missing === undefined ? null : Math.max(0, health.track_count - missing),
        });
      })
      .catch(() => {
        if (!cancelled) setKeys("unread");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // With no tracks there are no keys to lose; unread, the sentence still says what changed.
  // The key line waits for Health; the size line does not, so the note appears at once.
  const keyLine = keys !== null && !(keys !== "unread" && keys.tracks === 0);
  const nothingToSay = open && keys !== null && !sizeLine && !keyLine;

  useEffect(() => {
    if (!nothingToSay) return;
    markPhase14NoteSeen();
    onClose();
  }, [nothingToSay, onClose]);

  const close = () => {
    markPhase14NoteSeen();
    onClose();
  };

  // With no size line there is nothing to show until Health says whether there is a key line.
  if (!open || nothingToSay || (keys === null && !sizeLine)) return null;

  const count = keys !== null && keys !== "unread" ? keys.withKey : null;
  const keySentence =
    count === null
      ? "Keys now come only from Beatport."
      : `Keys now come only from Beatport. ${count.toLocaleString()} of your tracks ${count === 1 ? "has" : "have"} a key.`;

  return (
    <Modal
      open
      title="What changed"
      onClose={close}
      primaryAction={{ label: "Got it", onClick: close }}
    >
      <div className="phase14-note">
        {sizeLine && (
          <div className="phase14-note__line">
            <p>CuePoint is now Medium size (1.5×).</p>
            <Button
              variant="secondary"
              onClick={() => {
                close();
                onChangeSize();
              }}
            >
              Change size
            </Button>
          </div>
        )}
        {keyLine && (
          <div className="phase14-note__line">
            <p>{keySentence}</p>
            <Button
              variant="secondary"
              onClick={() => {
                close();
                onMatch();
              }}
            >
              Match tracks…
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
