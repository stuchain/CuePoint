/**
 * Discover's entries in a track's operations list (DISCOVER-11).
 *
 * One track in hand, three ways out of it: its **Similar tracks**, its
 * **Artist page** and its **Label page**. They join the one list the context
 * menu and the Actions button both draw (ORG-11), so the two surfaces offer
 * them together or not at all.
 *
 * A credit can name several artists — "Mara Veil, DJEFF feat. Kiko" — so
 * **Artist page** is a submenu of them when there is more than one, remixers
 * after the artists. Who they are is the engine's answer (`credits`, from
 * `split_credit`), never a split of the text here. Before that answer is in
 * hand, or when a track has no artist or no label, the entry is shown and
 * disabled rather than missing, so the menu keeps its shape.
 *
 * The list is pure, as `trackMenu.ts` is: what it offers for which track is a
 * thing to test without opening a menu. `creditsFor` is the one read, and the
 * menu waits for it only when it opens on one track.
 */
import type {
  EntityKind,
  LibraryTrackDetail,
  TrackCreditLink,
  TrackCreditLinks,
} from "../../api/cuepointBridge.types";
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";

interface DiscoverMenuContext {
  /** How many tracks the entries would act on; they are offered for one. */
  count: number;
  /** The one track's credits, or null while unknown. */
  credits: TrackCreditLinks | null;
}

interface DiscoverMenuHandlers {
  onSimilar: () => void;
  onOpenPage: (kind: EntityKind, ref: string) => void;
}

/** Artists, then remixers, each person once however many roles they have. */
export function pageArtists(credits: TrackCreditLinks): TrackCreditLink[] {
  const seen = new Set<string>();
  const people: TrackCreditLink[] = [];
  for (const link of [...credits.artists, ...credits.remixers]) {
    if (seen.has(link.ref)) continue;
    seen.add(link.ref);
    people.push(link);
  }
  return people;
}

function artistEntry(
  credits: TrackCreditLinks | null,
  onOpenPage: DiscoverMenuHandlers["onOpenPage"],
): TrackContextMenuItem {
  const people = credits ? pageArtists(credits) : [];
  if (people.length === 0) {
    return { id: "artist-page", label: "Artist page", disabled: true, onSelect: () => undefined };
  }
  if (people.length === 1) {
    const [only] = people;
    return {
      id: "artist-page",
      label: "Artist page",
      onSelect: () => onOpenPage("artist", only.ref),
    };
  }
  return {
    id: "artist-page",
    label: "Artist page",
    // A parent never acts; the list is what runs, as Rate's does.
    onSelect: () => undefined,
    items: people.map((person, index) => ({
      id: `artist-page-${index}`,
      label: person.role === "remixer" ? `${person.name} (remixer)` : person.name,
      onSelect: () => onOpenPage("artist", person.ref),
    })),
  };
}

export function discoverMenuItems(
  context: DiscoverMenuContext,
  handlers: DiscoverMenuHandlers,
): TrackContextMenuItem[] {
  if (context.count !== 1) return [];
  const label = context.credits?.label ?? null;
  return [
    {
      id: "similar-tracks",
      label: "Similar tracks",
      separatorBefore: true,
      onSelect: handlers.onSimilar,
    },
    artistEntry(context.credits, handlers.onOpenPage),
    label
      ? {
          id: "label-page",
          label: "Label page",
          onSelect: () => handlers.onOpenPage("label", label.ref),
        }
      : { id: "label-page", label: "Label page", disabled: true, onSelect: () => undefined },
  ];
}

/**
 * A track's credits, from the detail the Inspector already holds when it is
 * that track's, and read otherwise. Null when they cannot be read: the
 * entries then stay disabled rather than guess.
 */
export async function creditsFor(
  trackId: number,
  held: Pick<LibraryTrackDetail, "track" | "credits"> | null,
): Promise<TrackCreditLinks | null> {
  if (held && held.track.id === trackId) return held.credits ?? null;
  const read = window.cuepoint?.getLibraryTrack;
  if (!read) return null;
  try {
    return (await read({ trackId })).credits ?? null;
  } catch {
    return null;
  }
}
