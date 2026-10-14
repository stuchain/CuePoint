/**
 * What CuePoint knows about one track (LIBUI-09, DEC-047, then ORG-10).
 *
 * The first thing ever to render inside the Inspector container DEC-024 built
 * empty in Phase 2. LIBUI-09 filled it with everything the import captured and
 * said read-only was the whole design, because nothing in the build owned a
 * write path: ratings and tags were Phase 6, and a field that looked editable
 * would have been a promise this build could not keep.
 *
 * ORG-10 is Phase 6, and it keeps that promise **without taking the old one
 * back**. The panel is now two zones. "Yours" is CuePoint's own layer and is
 * editable; everything below it is the imported record and is exactly as read-
 * only as it was, field for field. They are never blurred, because DEC-057's
 * whole design is that a rating you set and a rating Rekordbox sent are
 * different facts that both survive.
 *
 * CLEAN-13 adds a third zone and a picture. **Beatport** says where the track
 * stands with a match and puts each overridable field's three values side by
 * side; the header shows the track's artwork through CLEAN-09's guarded route;
 * "Yours" gains the five values a person can type; History offers Revert for
 * CuePoint's own changes and Restore for tags written to the file. The
 * imported record stays read-only, field for field.
 *
 * WAVE-04 completes the imported record with the track's cue points and beat
 * grid (`TrackMarksSection`), read-only like the rest of it (DEC-118). WAVE-06
 * draws them on the track's waveform under the header (`TrackWaveform`).
 *
 * **A field Rekordbox did not supply reads as absent, not as zero.** That is
 * why LIBRARY-01 made those columns nullable (DEC-034): unrated and rated-zero
 * are different facts, and so are "never played" and "no play count recorded".
 */
