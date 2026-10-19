/**
 * A Set table cell's warnings: the open ones in a few words, or "accepted"
 * (PREP-10). Every sentence is its hint, for a pointer that stops on it.
 */
import type { SetWarning } from "../../api/cuepointBridge.types";
import { PixelIcon } from "../../components/PixelIcon";
import { summarizeWarnings } from "./prepareFormat";

export function WarningCell({ warnings }: { warnings: readonly SetWarning[] }) {
  const summary = summarizeWarnings(warnings);
  if (summary.tone === "none") return null;
  return (
    <span
      className={`prepare-warning prepare-warning--${summary.tone}`}
      data-hint={summary.title}
    >
      <PixelIcon
        name={summary.tone === "open" ? "warning" : "check"}
        size="sm"
        className="cp-pixel-icon--text cp-pixel-icon--before"
      />
      {summary.text}
    </span>
  );
}

/**
 * The dot's shape as well as its colour, so it reads without telling reds from greens: filled,
 * half and a ring (drawn in CSS, there is no ring icon). Not typed glyphs (C138).
 */
export function FitDot({ level }: { level: "fit" | "one" | "both" }) {
  if (level === "both") return <span className="prepare-fit__ring" />;
  return <PixelIcon name={level === "fit" ? "dot-filled" : "dot-half"} size="sm" />;
}
