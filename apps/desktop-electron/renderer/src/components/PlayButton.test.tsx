import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlayButton } from "./PlayButton";

describe("PlayButton (C200)", () => {
  it("takes its hover tip from its aria-label", () => {
    render(<PlayButton aria-label="Play Strobe" />);
    expect(screen.getByRole("button", { name: "Play Strobe" })).toHaveAttribute("title", "Play Strobe");
  });

  it("shows pause while playing and runs its click", async () => {
    const onClick = vi.fn();
    const { container } = render(<PlayButton aria-label="Pause Strobe" playing onClick={onClick} />);
    expect(container.querySelector('svg[data-icon="pause"]')).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Pause Strobe" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
