/**
 * Copying tracks out of CuePoint (LIBUI-09).
 *
 * Tab-separated, the columns the table is showing, in the order it is showing
 * them — so what lands in a spreadsheet or a message is what was on screen,
 * not a shape someone would have to explain. The header row is included for
 * the same reason.
 *
 * Values come from the same `render` functions the table uses where they
 * produce text, so a copied BPM reads as the table's BPM. Where a column
 * renders something that is not text — an icon, a control — the raw field is
 * used instead, because a copy of "[object Object]" helps nobody.
 */
import type { TrackColumnDef } from "../../components/table";

/** Each gathered column's text, by column id (`gatherText`). */
type GatheredTexts<Row> = ReadonlyMap<string, (row: Row) => string>;

/** What a cell contributes to a copy. */
export function cellText<Row>(
  column: TrackColumnDef<Row>,
  row: Row,
  gathered?: GatheredTexts<Row>,
): string {
  const read = gathered?.get(column.id);
  if (read) return read(row);
  // A column that draws more than text says what its text is (CLEAN-13): an
  // overridden BPM copies as the BPM shown, not as the imported field.
  if (column.text) return column.text(row);
  const rendered = column.render(row);
  if (typeof rendered === "string") return rendered;
  if (typeof rendered === "number") return String(rendered);

  // The fallback reads the field by the column's id, which is the one place
  // this needs to treat a row as a record. A column whose id is not a field
  // simply contributes nothing, which is what an icon column should.
  const raw = (row as Record<string, unknown>)[column.id];
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  return "";
}

/** A tab is the separator, so a tab inside a value would break the shape. */
function clean(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * The selection as text: a header row, then one row per track.
 *
 * Returns "" for nothing selected, so a caller can tell "nothing to copy" from
 * "a copy with no rows in it".
 */
export function tracksAsText<Row>(
  columns: readonly TrackColumnDef<Row>[],
  rows: readonly Row[],
  gathered?: GatheredTexts<Row>,
): string {
  if (rows.length === 0 || columns.length === 0) return "";
  const header = columns.map((column) => clean(column.header)).join("\t");
  const body = rows.map((row) =>
    columns.map((column) => clean(cellText(column, row, gathered))).join("\t"),
  );
  return [header, ...body].join("\n");
}

/**
 * The selection as text, once every shown column whose text is not in the row
 * has read it for these rows (`gatherText`, WAVE-08). What every copy of a
 * table calls, so a column that needs a read gets it in each.
 */
export async function gatherTracksAsText<Row>(
  columns: readonly TrackColumnDef<Row>[],
  rows: readonly Row[],
): Promise<string> {
  if (rows.length === 0 || columns.length === 0) return "";
  const gathering = columns.filter((column) => column.gatherText !== undefined);
  const texts = await Promise.all(gathering.map((column) => column.gatherText!(rows)));
  const gathered = new Map(gathering.map((column, index) => [column.id, texts[index]]));
  return tracksAsText(columns, rows, gathered);
}

/** What to say after a copy, including when it could not be all of it. */
export function copySummary(copied: number, selected: number): string {
  if (copied === 0) return "Nothing to copy";
  if (copied < selected) {
    return `Copied the first ${copied.toLocaleString()} of ${selected.toLocaleString()} tracks`;
  }
  return `Copied ${copied.toLocaleString()} ${copied === 1 ? "track" : "tracks"}`;
}

/**
 * Put text on the clipboard, saying whether it worked.
 *
 * The clipboard can refuse — a window without focus, a browser without
 * permission — and a copy that silently did nothing is worse than one that
 * says so.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
