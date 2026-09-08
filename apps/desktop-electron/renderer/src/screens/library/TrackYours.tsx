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
import { useCallback, useId, useMemo, useState } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import type { TrackMetadata } from "../../api/cuepointBridge.types";
import {
  NOTES_MAX_LENGTH,
  RATING_STARS,
  TAG_NAME_MAX_LENGTH,
  clearRatingLabel,
  describeRatingSource,
  nextRating,
  starLabel,
} from "./trackEdits";
import { useTrackMetadata } from "./useTrackMetadata";
import { useTrackTags, type TrackTag } from "./useTrackTags";

export interface TrackYoursProps {
  trackId: number;
  /** What the engine last said. A new object means a fresh read. */
  metadata: TrackMetadata;
  tags: readonly TrackTag[];
  /** Every refusal, in the engine's own words. */
  onError: (message: string) => void;
  /** Fired after every accepted write, so the History section re-reads. */
  onSaved?: () => void;
}

const STARS = Array.from({ length: RATING_STARS }, (_, index) => index + 1);

export function TrackYours({ trackId, metadata, tags, onError, onSaved }: TrackYoursProps) {
  const editor = useTrackMetadata({ trackId, metadata, onError, onSaved });
  const tagging = useTrackTags({ trackId, tags, onError, onSaved });
  const [draftTag, setDraftTag] = useState("");
  const [focusStar, setFocusStar] = useState<number | null>(null);
  const listId = useId();
  const ratingId = useId();
  const notesId = useId();
  const tagId = useId();

  const record = editor.metadata;
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

  return (
    <section className="cp-track-yours" aria-label="Yours">
      <h3 className="cp-track-detail__subtitle">Yours</h3>

      <div className="cp-track-yours__rating">
        <span className="cp-track-yours__label" id={ratingId}>
          Your rating
        </span>
        <div className="cp-track-yours__stars">
          {/* The clear control sits beside the group rather than inside it: a
              radio group holds radios, and a button among them is a button a
              screen reader announces as a sixth option. */}
          <div
            className="cp-track-yours__group"
            role="radiogroup"
            aria-labelledby={ratingId}
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
                {star <= lit ? "★" : "☆"}
              </button>
            ))}
          </div>
          {clearLabel && (
            <button
              type="button"
              className="cp-track-yours__clear"
              onClick={() => editor.clearRating()}
            >
              {clearLabel}
            </button>
          )}
        </div>
        {/* Which layer is showing, in words: DEC-057's whole point is that the
            effective value carries its source. */}
        <p className="cp-track-yours__source">{describeRatingSource(record)}</p>
      </div>

      <button
        type="button"
        className={`cp-track-yours__favorite${
          record.favorite ? " cp-track-yours__favorite--on" : ""
        }`}
        aria-pressed={record.favorite}
        onClick={() => editor.setFavorite(!record.favorite)}
      >
        <span aria-hidden="true">{record.favorite ? "♥" : "♡"}</span>
        Favorite
      </button>

      <div className="cp-track-yours__field">
        <label className="cp-track-yours__label" htmlFor={notesId}>
          Your notes
        </label>
        <textarea
          id={notesId}
          className="cp-track-yours__notes"
          rows={3}
          maxLength={NOTES_MAX_LENGTH}
          value={editor.notes}
          placeholder="Anything Rekordbox's comment cannot hold"
          onChange={(event) => editor.editNotes(event.target.value)}
          onBlur={() => editor.flushNotes()}
        />
        {/* `aria-live` rather than `role="status"`: the panel already has one
            status — how many tracks are selected — and a second would make
            "the status" ambiguous to a screen reader and to a test. */}
        <p className="cp-track-yours__state" aria-live="polite">
          {editor.notesState === "saving" ? "Saving…" : ""}
          {editor.notesState === "saved" ? "Saved" : ""}
        </p>
      </div>

      <div className="cp-track-yours__field">
        <span className="cp-track-yours__label">Tags</span>
        <ul className="cp-track-yours__tags">
          {tagging.tags.map((tag) => (
            <li key={tag.id} className="cp-track-yours__tag">
              <PixelIcon name="tag" className="cp-track-yours__tag-icon" />
              {tag.name}
              <button
                type="button"
                className="cp-track-yours__tag-remove"
                aria-label={`Remove tag ${tag.name}`}
                onClick={() => void tagging.remove(tag.id)}
              >
                ×
              </button>
            </li>
          ))}
          {tagging.tags.length === 0 && (
            <li className="cp-track-yours__tag-empty">No tags yet</li>
          )}
        </ul>
        <div className="cp-track-yours__add">
          <label className="cp-track-yours__label" htmlFor={tagId}>
            Add a tag
          </label>
          <input
            id={tagId}
            className="cp-track-yours__tag-input"
            list={listId}
            value={draftTag}
            maxLength={TAG_NAME_MAX_LENGTH}
            placeholder="Type a name"
            onChange={(event) => setDraftTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
          />
          {/* Suggestions only. Whether a typed name is a new tag or one that
              already exists in another capitalization is the engine's answer,
              not this list's. */}
          <datalist id={listId}>
            {suggestions.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          <button
            type="button"
            className="cp-track-yours__tag-add"
            onClick={addTag}
            disabled={draftTag.trim() === ""}
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
