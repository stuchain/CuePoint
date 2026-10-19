/**
 * The counts as a list (PAGES-16): the accessible reading of the wheel's numbers.
 *
 * Every key the sources hold, in Camelot order, each as the Library's key chip with its name, a
 * bar in the key's own colour and its count written out, then "— no key" as one more row (C258).
 * A row is a button that chooses its key (Ctrl or Command adds one, Shift takes a run); the keys
 * that mix with the one asked about say so in words, so the light is never color alone.
 */
import { useMemo, type CSSProperties } from "react";

import type { KeyPopulationEntry } from "../../api/cuepointBridge.types";
import { countedName, keyName } from "../../components/wheel/camelot";
import type { PickModifiers } from "../../components/wheel/CamelotWheel";
import { RankBar } from "../../components/charts/RankBar";
import { Hint } from "../../components/Hint";
import { KeyChip } from "../../components/wheel";
import { formatCount } from "../../format/counts";
import { NO_VALUE } from "../../format/words";
import { changedMark, useCountChanges } from "../../components/wheel/useCountChanges";
import { keysListRows, type KeysListRow } from "./keysCounts";

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

/** What the no-key row is called to a screen reader: the words the page has always used. */
const NO_KEY_NAME = "No Beatport key";
const NO_KEY_HINT = "Every track here has a key";

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
  const rows = useMemo(() => keysListRows(keys, noKey), [keys, noKey]);
  return (
    <div className="keys-counts" role="group" aria-label="Keys in these sources">
      <ul className="keys-counts__list">
        {rows.map((row) =>
          row.kind === "none" ? (
            <li key="none" data-line="no-key">
              <KeysNoKeyButton row={row} noneChosen={noneChosen} onPickNone={onPickNone} />
            </li>
          ) : (
            <li key={row.code} data-line="key">
              <KeyRow
                row={row}
                chosen={chosen.has(row.code!)}
                relation={lit.get(row.code!)}
                mixKey={mixKey}
                changed={changedMark(marks, row.code!)}
                onPick={onPick}
              />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function KeyRow({
  row,
  chosen,
  relation,
  mixKey,
  changed,
  onPick,
}: {
  row: KeysListRow;
  chosen: boolean;
  relation: "same" | "adjacent" | "relative" | undefined;
  mixKey: string | null;
  changed: ReturnType<typeof changedMark>;
  onPick: KeysCountsListProps["onPick"];
}) {
  const code = row.code!;
  return (
    <button
      type="button"
      className="keys-counts__row"
      style={{ "--key": `var(--key-${code})` } as CSSProperties}
      aria-pressed={chosen}
      aria-label={countedName(code, row.count, chosen, relation)}
      data-lit={relation}
      onClick={(event) =>
        onPick(code, {
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        })
      }
    >
      <span className="keys-counts__code">
        <KeyChip value={code} />
      </span>
      <span className="keys-counts__name">{keyName(code)}</span>
      {relation && relation !== "same" && mixKey && (
        <span className="keys-counts__mix">mixes with {mixKey}</span>
      )}
      <span
        className="keys-counts__bar"
        aria-hidden="true"
        data-bar
        data-changed={changed}
        data-percent={row.percent}
      >
        <RankBar share={row.percent / 100} />
      </span>
      <span className="keys-counts__count" data-changed={changed}>
        {formatCount(row.count)}
      </span>
    </button>
  );
}

/**
 * "— no key  47": the tracks without a Beatport key, a button that chooses them. The list ends
 * with it, and the wheel view draws it under the wheel, so it is on the page in both.
 */
function KeysNoKeyButton({
  row,
  noneChosen,
  onPickNone,
}: {
  row: KeysListRow;
  noneChosen: boolean;
  onPickNone: () => void;
}) {
  return (
    <Hint text={row.count === 0 ? NO_KEY_HINT : undefined}>
      <button
        type="button"
        className="keys-counts__row keys-counts__row--none"
        style={{ "--key": "var(--fg-muted)" } as CSSProperties}
        aria-pressed={noneChosen}
        aria-label={`${NO_KEY_NAME}: ${formatCount(row.count)}`}
        aria-disabled={row.count === 0 ? true : undefined}
        onClick={() => {
          if (row.count > 0) onPickNone();
        }}
      >
        <span className="keys-counts__code">{NO_VALUE}</span>
        <span className="keys-counts__name">no key</span>
        <span className="keys-counts__bar" aria-hidden="true" data-bar data-percent={row.percent}>
          <RankBar share={row.percent / 100} />
        </span>
        <span className="keys-counts__count">{formatCount(row.count)}</span>
      </button>
    </Hint>
  );
}

/** The no-key row on its own, for the wheel view: the same row, the same place in the list's grid. */
export function KeysNoKeyRow({
  noKey,
  noneChosen,
  onPickNone,
}: Pick<KeysCountsListProps, "noKey" | "noneChosen" | "onPickNone">) {
  const row = useMemo(() => keysListRows([], noKey).at(-1)!, [noKey]);
  return (
    <ul className="keys-counts__list" data-line="no-key">
      <li>
        <KeysNoKeyButton row={{ ...row, percent: 0 }} noneChosen={noneChosen} onPickNone={onPickNone} />
      </li>
    </ul>
  );
}
