/**
 * Where an Artist page, a Label page and Similar tracks live (DISCOVER-11).
 *
 * They are routes under the `discover` destination, not destinations of their
 * own (DEC-094): `/discover/artist/:ref`, `/discover/label/:ref` and
 * `/discover/similar/:trackId`. The sidebar keeps Discover highlighted on all
 * three, and the app remembers Discover, not the page, as where to reopen.
 *
 * A reference is written as the engine writes it, `bp:<id>` or `name:<key>`
 * (DISCOVER-07). A name is sent as it is spelled: the engine folds it to its
 * key and answers the page's own reference, which replaces the route, so a
 * page has one address however it was reached.
 */
import type { EntityKind, FilterRule } from "../../api/cuepointBridge.types";

/** The route patterns, for `App.tsx`. */
export const ARTIST_PAGE_ROUTE = "/discover/artist/:ref";
export const LABEL_PAGE_ROUTE = "/discover/label/:ref";
export const SIMILAR_ROUTE = "/discover/similar/:trackId";

/** An Artist or Label page's address. */
export function entityPath(kind: EntityKind, ref: string): string {
  return `/discover/${kind}/${encodeURIComponent(ref)}`;
}

/** The Similar tracks view for a seed track. */
export function similarPath(trackId: number): string {
  return `/discover/similar/${trackId}`;
}

/** A reference by name, as spelled; the engine folds it to a key. */
export function nameRef(name: string): string {
  return `name:${name.trim()}`;
}

/** A reference by Beatport id. */
export function beatportRef(id: number): string {
  return `bp:${id}`;
}

/** A seed track id from a route, or null when the route names none. */
export function trackIdFromRoute(param: string | undefined): number | null {
  if (!param || !/^[1-9]\d*$/.test(param)) return null;
  const id = Number(param);
  return Number.isSafeInteger(id) ? id : null;
}

/** An artist or label a page can open on. */
export interface PageRef {
  kind: EntityKind;
  ref: string;
}

function positiveId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value.trim()) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The page a filter clause is about, when it names exactly one artist or label.
 *
 * "Credited artist is Mara Veil" is her page, by name; "Beatport label is
 * 40211" is that label's, by id. Any other operator is a question about many
 * (or none), and names no one page.
 */
export function pageOfRule(rule: FilterRule): PageRef | null {
  if (rule.operator !== "is") return null;
  const text = typeof rule.value === "string" ? rule.value.trim() : "";
  switch (rule.field) {
    case "artist_name":
      return text ? { kind: "artist", ref: nameRef(text) } : null;
    case "label_name":
      return text ? { kind: "label", ref: nameRef(text) } : null;
    case "beatport_artist": {
      const id = positiveId(rule.value);
      return id === null ? null : { kind: "artist", ref: beatportRef(id) };
    }
    case "beatport_label": {
      const id = positiveId(rule.value);
      return id === null ? null : { kind: "label", ref: beatportRef(id) };
    }
    default:
      return null;
  }
}
