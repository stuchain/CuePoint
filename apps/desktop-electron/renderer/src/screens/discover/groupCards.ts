/**
 * A dig's results as rows of cards: the words and the arithmetic (no React).
 *
 * The engine decides which cards a dig has and which row each is in; this only
 * says them. Row one is the charts the chosen artists made, or "Genre charts"
 * when no artist was chosen: the engine names which (`genre_charts`), so the
 * renderer never works the rule out for itself.
 */
import type {
  DiscoverChartsMode,
  DiscoverGroupCard,
  DiscoverGroupRef,
  DiscoverGroupRowId,
} from "../../api/cuepointBridge.types";
import { countNoun, formatCount } from "../../format/counts";

export const ROW_TITLES: Record<DiscoverGroupRowId, string> = {
  charts: "Your artists' charts",
  genre_charts: "Genre charts",
  artists: "Your artists' new releases",
  labels: "Your labels",
};

/**
 * A row's title. With every library artist asked for (`library`) the artists
 * row holds the artists whose charts were read and no new releases (a dig does
 * not look up thousands of artists), so it is "Your artists".
 */
export function rowTitle(id: DiscoverGroupRowId, mode: DiscoverChartsMode | null = null): string {
  if (id === "artists" && mode === "library") return "Your artists";
  return ROW_TITLES[id];
}

/** Cards a row shows before "See all". */
export const ROW_LIMIT = 6;

/** The count beside a row's title: the cards in it, the same in every row (M177). */
export function rowCount(cards: readonly DiscoverGroupCard[]): number {
  return cards.length;
}

/** "3 charts · 4 new", "6 new", "10 tracks": what a card holds, said briefly. */
export function cardCounts(
  card: DiscoverGroupCard,
  mode: DiscoverChartsMode | null = null,
): string {
  if (card.kind === "chart") return countNoun(card.tracks, "track");
  if (card.kind === "label") return `${formatCount(card.new)} new`;
  // Where no new releases were looked up, "0 new" would be a claim nobody checked.
  if (mode === "library") return countNoun(card.charts, "chart");
  return `${countNoun(card.charts, "chart")} · ${formatCount(card.new)} new`;
}

/** The accessible name of a card's button: what it is called, and what it holds. */
export function cardName(
  card: DiscoverGroupCard,
  mode: DiscoverChartsMode | null = null,
): string {
  const kind = card.kind === "chart" ? "Chart" : card.kind === "artist" ? "Artist" : "Label";
  return `${kind} ${card.name}, ${cardCounts(card, mode)}`;
}

/** A card's identity across rows: a chart's id can equal an artist's key text. */
export function cardId(card: Pick<DiscoverGroupCard, "kind" | "key">): string {
  return `${card.kind}:${card.key}`;
}

export function cardRef(card: DiscoverGroupCard): DiscoverGroupRef {
  return { kind: card.kind, key: card.key };
}

/** The ticked cards, in the order the rows show them. */
export function tickedCards(
  rows: readonly { cards: readonly DiscoverGroupCard[] }[],
  ticked: ReadonlySet<string>,
): DiscoverGroupCard[] {
  return rows.flatMap((row) => row.cards.filter((card) => ticked.has(cardId(card))));
}

/** "Argy, Afterlife and 2 more": the first names, then how many are left. */
export function tickedNames(cards: readonly DiscoverGroupCard[], shown = 2): string {
  const names = cards.slice(0, shown).map((card) => card.name);
  const rest = cards.length - names.length;
  if (rest <= 0) return names.join(", ");
  return `${names.join(", ")} and ${rest} more`;
}

/**
 * The bar over ticked cards: "Ticked: Argy, Afterlife · 20 tracks · 3 already
 * in your library". The summary is the engine's, so a track on two ticked cards
 * is counted once. Said before the summary arrives without the counts.
 */
export function tickedLine(
  cards: readonly DiscoverGroupCard[],
  summary: { tracks: number; owned: number } | null,
): string {
  const head = `Ticked: ${tickedNames(cards)}`;
  if (!summary) return head;
  const tracks = countNoun(summary.tracks, "track");
  if (summary.owned <= 0) return `${head} · ${tracks}`;
  return `${head} · ${tracks} · ${formatCount(summary.owned)} already in your library`;
}

/** What adding ticked cards to the wantlist did, with the owned ones said to be left out. */
export function wantlistLine(message: string, owned: number): string {
  if (owned <= 0) return message;
  return `${message} ${countNoun(owned, "track")} already in your library ${owned === 1 ? "was" : "were"} left out.`;
}