import { Fragment, useCallback, useState, type ReactNode } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import { TrackContextMenu } from "../../components/TrackContextMenu";
import { KeyChip, WheelButton } from "../../components/wheel";
import { formatBpm } from "../../components/format/bpm";
import { LOUDNESS_LINE_TITLE, loudnessLine, loudnessShort } from "../../components/waveform/loudnessWords";
import type {
  CollectionNode,
  EntityKind,
  LibraryPlaylistNode,
  LibraryTrackDetail,
  LibraryTrackRow,
  TrackCreditLink,
  TrackFieldChange,
  WaveformTrack,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { matchStateLabel } from "../clean/cleanFormat";
import { useTrackMatches } from "../clean/useTrackMatches";
import { similarPath } from "../discover/discoverLinks";
import { CreditLinks } from "./CreditLinks";
import { DisclosureSection } from "./DisclosureSection";
import { RouteButton } from "./RouteButton";
import { followJob } from "./followJob";
import { starsFor } from "./filterText";
import { jobErrorMessage } from "./libraryFormat";
import { TrackArtwork } from "./TrackArtwork";
import { MatchOnBeatport, TrackBeatportSection } from "./TrackBeatportSection";
import { TrackHistorySection } from "./TrackHistorySection";
import { TrackMarksSection } from "./TrackMarksSection";
import { availableQueueActions, runQueueAction, type QueueAction } from "./trackDetailsActions";
import { cuesHeaderSummary, CUES_HINT } from "./trackMarks";
import { TrackWaveform } from "./TrackWaveform";
import { TrackYours } from "./TrackYours";
import { useTrackHistory } from "./useTrackHistory";
import { useTrackWrites } from "./useTrackWrites";
import { reportUnexpected } from "../../reporting/reporting";
import "./TrackDetailPanel.css";
import { userMessage } from "../../api/userMessage";
import { NO_VALUE } from "../../words";

/** A Collection as the track-detail read names it — enough to show and to open. */
type TrackCollectionRef = Pick<CollectionNode, "id" | "name" | "kind">;

interface TrackDetailPanelProps {
  detail: LibraryTrackDetail | null;
  loading?: boolean;
  error?: string | null;
  /** How many tracks are selected, when it is more than the one shown. */
  selectionCount?: number;
  /** Scope the table to a playlist the track is in. */
  onSelectPlaylist?: (playlist: LibraryPlaylistNode) => void;
  /** Scope the table to a Collection holding it (ORG-09). */
  onSelectCollection?: (collection: TrackCollectionRef) => void;
  /**
   * Open a Set holding it on the Prepare page (DEC-104). Absent — before that
   * page exists, or where a page has no way there — a Set scopes the table as
   * a Collection does, through `onSelectCollection`.
   */
  onOpenInPrepare?: (set: TrackCollectionRef) => void;
  /** Unused since K5 took Folder off the row; pages still pass it. */
  onReveal?: (filePath: string) => void;
  /** Where a refused edit goes. Without it the zone still works and stays quiet. */
  onError?: (message: string) => void;
  /**
   * After an edit that changed what the table shows — a typed value, an
   * applied one, a revert, a restore (CLEAN-13). The page reads the track and
   * its row again.
   */
  onTrackChanged?: () => void;
  /** Where "Open on the Clean page" goes. Absent, it is not offered. */
  onOpenInClean?: (trackId: number) => void;
  /** Where a finished revert or restore says what it did. */
  onMessage?: (message: string) => void;
  /**
   * Open an artist's or a label's page (DISCOVER-11). Absent, the credit and
   * the label are text, as they always were.
   */
  onOpenEntity?: (kind: EntityKind, ref: string) => void;
  /**
   * The tracks selected, read out when the selection is more than the one
   * shown: what Play, Play next and Add to queue act on (FLW-9). Absent, they
   * act on the track shown.
   */
  gatherSelectedRows?: (limit?: number) => Promise<LibraryTrackRow[]>;
  /**
   * Opens the edit dialog for the whole selection, for **Edit values for 4
   * tracks…** (INS-11, K4): in place on the page that hosts the panel, not on
   * Clean. Absent, the button is not offered, which is the case on every page that
   * cannot edit a selection.
   */
  onEditValues?: () => void;
  /**
   * A page's own zone, drawn above "Yours": the Prepare page's "In this Set"
   * (PREP-10), which is about the entry rather than the track. Absent on
   * every other page.
   */
  leadZone?: ReactNode;
}

/**
 * What the folded "Yours" heading still says, in words that read well aloud:
 * "★★★★ · favorite · 2 tags", or "no rating" when there is nothing of the person's in it.
 */
function yoursSummary(
  metadata: { effective_rating: number | null; favorite: boolean },
  tags: readonly unknown[],
): string {
  const parts: string[] = [];
  const stars = metadata.effective_rating;
  if (stars != null && stars > 0) parts.push(starsFor(stars));
  if (metadata.favorite) parts.push("favorite");
  if (tags.length > 0) parts.push(tags.length === 1 ? "1 tag" : `${tags.length} tags`);
  return parts.length > 0 ? parts.join(" · ") : "no rating";
}

/** The same, in words a screen reader reads: "4 stars · favorite", for a rating drawn as stars. */
function yoursSpoken(
  metadata: { effective_rating: number | null; favorite: boolean },
  tags: readonly unknown[],
): string | undefined {
  const stars = metadata.effective_rating;
  if (stars == null || stars <= 0) return undefined;
  const parts = [stars === 1 ? "1 star" : `${stars} stars`];
  if (metadata.favorite) parts.push("favorite");
  if (tags.length > 0) parts.push(tags.length === 1 ? "1 tag" : `${tags.length} tags`);
  return parts.join(" · ");
}

/** What the folded "Where it is" heading says: "1 Set · 1 playlist", or that it is nowhere yet. */
function whereSummary(collections: number, sets: number, playlists: number): string {
  const parts: string[] = [];
  if (collections > 0) parts.push(`${collections.toLocaleString()} ${collections === 1 ? "Collection" : "Collections"}`);
  if (sets > 0) parts.push(`${sets.toLocaleString()} ${sets === 1 ? "Set" : "Sets"}`);
  if (playlists > 0) parts.push(`${playlists.toLocaleString()} ${playlists === 1 ? "playlist" : "playlists"}`);
  return parts.length > 0 ? parts.join(" · ") : "Not in any Collection";
}

/** Absent is absent: an em dash, never a zero. */
function text(value: string | null | undefined): string {
  return value == null || value === "" ? "—" : value;
}

/**
 * What follows the key chip on the key line (DEC-201, FLW-9, R4-2): " · A minor · Beatport",
 * " · A minor · yours", or null when the track has no key. The chip itself carries the code.
 */
function keyDetail(track: {
  effective_key?: string | null;
  key_name?: string | null;
  key_source?: "yours" | "beatport" | null;
}): string | null {
  if (!track.effective_key) return null;
  const rest = [track.key_name, track.key_source === "yours" ? "yours" : track.key_source === "beatport" ? "Beatport" : null]
    .filter(Boolean)
    .join(" · ");
  return rest ? ` · ${rest}` : "";
}

function number(value: number | null | undefined, suffix = ""): string {
  return value == null ? "—" : `${value.toLocaleString()}${suffix}`;
}

function duration(seconds: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/**
 * A credit as links when the engine named its artists and there is somewhere
 * to open them, and as the text it always was otherwise.
 */
function credited(
  credit: string | null | undefined,
  links: readonly TrackCreditLink[] | undefined,
  onOpen: ((kind: EntityKind, ref: string) => void) | undefined,
): React.ReactNode {
  if (!onOpen || !links || links.length === 0) return text(credit);
  return <CreditLinks credit={credit ?? ""} links={links} onOpen={onOpen} />;
}

/**
 * `valueClassName` is `cp-data` for a number, time or date (R4-3, DEC-048): the data face with
 * figures that line up. Words (genre, label, comment, path) keep the text face.
 */
function Row({
  label,
  value,
  valueClassName,
  hideLabel = false,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  /** Read by screen readers, not drawn: the value says what it is. */
  hideLabel?: boolean;
}) {
  return (
    <div className="cp-track-detail__row">
      <dt className={hideLabel ? "cp-track-detail__label cp-visually-hidden" : "cp-track-detail__label"}>{label}</dt>
      <dd className={valueClassName ? `cp-track-detail__value ${valueClassName}` : "cp-track-detail__value"}>{value}</dd>
    </div>
  );
}

/**
 * The pixel icon for a Collection's kind — a saved question looks like one,
 * and a Set wears Prepare's flag, as it does in the tree (PREP-09).
 */
function collectionIcon(kind: TrackCollectionRef["kind"]) {
  if (kind === "smart") return "smart" as const;
  if (kind === "folder") return "folder" as const;
  if (kind === "set") return "prepare" as const;
  return "collections" as const;
}

export function TrackDetailPanel({
  detail,
  loading = false,
  error = null,
  selectionCount = 0,
  onSelectPlaylist,
  onSelectCollection,
  onOpenInPrepare,
  onError,
  onTrackChanged,
  onOpenInClean,
  onMessage,
  onOpenEntity,
  gatherSelectedRows,
  onEditValues,
  leadZone,
}: TrackDetailPanelProps) {
  // Bumped by every accepted write, which is what makes the History section
  // re-read. A local append would show entries the engine did not write:
  // re-saving the same note records nothing at all.
  const [written, setWritten] = useState(0);
  // What TrackYours shows now: its edits are optimistic and never reload `detail`.
  const [shown, setShown] = useState<{
    trackId: number;
    metadata: { effective_rating: number | null; favorite: boolean };
    tags: readonly unknown[];
  } | null>(null);
  const trackId = detail?.track.id ?? null;
  // The loudness the facts line reads: the waveform's own answer, told up as it
  // arrives, so one request and one poll serve both.
  const [reading, setReading] = useState<{ trackId: number | null; track: WaveformTrack | null }>({
    trackId: null,
    track: null,
  });
  const onReading = useCallback(
    (track: WaveformTrack | null) => setReading({ trackId: track?.track_id ?? null, track }),
    [],
  );
  const history = useTrackHistory(trackId, written);
  const writes = useTrackWrites(trackId, written);
  const matches = useTrackMatches(trackId, written);
  const [acting, setActing] = useState<QueueAction | null>(null);
  // Where the Queue ▾ menu is open, under its button (K5).
  const [queueMenu, setQueueMenu] = useState<{ x: number; y: number } | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const onSaved = useCallback(() => setWritten((n) => n + 1), []);
  const report = useCallback((message: string) => onError?.(message), [onError]);

  /** A write that changed a value the table shows, not only CuePoint's notes. */
  const onChanged = useCallback(() => {
    setWritten((n) => n + 1);
    onTrackChanged?.();
  }, [onTrackChanged]);

  const revert = useCallback(
    async (change: TrackFieldChange) => {
      const bridge = window.cuepoint?.revertChange;
      if (!bridge || change.id == null) return;
      setReverting(change.id);
      try {
        const { revert: done } = await bridge({ change_id: change.id });
        onMessage?.(done.changed ? "Undone." : "It already held that value; nothing changed.");
        onChanged();
        announceLibraryChange();
      } catch (cause) {
        reportUnexpected(cause);
        // A stale revert is refused with both values named (CLEAN-06).
        report(userMessage(cause));
      } finally {
        setReverting(null);
      }
    },
    [onChanged, onMessage, report],
  );

  const restore = useCallback(async () => {
    const bridge = window.cuepoint?.startTagRestore;
    if (!bridge || trackId == null) return;
    setRestoring(true);
    try {
      const started = await bridge({ track_id: trackId });
      const finished = await followJob(started.job_id).finished;
      if (finished.state === "failed") report(jobErrorMessage(finished.error));
      else onMessage?.("Save undone.");
    } catch (cause) {
      reportUnexpected(cause);
      report(userMessage(cause));
    } finally {
      setRestoring(false);
      onChanged();
      announceLibraryChange();
    }
  }, [onChanged, onMessage, report, trackId]);

  const act = async (action: QueueAction) => {
    if (!detail) return;
    setActing(action);
    try {
      let rows: LibraryTrackRow[] = [];
      if (selectionCount > 1 && gatherSelectedRows) rows = await gatherSelectedRows();
      if (rows.length === 0) rows = [detail.track];
      const outcome = await runQueueAction(action, rows);
      if (outcome?.failed) report(outcome.message);
      else if (outcome) onMessage?.(outcome.message);
    } catch (cause) {
      reportUnexpected(cause);
      report(userMessage(cause));
    } finally {
      setActing(null);
    }
  };

  /** The first track selected, for Similar tracks; the one shown when that is not known. */
  const similarTarget = async (): Promise<string | null> => {
    if (!detail || detail.track.id == null) return null;
    if (selectionCount > 1 && gatherSelectedRows) {
      const rows = await gatherSelectedRows(1);
      const first = rows.find((row) => row.id != null)?.id;
      if (first != null) return similarPath(first);
    }
    return similarPath(detail.track.id);
  };

  if (error) {
    return (
      <p className="cp-track-detail__note" role="alert">
        {error}
      </p>
    );
  }

  if (!detail) {
    return (
      <p className="cp-track-detail__note">
        {loading ? "Reading the track…" : "Click a track to see its details, rate it and tag it here."}
      </p>
    );
  }

  const { track, playlists, credits } = detail;
  // The engine lists every node holding the track, Sets with their kind
  // (PREP-02). A Set is not a Collection to a reader (fact 2), so the two are
  // counted and listed apart, and a Set's list is drawn only when there is one:
  // "In no Sets" on every track would be a line about a feature, not the track.
  const collections = detail.collections.filter((node) => node.kind !== "set");
  const sets = detail.collections.filter((node) => node.kind === "set");

  const key = keyDetail(track);
  const queue = availableQueueActions();
  const matchState = matches.matches?.state?.state ?? null;
  // A track with no key is offered the match right where the absence is read;
  // the Beatport section, folded until asked for, offers it again to a track
  // not looked up yet.
  const keyMatchOffered = key === null && track.id != null;
  const changeCount = history.changes.length;
  const editable = track.id != null && window.cuepoint?.setTrackOverrides;
  const loudnessTrack = reading.trackId !== null && reading.trackId === track.id ? reading.track : null;
  const lufs = loudnessShort(loudnessTrack);
  const bpm = formatBpm(track.bpm);
  const genre = track.genre ? track.genre : null;

  return (
    <div className="cp-track-detail">
      <header className="cp-track-detail__head">
        {/* Small art beside the words that name the track. */}
        <div className="cp-track-detail__ident">
          {track.id != null && window.cuepoint?.getTrackArtwork && (
            <TrackArtwork trackId={track.id} version={written} />
          )}
          <div className="cp-track-detail__idtext">
            <h2 className="cp-track-detail__title">{text(track.title)}</h2>
            <p className="cp-track-detail__artist">
              {credited(track.artist, credits?.artists, onOpenEntity)}
            </p>
            {/* The label a Label page means: the effective one (DEC-068), which
                is why it is here beside the artist rather than in the imported
                record below, whose Label row stays what Rekordbox sent. */}
            {onOpenEntity && credits?.label && (
              <p className="cp-track-detail__label">
                {credited(credits.label.name, [credits.label], onOpenEntity)}
              </p>
            )}
          </div>
        </div>
        {/* One facts line: the key chip with the Camelot wheel's button beside the
            key it is about (K8, DEC-282), then BPM, genre and loudness. */}
        <div className="cp-track-detail__facts">
          <div className="cp-track-detail__keyrow">
            <dl className="cp-track-detail__keyline" data-testid="track-key">
              <Row
                label="Key"
                hideLabel
                value={
                  key !== null ? (
                    // The chip is the code, coloured by its wheel position (R4-2, DEC-272);
                    // the key's name and source follow it as muted text.
                    <>
                      <KeyChip value={track.effective_key} />
                      <span className="cp-track-detail__keymeta">{key}</span>
                    </>
                  ) : (
                    <span className="cp-track-detail__file">
                      <span>{NO_VALUE}</span>
                      {keyMatchOffered && track.id != null && <MatchOnBeatport trackId={track.id} />}
                    </span>
                  )
                }
              />
            </dl>
            <WheelButton />
          </div>
          {bpm && (
            <span className="cp-track-detail__fact cp-data" data-testid="track-fact-bpm">
              {`${bpm} BPM`}
            </span>
          )}
          {genre && (
            <span className="cp-track-detail__fact" data-testid="track-fact-genre">
              {genre}
            </span>
          )}
          {lufs && (
            <span
              className="cp-track-detail__fact cp-data"
              data-testid="track-fact-loudness"
              title={`${loudnessLine(loudnessTrack) ?? lufs}. ${LOUDNESS_LINE_TITLE}`}
            >
              <span className="cp-visually-hidden">Loudness </span>
              {lufs}
            </span>
          )}
        </div>
        {selectionCount > 1 && (
          // DEC-045: the panel shows the last-clicked track and says how many
          // there are; the buttons under it act on all of them, and the
          // fields below change this one. K5 says it on one line, the second
          // half in the link's title rather than a paragraph.
          <p className="cp-track-detail__selection">
            <span role="status">{selectionCount.toLocaleString()} selected</span>
            {onEditValues && (
              <>
                {" · "}
                <button
                  type="button"
                  className="cp-track-detail__reveal"
                  aria-label={`Edit values for ${selectionCount.toLocaleString()} tracks…`}
                  title={`Edit values for ${selectionCount.toLocaleString()} tracks — the fields below change only this one`}
                  onClick={onEditValues}
                >
                  Edit values…
                </button>
              </>
            )}
          </p>
        )}
        {/* Three buttons (K5, DEC-285, amending DEC-246): Play, Queue ▾ with
            the two that never interrupt, and Similar. The aria-labels and titles
            keep the full names. Show in folder lives in the row's menus. */}
        <div className="cp-track-actions" role="group" aria-label="Actions for this track">
          {queue.play && (
            <button type="button" className="cp-track-actions__button" disabled={acting !== null} onClick={() => void act("play")}>
              Play
            </button>
          )}
          {(queue.next || queue.end) && (
            <button
              type="button"
              className="cp-track-actions__button"
              aria-label="Queue"
              aria-haspopup="menu"
              aria-expanded={queueMenu !== null}
              disabled={acting !== null}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setQueueMenu({ x: rect.left, y: rect.bottom });
              }}
            >
              Queue<PixelIcon name="chevron-down" className="cp-pixel-icon--text cp-pixel-icon--after" />
            </button>
          )}
          {track.id != null && (
            <RouteButton
              to={selectionCount > 1 && gatherSelectedRows ? similarTarget : similarPath(track.id)}
              className="cp-track-actions__button"
              aria-label="Similar tracks"
              title="Similar tracks"
            >
              Similar
            </RouteButton>
          )}
        </div>
        {queueMenu && (
          <TrackContextMenu
            x={queueMenu.x}
            y={queueMenu.y}
            label="Queue"
            onClose={() => setQueueMenu(null)}
            items={[
              ...(queue.next
                ? [{ id: "next", label: "Play next", onSelect: () => void act("next") }]
                : []),
              ...(queue.end
                ? [{ id: "end", label: "Add to queue", onSelect: () => void act("end") }]
                : []),
            ]}
          />
        )}
      </header>

      {/* The whole track, its marks on it (WAVE-06): under the header, the
          panel's full width. Keyed by track, so a new track never shows the
          last one's picture while its own is read; the key is its own, since
          TrackYours' sits in the same list keyed by the bare track id. */}
      {track.id != null && window.cuepoint?.waveforms && (
        <TrackWaveform key={`waveform-${track.id}`} trackId={track.id} loudnessInFacts onReading={onReading} />
      )}

      {/* The caller's own slot: its key is the caller's (Prepare keys its zone
          by entry id), and in the list beside TrackYours' track-id key two
          different things could both be "3" and leave a stale zone behind. */}
      <Fragment>{leadZone}</Fragment>

      {/* A track with no id is not editable, and there is nothing to say
          about that: the id is what every write is addressed to. */}
      {track.id != null && (
        <DisclosureSection
          id="yours"
          title="Yours"
          defaultOpen={false}
          summary={
            shown && shown.trackId === track.id
              ? yoursSummary(shown.metadata, shown.tags)
              : yoursSummary(detail.metadata, detail.tags)
          }
          summarySpoken={
            shown && shown.trackId === track.id
              ? yoursSpoken(shown.metadata, shown.tags)
              : yoursSpoken(detail.metadata, detail.tags)
          }
          className="cp-track-section--yours">
          <TrackYours
            // A different track is a different editor: a note being typed
            // belongs to the track it was typed against, and remounting is what
            // makes that structural rather than careful.
            key={track.id}
            trackId={track.id}
            metadata={detail.metadata}
            tags={detail.tags}
            onError={report}
            onSaved={onSaved}
            onShown={(metadata, shownTags) =>
              setShown({ trackId: track.id as number, metadata, tags: shownTags })
            }
            track={editable ? { ...track, id: track.id } : undefined}
            // Only an accepted match's key is what clearing the edit gives back (DEC-201).
            beatportKey={matchState === "accepted" ? (matches.matches?.candidate?.key || null) : null}
            onValueSaved={onChanged}
          />
        </DisclosureSection>
      )}

      <DisclosureSection id="details" title="Details from Rekordbox" defaultOpen={false}>
        <dl className="cp-track-detail__fields">
          <Row
            label="Remixer"
            value={credited(track.remixer, credits?.remixers, onOpenEntity)}
          />
          <Row label="Album" value={text(track.album)} />
          <Row label="Label" value={text(track.label)} />
          <Row label="Genre" value={text(track.genre)} />
          <Row label="BPM" value={formatBpm(track.bpm) || "—"} valueClassName="cp-data" />
          <Row label="Year" value={track.year == null ? "—" : String(track.year)} valueClassName="cp-data" />
          <Row label="Length" value={duration(track.duration_seconds)} valueClassName="cp-data" />
          {/* Stars, not a number: the parser converted Rekordbox's 0/51/…/255
              encoding at import, so what is stored is already a star count. This
              row stays Rekordbox's own value whatever CuePoint's layer says —
              the resolved one is above, with its source on hover. */}
          <Row
            label="Rating"
            value={track.rating == null ? "—" : starsFor(track.rating)}
          />
          <Row label="Plays" value={number(track.play_count)} valueClassName="cp-data" />
          <Row label="Color" value={text(track.colour)} />
          <Row label="Added" value={text(track.date_added)} valueClassName="cp-data" />
          <Row label="Bitrate" value={number(track.bitrate, " kbps")} valueClassName="cp-data" />
          <Row label="Comment" value={text(track.comment)} />
          <Row
            label="File"
            value={
              <span className="cp-track-detail__file">
                <span title={track.file_path}>{text(track.file_path)}</span>
              </span>
            }
          />
        </dl>
      </DisclosureSection>

      {/* The rest of Rekordbox's record: its cues and grid (WAVE-04). */}
      {detail.marks && (
        <DisclosureSection
          id="cues"
          title="Cue points"
          summary={cuesHeaderSummary(detail.marks)}
          hint={CUES_HINT}
          defaultOpen={false}
        >
          <TrackMarksSection marks={detail.marks} />
        </DisclosureSection>
      )}

      <DisclosureSection
        id="where"
        title="Where it is"
        summary={whereSummary(collections.length, sets.length, playlists.length)}
        defaultOpen={false}
      >
        {collections.length > 0 && (
          <section className="cp-track-detail__playlists">
            <h4 className="cp-track-detail__subtitle">
              {`In ${collections.length} ${collections.length === 1 ? "Collection" : "Collections"}`}
            </h4>
            <ul>
              {collections.map((collection) => (
                <li key={collection.id}>
                  <button
                    type="button"
                    className="cp-track-detail__playlist"
                    onClick={() => onSelectCollection?.(collection)}
                  >
                    <PixelIcon
                      name={collectionIcon(collection.kind)}
                      className="cp-track-detail__icon"
                    />
                    {collection.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sets.length > 0 && (
          <section className="cp-track-detail__playlists" aria-label="Sets">
            <h4 className="cp-track-detail__subtitle">
              {`In ${sets.length} ${sets.length === 1 ? "Set" : "Sets"}`}
            </h4>
            <ul>
              {sets.map((set) => (
                <li key={set.id}>
                  <button
                    type="button"
                    className="cp-track-detail__playlist"
                    title={onOpenInPrepare ? `Open ${set.name} in Prepare` : undefined}
                    onClick={() =>
                      onOpenInPrepare ? onOpenInPrepare(set) : onSelectCollection?.(set)
                    }
                  >
                    <PixelIcon name={collectionIcon(set.kind)} className="cp-track-detail__icon" />
                    {set.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {playlists.length === 0 ? (
          <p className="cp-track-detail__none">Not in any Rekordbox playlist.</p>
        ) : (
          <section className="cp-track-detail__playlists">
            <h4 className="cp-track-detail__subtitle">
              {`In ${playlists.length} ${playlists.length === 1 ? "playlist" : "playlists"}`}
            </h4>
            <ul>
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className="cp-track-detail__playlist"
                    title={playlist.path}
                    onClick={() => onSelectPlaylist?.(playlist)}
                  >
                    <PixelIcon name="playlist" className="cp-track-detail__icon" />
                    {playlist.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DisclosureSection>

      {track.id != null && !matches.unavailable && (
        <DisclosureSection
          id="beatport"
          title="Beatport"
          summary={matchStateLabel(matchState) || null}
          defaultOpen={false}
        >
          <TrackBeatportSection
            track={{ ...track, id: track.id }}
            matches={matches}
            onOpenInClean={onOpenInClean}
          />
        </DisclosureSection>
      )}

      {!history.unavailable && (
        <DisclosureSection
          id="history"
          title="History"
          summary={
            history.loading && changeCount === 0
              ? null
              : changeCount === 0
                ? "none yet"
                : `${changeCount.toLocaleString()} ${changeCount === 1 ? "change" : "changes"}`
          }
          defaultOpen={false}
        >
          <TrackHistorySection
            changes={history.changes}
            loading={history.loading}
            error={history.error}
            unavailable={history.unavailable}
            onRevert={window.cuepoint?.revertChange ? (change) => void revert(change) : undefined}
            reverting={reverting}
            writes={writes}
            onRestore={window.cuepoint?.startTagRestore ? () => void restore() : undefined}
            restoring={restoring}
          />
        </DisclosureSection>
      )}
    </div>
  );
}
