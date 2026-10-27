/**
 * A loading table is its own shape over placeholder rows, not a spinner (M373).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SkeletonTable } from "./SkeletonTable";

describe("SkeletonTable (M373)", () => {
  it("draws the table's headers over placeholder rows, and says what loads once", () => {
    const { container } = render(<SkeletonTable what="past matches" columns={["When", "What was matched", ""]} />);
    const status = screen.getByRole("status", { name: "Loading past matches…" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect([...container.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["When", "What was matched", ""]);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(3);
    // The track table's bars: its tone, height and slow breath, and no spinner.
    expect(rows[0]!.querySelectorAll(".track-table__skeleton")).toHaveLength(3);
    expect(container.querySelector(".cp-loading")).toBeNull();
  });
});
