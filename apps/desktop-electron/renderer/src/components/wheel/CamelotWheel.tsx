import { Fragment, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { keyHint } from "./wheelLink";
import { changedMark, useCountChanges } from "./useCountChanges";
import {
  CAMELOT_CODES,
  GRID_CELLS,
  countLevel,
  compactCount,
  countedName,
  keyName,
  moveOnRing,
  segmentShape,
  tracksWord,
  type WheelMove,
} from "./camelot";
import "./CamelotWheel.css";

export type KeyRelation = "same" | "adjacent" | "relative";

interface CamelotWheelProps {
  /** The lit keys and how each relates to the track's key; the rest are unlit. */
  lit: ReadonlyMap<string, KeyRelation>;
  /** The one key in the tab order; the arrows move it. */
  focusCode: string;
  onFocusCode: (code: string) => void;
  /**
   * A key was chosen, by a click or Enter. The click's Ctrl, Command and Shift come with it, for
   * the Keys page's choosing of several; the header's wheel takes the code alone.
   */
  onPick: (code: string, modifiers: PickModifiers) => void;
  /** What the hole in the middle shows. */
  center?: ReactNode;
  /**
   * The counts mode (PAGES-16): how many tracks each key holds. Each segment writes its count
   * beside its name and is drawn darker the more it holds; a key not in the map holds none.
   * Without it the wheel is the header's, as it was.
   */
  counts?: ReadonlyMap<string, number>;
  /** In the counts mode, the keys chosen on the page: drawn solid and named so. */
  chosen?: ReadonlySet<string>;
}

/** Which of Ctrl, Command and Shift were down for a pick. */
export interface PickModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const MOVES: Record<string, WheelMove> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
};

const SHAPES = new Map(CAMELOT_CODES.map((code) => [code, segmentShape(code)]));

/** How a segment is named once it is lit, so the words do not lean on color alone. */
function nameOf(code: string, relation: KeyRelation | undefined): string {
  if (relation === "same") return `${code}, ${keyName(code)}, this track's key`;
  return relation ? `${code}, ${keyName(code)}, compatible` : `${code}, ${keyName(code)}`;
}

/**
 * The Camelot wheel's drawing (PAGES-10): 24 keys in two rings, A inside and B
 * outside, 12 at the top. Each is a button; the track's own key and the keys that
 * mix with it are lit. It draws what it is given and knows nothing of tracks or the
 * Library, so PAGES-16's Keys page can draw on it as well.
 */
/** A stable empty map, for the wheel drawn without counts. */
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

export function CamelotWheel({
  lit,
  focusCode,
  onFocusCode,
  onPick,
  center,
  counts,
  chosen,
}: CamelotWheelProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // Which key has focus or the pointer: drawn as an outline round its wedge, never a fill.
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const marks = useCountChanges(counts ?? NO_COUNTS);
  const biggest = counts ? Math.max(0, ...counts.values()) : 0;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = MOVES[event.key];
    if (!move) return;
    const current = (event.target as HTMLElement).getAttribute("data-key");
    if (!current) return;
    event.preventDefault();
    const next = moveOnRing(current, move);
    onFocusCode(next);
    buttons.current.get(next)?.focus();
  };

  const levelOf = (code: string) => (counts ? countLevel(counts.get(code) ?? 0, biggest) : 0);

  return (
    <div className="cp-wheel" role="group" aria-label="Keys" onKeyDown={onKeyDown}>
      <svg className="cp-wheel__art" viewBox={`0 0 ${GRID_CELLS} ${GRID_CELLS}`} aria-hidden="true">
        {CAMELOT_CODES.map((code) => (
          <path
            key={code}
            className="cp-wheel__shape"
            d={SHAPES.get(code)!.path}
            data-shape={code}
            data-lit={lit.get(code) ?? undefined}
            data-level={levelOf(code) || undefined}
            data-chosen={chosen?.has(code) ? "true" : undefined}
            data-changed={counts ? changedMark(marks, code) : undefined}
          />
        ))}
        {/* The marks go last so they lie over the neighbors' fills. */}
        {hovered !== null && hovered !== focused && (
          <path className="cp-wheel__mark" data-mark="hover" d={SHAPES.get(hovered)!.path} />
        )}
        {focused !== null && (
          <path className="cp-wheel__mark" data-mark="focus" d={SHAPES.get(focused)!.path} />
        )}
      </svg>
      {CAMELOT_CODES.map((code) => {
        const shape = SHAPES.get(code)!;
        const relation = lit.get(code);
        const count = counts ? (counts.get(code) ?? 0) : null;
        const isChosen = chosen?.has(code) ?? false;
        return (
          <Fragment key={code}>
            <button
              type="button"
              ref={(node) => {
                if (node) buttons.current.set(code, node);
                else buttons.current.delete(code);
              }}
              className="cp-wheel__key"
              data-key={code}
              data-ring={code.slice(-1)}
              data-lit={relation ?? undefined}
              data-chosen={isChosen ? "true" : undefined}
              aria-current={relation === "same" ? "true" : undefined}
              aria-label={count === null ? nameOf(code, relation) : countedName(code, count, isChosen, relation)}
              aria-pressed={count === null ? undefined : isChosen}
              title={count === null ? keyHint(code) : `${code}: ${tracksWord(count)}`}
              tabIndex={code === focusCode ? 0 : -1}
              style={
                {
                  clipPath: shape.polygon,
                  "--wheel-x": `${shape.label.x}%`,
                  "--wheel-y": `${shape.label.y}%`,
                } as CSSProperties
              }
              onClick={(event) =>
                onPick(code, { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey })
              }
              onFocus={() => {
                onFocusCode(code);
                setFocused(code);
              }}
              onBlur={() => setFocused((now) => (now === code ? null : now))}
              onPointerEnter={() => setHovered(code)}
              onPointerLeave={() => setHovered((now) => (now === code ? null : now))}
            >
            </button>
            {/* Beside the button, not in it: a clipped box would cut the focus mark. */}
            <span
              className="cp-wheel__label"
              aria-hidden="true"
              data-label-for={code}
              data-counted={count === null ? undefined : "true"}
              style={{ "--wheel-x": `${shape.label.x}%`, "--wheel-y": `${shape.label.y}%` } as CSSProperties}
            >
              {code}
              {count !== null && (
                <span className="cp-wheel__count" data-changed={changedMark(marks, code)}>
                  {compactCount(count)}
                </span>
              )}
            </span>
          </Fragment>
        );
      })}
      {center !== undefined && <div className="cp-wheel__center">{center}</div>}
    </div>
  );
}
