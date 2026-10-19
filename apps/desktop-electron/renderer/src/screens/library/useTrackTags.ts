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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Tag, TagUsage } from "../../api/cuepointBridge.types";
import { TAGS, useSharedRead } from "../../api/sharedReads";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";
import { needsDesktopApp } from "../../api/userMessage";

/** A tag as one track's record carries it — no usage count, that is the vocabulary's. */
export type TrackTag = Pick<Tag, "id" | "name" | "category" | "colour">;

interface TrackTagsEditor {
  tags: TrackTag[];
  /** Every tag in the library, for suggestions. Empty until it has loaded. */
  vocabulary: TagUsage[];
  /** Add by name: reuses an existing tag, or makes one. */
  add: (name: string) => Promise<void>;
  remove: (tagId: number) => Promise<void>;
}

interface TrackTagsOptions {
  trackId: number | null;
  /** What the track-detail read said this track carries. */
  tags: readonly TrackTag[];
  onError: (message: string) => void;
  onSaved?: () => void;
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
  const alive = useRef(true);
  // The whole library's tags: a short list that does not depend on the selection,
  // shared with the page that shows this panel and read again after this panel
  // makes a tag that was not in it. A vocabulary that cannot be read leaves
  // typing a name working exactly as it did, so a failure is not reported.
  const { value: vocabularyAnswer, refresh: refreshVocabulary } = useSharedRead(TAGS);
  const vocabulary: TagUsage[] = useMemo(() => vocabularyAnswer?.tags ?? [], [vocabularyAnswer]);

  useEffect(() => {
    setShown([...tags]);
  }, [tags]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const add = useCallback(
    async (name: string) => {
      const wanted = name.trim();
      if (wanted === "" || trackId == null) return;
      const create = window.cuepoint?.createTag;
      const assign = window.cuepoint?.assignTag;
      if (!create || !assign) {
        onError(needsDesktopApp("Editing tags"));
        return;
      }
      if (alreadyHas(shown, wanted)) return;

      let tag: Tag;
      try {
        tag = (await create({ name: wanted })).tag;
      } catch (cause) {
        reportUnexpected(cause);
        onError(userMessage(cause));
        return;
      }
      // Now it has an id, so the chip can be drawn and removed again.
      if (alive.current) setShown((current) => [...current, tag]);
      try {
        await assign({ tag_id: tag.id, track_ids: [trackId] });
        refreshVocabulary();
        onSaved?.();
      } catch (cause) {
        reportUnexpected(cause);
        if (alive.current) setShown((current) => current.filter((t) => t.id !== tag.id));
        onError(userMessage(cause));
      }
    },
    [onError, onSaved, refreshVocabulary, shown, trackId],
  );

  const remove = useCallback(
    async (tagId: number) => {
      if (trackId == null) return;
      const unassign = window.cuepoint?.unassignTag;
      if (!unassign) {
        onError(needsDesktopApp("Editing tags"));
        return;
      }
      const before = shown;
      setShown((current) => current.filter((tag) => tag.id !== tagId));
      try {
        await unassign({ tag_id: tagId, track_ids: [trackId] });
        onSaved?.();
      } catch (cause) {
        reportUnexpected(cause);
        if (alive.current) setShown(before);
        onError(userMessage(cause));
      }
    },
    [onError, onSaved, shown, trackId],
  );

  return { tags: shown, vocabulary, add, remove };
}
