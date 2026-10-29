/**
 * The Inspector's editable zone (ORG-10, DEC-057, DEC-047).
 *
 * Phase 4 filled the Inspector with everything the import captured and said in
 * as many words that read-only was the whole design, because nothing in the
 * build owned a write path. This is that write path, and it is deliberately a
 * *second zone* rather than fields becoming editable in place: a rating you
 * set and a rating Rekordbox sent are different facts, and a panel that let
 * you type over the second one would be promising something DEC-057 spent a
 * table avoiding.
 *
 * So the zone is separated, labelled "Yours", and every rating says which of
 * the two layers is showing. The clear control is the one place the two-layer
 * model becomes visible instead of mysterious, which is why its label changes
 * with what is underneath it.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { RemoveButton } from "../../components/CloseButton";
import { PixelIcon } from "../../components/PixelIcon";
import type { LibraryTrackRow, TrackMetadata } from "../../api/cuepointBridge.types";
import {
  NOTES_MAX_LENGTH,
  RATING_STARS,
  TAG_NAME_MAX_LENGTH,
  clearRatingLabel,
  describeRatingSource,
  nextRating,
  starLabel,
} from "./trackEdits";
import { TrackEditedValues } from "./TrackEditedValues";
import { useTrackMetadata } from "./useTrackMetadata";
import { useTrackTags, type TrackTag } from "./useTrackTags";
import { Hint } from "../../components/Hint";
import { Textarea } from "../../components/Textarea";
import { TextField } from "../../components/TextField";

interface TrackYoursProps {
  trackId: number;
  /** What the engine last said. A new object means a fresh read. */
  metadata: TrackMetadata;
  tags: readonly TrackTag[];
  /** Every refusal, in the engine's own words. */
  onError: (message: string) => void;
  /** Fired after every accepted write, so the History section re-reads. */
  onSaved?: () => void;
  /** What this zone currently shows (edits are optimistic), so a folded heading can say it. */
  onShown?: (metadata: TrackMetadata, tags: readonly TrackTag[]) => void;
  /**
   * The track, when this build can type the five values CuePoint overrides
   * (CLEAN-13). Absent, the zone is ORG-10's: rating, favorite, notes, tags.
   */
  track?: LibraryTrackRow & { id: number };
  /** Beatport's key for the track, when its match has one: where "go back" returns the key to. */
  beatportKey?: string | null;
  /** Fired after a typed value is saved, which changes what the table shows. */
  onValueSaved?: () => void;
}

/** How long the inline "Saved" stays after a rating or favorite is accepted (as Settings' tick does). */
const SAVED_TICK_MS = 2000;

const STARS = Array.from({ length: RATING_STARS }, (_, index) => index + 1);

