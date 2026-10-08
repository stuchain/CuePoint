/**
 * Artist and label names in a Beatport table, as links to their pages (FLW-16).
 *
 * Buttons that read as text, as the Library's credits are (`CreditLinks`): the
 * name is the label and the title says which page it opens. They are real
 * buttons, so Tab reaches them within the row and Enter or Space opens the
 * page. A click opens the page and does not select the row it sits in.
 *
 * A Beatport row carries artist names only, so an artist is opened by name and
 * the engine answers the page's own address, replacing the route when the name
 * has since been linked to a Beatport artist (DEC-095). A label has its
 * Beatport id on the row, so it opens by that.
 */
import { useNavigate } from "react-router-dom";

import type { BeatportTrackRow, EntityKind } from "../../api/cuepointBridge.types";
import "../library/CreditLinks.css";
import { beatportRef, entityPath, nameRef } from "./discoverLinks";

function NameLink({ kind, name, reference }: { kind: EntityKind; name: string; reference: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="cp-credit-link"
      title={`Open the ${kind} page`}
      onClick={(event) => {
        event.stopPropagation();
        navigate(entityPath(kind, reference));
      }}
      // A press on the name is not a press on the row.
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {name}
    </button>
  );
}

/** "A, B (remixed by C)", each name a link. */
export function ArtistLinks({ row }: { row: Pick<BeatportTrackRow, "artists" | "remixers"> }) {
  const names = (list: readonly string[]) =>
    list.map((name, index) => (
      <span key={`${name}-${index}`}>
        {index > 0 && ", "}
        <NameLink kind="artist" name={name} reference={nameRef(name)} />
      </span>
    ));
  return (
    <>
      {names(row.artists)}
      {row.remixers.length > 0 && (
        <>
          {" (remixed by "}
          {names(row.remixers)}
          {")"}
        </>
      )}
    </>
  );
}

/** A row's label, a link by its Beatport id, or by name when the row has none. */
export function LabelLink({
  row,
}: {
  row: Pick<BeatportTrackRow, "label_id" | "label_name">;
}) {
  if (!row.label_name) return null;
  const reference = row.label_id != null ? beatportRef(row.label_id) : nameRef(row.label_name);
  return <NameLink kind="label" name={row.label_name} reference={reference} />;
}
