import { describe, expect, it, vi } from "vitest";
import { EVENTS, shouldLoadAnalytics, trackEvent } from "./analytics";

describe("trackEvent", () => {
  it("passes the name and data to umami.track", () => {
    const track = vi.fn();
    trackEvent("download", { system: "macos", chip: "arm64" }, { umami: { track } });
    expect(track).toHaveBeenCalledExactlyOnceWith("download", { system: "macos", chip: "arm64" });
  });
  it("does nothing when Umami is not loaded (a preview build, a blocker)", () => {
    expect(() => trackEvent("download", {}, {})).not.toThrow();
  });
  it("never lets a failing tracker break the page", () => {
    expect(() =>
      trackEvent("download", {}, {
        umami: {
          track: () => {
            throw new Error("x");
          },
        },
      }),
    ).not.toThrow();
  });
  it("sends only the keys an event is allowed to carry, so nothing personal slips in", () => {
    const track = vi.fn();
    trackEvent("form-sent", { form: "contact", email: "a@b.co" }, { umami: { track } });
    expect(track).toHaveBeenCalledWith("form-sent", { form: "contact" });
  });
});

describe("EVENTS", () => {
  it("names the events the privacy policy lists, and no others", () => {
    expect(Object.values(EVENTS).sort()).toEqual(["download", "form-sent", "theme-change"]);
  });
});

describe("shouldLoadAnalytics", () => {
  it("loads only for a public build with no cookie outside the allow list, or with the visitor's yes", () => {
    expect(shouldLoadAnalytics({ isPublic: true, consentNeeded: false, choice: null })).toBe(true);
    expect(shouldLoadAnalytics({ isPublic: false, consentNeeded: false, choice: null })).toBe(false);
    expect(shouldLoadAnalytics({ isPublic: true, consentNeeded: true, choice: null })).toBe(false);
    expect(shouldLoadAnalytics({ isPublic: true, consentNeeded: true, choice: "no" })).toBe(false);
    expect(shouldLoadAnalytics({ isPublic: true, consentNeeded: true, choice: "yes" })).toBe(true);
    expect(shouldLoadAnalytics({ isPublic: false, consentNeeded: true, choice: "yes" })).toBe(false);
  });
});
