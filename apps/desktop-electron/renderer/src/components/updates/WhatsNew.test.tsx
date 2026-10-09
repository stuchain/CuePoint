/**
 * "What's new" after an update (DIST-07, DEC-172).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { installUpdates, updateState } from "../../test/updatesBridge";
import { WhatsNew } from "./WhatsNew";

const NOTES = { version: "1.0.0-test.2", notes: "- A new thing", releaseUrl: null };

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("WhatsNew after an update", () => {
  it("shows the notes of the new version when main has some", async () => {
    installUpdates(updateState(), { whatsNew: NOTES });
    render(<WhatsNew />);
    const dialog = await screen.findByRole("dialog", { name: "What's new in CuePoint 1.0.0-test.2" });
    expect(dialog).toHaveTextContent("A new thing");
  });

  it("shows nothing when main has nothing (a first install, or already seen)", async () => {
    const fake = installUpdates(updateState(), { whatsNew: null });
    render(<WhatsNew />);
    await waitFor(() => expect(fake.bridge.getWhatsNew).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows nothing without the bridge", async () => {
    render(<WhatsNew />);
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses on Got it and closes", async () => {
    const fake = installUpdates(updateState(), { whatsNew: NOTES });
    render(<WhatsNew />);
    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(fake.bridge.dismissWhatsNew).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not come back on the next start, when main has nothing more", async () => {
    const fake = installUpdates(updateState(), { whatsNew: NOTES });
    const first = render(<WhatsNew />);
    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));
    first.unmount();
    // The next start: main has marked it seen and answers null.
    vi.mocked(fake.bridge.getWhatsNew).mockResolvedValue(null);
    render(<WhatsNew />);
    await waitFor(() => expect(fake.bridge.getWhatsNew).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides when another note opens over it, so two dialogs never show together", async () => {
    installUpdates(updateState(), { whatsNew: NOTES });
    const { rerender } = render(<WhatsNew hold={false} />);
    await screen.findByRole("dialog");
    rerender(<WhatsNew hold />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    rerender(<WhatsNew hold={false} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("says there are no notes when the release had none", async () => {
    installUpdates(updateState(), { whatsNew: { ...NOTES, notes: null } });
    render(<WhatsNew />);
    expect(await screen.findByText("No notes for this version.")).toBeInTheDocument();
  });

  it("waits while the earlier note is open, then shows", async () => {
    const fake = installUpdates(updateState(), { whatsNew: NOTES });
    const { rerender } = render(<WhatsNew hold />);
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fake.bridge.getWhatsNew).not.toHaveBeenCalled();
    rerender(<WhatsNew hold={false} />);
    expect(await screen.findByRole("dialog", { name: /What's new in CuePoint/ })).toBeInTheDocument();
  });
});

describe("WhatsNew on demand", () => {
  it("shows the notes it is given and never dismisses", async () => {
    const fake = installUpdates(updateState());
    let closed = 0;
    render(<WhatsNew notes={NOTES} onClose={() => (closed += 1)} />);
    expect(await screen.findByRole("dialog", { name: "What's new in CuePoint 1.0.0-test.2" })).toBeInTheDocument();
    expect(fake.bridge.getWhatsNew).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(closed).toBe(1);
    expect(fake.bridge.dismissWhatsNew).not.toHaveBeenCalled();
  });
});
