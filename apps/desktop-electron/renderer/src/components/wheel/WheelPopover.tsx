import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../Button";
import { MATCH_ON_BEATPORT } from "../../format/words";
import { CamelotWheel, WheelKeyText } from "./CamelotWheel";
import { useKeyNotation } from "./keyNotationSetting";
import { keyLabel, parseCode } from "./camelot";
import { placeWheel } from "./wheelPlacement";
import { keyRulesState, openMatching } from "./wheelLink";
import { closeWheel, type WheelSource } from "./wheelStore";
import { useCompatibleKeys, useWheelSubject } from "./useWheelSubject";
import "./WheelPopover.css";

interface WheelPopoverProps {
  source: WheelSource;
  /** Closed and playing its exit (PAGES-12): inert, taking no clicks. */
  leaving?: boolean;
  /** The opener it hangs under, or null when none is known: the popover is fixed, placed from this. */
  anchor: HTMLElement | null;
  /** The presence ref, on the element that carries the exit. */
  presenceRef?: RefObject<HTMLDivElement | null>;
}

/** The first key to land on: the track's own, else 8A, the middle of the wheel's range. */
function startingCode(key: string | null): string {
  return key !== null && parseCode(key) !== null ? key : "8A";
}

/** The hole in the middle: the track's key in the chosen notation (a text that is not a place is shown as it came). */
function SubjectKey({ value }: { value: string }) {
  const notation = useKeyNotation();
  return parseCode(value) ? <WheelKeyText code={value} notation={notation} /> : <>{value}</>;
}

/**
 * The Camelot wheel as a popover next to its button (PAGES-10, DEC-133, K8).
 *
 * Fixed to the window and placed from the button, so the page below never reflows and the
 * scrolling Track details panel the button sits in cannot clip it. It
 * lights the track's key and the keys the engine says mix with it, says in words
 * what it is lit for, and a click on a key opens the whole Library on that key
 * (DEC-160).
 */
export function WheelPopover({ source, anchor, leaving = false, presenceRef }: WheelPopoverProps) {
  const navigate = useNavigate();
  const subject = useWheelSubject(source);
  const notation = useKeyNotation();
  const subjectKey = subject ? subject.key : null;
  const lit = useCompatibleKeys(subjectKey);
  const [focusCode, setFocusCode] = useState(() => startingCode(subjectKey));
  const rootRef = useRef<HTMLDivElement>(null);

  // Open on the track's own key; a different track moves the tab stop with it.
  useEffect(() => {
    setFocusCode(startingCode(subjectKey));
  }, [subjectKey]);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>(`[data-key="${startingCode(subjectKey)}"]`)?.focus();
    // On open only: later changes of key move the tab stop, not the user's focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place it next to the button that opened it (see wheelPlacement.ts), kept inside the window.
  useLayoutEffect(() => {
    const fit = (event?: Event) => {
      const root = rootRef.current;
      if (!root) return;
      // The popover's own scroll is the person reading it: refitting would be a no-op at best.
      if (event?.type === "scroll" && event.target instanceof Node && root.contains(event.target)) return;
      const connected = anchor?.isConnected ? anchor : null;
      const bar = connected?.closest(".cp-player-bar");
      const at = placeWheel({
        source: source === "player" ? "player" : "details",
        anchor: connected ? connected.getBoundingClientRect() : null,
        bar: bar ? bar.getBoundingClientRect() : null,
        // The natural height, read from the content so the current cap (and the scroll position
        // it keeps) never has to be taken off to measure.
        size: { width: root.offsetWidth, height: root.scrollHeight + (root.offsetHeight - root.clientHeight) },
        win: { width: window.innerWidth, height: window.innerHeight },
      });
      root.style.top = `${at.top}px`;
      root.style.left = `${at.left}px`;
      root.style.maxHeight = `${at.maxHeight}px`;
    };
    fit();
    // Scrolling anything (Track details, the page) moves the opener under it: follow it.
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
    };
  }, [anchor, source]);

  const pick = useCallback(
    (code: string) => {
      closeWheel({ restoreFocus: false });
      navigate("/library", { state: keyRulesState(code) });
    },
    [navigate],
  );

  const match = useCallback(
    (trackId?: number | string | null) => {
      closeWheel({ restoreFocus: false });
      openMatching(navigate, trackId);
    },
    [navigate],
  );

  const who = subject?.kind === "playing" ? "Playing" : "Selected";
  const name = subject?.title ?? "this track";

  let caption: string;
  let action: { label: string; run: () => void } | null = null;
  if (subject === null) {
    caption = "Select or play a track to light its key";
  } else if (subject.key === null) {
    caption = "This track has no Beatport key yet";
    action = { label: MATCH_ON_BEATPORT, run: () => match(subject.id) };
  } else {
    caption = `${who}: ${name} · ${keyLabel(subject.key, notation)}`;
  }

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        if (presenceRef) presenceRef.current = node;
      }}
      className="cp-wheel-pop"
      role="dialog"
      aria-label="Camelot wheel"
      data-leaving={leaving ? "" : undefined}
      inert={leaving}
    >
      <CamelotWheel
        lit={lit}
        focusCode={focusCode}
        onFocusCode={setFocusCode}
        onPick={pick}
        center={subjectKey ? <SubjectKey value={subjectKey} /> : undefined}
      />
      <p className="cp-wheel-pop__caption" role="status">
        {caption}
      </p>
      {action && (
        <div className="cp-wheel-pop__actions">
          <Button variant="secondary" onClick={action.run}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
