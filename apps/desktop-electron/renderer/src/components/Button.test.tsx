/**
 * Component-level tests for Button.
 *
 * This is the first rendering test in the renderer: until now the suite covered
 * only pure utility modules, so no component's behaviour was verified anywhere
 * — `.test.tsx` files were not even collected. It doubles as the template for
 * testing the components the Library and Player phases will add.
 *
 * These assert behaviour a user would notice (a disabled button not firing its
 * handler, a loading button hiding its label) rather than markup details, so
 * they survive restyling.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "./Button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Import Library</Button>);
    expect(
      screen.getByRole("button", { name: "Import Library" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Run
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("is disabled while loading, so a job cannot be started twice", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Match
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("hides the label while loading", () => {
    render(<Button loading>Match</Button>);
    expect(screen.queryByText("Match")).not.toBeInTheDocument();
  });

  it("defaults to type=button so it cannot submit a form", () => {
    render(<Button>Safe</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("applies the variant class", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("cp-btn--danger");
  });

  it("renders an icon alongside the label", () => {
    render(<Button icon={<span data-testid="icon">*</span>}>Play</Button>);

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play/ })).toBeInTheDocument();
  });

  it("keeps caller-supplied class names", () => {
    render(<Button className="extra">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("extra");
  });
});
