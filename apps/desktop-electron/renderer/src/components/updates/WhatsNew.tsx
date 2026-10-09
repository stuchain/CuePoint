import { useEffect, useState } from "react";

import type { WhatsNew as WhatsNewNotes } from "../../api/cuepointBridge.types";
import { Modal } from "../Modal";
import { ReleaseNotesView } from "./ReleaseNotesView";

interface WhatsNewProps {
  /** On demand (Settings): these notes, closed with `onClose`; nothing is asked of main and nothing dismissed. */
  notes?: WhatsNewNotes;
  /** On demand: whether it is open, so it can play the dialog's exit before it goes. Default open. */
  open?: boolean;
  onClose?: () => void;
  /** After an update: wait while another note is open, then show once. */
  hold?: boolean;
}

/**
 * The notes of the version that is running (DIST-07, DEC-172). Mounted in the app, it asks main
 * once, on launch, and shows them only after an update, until **Got it**. Given `notes`, it shows
 * those on demand and never dismisses anything.
 */
export function WhatsNew({ notes, open: openOnDemand = true, onClose, hold = false }: WhatsNewProps) {
  const onDemand = notes !== undefined;
  const [found, setFound] = useState<WhatsNewNotes | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (onDemand || hold) return;
    const updates = window.cuepoint?.updates;
    if (!updates) return;
    let live = true;
    void updates
      .getWhatsNew()
      .then((result) => {
        if (live && result) setFound(result);
      })
      .catch(() => {
        // Nothing to show is the safe answer.
      });
    return () => {
      live = false;
    };
  }, [onDemand, hold]);

  const shown = onDemand ? notes : found;
  if (!shown) return null;

  const close = () => {
    if (onDemand) {
      onClose?.();
      return;
    }
    setDismissed(true);
    void window.cuepoint?.updates?.dismissWhatsNew?.();
  };

  return (
    <Modal
      // A note opening over it (`hold`) hides it until that closes: two dialogs never show together.
      open={onDemand ? openOnDemand : !dismissed && !hold}
      title={`What's new in CuePoint ${shown.version}`}
      onClose={close}
      primaryAction={{ label: "Got it", onClick: close }}
    >
      <ReleaseNotesView notes={shown.notes} />
    </Modal>
  );
}
