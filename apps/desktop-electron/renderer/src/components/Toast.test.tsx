import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import toastCss from "./Toast.css?raw";
import { ToastProvider, useToast } from "./Toast";

let push: ReturnType<typeof useToast>["push"];
function Grab() {
  push = useToast().push;
  return null;
}

describe("a toast with an action", () => {
  it("shows the action, runs it once, and goes", async () => {
    const undo = vi.fn();
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => push("Appearance reset to defaults.", "info", { label: "Undo", onClick: undo }));
    expect(screen.getByText("Appearance reset to defaults.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Appearance reset to defaults.")).toBeNull();
  });

  it("has no button when it has no action", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => push("Saved.", "success"));
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Close message"]);
  });
});

describe("leaving", () => {
  it("clears its toasts' timers when it goes, so none fires on a page that is gone", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <ToastProvider>
          <Grab />
        </ToastProvider>,
      );
      act(() => push("Saved."));
      act(() => push("Undo this?", "info", { label: "Undo", onClick: () => {} }));
      expect(vi.getTimerCount()).toBe(2);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

function mount() {
  return render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  );
}

describe("how long a toast stays", () => {
  function withTimers(run: () => void) {
    vi.useFakeTimers();
    try {
      run();
    } finally {
      vi.useRealTimers();
    }
  }

  it("keeps an error until it is closed", () => {
    withTimers(() => {
      mount();
      act(() => push("Could not save.", "error"));
      act(() => void vi.advanceTimersByTime(30000));
      expect(screen.getByText("Could not save.")).toBeInTheDocument();
    });
  });

  it("keeps a warning until it is closed", () => {
    withTimers(() => {
      mount();
      act(() => push("Check this.", "warning"));
      act(() => void vi.advanceTimersByTime(30000));
      expect(screen.getByText("Check this.")).toBeInTheDocument();
    });
  });

  it("lets an info toast go after 4 s, and one with an action after 10 s", () => {
    withTimers(() => {
      mount();
      act(() => push("Saved.", "info"));
      act(() => push("Reset.", "info", { label: "Undo", onClick: () => {} }));
      act(() => void vi.advanceTimersByTime(4100));
      expect(screen.queryByText("Saved.")).toBeNull();
      expect(screen.getByText("Reset.")).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(6000));
      expect(screen.queryByText("Reset.")).toBeNull();
    });
  });
});

describe("closing", () => {
  it.each(["info", "success", "warning", "error"] as const)("closes a %s toast with the close button", async (variant) => {
    mount();
    act(() => push("A message.", variant));
    await userEvent.click(screen.getByRole("button", { name: "Close message" }));
    expect(screen.queryByText("A message.")).toBeNull();
  });
});

describe("hovering", () => {
  it("pauses the timer and resumes with the time that was left", () => {
    vi.useFakeTimers();
    try {
      mount();
      act(() => push("Saved.", "info"));
      act(() => void vi.advanceTimersByTime(3000));
      const toast = screen.getByRole("status");
      fireEvent.pointerEnter(toast);
      act(() => void vi.advanceTimersByTime(10000));
      expect(screen.getByText("Saved.")).toBeInTheDocument();
      fireEvent.pointerLeave(toast);
      act(() => void vi.advanceTimersByTime(1100));
      expect(screen.queryByText("Saved.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses while focus is inside it", () => {
    vi.useFakeTimers();
    try {
      mount();
      act(() => push("Saved.", "info"));
      const close = screen.getByRole("button", { name: "Close message" });
      act(() => close.focus());
      act(() => void vi.advanceTimersByTime(10000));
      expect(screen.getByText("Saved.")).toBeInTheDocument();
      act(() => close.blur());
      act(() => void vi.advanceTimersByTime(4100));
      expect(screen.queryByText("Saved.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a keyed push", () => {
  it("replaces the toast with that key in place", () => {
    mount();
    act(() => push("Copying 1", "info", undefined, { key: "copy" }));
    act(() => push("Copying 2", "error", undefined, { key: "copy" }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Copying 2")).toBeInTheDocument();
    expect(screen.queryByText("Copying 1")).toBeNull();
  });

  it("restarts the timer by the new variant", () => {
    vi.useFakeTimers();
    try {
      mount();
      act(() => push("Working", "info", undefined, { key: "job" }));
      act(() => void vi.advanceTimersByTime(3000));
      act(() => push("Failed", "error", undefined, { key: "job" }));
      act(() => void vi.advanceTimersByTime(30000));
      expect(screen.getByText("Failed")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stacks pushes without a key that say different things", () => {
    mount();
    act(() => push("One"));
    act(() => push("Two"));
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });
});

describe("repeats and a full stack", () => {
  it("shows the same words once, however often they are pushed", () => {
    mount();
    for (let i = 0; i < 30; i += 1) act(() => push("Tracks are rearranged one at a time.", "warning"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("keeps toasts with an action apart, so each Undo stays its own", () => {
    mount();
    const undo = { label: "Undo", onClick: () => {} };
    act(() => push("Tag removed.", "info", undo));
    act(() => push("Tag removed.", "info", undo));
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("keeps at most five on screen: the oldest makes way", () => {
    mount();
    for (let i = 1; i <= 7; i += 1) act(() => push(`Problem ${i}`, "error"));
    expect(screen.getAllByRole("alert")).toHaveLength(5);
    expect(screen.queryByText("Problem 1")).toBeNull();
    expect(screen.queryByText("Problem 2")).toBeNull();
    expect(screen.getByText("Problem 7")).toBeInTheDocument();
  });
});

describe("toast look (C122)", () => {
  it("announces an error at once and the others politely", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => push("Could not save.", "error"));
    act(() => push("Saved.", "success"));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save.");
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });

  it("closes with the small close button, named for what it closes, and its hover tip", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => push("Saved."));
    const close = screen.getByRole("button", { name: "Close message" });
    expect(close).toHaveClass("cp-btn--sm");
    expect(close).toHaveAttribute("title", "Close message");
  });
});

describe("toast styles (C122)", () => {
  it("sits on the panel colour with even padding, 8 apart, above the player and the table scrollbar", () => {
    expect(toastCss).toMatch(/\.cp-toast\s*\{[^}]*background:\s*var\(--bg-panel\);/);
    expect(toastCss).toMatch(/\.cp-toast\s*\{[^}]*padding:\s*var\(--space-md\);/);
    expect(toastCss).toMatch(/\.cp-toast-stack\s*\{[^}]*gap:\s*var\(--space-sm\);/);
    expect(toastCss).toMatch(/--shell-bottom-inset/);
  });
});
