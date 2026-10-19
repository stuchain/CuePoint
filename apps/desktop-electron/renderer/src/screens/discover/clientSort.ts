/**
 * Sorting the rows a Discover table holds, in the screen (C70, C193).
 *
 * `TrackTable` sorts a column with an `accessor` and no engine key by itself, but the callbacks
 * it makes then carry the displayed position, so a screen that plays "from row 3" or extends a
 * Shift range must see the rows in that same order. These helpers order rows the way the table
 * does (empty values last in either direction, numbers by value, words by the locale with
 * numbers inside them in numeric order), so a screen can mirror it.
 */
export type SortValue = string | number | null | undefined;

export interface ClientSort {
  key: string;
  direction: "asc" | "desc";
}

const isEmpty = (value: SortValue) => value === null || value === undefined || value === "";

/** The table's own comparison: empty values go last, in either direction. */
export function compareValues(a: SortValue, b: SortValue, direction: 1 | -1): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * direction;
}

/**
 * The rows in the order a column's accessor puts them; ties keep their given order. With no sort,
 * or a column the screen cannot order, the rows come back as they were given.
 */
export function sortedRows<Row>(
  rows: readonly Row[],
  columns: readonly { id: string; accessor?: (row: Row) => SortValue }[],
  sort: ClientSort | null,
): Row[] {
  const accessor = sort ? columns.find((column) => column.id === sort.key)?.accessor : undefined;
  if (!sort || !accessor) return [...rows];
  const direction = sort.direction === "desc" ? -1 : 1;
  const values = rows.map((row) => accessor(row));
  return rows
    .map((_, at) => at)
    .sort((a, b) => compareValues(values[a], values[b], direction) || a - b)
    .map((at) => rows[at]!);
}