export function TrackYours({
  trackId,
  metadata,
  tags,
  onError,
  onSaved,
  onShown,
  track,
  beatportKey,
  onValueSaved,
}: TrackYoursProps) {
  const editor = useTrackMetadata({ trackId, metadata, onError, onSaved });
  const tagging = useTrackTags({ trackId, tags, onError, onSaved });
  const [draftTag, setDraftTag] = useState("");
  const [focusStar, setFocusStar] = useState<number | null>(null);
  const ratingId = useId();
  const notesId = useId();
  const tagId = useId();

  // M382: the rating shows at once; this says it stuck. `aria-live`, not a second `role="status"`
  // (see the notes' line below).
  const [tick, setTick] = useState(false);
  useEffect(() => {
    if (editor.ratingSaved === 0) return;
    setTick(true);
    const timer = window.setTimeout(() => setTick(false), SAVED_TICK_MS);
    return () => window.clearTimeout(timer);
  }, [editor.ratingSaved]);

  const record = editor.metadata;
  const shownTags = tagging.tags;
  useEffect(() => {
    onShown?.(record, shownTags);
    // onShown is a fresh closure each render; only what is shown should refire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, shownTags]);
  const lit = record.effective_rating ?? 0;
  const clearLabel = clearRatingLabel(record);

  // Exactly one star is the group's tab stop, as a radio group has exactly one
  // (ARIA): the chosen one, or the first when nothing is chosen.
  const tabStar = focusStar ?? (lit > 0 ? lit : 1);

  const pick = useCallback(
    (star: number) => {
      setFocusStar(star);
      const wanted = nextRating(record.rating, star);
      if (wanted === null) editor.clearRating();
      else editor.setRating(wanted);
    },
    [editor, record.rating],
  );

  const onStarKeys = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const move = (star: number) => {
        event.preventDefault();
        setFocusStar(star);
        // Arrows in a radio group choose as they move, and they can only land
        // somewhere else — so they set rather than toggle. Clearing from the
        // keyboard is Space on the chosen star, or the clear button.
        editor.setRating(star);
      };
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        move(Math.min(RATING_STARS, tabStar + 1));
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        move(Math.max(1, tabStar - 1));
      } else if (event.key === "Home") {
        move(1);
      } else if (event.key === "End") {
        move(RATING_STARS);
      }
    },
    [editor, tabStar],
  );

  const addTag = useCallback(() => {
    const name = draftTag.trim();
    if (name === "") return;
    setDraftTag("");
    void tagging.add(name);
  }, [draftTag, tagging]);

  const suggestions = useMemo(
    () => tagging.vocabulary.filter((tag) => !tagging.tags.some((own) => own.id === tag.id)),
    [tagging.tags, tagging.vocabulary],
  );

  const suggestionItems = useMemo(
    () => suggestions.map((tag) => ({ value: tag.name })),
    [suggestions],
  );

  return (
    <div className="cp-track-yours" role="group" aria-label="Your ratings, notes and values">

      <div className="cp-track-yours__rating">
        <span className="cp-track-yours__label" id={ratingId}>
          Rating
        </span>
        <div className="cp-track-yours__stars">
          {/* The clear control sits beside the group rather than inside it: a
              radio group holds radios, and a button among them is a button a
              screen reader announces as a sixth option. */}
          <div
            className="cp-track-yours__group"
            role="radiogroup"
            aria-labelledby={ratingId}
            // Which layer is showing (DEC-057) is said on hover, not as a line (DEC-246).
            data-hint={describeRatingSource(record)}
            onKeyDown={onStarKeys}
          >
            {STARS.map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={lit === star}
                aria-label={starLabel(star)}
                tabIndex={tabStar === star ? 0 : -1}
                className={`cp-track-yours__star${
                  star <= lit ? " cp-track-yours__star--on" : ""
                }`}
                onClick={() => pick(star)}
                onFocus={() => setFocusStar(star)}
              >
                <PixelIcon name={star <= lit ? "star" : "star-outline"} size="lg" />
              </button>
            ))}
          </div>
          {clearLabel && (
            <button
              type="button"
              className="cp-link cp-track-yours__clear"
              onClick={() => editor.clearRating()}
            >
              {clearLabel}
            </button>
          )}
          <Hint text={record.favorite ? "Remove from favorites" : "Add to favorites"}>
            <button
              type="button"
              className={`cp-track-yours__favorite${
                record.favorite ? " cp-track-yours__favorite--on" : ""
              }`}
              aria-label="Favorite"
              aria-pressed={record.favorite}
              onClick={() => editor.setFavorite(!record.favorite)}
            >
              <PixelIcon name={record.favorite ? "heart" : "heart-outline"} size="lg" />
            </button>
          </Hint>
          <span className="cp-track-yours__saved" aria-live="polite">
            {tick ? (
              <>
                <PixelIcon name="check" size="sm" className="cp-pixel-icon--before" /> Saved
              </>
            ) : null}
          </span>
        </div>
      </div>

      <div className="cp-track-yours__row">
        <span className="cp-track-yours__label" aria-hidden="true">
          Notes
        </span>
        <div className="cp-track-yours__control">
        <Textarea
          id={notesId}
          label="Notes"
          hideLabel
          width="full"
          rows={3}
          maxLength={NOTES_MAX_LENGTH}
          value={editor.notes}
          placeholder="Add a note…"
          onChange={(event) => editor.editNotes(event.target.value)}
          onBlur={() => editor.flushNotes()}
        />
        {/* `aria-live` rather than `role="status"`: the panel already has one
            status - how many tracks are selected - and a second would make
            "the status" ambiguous to a screen reader and to a test. */}
        <p className="cp-track-yours__state" aria-live="polite">
          {editor.notesState === "saving" ? "Saving…" : ""}
          {editor.notesState === "saved" ? "Saved" : ""}
        </p>
        </div>
      </div>

      <div className="cp-track-yours__row">
        <span className="cp-track-yours__label">Tags</span>
        <ul className="cp-track-yours__tags">
          {tagging.tags.map((tag) => (
            <li key={tag.id} className="cp-track-yours__tag">
              <PixelIcon name="tag" className="cp-track-yours__tag-icon" />
              {tag.name}
              <RemoveButton
                aria-label={`Remove tag ${tag.name}`}
                onClick={() => void tagging.remove(tag.id)}
              />
            </li>
          ))}
          {tagging.tags.length === 0 && (
            <li className="cp-track-yours__tag-empty">No tags yet</li>
          )}
        </ul>
      </div>

      <div className="cp-track-yours__add">
        {/* Suggestions only, in an in-app list rather than a native <datalist> (macOS
            crashed on that popup). Whether a typed name is a new tag or one that
            already exists in another capitalization is the engine's answer,
            not this list's. */}
        <TextField
          id={tagId}
          label="Add a tag"
          // M136: the row flexes to the panel and the field is as tall as Add (its label is the Tags heading above).
          width="full"
          className="cp-track-yours__tagfield"
          suggestions={suggestionItems}
          onPick={setDraftTag}
          value={draftTag}
          maxLength={TAG_NAME_MAX_LENGTH}
          placeholder="Peak time"
          onChange={(event) => setDraftTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
        />
        {/* L6: as tall as the field beside it (was the small button). */}
        <Button variant="secondary" onClick={addTag} disabled={draftTag.trim() === ""}>
          Add
        </Button>
      </div>

      {track && (
        <TrackEditedValues
          track={track}
          beatportKey={beatportKey}
          onSaved={onValueSaved ?? onSaved ?? (() => undefined)}
          onError={onError}
        />
      )}
    </div>
  );
}
