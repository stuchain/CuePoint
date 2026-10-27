/** The words and counts of a dig's cards (no React). */
import { describe, expect, it } from "vitest";

import type { DiscoverGroupCard } from "../../api/cuepointBridge.types";
import {
  cardCounts,
  cardId,
  cardName,
  rowCount,
  rowTitle,
  tickedCards,
  tickedLine,
  tickedNames,
  wantlistLine,
} from "./groupCards";

const base: DiscoverGroupCard = {
  kind: "chart",
  key: "1",
  name: "Summer Selection",
  curator: "Argy",
  tracks: 10,
  owned: 0,
  charts: 0,
  new: 0,
  has_art: false,
};
const artist: DiscoverGroupCard = { ...base, kind: "artist", key: "argy", name: "Argy", charts: 3, new: 4 };
const label: DiscoverGroupCard = { ...base, kind: "label", key: "afterlife", name: "Afterlife", new: 6, tracks: 6 };

describe("what a card says it holds", () => {
  it("counts a chart's tracks, an artist's charts and new releases, a label's new releases", () => {
    expect(cardCounts(base)).toBe("10 tracks");
    expect(cardCounts({ ...base, tracks: 1 })).toBe("1 track");
    expect(cardCounts(artist)).toBe("3 charts · 4 new");
    expect(cardCounts({ ...artist, charts: 1 })).toBe("1 chart · 4 new");
    expect(cardCounts(label)).toBe("6 new");
  });

  it("names a card's button by its kind, its name and its counts", () => {
    expect(cardName(base)).toBe("Chart Summer Selection, 10 tracks");
    expect(cardName(artist)).toBe("Artist Argy, 3 charts · 4 new");
    expect(cardName(label)).toBe("Label Afterlife, 6 new");
  });

  it("tells a chart's id from an artist's key of the same text", () => {
    expect(cardId({ kind: "chart", key: "7" })).not.toBe(cardId({ kind: "artist", key: "7" }));
  });

  it("counts a row by its cards, the same in every row (M177)", () => {
    expect(rowCount([base, base])).toBe(2);
    expect(rowCount([artist, { ...artist, new: 1 }])).toBe(2);
    expect(rowCount([label])).toBe(1);
  });
});

describe("where releases were not looked up (every library artist)", () => {
  it("titles the artists row 'Your artists' and counts charts only", () => {
    expect(rowTitle("artists", "library")).toBe("Your artists");
    expect(rowTitle("artists", "artists")).toBe("Your artists' new releases");
    expect(cardCounts(artist, "library")).toBe("3 charts");
    expect(cardName(artist, "library")).toBe("Artist Argy, 3 charts");
    expect(rowCount([artist, artist])).toBe(2);
  });
});

describe("the ticked bar", () => {
  const rows = [{ cards: [base, artist] }, { cards: [label] }];

  it("lists the ticked cards in the order the rows show them", () => {
    const ticked = new Set([cardId(label), cardId(base)]);
    expect(tickedCards(rows, ticked).map((c) => c.name)).toEqual(["Summer Selection", "Afterlife"]);
  });

  it("names the first two and counts the rest", () => {
    expect(tickedNames([artist])).toBe("Argy");
    expect(tickedNames([artist, label])).toBe("Argy, Afterlife");
    expect(tickedNames([artist, label, base, base])).toBe("Argy, Afterlife and 2 more");
  });

  it("says the distinct tracks and the owned ones, and only the owned when there are some", () => {
    expect(tickedLine([artist, label], { tracks: 20, owned: 3 })).toBe(
      "Ticked: Argy, Afterlife · 20 tracks · 3 already in your library",
    );
    expect(tickedLine([artist], { tracks: 1, owned: 0 })).toBe("Ticked: Argy · 1 track");
    expect(tickedLine([artist], null)).toBe("Ticked: Argy");
  });

  it("says the owned tracks a wantlist add left out", () => {
    expect(wantlistLine("Added 3 tracks.", 0)).toBe("Added 3 tracks.");
    expect(wantlistLine("Added 3 tracks.", 1)).toBe("Added 3 tracks. 1 track already in your library was left out.");
    expect(wantlistLine("Added 3 tracks.", 4)).toBe("Added 3 tracks. 4 tracks already in your library were left out.");
  });
});
