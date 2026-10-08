/**
 * The error-reporting switch in Settings (REPORT-01, DEC-128).
 *
 * Over a fake bridge: it shows the stored state, toggling calls the bridge
 * once, a refusal puts the switch back, and without a bridge it is disabled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ErrorReportingSettingsPanel } from "./ErrorReportingSettingsPanel";

let get: ReturnType<typeof vi.fn>;
let set: ReturnType<typeof vi.fn>;

function install(stored: boolean) {
  get = vi.fn().mockResolvedValue({ enabled: stored });
  set = vi.fn(async (enabled: boolean) => ({ enabled }));
  (window as unknown as { cuepoint?: unknown }).cuepoint = { errorReporting: { get, set } };
}

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the error-reporting switch", () => {
  beforeEach(() => install(true));

  it("shows a stored on", async () => {
    render(<ErrorReportingSettingsPanel />);
    const toggle = screen.getByRole("switch", { name: "Send error reports" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toBeChecked();
  });

  it("shows a stored off", async () => {
    install(false);
    render(<ErrorReportingSettingsPanel />);
    const toggle = screen.getByRole("switch", { name: "Send error reports" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
  });

  it("says what a report carries, and what it never does", () => {
    render(<ErrorReportingSettingsPanel />);
    expect(screen.getByText(/the steps that led to it/)).toBeInTheDocument();
    expect(screen.getByText(/built not to carry your file, folder, track/)).toBeInTheDocument();
  });

  it("calls the bridge once with the opposite value, and shows the answer", async () => {
    render(<ErrorReportingSettingsPanel />);
    const toggle = screen.getByRole("switch", { name: "Send error reports" });
    await waitFor(() => expect(toggle).toBeEnabled());

    await userEvent.click(toggle);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(false);
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it("shows Saved once the bridge has accepted the change", async () => {
    render(<ErrorReportingSettingsPanel />);
    const toggle = screen.getByRole("switch", { name: "Send error reports" });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    await waitFor(() => expect(document.body).toHaveTextContent("✓ Saved"));
  });

  it("holds the rest of the Privacy section after its own controls", async () => {
    render(
      <ErrorReportingSettingsPanel>
        <p>When CuePoint quits</p>
      </ErrorReportingSettingsPanel>,
    );
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Send error reports")).toBeLessThan(text.indexOf("When CuePoint quits"));
  });

  it("puts the switch back and says why when the change is refused", async () => {
    set.mockRejectedValue(new Error("The settings file could not be written."));
    render(<ErrorReportingSettingsPanel />);
    const toggle = screen.getByRole("switch", { name: "Send error reports" });
    await waitFor(() => expect(toggle).toBeEnabled());

    await userEvent.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The settings file could not be written.",
    );
    expect(toggle).toBeChecked();
  });

  it("opens Help → Privacy from its link", async () => {
    const onOpenPrivacy = vi.fn();
    render(<ErrorReportingSettingsPanel onOpenPrivacy={onOpenPrivacy} />);
    await userEvent.click(screen.getByRole("button", { name: "Privacy details" }));
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
  });
});

describe("when a link asks for the switch", () => {
  it("focuses it once its state is read, and only once", async () => {
    let answer: (state: { enabled: boolean }) => void = () => {};
    install(true);
    get.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { rerender } = render(<ErrorReportingSettingsPanel focusToken="a" />);
    const toggle = screen.getByRole("switch", { name: "Send error reports" });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toHaveFocus();

    answer({ enabled: true });
    await waitFor(() => expect(toggle).toHaveFocus());

    toggle.blur();
    rerender(<ErrorReportingSettingsPanel focusToken="a" />);
    expect(toggle).not.toHaveFocus();
    rerender(<ErrorReportingSettingsPanel focusToken="b" />);
    await waitFor(() => expect(toggle).toHaveFocus());
  });
});

describe("without the desktop bridge", () => {
  it("is disabled, and says how to change it", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    render(<ErrorReportingSettingsPanel />);
    expect(screen.getByRole("switch", { name: "Send error reports" })).toBeDisabled();
    expect(screen.getByText("Open CuePoint as a desktop app to change this.")).toBeInTheDocument();
  });
});
