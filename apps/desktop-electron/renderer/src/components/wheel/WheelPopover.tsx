import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../Button";
import { CamelotWheel } from "./CamelotWheel";
import { parseCode } from "./camelot";
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

/** Space left under the popover when it is as tall as the window allows, in CSS pixels. */
const FIT_MARGIN = 8;

/** The first key to land on: the track's own, else 8A, the middle of the wheel's range. */
function startingCode(key: string | null): string {
  return key !== null && parseCode(key) !== null ? key : "8A";
}

/**
 * The Camelot wheel as a popover under its button (PAGES-10, DEC-133, K8).
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

  // Place it under the button, right edges level and kept inside the window, then fit the
  // window: the room from the popover's top to the window's bottom edge.
  useLayoutEffect(() => {
    const fit = () => {
      const root = rootRef.current;
      if (!root) return;
      const width = root.offsetWidth;
      // Under the opener, right edges level; with none known, the window's top right.
      const box = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
      const left = Math.min((box ? box.right : window.innerWidth) - width, window.innerWidth - width - FIT_MARGIN);
      // Under the opener when half the window is free below it; otherwise (the player bar's key at
      // the foot, or Track details' key line low or scrolled out at the largest size) from the top.
      const below = box ? window.innerHeight - box.bottom : 0;
      root.style.top = `${box && below >= window.innerHeight / 2 ? box.bottom : FIT_MARGIN}px`;
      root.style.left = `${Math.max(left, FIT_MARGIN)}px`;
      const room = window.innerHeight - root.getBoundingClientRect().top - FIT_MARGIN;
      root.style.maxHeight = `${Math.max(room, 0)}px`;
    };
    fit();
    // Scrolling anything (Track details, the page) moves the opener under it: follow it.
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
    };
  }, [anchor]);

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
    caption = "Select or play a track to light its key.";
  } else if (subject.key === null) {
    caption = "This track has no Beatport key yet";
    action = { label: "Match on Beatport", run: () => match(subject.id) };
  } else {
    caption = `${who}: ${name} · ${subject.key}`;
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
        center={subjectKey ?? undefined}
      />
      <p className="cp-wheel-pop__caption" role="status">
        {caption}
      </p>
      {action && (
        <div className="cp-wheel-pop__actions">
          <Button variant="primary" onClick={action.run}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
