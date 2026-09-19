/**
 * Home after inKey retired (CLEAN-14, DEC-071): matching starts from Clean.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { ToolSelectionScreen } from "./ToolSelectionScreen";

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ToolSelectionScreen />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ToolSelectionScreen", () => {
  it("offers Clean as the way to match, and no inKey", () => {
    renderHome();

    expect(screen.getByRole("button", { name: /Clean/ })).toBeInTheDocument();
    expect(screen.queryByText(/inKey/)).toBeNull();
    expect(screen.queryByText(/Results/)).toBeNull();
  });

  it("opens Clean from its main action", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: /Clean/ }));

    expect(screen.getByTestId("where")).toHaveTextContent("/clean");
  });

  it("still opens inCrate", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Open inCrate" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/incrate");
  });

  it("says when the engine is not connected", () => {
    renderHome();
    expect(screen.getByText("Browser lab mode")).toBeInTheDocument();
  });
});
