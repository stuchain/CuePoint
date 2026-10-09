import { useMemo } from "react";

import { renderReleaseNotes } from "./releaseNotes";
import "./updates.css";

/** A version's notes as formatted text, or a plain line when there are none. */
export function ReleaseNotesView({ notes }: { notes: string | null | undefined }) {
  const body = useMemo(() => (notes && notes.trim() !== "" ? renderReleaseNotes(notes) : null), [notes]);
  if (body === null) return <p className="cp-release-notes__none">No notes for this version.</p>;
  return <div className="cp-release-notes">{body}</div>;
}
