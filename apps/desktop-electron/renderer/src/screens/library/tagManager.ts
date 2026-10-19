/**
 * Tending the tag vocabulary (ORG-12, ORG-03).
 *
 * A tag is a browsing vocabulary, so tidying it lives beside the filter bar
 * that uses it rather than in Settings — nobody goes to Settings to fix a
 * spelling they just saw in a filter.
 *
 * Two of the four gestures cannot be taken back. `delete` takes a tag off
 * every track that had it, and `merge` moves them and deletes the source; both
 * are recorded per track in the History (DEC-008), which is a way to find out
 * what happened rather than a way to reverse it. So both say the number out
 * loud before they run, and the number is the engine's `track_count` rather
 * than anything counted here.
 */
import { countNoun } from "../../format/counts";
import type { Tag, TagUsage } from "../../api/cuepointBridge.types";

/** A tag's name, as the engine bounds it. */
export const TAG_NAME_MAX_LENGTH = 60;

/** A tag's category, as the engine bounds it. */
export const TAG_CATEGORY_MAX_LENGTH = 60;

/**
 * The colours a tag may have, in the engine's order.
 *
 * Names the engine stores (it bounds them), not what is painted: a tag is painted from the tag
 * palette (`--tag-*`), never from a status colour, so a "Red" tag does not read as an error and
 * a name is the hue it shows in every theme (C96).
 */
export const TAG_COLOURS = ["primary", "success", "warning", "danger", "info"] as const;

type TagColour = (typeof TAG_COLOURS)[number];

/** What each token is called in a colour picker. */
const COLOUR_LABELS: Record<TagColour, string> = {
  primary: "Blue",
  success: "Green",
  warning: "Yellow",
  danger: "Red",
  info: "Cyan",
};

/** The tag palette hue each stored name paints with. */
const COLOUR_HUES: Record<TagColour, string> = {
  primary: "blue",
  success: "green",
  warning: "yellow",
  danger: "red",
  info: "cyan",
};

export function colourLabel(colour: string | null): string {
  if (colour === null) return "None";
  return COLOUR_LABELS[colour as TagColour] ?? colour;
}

/** The CSS variable a colour token paints with. */
export function colourVariable(colour: string | null): string | undefined {
  if (colour === null || !TAG_COLOURS.includes(colour as TagColour)) return undefined;
  return `var(--tag-${COLOUR_HUES[colour as TagColour]})`;
}

/** What a tag is edited into. Absent fields say nothing about their column. */
export interface TagDraft {
  name: string;
  category: string;
  colour: string | null;
}

export function draftOf(tag: Tag): TagDraft {
  return { name: tag.name, category: tag.category ?? "", colour: tag.colour };
}

type DraftCheck = { ok: true } | { ok: false; reason: string };

/** A draft the engine would accept, or why it would not. */
export function checkDraft(draft: TagDraft): DraftCheck {
  const name = draft.name.trim();
  if (name === "") return { ok: false, reason: "A tag needs a name" };
  if (name.length > TAG_NAME_MAX_LENGTH) {
    return { ok: false, reason: `A name is at most ${TAG_NAME_MAX_LENGTH} characters` };
  }
  if (draft.category.trim().length > TAG_CATEGORY_MAX_LENGTH) {
    return {
      ok: false,
      reason: `A category is at most ${TAG_CATEGORY_MAX_LENGTH} characters`,
    };
  }
  if (draft.colour !== null && !TAG_COLOURS.includes(draft.colour as TagColour)) {
    return { ok: false, reason: "That is not a color a tag can have" };
  }
  return { ok: true };
}

/**
 * The fields a save should send, which is only the ones that changed.
 *
 * The engine's update route applies a field when the key is present, so
 * `category: null` clears a category and leaving it out says nothing about it.
 * Sending all three every time would work and would also write a history entry
 * for two columns nobody touched.
 */
export interface TagPatch {
  name?: string;
  category?: string | null;
  colour?: string | null;
}

export function tagPatch(tag: Tag, draft: TagDraft): TagPatch {
  const patch: TagPatch = {};
  const name = draft.name.trim();
  const category = draft.category.trim() === "" ? null : draft.category.trim();
  if (name !== tag.name) patch.name = name;
  if (category !== (tag.category ?? null)) patch.category = category;
  if (draft.colour !== (tag.colour ?? null)) patch.colour = draft.colour;
  return patch;
}

export function hasChanges(patch: TagPatch): boolean {
  return Object.keys(patch).length > 0;
}

function tracks(count: number): string {
  return countNoun(count, "track");
}

/**
 * What deleting a tag would do, said before it happens.
 *
 * The count is what makes it a decision rather than a click: "delete Peak-time"
 * and "take Peak-time off 412 tracks" are the same action and only one of them
 * is a question anybody can answer.
 */
export function describeDelete(tag: TagUsage): string {
  if (tag.track_count === 0) {
    return "Nothing is tagged with it.";
  }
  return `It comes off ${tracks(tag.track_count)}, and there is no undo.`;
}

/** What merging would do. The source is deleted, which is said rather than implied. */
export function describeMerge(source: TagUsage, target: TagUsage): string {
  return (
    `${tracks(source.track_count)} move across to “${target.name}”, and “${source.name}” is deleted.`
  );
}

/** What a finished delete says. `untagged` is the engine's count, not a guess. */
export function deletedLine(name: string, untagged: number): string {
  if (untagged === 0) return `Deleted “${name}”`;
  return `Deleted “${name}”, ${tracks(untagged)} lost it`;
}

/** What a finished merge says. */
export function mergedLine(source: string, target: string, moved: number): string {
  if (moved === 0) return `Merged “${source}” into “${target}”`;
  return `Merged “${source}” into “${target}”, ${tracks(moved)} moved`;
}

/**
 * The vocabulary in the order a manager shows it: by category, then by name.
 *
 * Uncategorized tags last rather than first. A category is something a user
 * gave a tag, and the ones they have not got to yet are the ones they are
 * looking for.
 */
export function sortedTags(tags: readonly TagUsage[]): TagUsage[] {
  return [...tags].sort((left, right) => {
    const ours = left.category ?? "";
    const theirs = right.category ?? "";
    if (ours !== theirs) {
      if (ours === "") return 1;
      if (theirs === "") return -1;
      return ours.localeCompare(theirs);
    }
    return left.name.localeCompare(right.name);
  });
}

/** How a tag reads in a list: its name, its category, and what carries it. */
export function tagHint(tag: TagUsage): string {
  const used = tracks(tag.track_count);
  return tag.category ? `${tag.category} · ${used}` : used;
}
