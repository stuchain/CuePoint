/**
 * The selection's one programmatic gesture (PREP-11): `select` picks one row
 * from outside the table, as a plain click would, for the Prepare page's lanes
 * and for an insert that selects what it made.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useBeatportSelection } from "./useBeatportSelection";

interface Row {
  id: number;
}

const ROWS: Row[] = [{ id: 10 }, { id: 11 }, { id: 12 }];

function hook() {
  return renderHook(() =>
    useBeatportSelection<Row>({
      key: "rows",
      idOf: (row) => row.id,
      getRow: (index) => ROWS[index],
      loadedRows: () => ROWS.map((row, index) => ({ row, index })),
    }),
  );
}

describe("select", () => {
  it("selects that row alone, and anchors there as a click does", () => {
    const view = hook();
    act(() => view.result.current.onRowClick(ROWS[0], 0, { ctrlKey: false, metaKey: false, shiftKey: false } as React.MouseEvent));
    act(() => view.result.current.onRowClick(ROWS[1], 1, { ctrlKey: true, metaKey: false, shiftKey: false } as React.MouseEvent));
    expect(view.result.current.count).toBe(2);
    act(() => view.result.current.select(ROWS[2], 2));
    expect([...view.result.current.keys]).toEqual([12]);
    expect(view.result.current.rows).toEqual([ROWS[2]]);
    expect(view.result.current.anchor).toBe(2);
    // A Shift-click extends from where `select` put the anchor.
    act(() => view.result.current.onRowClick(ROWS[0], 0, { ctrlKey: false, metaKey: false, shiftKey: true } as React.MouseEvent));
    expect([...view.result.current.keys].sort()).toEqual([10, 11, 12]);
  });
});

const click = (view: ReturnType<typeof hook>, at: number, keys: { shiftKey?: boolean; ctrlKey?: boolean } = {}) =>
  act(() =>
    view.result.current.onRowClick(ROWS[at]!, at, {
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      ...keys,
    } as React.MouseEvent),
  );

describe("a Shift range, as in the Library", () => {
  it("adds the rows between the anchor and the click, keeps the anchor, and follows the clicked row", () => {
    const view = hook();
    click(view, 0);
    click(view, 2, { shiftKey: true });
    expect([...view.result.current.keys].sort()).toEqual([10, 11, 12]);
    expect(view.result.current.anchor).toBe(0);
    // The Inspector and the wheel follow the row clicked last, not the anchor.
    expect(view.result.current.anchorRow).toEqual(ROWS[2]);
    // Shift-clicking again extends from the same place.
    click(view, 1, { shiftKey: true });
    expect(view.result.current.anchor).toBe(0);
    expect(view.result.current.anchorRow).toEqual(ROWS[1]);
  });

  it("is a plain click when there is nothing to extend from", () => {
    const view = hook();
    click(view, 1, { shiftKey: true });
    expect([...view.result.current.keys]).toEqual([11]);
    expect(view.result.current.anchor).toBe(1);
  });

  it("keeps what Ctrl added when a range is added", () => {
    const view = hook();
    click(view, 0);
    click(view, 2, { ctrlKey: true });
    click(view, 1, { shiftKey: true });
    expect([...view.result.current.keys].sort()).toEqual([10, 11, 12]);
  });
});
