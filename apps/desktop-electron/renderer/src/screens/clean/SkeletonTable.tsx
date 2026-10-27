/**
 * A table that is still loading, drawn as its own header over placeholder rows (M373): the shape of
 * what is coming, not a spinner, as the Library's table does for rows not fetched yet. The bars are
 * the track table's (`track-table__skeleton`), so they share its tone, height and slow breath.
 * Screen readers hear "Loading <what>…" once, from the table's busy status.
 */
import { loadingWords } from "../../components/Loading";
import "../../components/table/DataTable.css";
import "../../components/table/TrackTable.css";

/** How many placeholder rows: about a screenful, and never a scroll of its own. */
const ROWS = 8;
/** Each row's bars vary a little, so the block reads as rows of text rather than a grid. */
const WIDTHS = ["70%", "55%", "40%", "60%", "50%"];

interface SkeletonTableProps {
  /** What is loading, as in `<Loading what>`: "the tracks", "past matches". */
  what: string;
  /** The real table's column headers, in order; an empty string is a column with no words. */
  columns: readonly string[];
  className?: string;
}

export function SkeletonTable({ what, columns, className = "" }: SkeletonTableProps) {
  return (
    <div className={`clean-skeleton ${className}`.trim()} role="status" aria-busy="true" aria-label={loadingWords(what)}>
      <table className="cp-data-table" aria-hidden>
        <thead>
          <tr>
            {columns.map((name, index) => (
              <th key={index} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS }, (_, row) => (
            <tr key={row}>
              {columns.map((_, column) => (
                <td key={column}>
                  <span
                    className="track-table__skeleton"
                    style={{ ["--skeleton-width" as string]: WIDTHS[(row + column) % WIDTHS.length] }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
