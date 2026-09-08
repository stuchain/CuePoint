/**
 * The tags on one track, and the vocabulary to pick from (ORG-10, DEC-015).
 *
 * Adding a tag by typing is two calls, and the first one is the interesting
 * one: `createTag` is the engine's `create_or_get`, which matches ignoring
 * case. So typing `peak-time` when `Peak-time` exists reuses the tag rather
 * than making a second one — and that rule lives in the engine, where the
 * unique index enforces it, rather than being re-implemented here against a
 * vocabulary that may be a few seconds stale. The renderer's copy exists only
 * to *suggest*; it never decides.
 *
 * The chips are optimistic in the direction that matters. A removal disappears
 * at once and comes back if the engine refuses; an addition waits for the tag
 * to exist, because a chip with no id behind it cannot be removed again.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Tag, TagUsage } from "../../api/cuepointBridge.types";

/** A tag as one track's record carries it — no usage count, that is the vocabulary's. */
export type TrackTag = Pick<Tag, "id" | "name" | "category" | "colour">;

export interface TrackTagsEditor {
  tags: TrackTag[];
  /** Every tag in the library, for suggestions. Empty until it has loaded. */
  vocabulary: TagUsage[];
  /** Add by name: reuses an existing tag, or makes one. */
  add: (name: string) => Promise<void>;
  remove: (tagId: number) => Promise<void>;
}

export interface TrackTagsOptions {
  trackId: number | null;
  /** What the track-detail read said this track carries. */
  tags: readonly TrackTag[];
  onError: (message: string) => void;
  onSaved?: () => void;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** True when the track already carries this name, ignoring case as the index does. */
function alreadyHas(tags: readonly TrackTag[], name: string): boolean {
  const wanted = name.trim().toLocaleLowerCase();
  return tags.some((tag) => tag.name.toLocaleLowerCase() === wanted);
}

export function useTrackTags({
  trackId,
  tags,
  onError,
  onSaved,
}: TrackTagsOptions): TrackTagsEditor {
  const [shown, setShown] = useState<TrackTag[]>([...tags]);
  const [vocabulary, setVocabulary] = useState<TagUsage[]>([]);
  const alive = useRef(true);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    setShown([...tags]);
  }, [tags]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The vocabulary is the whole library's tags, which is a short list and does
  // not depend on the selection — so it is read once, and again after this
  // panel makes a tag that was not in it.
  useEffect(() => {
    const bridge = window.cuepoint?.getTags;
    if (!bridge) return;
    let cancelled = false;
    void bridge()
      .then((payload) => {
        if (!cancelled && alive.current) setVocabulary(payload.tags);
      })
      .catch(() => {
        // Suggestions are a convenience. A vocabulary that cannot be read
        // leaves typing a name working exactly as it did.
      });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const add = useCallback(
    async (name: string) => {
      const wanted = name.trim();
      if (wanted === "" || trackId == null) return;
      const create = window.cuepoint?.createTag;
      const assign = window.cuepoint?.assignTag;
      if (!create || !assign) {
        onError("This build cannot edit tags.");
        return;
      }
      if (alreadyHas(shown, wanted)) return;

      let tag: Tag;
      try {
        tag = (await create({ name: wanted })).tag;
      } catch (cause) {
        onError(messageOf(cause));
        return;
      }
      // Now it has an id, so the chip can be drawn and removed again.
      if (alive.current) setShown((current) => [...current, tag]);
      try {
        await assign({ tag_id: tag.id, track_ids: [trackId] });
        if (alive.current) setReloads((n) => n + 1);
        onSaved?.();
      } catch (cause) {
        if (alive.current) setShown((current) => current.filter((t) => t.id !== tag.id));
        onError(messageOf(cause));
      }
    },
    [onError, onSaved, shown, trackId],
  );

  const remove = useCallback(
    async (tagId: number) => {
      if (trackId == null) return;
      const unassign = window.cuepoint?.unassignTag;
      if (!unassign) {
        onError("This build cannot edit tags.");
        return;
      }
      const before = shown;
      setShown((current) => current.filter((tag) => tag.id !== tagId));
      try {
        await unassign({ tag_id: tagId, track_ids: [trackId] });
        onSaved?.();
      } catch (cause) {
        if (alive.current) setShown(before);
        onError(messageOf(cause));
      }
    },
    [onError, onSaved, shown, trackId],
  );

  return { tags: shown, vocabulary, add, remove };
}
