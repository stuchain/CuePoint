/**
 * Everything that can be done to selected tracks, as one list (FLW-8, LIB-6).
 *
 * Six groups, Play, Organize, Explore, Beatport, Fix and More, each a list of
 * entries. The selection bar draws every group as a button that opens its
 * entries; the right-click menu draws the same groups as submenus (Play's
 * three entries on its first lines). Both read
 * `trackActionGroups`, so the two cannot drift: an entry added here is in
 * both, and a test builds both and compares them.
 *
 * It is pure on purpose, like `trackMenu.ts` whose organization entries and
 * Rate ▸ submenu it reuses: what is offered for which selection is a thing to
 * test without opening a menu.
 */
import type { EntityKind, TrackCreditLinks } from "../../api/cuepointBridge.types";
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { discoverMenuItems } from "./libraryDiscover";
import {
  beatportMenuItems,
  fixMenuItems,
  type BeatportMenuHandlers,
  type FixMenuHandlers,
} from "./libraryClean";
import { organizationMenuItems, type OrganizationMenuHandlers } from "./trackMenu";

export type TrackActionGroupId = "play" | "organize" | "explore" | "beatport" | "fix" | "more";

/** The groups and their names, in the order the bar and the menu show them. */
export const ACTION_GROUPS: readonly { id: TrackActionGroupId; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "organize", label: "Organize" },
  { id: "explore", label: "Explore" },
  { id: "beatport", label: "Beatport" },
  { id: "fix", label: "Fix" },
  { id: "more", label: "More" },
];

/** What the bar says on a disabled group when nothing is selected. */
export const SELECT_TRACKS_FIRST = "Select tracks first";

export interface TrackActionGroup {
  id: TrackActionGroupId;
  label: string;
  items: TrackContextMenuItem[];
  /** Why the group cannot be opened, or null when it can. */
  disabledReason: string | null;
}

export interface TrackActionContext {
  /** How many tracks the entries apply to. */
  count: number;
  /** The Collection the table is showing, when it holds rows (see `trackMenu.ts`). */
  collection: { id: number; name: string } | null;
  /** The first track's credits, for Explore; null while unknown. */
  credits: TrackCreditLinks | null;
  /** Whether exactly one track with a known file is acted on (Show in folder). */
  revealable: boolean;
}

export interface TrackActionHandlers {
  /** Absent where there is no player to talk to. */
  play?: { onPlay: () => void; onPlayNext: () => void; onAddToQueue: () => void };
  organization: OrganizationMenuHandlers;
  /** Absent where no artist, label or Similar page can be opened. */
  explore?: {
    onSimilar: () => void;
    onOpenPage: (kind: EntityKind, ref: string) => void;
  };
  beatport?: BeatportMenuHandlers;
  fix?: FixMenuHandlers;
  more: {
    onCopy: () => void;
    /** Null when the file's place cannot be shown (Show in folder is disabled). */
    onReveal: (() => void) | null;
  };
}

function tracks(count: number): string {
  return `${count.toLocaleString()} tracks`;
}

function playItems(
  count: number,
  handlers: NonNullable<TrackActionHandlers["play"]>,
): TrackContextMenuItem[] {
  return [
    {
      id: "play",
      // One row plays the view behind it (DEC-012); a selection *is* the
      // queue, because someone who picked five tracks meant those five.
      label: count > 1 ? `Play ${tracks(count)}` : "Play",
      onSelect: handlers.onPlay,
    },
    { id: "play-next", label: "Play next", onSelect: handlers.onPlayNext },
    { id: "add-to-queue", label: "Add to queue", onSelect: handlers.onAddToQueue },
  ];
}

function moreItems(
  context: TrackActionContext,
  handlers: TrackActionHandlers["more"],
): TrackContextMenuItem[] {
  return [
    {
      id: "copy",
      label: context.count > 1 ? `Copy ${tracks(context.count)}` : "Copy",
      onSelect: handlers.onCopy,
    },
    {
      id: "reveal",
      label: "Show in folder",
      // One track, one file: revealing five folders at once is not a thing
      // anyone asked for, so it is offered as a button that means one.
      disabled: !context.revealable || handlers.onReveal === null,
      onSelect: () => handlers.onReveal?.(),
    },
  ];
}

/** An entry that opens a divider above itself is a line along the top of a group. */
function withoutLeadingDivider(items: TrackContextMenuItem[]): TrackContextMenuItem[] {
  return items.map((item, at) => (at === 0 ? { ...item, separatorBefore: false } : item));
}

/** The six groups for these tracks. Always all six, so the bar keeps its shape. */
export function trackActionGroups(
  context: TrackActionContext,
  handlers: TrackActionHandlers,
): TrackActionGroup[] {
  const { count } = context;
  const built: Record<TrackActionGroupId, TrackContextMenuItem[]> = {
    play: count > 0 && handlers.play ? playItems(count, handlers.play) : [],
    organize: organizationMenuItems(
      { count, collection: context.collection },
      handlers.organization,
    ),
    // Explore opens the page for one track; with several, for the first.
    explore:
      handlers.explore && count > 0
        ? discoverMenuItems(
            { count: 1, credits: context.credits },
            { onSimilar: handlers.explore.onSimilar, onOpenPage: handlers.explore.onOpenPage },
          )
        : [],
    beatport: beatportMenuItems({ count }, handlers.beatport ?? {}),
    fix: fixMenuItems({ count }, handlers.fix ?? {}),
    more: count > 0 ? moreItems(context, handlers.more) : [],
  };

  return ACTION_GROUPS.map(({ id, label }) => {
    const items = withoutLeadingDivider(built[id]);
    return {
      id,
      label,
      items,
      disabledReason:
        count <= 0 ? SELECT_TRACKS_FIRST : items.length === 0 ? "Not available here" : null,
    };
  });
}

/** The id of the parent entry that stands for a group in the right-click menu. */
export const groupMenuId = (id: TrackActionGroupId) => `group-${id}`;

/**
 * The right-click menu: the bar's groups as submenus (FLW-8, LIB-6). Play's
 * three entries stay at the top, where a menu's first line is the thing most
 * often wanted; every other group is a parent holding exactly the entries the
 * bar's button for it opens. Groups with nothing to offer leave no gap.
 */
export function menuFromGroups(groups: readonly TrackActionGroup[]): TrackContextMenuItem[] {
  const filled = groups.filter((group) => group.items.length > 0);
  const top: TrackContextMenuItem[] = [];
  for (const group of filled) {
    if (group.id === "play") {
      top.push(...group.items);
      continue;
    }
    top.push({
      id: groupMenuId(group.id),
      label: group.label,
      onSelect: () => undefined,
      items: group.items,
      separatorBefore: top.length > 0,
    });
  }
  return top;
}
