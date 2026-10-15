import { PixelSpinner } from "./PixelSpinner";
import "./Loading.css";

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
 * The one loading look: the pixel spinner and "Loading <what>…". A wait that runs a job with
 * progress is a progress bar in the status strip, not this.
 */
export function Loading({ what, centered = false, className = "" }: LoadingProps) {
  return (
    <div className={`cp-loading${centered ? " cp-loading--centered" : ""} ${className}`.trim()}>
      <PixelSpinner label={loadingWords(what)} />
    </div>
  );
}
