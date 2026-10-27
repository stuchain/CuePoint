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
 * D16 (round 3) makes it three tabs and takes the buttons off the head: Overview says where the
 * track lives (Collections, playlists, Sets, with Add to…), Beatport compares Rekordbox's values
 * with Beatport's, Yours is rating, notes and tags. Play, Queue and Similar are the selection
 * bar's and the row's menu, so a track has one home for its actions.
 *
 * **A field Rekordbox did not supply reads as absent, not as zero.** That is
 * why LIBRARY-01 made those columns nullable (DEC-034): unrated and rated-zero
 * are different facts, and so are "never played" and "no play count recorded".
 */
import { Fragment, useCallback, useEffect, useId, useState, type ReactNode } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import { WheelButton } from "../../components/wheel";
import { formatBpm } from "../../components/format/bpm";
import { LOUDNESS_LINE_TITLE, loudnessLine, loudnessShort, peakShort } from "../../components/waveform/loudnessWords";
import type {
  CollectionNode,
  EntityKind,
  LibraryPlaylistNode,
  LibraryTrackDetail,
  TrackCreditLink,
  TrackFieldChange,
  WaveformTrack,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { matchStateLabel } from "../clean/cleanFormat";
import { useTrackMatches } from "../clean/useTrackMatches";
import { CreditLinks } from "./CreditLinks";
import { Tabs, panelId, tabId } from "../../components/Tabs";
import { DisclosureSection } from "./DisclosureSection";
import { followJob } from "./followJob";
import { jobErrorMessage } from "./libraryFormat";
import { TrackArtwork } from "./TrackArtwork";
import { MatchOnBeatport, TrackBeatportSection } from "./TrackBeatportSection";
import { TrackHistorySection } from "./TrackHistorySection";
import { TrackMarksSection } from "./TrackMarksSection";
import { CUES_HINT, cuesSummary } from "./trackMarks";
import { TrackWaveform } from "./TrackWaveform";
import { TrackYours } from "./TrackYours";
import { useTrackHistory } from "./useTrackHistory";
import { useTrackWrites } from "./useTrackWrites";
import { reportUnexpected } from "../../reporting/reporting";
import "./TrackDetailPanel.css";
import { userMessage } from "../../api/userMessage";
import { formatLength } from "../../format/durations";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { EmptyState } from "../../components/EmptyState";
import { Loading } from "../../components/Loading";
import { countNoun, formatCount } from "../../format/counts";
import { NO_VALUE } from "../../words";
import { RatingStars } from "./RatingStars";

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
   * Opens the page's "Add to Collection" picker for the track shown: the **Add to…** beside the
   * track's Collections on Overview (D16). Absent, it is not offered.
   */
  onAddToCollection?: () => void;
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

/** Absent is absent: an em dash, never a zero. */
function text(value: string | null | undefined): string {
  return value == null || value === "" ? NO_VALUE : value;
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
  return value == null ? NO_VALUE : `${formatCount(value)}${suffix}`;
}

function duration(seconds: number | null): string {
  return formatLength(seconds);
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

/** The panel's tabs, in the order they are read. */
type DetailTab = "overview" | "beatport" | "yours";

const TAB_LABELS: Record<DetailTab, string> = {
  overview: "Overview",
  beatport: "Beatport",
  yours: "Yours",
};

/** How long a read of another track runs before the track on screen reads as stale (D32, M379). */
const STALE_AFTER_MS = 300;

/** The tab the person last chose, remembered like the panel's folds (storage can be blocked). */
export const TRACK_DETAILS_TAB_KEY = "cuepoint-ui-track-details-tab";

function readTab(): DetailTab {
  try {
    const stored = localStorage.getItem(TRACK_DETAILS_TAB_KEY);
    if (stored === "overview" || stored === "beatport" || stored === "yours") return stored;
  } catch {
    // Blocked: the panel opens on Overview.
  }
  return "overview";
}

function rememberTab(tab: DetailTab): void {
  try {
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, tab);
  } catch {
    // Blocked or full: the tab still works for as long as the page is open.
  }
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
  onEditValues,
  onAddToCollection,
  leadZone,
}: TrackDetailPanelProps) {
  // Bumped by every accepted write, which is what makes the History section
  // re-read. A local append would show entries the engine did not write:
  // re-saving the same note records nothing at all.
  const [written, setWritten] = useState(0);
  const [tab, setTab] = useState<DetailTab>(readTab);
  const tabsId = useId();
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
  const [reverting, setReverting] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const onSaved = useCallback(() => setWritten((n) => n + 1), []);
  const report = useCallback((message: string) => onError?.(message), [onError]);
  // The previous track stays on screen while the next one is read; after a beat it reads as stale
  // rather than as the new track's, and a quick re-read of the same track never flickers (M379).
  const [stale, setStale] = useState(false);
  const readingAnother = loading && detail !== null;
  useEffect(() => {
    if (!readingAnother) {
      setStale(false);
      return;
    }
    const timer = setTimeout(() => setStale(true), STALE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [readingAnother]);

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
      else onMessage?.("Sync undone.");
    } catch (cause) {
      reportUnexpected(cause);
      report(userMessage(cause));
    } finally {
      setRestoring(false);
      onChanged();
      announceLibraryChange();
    }
  }, [onChanged, onMessage, report, trackId]);

  if (error) {
    return (
      <p className="cp-track-detail__note" role="alert">
        {error}
      </p>
    );
  }

  if (!detail) {
    return (
      <div className="cp-track-detail__note">
        {loading ? (
          <Loading what="track" />
        ) : (
          <EmptyState compact headline="Select a track to see its details" />
        )}
      </div>
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
  const matchState = matches.matches?.state?.state ?? null;
  // A track with no key is offered the match right where the absence is read (the Key
  // fact on Overview); the Beatport tab offers it again to a track not looked up yet.
  const keyMatchOffered = key === null && track.id != null;
  const changeCount = history.changes.length;
  const editable = track.id != null && window.cuepoint?.setTrackOverrides;
  const loudnessTrack = reading.trackId !== null && reading.trackId === track.id ? reading.track : null;
  const lufs = loudnessShort(loudnessTrack);
  const peak = peakShort(loudnessTrack);
  const bpm = formatBpm(track.bpm);
  const genre = track.genre ? track.genre : null;

  const sourceWords =
    track.key_source === "yours" ? "yours" : track.key_source === "beatport" ? "Beatport" : null;
  const matchWord = matchStateLabel(matchState);

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview", label: TAB_LABELS.overview },
    ...(track.id != null && !matches.unavailable ? [{ id: "beatport" as const, label: TAB_LABELS.beatport }] : []),
    ...(track.id != null ? [{ id: "yours" as const, label: TAB_LABELS.yours }] : []),
  ];
  // A remembered tab this track does not offer (Beatport off, no id) reads as Overview.
  const activeTab: DetailTab = tabs.some((item) => item.id === tab) ? tab : "overview";
  const choose = (id: string) => {
    const next = id as DetailTab;
    setTab(next);
    rememberTab(next);
  };
  // Every panel stays mounted and is hidden when not chosen, as a folded section was: a note
  // being typed or a read in flight is not thrown away by a click on another tab.
  const panel = (id: DetailTab, children: ReactNode) => (
    <div
      role="tabpanel"
      id={panelId(tabsId, id)}
      aria-labelledby={tabId(tabsId, id)}
      className="cp-track-detail__tabpanel"
      hidden={activeTab !== id}
    >
      {children}
    </div>
  );

  return (
    <div className={`cp-track-detail${stale ? " cp-track-detail--stale" : ""}`} aria-busy={loading || undefined}>
      {/* The art scrolls away; the words that name the track stay (C35). */}
      {track.id != null && window.cuepoint?.getTrackArtwork && (
        <div className="cp-track-detail__art">
          <TrackArtwork trackId={track.id} version={written} />
        </div>
      )}
      <header className="cp-sticky-head cp-track-detail__head">
        <div className="cp-track-detail__ident">
          <div className="cp-track-detail__idtext">
            <h2 className="cp-track-detail__title">{text(track.title)}</h2>
            <p className="cp-track-detail__artist">
              {credited(track.artist, credits?.artists, onOpenEntity)}
            </p>
            {/* The label a Label page means: the effective one (DEC-068), which
                is why it is here beside the artist rather than in the imported
                record below, whose Label row stays what Rekordbox sent. */}
            {onOpenEntity && credits?.label && (
              <p className="cp-track-detail__labelname">
                {credited(credits.label.name, [credits.label], onOpenEntity)}
              </p>
            )}
          </div>
        </div>
        {selectionCount > 1 && (
          // DEC-045: the panel shows the last-clicked track and says how many
          // there are; the buttons under it act on all of them, and the
          // fields below change this one. K5 says it on one line, the second
          // half in the link's title rather than a paragraph.
          <p className="cp-track-detail__selection">
            <span role="status">{formatCount(selectionCount)} selected</span>
            {onEditValues && (
              <>
                <Hint text={`Edit values for ${formatCount(selectionCount)} tracks — the fields below change only this one`}>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Edit values for ${formatCount(selectionCount)} tracks…`}
                    onClick={onEditValues}
                  >
                    Edit values…
                  </Button>
                </Hint>
              </>
            )}
          </p>
        )}
      </header>

      {/* The caller's own slot: its key is the caller's (Prepare keys its zone
          by entry id), and in the list beside TrackYours' track-id key two
          different things could both be "3" and leave a stale zone behind. */}
      <Fragment>{leadZone}</Fragment>

      <Tabs tabs={tabs} activeId={activeTab} onChange={choose} variant="sub" idPrefix={tabsId} />

      {panel(
        "overview",
        <>
          <dl className="cp-facts cp-track-detail__facts" aria-label="Facts">
            <div className="cp-track-detail__fact cp-track-detail__fact--key" data-testid="track-key">
              <dt className="cp-track-detail__factlabel">Key</dt>
              <dd className="cp-track-detail__factvalue">
                {key !== null ? (
                  // The chip is the code, coloured by its wheel position (R4-2, DEC-272); the
                  // wheel's button sits beside the chip it is about (K8, DEC-282), then the
                  // key's name. Where it came from is said on hover and to screen readers.
                  <span className="cp-track-detail__keyrow">
                    <WheelButton keyName={track.effective_key} />
                    <Hint text={sourceWords ? `Key from ${sourceWords}` : undefined} inline>
                      <span className="cp-track-detail__keymeta">{track.key_name ?? ""}</span>
                    </Hint>
                    {sourceWords !== null && <span className="cp-visually-hidden">{` \u00b7 ${sourceWords}`}</span>}
                  </span>
                ) : (
                  // The wheel's button draws the one dash itself (a track with no key shows a muted
                  // dash in the same button); a second "—" beside it read as an empty chip.
                  <span className="cp-track-detail__file">
                    <WheelButton />
                    {keyMatchOffered && track.id != null && <MatchOnBeatport trackId={track.id} />}
                  </span>
                )}
              </dd>
            </div>
            {bpm && (
              <div className="cp-track-detail__fact" data-testid="track-fact-bpm">
                <dt className="cp-track-detail__factlabel">BPM</dt>
                <dd className="cp-track-detail__factvalue cp-data">{bpm}</dd>
              </div>
            )}
            {genre && (
              <div className="cp-track-detail__fact" data-testid="track-fact-genre">
                <dt className="cp-track-detail__factlabel">Genre</dt>
                <dd className="cp-track-detail__factvalue">{genre}</dd>
              </div>
            )}
            {lufs && (
              <div className="cp-track-detail__fact" data-testid="track-fact-loudness">
                <dt className="cp-track-detail__factlabel">Loudness</dt>
                <dd className="cp-track-detail__factvalue cp-data">
                  <Hint text={`${loudnessLine(loudnessTrack) ?? lufs}. ${LOUDNESS_LINE_TITLE}`} inline>
                    <span>{lufs}</span>
                  </Hint>
                </dd>
              </div>
            )}
            {/* The peak beside the loudness (M130), signed above zero. */}
            {lufs && peak && (
              <div className="cp-track-detail__fact" data-testid="track-fact-peak">
                <dt className="cp-track-detail__factlabel">Peak</dt>
                <dd className="cp-track-detail__factvalue cp-data">{peak}</dd>
              </div>
            )}
            {track.id != null && !matches.unavailable && matchWord !== "" && (
              <div className="cp-track-detail__fact" data-testid="track-fact-beatport">
                <dt className="cp-track-detail__factlabel">Beatport</dt>
                <dd className="cp-track-detail__factvalue">
                  {/* The state is a link to the tab that explains it (M127). */}
                  <button type="button" className="cp-link cp-link--go" onClick={() => choose("beatport")}>
                    {matchWord}
                  </button>
                </dd>
              </div>
            )}
            {/* Where the track lives (M132, D16): the lines the Where tab held, with Add to…. */}
            <div className="cp-track-detail__fact" data-testid="track-fact-playlists">
              <dt className="cp-track-detail__factlabel">In playlists</dt>
              <dd className="cp-track-detail__factvalue">
                {playlists.length === 0 ? (
                  <span className="cp-track-detail__none">None</span>
                ) : (
                  <ul className="cp-track-detail__lists">
                    {playlists.map((playlist) => (
                      <li key={playlist.id}>
                        <Hint text={playlist.path}>
                          <button
                            type="button"
                            className="cp-link cp-track-detail__playlist"
                            onClick={() => onSelectPlaylist?.(playlist)}
                          >
                            <PixelIcon name="playlist" className="cp-track-detail__icon" />
                            {playlist.name}
                          </button>
                        </Hint>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div className="cp-track-detail__fact" data-testid="track-fact-collections">
              <dt className="cp-track-detail__factlabel">In Collections</dt>
              <dd className="cp-track-detail__factvalue">
                <ul className="cp-track-detail__lists">
                  {collections.length === 0 && (
                    <li>
                      <span className="cp-track-detail__none">None</span>
                    </li>
                  )}
                  {collections.map((collection) => (
                    <li key={collection.id}>
                      <button
                        type="button"
                        className="cp-link cp-track-detail__playlist"
                        onClick={() => onSelectCollection?.(collection)}
                      >
                        <PixelIcon name={collectionIcon(collection.kind)} className="cp-track-detail__icon" />
                        {collection.name}
                      </button>
                    </li>
                  ))}
                  {onAddToCollection && track.id != null && (
                    <li>
                      <button type="button" className="cp-link" onClick={onAddToCollection}>
                        Add to…
                      </button>
                    </li>
                  )}
                </ul>
              </dd>
            </div>
            {sets.length > 0 && (
              <div className="cp-track-detail__fact" data-testid="track-fact-sets">
                <dt className="cp-track-detail__factlabel">In Sets</dt>
                <dd className="cp-track-detail__factvalue">
                  <ul className="cp-track-detail__lists">
                    {sets.map((set) => (
                      <li key={set.id}>
                        <Hint text={onOpenInPrepare ? `Open ${set.name} in Prepare` : undefined}>
                          <button
                            type="button"
                            className="cp-link cp-track-detail__playlist"
                            onClick={() => (onOpenInPrepare ? onOpenInPrepare(set) : onSelectCollection?.(set))}
                          >
                            <PixelIcon name={collectionIcon(set.kind)} className="cp-track-detail__icon" />
                            {set.name}
                          </button>
                        </Hint>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>

          {/* The whole track, its marks on it (WAVE-06). Keyed by track, so a new track never
              shows the last one's picture while its own is read; mounted while another tab is
              open, so the loudness above keeps arriving. */}
          {track.id != null && window.cuepoint?.waveforms && (
            <TrackWaveform key={`waveform-${track.id}`} trackId={track.id} loudnessInFacts onReading={onReading} />
          )}

          {/* The rest of Rekordbox's record: its cues and grid (WAVE-04). */}
          {detail.marks && (
            <DisclosureSection
              id="cues"
              title="Cue points"
              summary={cuesSummary(detail.marks)}
              hint={CUES_HINT}
              defaultOpen={false}
            >
              <TrackMarksSection marks={detail.marks} />
            </DisclosureSection>
          )}

          <DisclosureSection id="details" title="From your Rekordbox file" defaultOpen={false}>
            <dl className="cp-facts cp-track-detail__fields">
              <Row
                label="Remixer"
                value={credited(track.remixer, credits?.remixers, onOpenEntity)}
              />
              <Row label="Album" value={text(track.album)} />
              <Row label="Label" value={text(track.label)} />
              <Row label="Genre" value={text(track.genre)} />
              <Row label="BPM" value={formatBpm(track.bpm) || NO_VALUE} valueClassName="cp-data" />
              <Row label="Year" value={track.year == null ? NO_VALUE : String(track.year)} valueClassName="cp-data" />
              <Row label="Length" value={duration(track.duration_seconds)} valueClassName="cp-data" />
              {/* Stars, not a number: the parser converted Rekordbox's 0/51/…/255
                  encoding at import, so what is stored is already a star count. This
                  row stays Rekordbox's own value whatever CuePoint's layer says —
                  the resolved one is above, with its source on hover. */}
              <Row
                label="Rating"
                value={track.rating == null ? NO_VALUE : <RatingStars count={track.rating} of={5} />}
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
                    <Hint text={track.file_path ?? undefined} inline>
                      <span>{text(track.file_path)}</span>
                    </Hint>
                  </span>
                }
              />
            </dl>
          </DisclosureSection>

        </>,
      )}

      {track.id != null &&
        !matches.unavailable &&
        panel(
          "beatport",
          <TrackBeatportSection
            track={{ ...track, id: track.id }}
            matches={matches}
            onOpenInClean={onOpenInClean}
            onError={report}
          />,
        )}

      {track.id != null &&
        panel(
          "yours",
          <>
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
              track={editable ? { ...track, id: track.id } : undefined}
              // Only an accepted match's key is what clearing the edit gives back (DEC-201).
              beatportKey={matchState === "accepted" ? (matches.matches?.candidate?.key || null) : null}
              onValueSaved={onChanged}
            />
            {!history.unavailable && (
              <DisclosureSection
                id="history"
                title="History"
                summary={
                  history.loading && changeCount === 0
                    ? null
                    : changeCount === 0
                      ? "none yet"
                      : countNoun(changeCount, "change")
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
          </>,
        )}
    </div>
  );
}
