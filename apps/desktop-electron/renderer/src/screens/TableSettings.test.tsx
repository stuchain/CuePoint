import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { resetKeyColoursForTests } from "../components/wheel/keyColourSetting";
import { ROW_DENSITY_STORAGE_KEY, resetRowDensityForTests } from "../tokens/rowDensity";
import { TableSettings } from "./TableSettings";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.rowDensity;
  delete document.documentElement.dataset.keyColours;
  resetRowDensityForTests();
  resetKeyColoursForTests();
});

afterEach(() => localStorage.clear());

const density = () => screen.getByRole("combobox", { name: "Row density" });
const keys = () => screen.getByRole("checkbox", { name: "Color keys" });

describe("Tables settings", () => {
  it("is a group headed Tables, Compact and coloured by default", () => {
    render(<TableSettings />);
    expect(screen.getByRole("group", { name: "Tables" })).toBeInTheDocument();
    expect(density()).toHaveValue("compact");
    expect(keys()).toBeChecked();
  });

  it("names the group with the one sub-heading look, not a field label's (C58)", () => {
    const { container } = render(<TableSettings />);
    expect(container.querySelector("legend > .cp-text-subhead")).toHaveTextContent("Tables");
  });

  it("offers Compact and Roomy", () => {
    render(<TableSettings />);
    const options = Array.from((density() as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(["Compact (26 px)", "Roomy (32 px)"]);
  });

  it("applies and remembers Roomy, and says it was saved", async () => {
    const onChange = vi.fn();
    render(<TableSettings onChange={onChange} />);
    await userEvent.selectOptions(density(), "roomy");
    expect(document.documentElement.dataset.rowDensity).toBe("roomy");
    expect(localStorage.getItem(ROW_DENSITY_STORAGE_KEY)).toBe("roomy");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("turns key colours off and on, and says it was saved", async () => {
    const onChange = vi.fn();
    render(<TableSettings onChange={onChange} />);
    await userEvent.click(keys());
    expect(keys()).not.toBeChecked();
    expect(document.documentElement.dataset.keyColours).toBe("off");
    await userEvent.click(keys());
    expect(keys()).toBeChecked();
    expect(document.documentElement.dataset.keyColours).toBeUndefined();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
