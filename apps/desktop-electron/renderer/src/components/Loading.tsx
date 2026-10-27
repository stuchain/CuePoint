import { useEffect, useRef, useState } from "react";
import { PixelSpinner } from "./PixelSpinner";
import "./Loading.css";

/** A wait shorter than this shows nothing, so a quick load does not flash a spinner (M371). */
export const LOADING_DELAY_MS = 300;
/** Once the spinner shows it stays at least this long, so it is seen rather than blinked (M371). */
export const LOADING_MINIMUM_MS = 400;

interface LoadingProps {
  /** What is loading, as a plain noun phrase: "tracks", "your Library". Words read "Loading <what>…". */
  what?: string;
  /** Centre it in the room it has (an empty table, a panel) instead of leaving it in the line. */
  centered?: boolean;
  className?: string;
}

/** The words of the one loading line: always "Loading <what>…", never Reading/Counting/Checking. */
export function loadingWords(what?: string): string {
  return what ? `Loading ${what}…` : "Loading…";
}

/**
 * Whether a loading look should be drawn for a wait that is `loading` now (M371): false for the
 * first `delay` ms, then true until the wait ends, and for `minimum` ms after it first showed. A
 * page that swaps the look for its content gives the content the same cue: draw it when this is
 * false and `loading` is false too.
 */
export function useLoadingGate(loading: boolean, delay = LOADING_DELAY_MS, minimum = LOADING_MINIMUM_MS): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (loading) {
      if (shown) return;
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, delay);
      return () => window.clearTimeout(timer);
    }
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(false), Math.max(0, minimum - (Date.now() - shownAt.current)));
    return () => window.clearTimeout(timer);
  }, [loading, shown, delay, minimum]);
  return shown;
}

/**
 * The one loading look: the pixel spinner and "Loading <what>…". A wait that runs a job with
 * progress is a progress bar in the status strip, not this. It holds its room from the first
 * frame but draws nothing for the first 300 ms, so a quick load never flashes it (M371).
 */
export function Loading({ what, centered = false, className = "" }: LoadingProps) {
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaiting(false), LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div
      className={`cp-loading${centered ? " cp-loading--centered" : ""} ${className}`.trim()}
      data-waiting={waiting ? "" : undefined}
    >
      <PixelSpinner label={loadingWords(what)} />
    </div>
  );
}
