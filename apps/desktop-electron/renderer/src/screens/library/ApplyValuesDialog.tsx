/**
 * "Use Beatport values…" over a selection (CLEAN-13, DEC-068, PAGES-07B).
 *
 * Accepting a match writes nothing; applying copies the chosen fields from
 * each track's accepted match into CuePoint's layer, as one batch. A track
 * without an accepted match is left as it is and counted, by the engine.
 *
 * The button says how many tracks it will change, from the engine's read-only count of
 * the ticked fields together; each tick shows its own count. Until a count is known
 * (no bridge, still asking, or it failed) the button says the selection's count.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { OverrideField } from "../../api/cuepointBridge.types";
import { Modal } from "../../components";
import { countNoun } from "../../format/counts";
import { COPY_VALUES } from "../../format/words";
import { APPLY_FIELDS, APPLY_FIELD_LABELS } from "../clean/comparison";
import "./cleanDialogs.css";

interface ApplyPreview {
  tracks: number;
  fields: Partial<Record<OverrideField, number>>;
}

interface ApplyValuesDialogProps {
  open: boolean;
  count: number;
  onClose: () => void;
  onApply: (fields: OverrideField[]) => void;
  /** How many tracks applying these fields would change; left out, no counts are shown. */
  preview?: (fields: OverrideField[]) => Promise<ApplyPreview>;
}

const tracksWord = (n: number) => countNoun(n, "track");

export function ApplyValuesDialog({ open, count, onClose, onApply, preview }: ApplyValuesDialogProps) {
  const [chosen, setChosen] = useState<OverrideField[]>([]);
  // Per field, asked once on open; and the ticked fields together, asked as the ticks change.
  const [perField, setPerField] = useState<ApplyPreview["fields"] | null>(null);
  const [together, setTogether] = useState<number | null>(null);
  const askedAll = useRef(0);
  const askedTicked = useRef(0);
  const countId = useId();

  // In the commit that opens it, as EditValuesDialog does: a passive effect ran after the
  // paint and could clear a box ticked as the dialog appeared.
  useLayoutEffect(() => {
    if (open) setChosen([]);
  }, [open]);

  // A late answer for a question no longer asked is dropped: each question takes a number.
  useEffect(() => {
    if (!open || !preview) {
      setPerField(null);
      return;
    }
    const mine = ++askedAll.current;
    setPerField(null);
    preview([...APPLY_FIELDS]).then(
      (answer) => {
        if (askedAll.current === mine) setPerField(answer.fields);
      },
      () => {},
    );
  }, [open, preview]);

  useEffect(() => {
    const mine = ++askedTicked.current;
    setTogether(null);
    if (!open || !preview || chosen.length === 0) return;
    preview(chosen).then(
      (answer) => {
        if (askedTicked.current === mine) setTogether(answer.tracks);
      },
      () => {},
    );
  }, [open, preview, chosen]);

  const toggle = (field: OverrideField, on: boolean) =>
    setChosen((previous) =>
      on ? APPLY_FIELDS.filter((name) => name === field || previous.includes(name)) : previous.filter((name) => name !== field),
    );

  const nothingTicked = chosen.length === 0;
  const nothingChanges = !nothingTicked && together === 0;

  return (
    <Modal
      open={open}
      // M412: the one verb the menus use (COPY_VALUES).
      title={`${COPY_VALUES} Beatport values`}
      onClose={onClose}
      primaryAction={{
        label: `Copy to ${tracksWord(together ?? count)}`,
        disabled: nothingTicked || nothingChanges,
        disabledReason: nothingTicked ? "Tick at least one value." : "No track would change.",
        onClick: () => {
          onApply(chosen);
          onClose();
        },
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="clean-dialog">
        <p className="cp-modal__lead">
          Copies values from each track&rsquo;s confirmed Beatport match. Tracks without one are
          skipped.
        </p>
        <fieldset className="clean-dialog__group clean-dialog__group--ticks">
          <legend>Fields</legend>
          {APPLY_FIELDS.map((field) => {
            const would = perField?.[field];
            return (
              <div key={field} className="clean-dialog__tick">
                <label className="clean-dialog__check cp-check">
                  <input
                    type="checkbox"
                    checked={chosen.includes(field)}
                    aria-describedby={would === undefined ? undefined : `${countId}-${field}`}
                    onChange={(event) => toggle(field, event.target.checked)}
                  />
                  {APPLY_FIELD_LABELS[field]}
                </label>
                {would !== undefined && (
                  <span id={`${countId}-${field}`} className="clean-dialog__count">
                    {`\u00b7 ${tracksWord(would)} would change`}
                  </span>
                )}
              </div>
            );
          })}
        </fieldset>
      </div>
    </Modal>
  );
}
