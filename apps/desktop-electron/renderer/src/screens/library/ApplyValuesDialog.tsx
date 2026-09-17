/**
 * "Apply Beatport values…" over a selection (CLEAN-13, DEC-068).
 *
 * Accepting a match writes nothing; applying copies the chosen fields from
 * each track's accepted match into CuePoint's layer, as one batch. A track
 * without an accepted match is left as it is and counted, by the engine.
 */
import { useEffect, useState } from "react";

import type { OverrideField } from "../../api/cuepointBridge.types";
import { Modal } from "../../components";
import { APPLY_FIELDS, APPLY_FIELD_LABELS } from "../clean/comparison";
import "./cleanDialogs.css";

export interface ApplyValuesDialogProps {
  open: boolean;
  count: number;
  onClose: () => void;
  onApply: (fields: OverrideField[]) => void;
}

export function ApplyValuesDialog({ open, count, onClose, onApply }: ApplyValuesDialogProps) {
  const [chosen, setChosen] = useState<OverrideField[]>([]);

  useEffect(() => {
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
      title="Apply Beatport values"
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
          accepted match are left as they are, and so is a field Beatport has no value for.
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
