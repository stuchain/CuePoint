/**
 * "Push to Beatport playlist…" (DISCOVER-10, DEC-099).
 *
 * Makes a new playlist on the user's Beatport account and adds the tracks, as
 * a job the status strip follows. The dialog asks only what the job needs: the
 * name, defaulted to the engine's, and whether tracks the library already owns
 * go too — by default they do not, since buying one twice is the mistake a
 * wantlist exists to prevent (DEC-092).
 *
 * A refusal — no token, too many tracks, a name too long, a push already
 * running — is shown here in the engine's words, and the dialog stays open, so
 * the person can change what was refused rather than start again.
 */
import { useEffect, useState } from "react";

import type { DiscoverRefusal } from "../../api/cuepointBridge.types";
import { Modal } from "../../components/Modal";
import { TextField } from "../../components/TextField";
import { refusalText } from "./discoverFormat";

export interface PushDialogProps {
  open: boolean;
  /** What will be pushed, as a phrase: "the 3 selected tracks". */
  what: string;
  defaultName: string;
  maxNameLength: number;
  onPush: (name: string, includeOwned: boolean) => Promise<DiscoverRefusal | null>;
  onClose: () => void;
}

export function PushDialog({
  open,
  what,
  defaultName,
  maxNameLength,
  onPush,
  onClose,
}: PushDialogProps) {
  const [name, setName] = useState(defaultName);
  const [includeOwned, setIncludeOwned] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setIncludeOwned(false);
    setRefusal(null);
    setPushing(false);
  }, [defaultName, open]);

  const trimmed = name.trim();
  const tooLong = trimmed.length > maxNameLength;

  const push = async () => {
    setPushing(true);
    setRefusal(null);
    try {
      const refused = await onPush(trimmed, includeOwned);
      if (refused) setRefusal(refusalText(refused));
    } catch (cause) {
      setRefusal(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPushing(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Push to a Beatport playlist"
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{
        label: "Push",
        onClick: () => void push(),
        loading: pushing,
        disabled: trimmed === "" || tooLong,
      }}
    >
      <div className="discover-dialog">
        <p className="discover-dialog__text">
          Makes a new playlist on your Beatport account with {what}, in the order the table shows.
        </p>
        <TextField
          label="Playlist name"
          id="discover-push-name"
          value={name}
          maxLength={maxNameLength + 1}
          onChange={(event) => setName(event.target.value)}
          error={
            tooLong
              ? `A playlist name is at most ${maxNameLength} characters.`
              : trimmed === ""
                ? "A playlist needs a name."
                : undefined
          }
        />
        <label className="discover-dialog__check">
          <input
            type="checkbox"
            checked={includeOwned}
            onChange={(event) => setIncludeOwned(event.target.checked)}
          />
          Include tracks you already own
        </label>
        {refusal && (
          <p className="discover-dialog__refusal" role="alert">
            {refusal}
          </p>
        )}
      </div>
    </Modal>
  );
}
