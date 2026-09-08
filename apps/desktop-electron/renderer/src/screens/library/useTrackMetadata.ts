/**
 * Editing CuePoint's own layer for one track (ORG-10, DEC-057).
 *
 * Every control here writes immediately and shows the result before the engine
 * has answered, because a rating that takes a round trip to light up is a
 * rating a user clicks twice. The cost of that is the bug this hook exists to
 * not have: **a panel showing a value the engine refused**. So it keeps two
 * copies — what the engine last confirmed, and what is on screen — and a
 * failure puts the confirmed value back and says why.
 *
 * The rollback is per field rather than wholesale. A note being typed while a
 * rating fails is not part of that failure, and restoring the whole record
 * would silently discard it.
 *
 * Notes are the one field that debounces. The timer is not what makes them
 * safe — the flush when the selection changes or the panel unmounts is. A note
 * typed and then abandoned by clicking the next track is the "it looked saved"
 * bug in its most common form, so the pending write is sent rather than
 * dropped, against the track it was typed against, even when there is nothing
 * left on screen to show the result.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackMetadata } from "../../api/cuepointBridge.types";
import {
  NOTES_DEBOUNCE_MS,
  normalizeNotes,
  withRating,
  type NotesState,
} from "./trackEdits";

/** What one write asks the engine to change. */
interface MetadataPatch {
  rating?: number | null;
  favorite?: boolean;
  notes?: string | null;
}

export interface TrackMetadataEditor {
  /** The record as it should be drawn now — optimistic until the engine answers. */
  metadata: TrackMetadata;
  /** The notes field's text, which is a draft until the debounce fires. */
  notes: string;
  notesState: NotesState;
  setRating: (stars: number) => void;
  clearRating: () => void;
  setFavorite: (favorite: boolean) => void;
  editNotes: (text: string) => void;
  /** Send a pending note now — what blur does. */
  flushNotes: () => void;
}

export interface TrackMetadataOptions {
  trackId: number | null;
  /** What the engine last said, from the track-detail read. */
  metadata: TrackMetadata;
  /** Told about every refusal, in the words the engine used. */
  onError: (message: string) => void;
  /** Told after every write the engine accepted — the History section listens. */
  onSaved?: () => void;
}

/**
 * The record with the fields this patch claimed put back as the engine has
 * them, and nothing else touched.
 *
 * A rating restores all three of its fields, because the effective value and
 * its source are derived from it and a half-restored rating would label itself
 * wrongly. Everything else on screen belongs to a write that did not fail.
 */
function rolledBack(
  current: TrackMetadata,
  confirmed: TrackMetadata,
  patch: MetadataPatch,
): TrackMetadata {
  if ("rating" in patch) {
    return {
      ...current,
      rating: confirmed.rating,
      effective_rating: confirmed.effective_rating,
      rating_source: confirmed.rating_source,
    };
  }
  if ("favorite" in patch) return { ...current, favorite: confirmed.favorite };
  return { ...current, notes: confirmed.notes };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useTrackMetadata({
  trackId,
  metadata,
  onError,
  onSaved,
}: TrackMetadataOptions): TrackMetadataEditor {
  const [shown, setShown] = useState<TrackMetadata>(metadata);
  const [notes, setNotes] = useState<string>(metadata.notes ?? "");
  const [notesState, setNotesState] = useState<NotesState>("idle");

  const confirmed = useRef<TrackMetadata>(metadata);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The note waiting for the timer, or null when nothing is waiting. */
  const waiting = useRef<string | null>(null);
  /** The track the pending note belongs to, which is not always the one shown. */
  const trackRef = useRef(trackId);

  // A fresh read replaces everything: the panel is showing a different track,
  // or the same one re-read, and either way the engine's answer is newer than
  // anything held here.
  useEffect(() => {
    confirmed.current = metadata;
    setShown(metadata);
    setNotes(metadata.notes ?? "");
    setNotesState("idle");
  }, [metadata]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * One write.
   *
   * `showing` is false for a write that belongs to a track the panel has
   * already moved on from: it still has to happen, and it still has to say so
   * when it fails, but nothing it produces belongs on screen.
   */
  const send = useCallback(
    async (
      patch: MetadataPatch,
      optimistic: TrackMetadata | null,
      id: number,
      showing: boolean,
    ): Promise<void> => {
      const bridge = window.cuepoint?.setTrackMetadata;
      if (!bridge) {
        onError("This build cannot edit tracks.");
        throw new Error("This build cannot edit tracks.");
      }
      if (showing && optimistic) setShown(optimistic);
      try {
        const payload = await bridge({ trackId: id, ...patch });
        if (showing) {
          confirmed.current = payload.metadata;
          if (alive.current) setShown(payload.metadata);
        }
        onSaved?.();
      } catch (cause) {
        // Only what this write claimed goes back. Anything else on screen
        // belongs to a write that did not fail.
        if (showing && alive.current) {
          setShown((current) => rolledBack(current, confirmed.current, patch));
          if ("notes" in patch) setNotes(confirmed.current.notes ?? "");
        }
        onError(messageOf(cause));
        throw cause;
      }
    },
    [onError, onSaved],
  );

  const setRating = useCallback(
    (stars: number) => {
      if (trackId == null) return;
      void send({ rating: stars }, withRating(shown, stars), trackId, true).catch(
        () => undefined,
      );
    },
    [send, shown, trackId],
  );

  const clearRating = useCallback(() => {
    if (trackId == null) return;
    void send({ rating: null }, withRating(shown, null), trackId, true).catch(
      () => undefined,
    );
  }, [send, shown, trackId]);

  const setFavorite = useCallback(
    (favorite: boolean) => {
      if (trackId == null) return;
      void send({ favorite }, { ...shown, favorite }, trackId, true).catch(() => undefined);
    },
    [send, shown, trackId],
  );

  /** Send whatever note is waiting, for the track it was typed against. */
  const saveWaiting = useCallback(
    (showing: boolean) => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const text = waiting.current;
      const id = trackRef.current;
      waiting.current = null;
      if (text === null || id == null) return;
      const value = normalizeNotes(text);
      if (showing && alive.current) setNotesState("saving");
      void send({ notes: value }, { ...shown, notes: value }, id, showing)
        .then(() => {
          if (showing && alive.current) setNotesState("saved");
        })
        .catch(() => {
          if (showing && alive.current) setNotesState("idle");
        });
    },
    [send, shown],
  );

  const saveRef = useRef(saveWaiting);
  saveRef.current = saveWaiting;

  const editNotes = useCallback((text: string) => {
    setNotes(text);
    setNotesState("idle");
    waiting.current = text;
    if (timer.current !== null) clearTimeout(timer.current);
    // A burst of typing is one request: each keystroke replaces the pending
    // note and pushes the timer out again.
    timer.current = setTimeout(() => saveRef.current(true), NOTES_DEBOUNCE_MS);
  }, []);

  const flushNotes = useCallback(() => saveRef.current(true), []);

  // Leaving is the moment a pending note would be lost, so the cleanup sends
  // it — before the body below moves the id on, which is what makes it go to
  // the right track.
  useEffect(() => {
    trackRef.current = trackId;
    return () => {
      saveRef.current(false);
    };
  }, [trackId]);

  return {
    metadata: shown,
    notes,
    notesState,
    setRating,
    clearRating,
    setFavorite,
    editNotes,
    flushNotes,
  };
}
