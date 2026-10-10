/**
 * "Use Beatport's values…" over a selection (CLEAN-13, DEC-068, PAGES-07B).
 *
 * Accepting a match writes nothing; applying copies the chosen fields from
 * each track's accepted match into CuePoint's layer, as one batch. A track
 * without an accepted match is left as it is and counted, by the engine.
 */
import { useLayoutEffect, useState } from "react";

import type { OverrideField } from "../../api/cuepointBridge.types";
import { Modal } from "../../components";
import { APPLY_FIELDS, APPLY_FIELD_LABELS } from "../clean/comparison";
import "./cleanDialogs.css";

interface ApplyValuesDialogProps {
  open: boolean;
  count: number;
  onClose: () => void;
  onApply: (fields: OverrideField[]) => void;
}

export function ApplyValuesDialog({ open, count, onClose, onApply }: ApplyValuesDialogProps) {
  const [chosen, setChosen] = useState<OverrideField[]>([]);

  // In the commit that opens it, as EditValuesDialog does: a passive effect ran after the
  // paint and could clear a box ticked as the dialog appeared.
  useLayoutEffect(() => {
    if (open) setChosen([]);
  }, [open]);

  const toggle = (field: OverrideField, on: boolean) =>
    setChosen((previous) =>
      on ? APPLY_FIELDS.filter((name) => name === field || previous.includes(name)) : previous.filter((name) => name !== field),
    );

  const many = `${count.toLocaleString()} ${count === 1 ? "track" : "tracks"}`;

  return (
    <Modal
      open={open}
      title="Use Beatport's values"
      onClose={onClose}
      primaryAction={{
        label: "Apply",
        disabled: chosen.length === 0,
        onClick: () => {
          onApply(chosen);
          onClose();
        },
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="clean-dialog">
        <p className="clean-dialog__lead">
          Copy these from the accepted Beatport match of each of {many}. Tracks without an
          accepted match are left as they are, and so is a field Beatport has no value for. The
          key is not listed: an accepted match already gives a track its key.
        </p>
        <fieldset className="clean-dialog__group">
          <legend>Fields</legend>
          {APPLY_FIELDS.map((field) => (
            <label key={field} className="clean-dialog__check">
              <input
                type="checkbox"
                checked={chosen.includes(field)}
                onChange={(event) => toggle(field, event.target.checked)}
              />
              {APPLY_FIELD_LABELS[field]}
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  );
}
