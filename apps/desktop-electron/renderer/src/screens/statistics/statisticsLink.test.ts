/** Statistics' focus links: the state a link carries, the search it can use instead, and both read back. */
import { describe, expect, it } from "vitest";

import { statisticsFocus, statisticsFocusFromSearch, statisticsFocusState } from "./statisticsLink";

describe("statisticsFocusState", () => {
  it("names the section and carries a token", () => {
    const state = statisticsFocusState("health");
    expect(state.statisticsFocus).toBe("health");
    expect(state.token).not.toBe("");
  });

  it("gives every navigation its own token", () => {
    expect(statisticsFocusState("health").token).not.toBe(statisticsFocusState("health").token);
  });
});

describe("statisticsFocus", () => {
  it("reads back what the state carried", () => {
    const state = statisticsFocusState("health");
    expect(statisticsFocus({ state })).toEqual({ focus: "health", token: state.token });
  });

  it("is null for an ordinary visit", () => {
    expect(statisticsFocus({ state: null })).toBeNull();
    expect(statisticsFocus({ state: undefined, search: "" })).toBeNull();
  });

  it("ignores a state that is not a section", () => {
    expect(statisticsFocus({ state: { statisticsFocus: "plays", token: "x" } })).toBeNull();
    expect(statisticsFocus({ state: "health" })).toBeNull();
  });

  it("takes ?section=health when there is no state, using the location's key as the token", () => {
    expect(statisticsFocus({ state: null, search: "?section=health", key: "k1" })).toEqual({
      focus: "health",
      token: "search-k1",
    });
  });

  it("prefers the state to the search", () => {
    const state = statisticsFocusState("health");
    expect(statisticsFocus({ state, search: "?section=health", key: "k1" })?.token).toBe(state.token);
  });
});

describe("statisticsFocusFromSearch", () => {
  it("accepts health, with or without other parameters", () => {
    expect(statisticsFocusFromSearch("?section=health")).toBe("health");
    expect(statisticsFocusFromSearch("?scope=library&section=health")).toBe("health");
  });

  it("refuses any other section or none", () => {
    expect(statisticsFocusFromSearch("?section=plays")).toBeNull();
    expect(statisticsFocusFromSearch("")).toBeNull();
  });
});
