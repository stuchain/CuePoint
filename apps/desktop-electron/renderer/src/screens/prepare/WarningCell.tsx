/**
 * A Set table cell's warnings: the open ones in a few words, or "accepted"
 * (PREP-10). Every sentence is the title, for a pointer that stops on it.
 */
import type { SetWarning } from "../../api/cuepointBridge.types";
import { summarizeWarnings } from "./prepareFormat";

export function WarningCell({ warnings }: { warnings: readonly SetWarning[] }) {
  const summary = summarizeWarnings(warnings);
  if (summary.tone === "none") return null;
  return (
    <span
      className={`prepare-warning prepare-warning--${summary.tone}`}
      title={summary.title}
    >
      <span aria-hidden="true">{summary.tone === "open" ? "⚠ " : "✓ "}</span>
      {summary.text}
    </span>
  );
}
