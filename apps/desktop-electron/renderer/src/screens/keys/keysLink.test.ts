import { describe, expect, it } from "vitest";

import { keysOpening, keysState } from "./keysLink";

describe("opening the Keys page on sources (PAGES-16)", () => {
  it("carries the sources in the router's state", () => {
    const state = keysState([
      { kind: "playlist", id: 4 },
      { kind: "set", id: 9 },
    ]);
    expect(keysOpening({ state, key: "nav-1" })).toEqual({
      sources: [
        { kind: "playlist", id: 4 },
        { kind: "set", id: 9 },
      ],
      token: "nav-1",
    });
  });

  it("opens on the whole library when it carries none", () => {
    expect(keysOpening({ state: keysState([]), key: "nav-2" })).toEqual({
      sources: [],
      token: "nav-2",
    });
  });

  it("is absent from a location that did not ask", () => {
    expect(keysOpening({ state: null, key: "a" })).toBeNull();
    expect(keysOpening({ state: { other: 1 }, key: "a" })).toBeNull();
  });

  it("drops what is not a source, since any code can push a location", () => {
    const state = {
      cuepointKeysSources: [
        { kind: "playlist", id: 1 },
        { kind: "album", id: 2 },
        { kind: "set", id: -3 },
        { kind: "collection", id: "7" },
        "nope",
        null,
      ],
    };
    expect(keysOpening({ state, key: "k" })?.sources).toEqual([{ kind: "playlist", id: 1 }]);
  });
});
