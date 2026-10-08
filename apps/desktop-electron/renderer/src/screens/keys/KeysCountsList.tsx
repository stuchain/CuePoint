/**
 * The counts as a list (PAGES-16): the accessible reading of the wheel's numbers.
 *
 * Every key the sources hold, in Camelot order, each with a bar and its count written out,
 * then "No Beatport key: N" on its own line. A row is a button that chooses its key (Ctrl or
 * Command adds one, Shift takes a run); the keys that mix with the one asked about say so
 * in words, so the light is never color alone.
 */
import { useMemo } from "react";

import type { KeyPopulationEntry } from "../../api/cuepointBridge.types";
import { countedName, keyName } from "../../components/wheel/camelot";
import type { PickModifiers } from "../../components/wheel/CamelotWheel";
import { changedMark, useCountChanges } from "../../components/wheel/useCountChanges";
import { barPercent } from "./keysCounts";

interface KeysCountsListProps {
  keys: readonly KeyPopulationEntry[];
  noKey: number;
  chosen: ReadonlySet<string>;
  noneChosen: boolean;
  /** The keys the engine says mix with `mixKey`, and what each is to it. */
  lit: ReadonlyMap<string, "same" | "adjacent" | "relative">;
  mixKey: string | null;
  onPick: (code: string, modifiers: PickModifiers) => void;
  onPickNone: () => void;
}

export function KeysCountsList({
  keys,
  noKey,
  chosen,
  noneChosen,
  lit,
  mixKey,
  onPick,
  onPickNone,
}: KeysCountsListProps) {
  const counts = useMemo(() => new Map(keys.map((entry) => [entry.code, entry.count])), [keys]);
  const marks = useCountChanges(counts);
  const biggest = Math.max(0, ...keys.map((entry) => entry.count));
  return (
    <div className="keys-counts" role="group" aria-label="Keys in these sources">
      <ul className="keys-counts__list">
        {keys.map((entry) => {
          const relation = lit.get(entry.code);
          return (
            <li key={entry.code} data-line="key">
              <button
                type="button"
                className="keys-counts__row"
                aria-pressed={chosen.has(entry.code)}
                aria-label={countedName(entry.code, entry.count, chosen.has(entry.code), relation)}
                data-lit={relation}
                onClick={(event) =>
                  onPick(entry.code, {
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    shiftKey: event.shiftKey,
                  })
                }
              >
                <span className="keys-counts__code">{entry.code}</span>
                <span className="keys-counts__name">{keyName(entry.code)}</span>
                {relation && relation !== "same" && mixKey && (
                  <span className="keys-counts__mix">mixes with {mixKey}</span>
                )}
                <span
                  className="keys-counts__bar"
                  aria-hidden="true"
                  data-bar
                  data-changed={changedMark(marks, entry.code)}
                  data-percent={barPercent(entry.count, biggest)}
                >
                  <span style={{ width: `${barPercent(entry.count, biggest)}%` }} />
                </span>
                <span className="keys-counts__count" data-changed={changedMark(marks, entry.code)}>
                  {entry.count.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="keys-counts__none" data-line="no-key">
        <button
          type="button"
          className="keys-counts__row keys-counts__row--none"
          aria-pressed={noneChosen}
          aria-disabled={noKey === 0 ? true : undefined}
          title={noKey === 0 ? "Every track here has a key" : undefined}
          onClick={() => {
            if (noKey > 0) onPickNone();
          }}
        >
          No Beatport key: {noKey.toLocaleString()}
        </button>
      </div>
    </div>
  );
}
