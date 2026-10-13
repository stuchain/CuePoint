/**
 * Correct ticked values, with the values to take in its own menu (K12).
 *
 * The button takes the ticked rows with the ticked values; the arrow beside it
 * opens the five values as tick entries (Key, BPM, Genre, Label, Year) that
 * stay open while several are changed. The same remembered preference as the
 * ticks under One at a time (OQ5). When not every value is ticked the button
 * says how many: "Correct ticked values (2 tracks, 4 fields)".
 */
import { useRef, useState } from "react";

import { Button } from "../../../components/Button";
import { TrackContextMenu } from "../../../components/TrackContextMenu";
import { trackCount } from "../cleanFormat";
import { CARD_FIELDS, CARD_FIELD_LABELS, type CardField } from "./matchCard";

/** "Correct ticked values (2 tracks)", and the number of fields when not all are ticked. */
function takeLabel(tracks: number, fields: number): string {
  const parts = [trackCount(tracks)];
  if (fields < CARD_FIELDS.length) parts.push(`${fields} ${fields === 1 ? "field" : "fields"}`);
  return `Correct ticked values (${parts.join(", ")})`;
}

interface TakeMenuProps {
  ticks: ReadonlySet<CardField>;
  onToggleTick: (field: CardField) => void;
  /** Rows ticked in the table. */
  tracks: number;
  busy: boolean;
  onTake: () => void;
}

export function TakeMenu({ ticks, onToggleTick, tracks, busy, onTake }: TakeMenuProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const none = ticks.size === 0;
  return (
    <span className="match-take">
      <Button
        disabled={busy || tracks === 0}
        aria-disabled={none ? true : undefined}
        title={none ? "Tick at least one value." : undefined}
        onClick={() => {
          if (!none) onTake();
        }}
      >
        {takeLabel(tracks, ticks.size)}
      </Button>
      <span ref={arrow} className="match-take__arrow">
        <Button
          iconOnly
          icon="chevron-down"
          aria-label="Values to take"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          disabled={busy}
          onClick={(event) => {
            if (menu) {
              setMenu(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom });
          }}
        />
      </span>
      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          label="Values to take"
          anchor={arrow}
          onClose={() => setMenu(null)}
          items={CARD_FIELDS.map((field) => ({
            id: field,
            label: field === "key" ? "Key (replaces yours)" : CARD_FIELD_LABELS[field],
            checked: ticks.has(field),
            onSelect: () => onToggleTick(field),
          }))}
        />
      )}
    </span>
  );
}
