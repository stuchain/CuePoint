/**
 * A ranked list in a Statistics card: a heading with what it counts at its right, a row of
 * column headings, then rows of rank, name, a bar as long as its share of the top row (its own
 * column, so every bar starts at the same edge, D22), and the numbers. A row is a button that opens exactly the tracks it counted.
 *
 * Shared by the Plays tab (top artists, labels and genres) and the Library tab (genres, labels
 * and artists by tracks). Only the first `shown` rows are drawn; the card's one link says how
 * many more it can show ("Show all 10") and puts them away again ("Show less").
 */
import { Fragment, useState, type ReactNode } from "react";

import type { FilterRuleSet } from "../../api/cuepointBridge.types";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { RankBar } from "../../components/charts/RankBar";
import { ShowMore } from "../../components/ShowMore";
import { formatCount } from "../../format/counts";
import "../../components/table/DataTable.css";

export interface RankRow {
  id: string;
  name: string;
  /** Tracks counted; drawn in the Tracks column when the card has one. */
  tracks?: number;
  /** Plays counted; drawn in the Plays column when the card has one. */
  plays?: number;
  /** What the bar is a share of: plays for a plays list, tracks for a tracks list. */
  weight: number;
  rules: FilterRuleSet;
  /** The row's accessible name. */
  label: string;
  /** Muted words after the name, for a row that opens more than it counted. */
  note?: string;
}

interface RankListProps {
  title: string;
  /** What the card counts, at the heading's right, in the order of its columns: "tracks · plays". */
  unit?: string;
  rows: readonly RankRow[];
  /** The numeric columns, in order. */
  columns: ReadonlyArray<"tracks" | "plays">;
  /** What the empty card says. */
  empty: string;
  /** Draw nothing at all when there are no rows (the Overview, M222), instead of an empty card. */
  hideWhenEmpty?: boolean;
  /** Rows drawn before the link; the rest wait behind it. */
  shown?: number;
  onOpen: (rules: FilterRuleSet) => void;
  /** Under the rows, at the left of the link. */
  children?: ReactNode;
}

const HEADINGS = { tracks: "Tracks", plays: "Plays" } as const;

export function RankList({
  title,
  unit,
  rows,
  columns,
  empty,
  hideWhenEmpty = false,
  shown = 5,
  onOpen,
  children,
}: RankListProps) {
  const [all, setAll] = useState(false);
  const visible = all ? rows : rows.slice(0, shown);
  const top = Math.max(1, ...rows.map((row) => row.weight));
  const more = rows.length > shown;
  if (hideWhenEmpty && rows.length === 0) return null;
  return (
    <Card className="statistics-panel rank" title={title} unit={unit} titleClassName="rank__title" bodyClassName="statistics-panel__body" aria-label={title}>
      {rows.length === 0 ? (
        <EmptyState compact headline={empty} />
      ) : (
        <>
          <div
            className="cp-data-grid__head rank__columns"
            style={{ ["--rank-columns" as string]: columns.length }}
            aria-hidden="true"
          >
            <span className="rank__hash">#</span>
            <span>Name</span>
            <span aria-hidden="true" />
            {columns.map((column) => (
              <span key={column} className="rank__number">
                {HEADINGS[column]}
              </span>
            ))}
          </div>
          <ol className="cp-data-grid__list" aria-label={title}>
            {visible.map((row, index) => (
              <li key={row.id} className="cp-data-grid__item">
                <button
                  type="button"
                  className="cp-data-grid__row rank__row"
                  style={{ ["--rank-columns" as string]: columns.length }}
                  aria-label={`${index + 1}. ${row.label}`}
                  onClick={() => onOpen(row.rules)}
                >
                  <span className="rank__hash statistics-figure" aria-hidden="true">
                    {index + 1}
                  </span>{" "}
                  <span className="rank__name" aria-hidden="true">
                    <span className="rank__text" data-cut-hint="">
                      {row.name}
                      {row.note && <span className="rank__note">{row.note}</span>}
                    </span>
                  </span>{" "}
                  <span className="rank__bar" aria-hidden="true">
                    <RankBar share={row.weight / top} />
                  </span>{" "}
                  {columns.map((column) => (
                    <Fragment key={column}>
                      <span
                        className={`rank__number statistics-figure${column === columns[columns.length - 1] ? " rank__number--main" : ""}`}
                        aria-hidden="true"
                      >
                        {formatCount(row[column] ?? 0)}
                      </span>{" "}
                    </Fragment>
                  ))}
                </button>
              </li>
            ))}
          </ol>
          {children}
          {more && (
            <div className="statistics-panel__foot">
              <ShowMore total={rows.length} expanded={all} onToggle={() => setAll((open) => !open)} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
