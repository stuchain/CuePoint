import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetKeyNotationForTests, saveKeyNotation } from "./keyNotationSetting";
import { WheelButton } from "./WheelButton";

describe("WheelButton", () => {
  it("is named Camelot wheel when the track has no key, and shows a muted dash", () => {
    render(<WheelButton />);
    const button = screen.getByRole("button", { name: "Camelot wheel" });
    expect(button).toHaveTextContent("—");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveClass("key-chip", "key-chip--button");
  });

  it("is the coloured key chip itself, with no ring and no word Wheel", () => {
    render(<WheelButton keyName="10B" />);
    const button = screen.getByRole("button", { name: "Show 10B on the Camelot wheel" });
    expect(button).toHaveClass("key-chip", "key-chip--10B", "key-chip--button");
    expect(button).toHaveTextContent("10B");
    expect(button).not.toHaveTextContent("Wheel");
    expect(button.querySelector("svg")).toBeNull();
  });

  it("writes the classic spelling as its Camelot code, in the name too", () => {
    render(<WheelButton source="player" keyName="Am" />);
    const button = screen.getByRole("button", { name: "Show 8A on the Camelot wheel" });
    expect(button).toHaveTextContent("8A");
    expect(button).toHaveClass("key-chip--8A");
  });

  it("reports whether the wheel is open", async () => {
    render(<WheelButton />);
    const button = screen.getByRole("button", { name: "Camelot wheel" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("says in its hint what a press does", () => {
    render(<WheelButton keyName="10B" />);
    expect(screen.getByRole("button", { name: "Show 10B on the Camelot wheel" })).toHaveAttribute(
      "title",
      "Show 10B on the Camelot wheel",
    );
  });
});

describe("WheelButton with Keys written as (K1 to K3)", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.keyNotation;
    resetKeyNotationForTests();
  });

  it("writes the key in the chosen notation and keeps its name and colour", () => {
    saveKeyNotation("musical");
    const { unmount } = render(<WheelButton keyName="8A" />);
    const button = screen.getByRole("button", { name: "Show 8A on the Camelot wheel" });
    expect(button).toHaveTextContent("Am");
    expect(button).toHaveClass("key-chip--8A");
    unmount();
    saveKeyNotation("both");
    render(<WheelButton keyName="8A" />);
    expect(screen.getByRole("button", { name: "Show 8A on the Camelot wheel" })).toHaveTextContent("8A · Am");
  });
});
