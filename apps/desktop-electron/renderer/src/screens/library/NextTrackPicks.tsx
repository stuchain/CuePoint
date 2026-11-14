/**
 * "Plays well next" in Track details (Overview): the three library tracks that mix best out of the
 * track shown, each with a visible Play next button.
 *
 * Data is the Similar page's own: `getSimilarTracks` ranks by the rule Prepare uses for a Set's
 * next track. Asked once per shown track. Rows are read with `getLibraryTrack` lazily: only for the
 * suggestions that pass the filter (`eligibleNextTracks`) and only until three are shown, cached by
 * id for the life of the mount, so a queue change re-filters without re-reading. Only the
 * upcoming tracks (the next 10 after the current one) count as queued. Nothing here is
 * hover-only: Play next is a button and a double-click plays the row now (inserted next, then
 * skipped to, so the queue is kept).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { LibraryTrackRow, PlayerSnapshot, SimilarTrack } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { usePlayedTracks, usePlayingTrackId } from "../../components/player/playedTracks";
import { selectQueueRevision } from "../../components/player/playerFormat";
import { usePlayerValue } from "../../components/player/playerStore";
import { KeyChip } from "../../components/wheel/KeyChip";
import { formatBpm } from "../../components/format/bpm";
import { isEngineRefusal } from "../../api/bridgeError";
import { isOutage } from "../../api/userMessage";
import { couldNot } from "../../format/words";
import { reportUnexpected } from "../../reporting/reporting";
import { reasonTokens, tempoDeltaText } from "../discover/reasonTokens";
import { describeSimilarReason } from "../discover/similarReasons";
import { RowArtwork } from "./libraryCells";
import {
  NEXT_PICKS_ASK,
  NEXT_PICKS_COUNT,
  NEXT_PICKS_UPCOMING,
  effectiveBpm,
  eligibleNextTracks,
  hasKeyOrBpm,
} from "./nextPicksRule";
import { queuedMessage, toQueueItem } from "./useLibraryPlayback";
import "./NextTrackPicks.css";

/** Where the playing track sits in play order, -1 for none. */
function selectCurrentIndex(state: PlayerSnapshot | null): number {
  return state?.queue.currentIndex ?? -1;
}

function selectRepeatsAll(state: PlayerSnapshot | null): boolean {
  return state?.queue.repeat === "all";
}

/** Clicks inside these belong to them, not to the row's double-click. */
const INTERACTIVE = "button, a, input, select, textarea, summary, [role='button'], [tabindex], .cp-hint, .cp-next-picks__cover";

interface Candidate {
  suggestion: SimilarTrack;
  row: LibraryTrackRow;
}

type Suggested =
  | { trackId: number; status: "ready"; suggestions: SimilarTrack[] }
  | { trackId: number; status: "error" };

/** `allExcluded`: the engine had matches and every one was queued, playing or played. */
type Resolved = { trackId: number; status: "ready" | "error"; candidates: Candidate[]; allExcluded: boolean };

type RowRead = { status: "row"; row: LibraryTrackRow } | { status: "gone" } | { status: "failed" };

async function suggest(trackId: number): Promise<Suggested> {
  const bridge = window.cuepoint;
  if (!bridge?.getSimilarTracks || !bridge.getLibraryTrack) return { trackId, status: "error" };
  const answer = await bridge.getSimilarTracks({ track_id: trackId, limit: NEXT_PICKS_ASK });
  if (answer.refusal) return { trackId, status: "error" };
  return { trackId, status: "ready", suggestions: answer.value.suggestions };
}

async function readRow(id: number): Promise<RowRead> {
  try {
    const detail = await window.cuepoint!.getLibraryTrack!({ trackId: id });
    const row = detail?.track;
    // A track gone since the answer was made is left out, not drawn as a hole.
    return row && row.id != null ? { status: "row", row } : { status: "gone" };
  } catch {
    return { status: "failed" };
  }
}

/** How long the shown track must stay shown before the engine is asked about it. */
const SUGGEST_DELAY_MS = 200;

/** The engine being down, or saying no, is the user's situation and not a bug; only the rest is reported. */
function reportIfUnexpected(cause: unknown): void {
  if (isOutage(cause) || isEngineRefusal(cause)) return;
  reportUnexpected(cause);
}

const NO_IDS: readonly number[] = [];
const NO_MARKS: Readonly<Record<number, "pending" | "queued">> = {};

/**
 * The library ids of the next tracks in play order after the current one, or null while they are
 * being read. A small slice, re-read only when the queue changes shape.
 */
function useUpcomingIds(active: boolean): { ids: readonly number[] | null; refresh: () => void } {
  const revision = usePlayerValue(selectQueueRevision);
  const currentIndex = usePlayerValue(selectCurrentIndex);
  const repeatsAll = usePlayerValue(selectRepeatsAll);
  const [read, setRead] = useState<readonly number[] | null>(null);
  const [rereads, setRereads] = useState(0);
  const refresh = useCallback(() => setRereads((n) => n + 1), []);

  useEffect(() => {
    if (revision === null || !active) return;
    let current = true;
    const queueWindow = window.cuepoint?.player?.queueWindow;
    if (!queueWindow) {
      setRead(NO_IDS);
      return;
    }
    const idsOf = (page: { items: Array<{ trackId?: number | null }> }) =>
      page.items.map((item) => item.trackId).filter((id): id is number => id != null);
    void (async () => {
      const after = idsOf(await queueWindow(currentIndex + 1, NEXT_PICKS_UPCOMING));
      // With repeat-all the queue wraps: once the end is near, the tracks from its start come next.
      const wrapped =
        repeatsAll && currentIndex > 0 && after.length < NEXT_PICKS_UPCOMING
          ? idsOf(await queueWindow(0, Math.min(currentIndex, NEXT_PICKS_UPCOMING - after.length)))
          : [];
      if (current) setRead([...after, ...wrapped]);
    })().catch(() => {
      if (current) setRead(NO_IDS);
    });
    return () => {
      current = false;
    };
  }, [revision, currentIndex, repeatsAll, active, rereads]);

  // No player state yet: there is no queue to be in.
  return { ids: revision === null ? NO_IDS : read, refresh };
}

/** The marks of one suggestion, each with its sentence for a screen reader and the hover. */
function Marks({ suggestion }: { suggestion: SimilarTrack }) {
  const tokens = reasonTokens(suggestion.reasons);
  const sentence = (component: string) =>
    suggestion.reasons
      .filter((reason) => reason.component === component)
      .map(describeSimilarReason)
      .join(" · ");
  const tempo = tempoDeltaText(tokens.tempo);
  const marks: Array<{ id: string; text: string; words: string }> = [];
  if (tokens.key) marks.push({ id: "key", text: tokens.key, words: sentence("key") });
  if (tempo) marks.push({ id: "tempo", text: tempo, words: sentence("tempo") });
  if (tokens.genre) marks.push({ id: "genre", text: "G", words: sentence("genre") });
  if (tokens.label) marks.push({ id: "label", text: "L", words: sentence("label") });
  if (tokens.artist) marks.push({ id: "artist", text: "A", words: sentence("artist") });
  return (
    <>
      {marks.map((mark) => (
        <Hint key={mark.id} text={mark.words || undefined} inline>
          {/* role="img" takes an accessible name; the short mark stays what is drawn. */}
          <span role="img" aria-label={mark.words || mark.text} className="cp-next-picks__mark cp-data">
            {mark.text}
          </span>
        </Hint>
      ))}
    </>
  );
}

export function NextTrackPicks({
  track,
  active = true,
  onMessage,
}: {
  /** The track Details shows. */
  track: LibraryTrackRow;
  /** False while the Overview tab is hidden (its panel stays mounted): nothing is asked then. */
  active?: boolean;
  onMessage?: (message: string) => void;
}) {
  const trackId = track.id;
  const titleId = useId();
  const canRank = hasKeyOrBpm(track);
  const available = Boolean(window.cuepoint?.getSimilarTracks && window.cuepoint?.getLibraryTrack);
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const canQueue = Boolean(window.cuepoint?.player?.playNext);
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Picks queued from here, kept in place as "Queued" until the shown track changes, so a row never
  // moves under the pointer between the clicks of a double-click. "pending" is a request in flight.
  const [marked, setMarked] = useState<{ trackId: number | null; byId: Readonly<Record<number, "pending" | "queued">> }>({
    trackId: null,
    byId: {},
  });
  const marks = marked.trackId === trackId ? marked.byId : NO_MARKS;
  const keptIds = useMemo(() => Object.keys(marks).map(Number), [marks]);
  // Ids with a request made, held synchronously: a second click of the same gesture arrives
  // before any re-render.
  const asked = useRef({ trackId, ids: new Set<number>() });
  if (asked.current.trackId !== trackId) asked.current = { trackId, ids: new Set<number>() };
  const { ids: upcomingIds, refresh: rereadUpcoming } = useUpcomingIds(active);
  const playingId = usePlayingTrackId();
  const played = usePlayedTracks();
  // Rows read so far, by track id, for the life of this mount.
  const rows = useRef(new Map<number, Promise<RowRead>>());
  // The last seed's answer, so a seed asked about once is not asked about again in this mount.
  const answered = useRef<Extract<Suggested, { status: "ready" }> | null>(null);

  useEffect(() => {
    if (trackId == null || !canRank || !available || !active) return;
    // The same seed again (the tab shown again, a kept page): its answer is already here.
    if (answered.current?.trackId === trackId) {
      setSuggested(answered.current);
      return;
    }
    let current = true;
    // A track passed over on the way to another is never asked about.
    const timer = setTimeout(() => {
      void suggest(trackId)
        .then((answer) => {
          if (answer.status === "ready") answered.current = answer;
          if (current) setSuggested(answer);
        })
        .catch((cause: unknown) => {
          reportIfUnexpected(cause);
          if (current) setSuggested({ trackId, status: "error" });
        });
    }, SUGGEST_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trackId, canRank, available, active]);

  const suggestions = suggested && suggested.trackId === trackId && suggested.status === "ready" ? suggested.suggestions : null;

  useEffect(() => {
    if (trackId == null || suggestions === null || upcomingIds === null) return;
    let current = true;
    // A pick queued from here stays in its place, however the queue reads.
    const kept = new Set(keptIds);
    const eligible = eligibleNextTracks(suggestions, {
      shownId: trackId,
      queuedIds: upcomingIds.filter((id) => !kept.has(id)),
      playingId,
      playedIds: played,
    });
    const cached = (id: number) => {
      let read = rows.current.get(id);
      if (!read) {
        read = readRow(id);
        rows.current.set(id, read);
        // A failed read is tried again next time rather than remembered.
        void read.then((answer) => {
          if (answer.status === "failed") rows.current.delete(id);
        });
      }
      return read;
    };
    void (async () => {
      const candidates: Candidate[] = [];
      let attempted = 0;
      let failed = 0;
      let at = 0;
      while (candidates.length < NEXT_PICKS_COUNT && at < eligible.length) {
        const batch = eligible.slice(at, at + NEXT_PICKS_COUNT - candidates.length);
        at += batch.length;
        const answers = await Promise.all(batch.map((suggestion) => cached(suggestion.track_id)));
        if (!current) return;
        answers.forEach((answer, i) => {
          attempted += 1;
          if (answer.status === "row") candidates.push({ suggestion: batch[i], row: answer.row });
          else if (answer.status === "failed") failed += 1;
        });
      }
      const everyReadFailed = candidates.length === 0 && attempted > 0 && failed === attempted;
      setResolved({
        trackId,
        status: everyReadFailed ? "error" : "ready",
        candidates,
        allExcluded: suggestions.length > 0 && eligible.length === 0,
      });
    })().catch((cause: unknown) => {
      reportIfUnexpected(cause);
      if (current) setResolved({ trackId, status: "error", candidates: [], allExcluded: false });
    });
    return () => {
      current = false;
    };
  }, [trackId, suggestions, upcomingIds, playingId, played, keptIds]);

  const shown = resolved && resolved.trackId === trackId ? resolved : null;
  const failedToSuggest = suggested?.trackId === trackId && suggested.status === "error";

  const mark = useCallback(
    (id: number, status: "pending" | "queued" | null) => {
      setMarked((previous) => {
        const byId = { ...(previous.trackId === trackId ? previous.byId : NO_MARKS) };
        if (status === null) delete byId[id];
        else byId[id] = status;
        return { trackId, byId };
      });
    },
    [trackId],
  );

  const queueNext = useCallback(
    async (row: LibraryTrackRow) => {
      const player = window.cuepoint?.player;
      const id = row.id;
      if (!player?.playNext || id == null || asked.current.ids.has(id)) return;
      asked.current.ids.add(id);
      mark(id, "pending");
      try {
        await player.playNext([toQueueItem(row)]);
      } catch {
        asked.current.ids.delete(id);
        mark(id, null);
        onMessage?.(couldNot("queue that track to play next"));
        return;
      }
      mark(id, "queued");
      onMessage?.(queuedMessage(1, "next"));
    },
    [mark, onMessage],
  );

  const playNow = useCallback(
    async (row: LibraryTrackRow) => {
      // Insert after the current track and skip to it: the rest of the queue stays. These are two
      // calls: the player has no single "insert and jump" action to use.
      const player = window.cuepoint?.player;
      const id = row.id;
      if (!player?.playNext || !player.next || id == null || asked.current.ids.has(id)) return;
      asked.current.ids.add(id);
      mark(id, "pending");
      try {
        await player.playNext([toQueueItem(row)]);
      } catch {
        asked.current.ids.delete(id);
        mark(id, null);
        onMessage?.(couldNot("play that track"));
        return;
      }
      mark(id, "queued");
      try {
        await player.next();
      } catch {
        onMessage?.(couldNot("play that track"));
      }
    },
    [mark, onMessage],
  );

  /** Keep keyboard focus in the section when the pressed button is about to be disabled. */
  const keepFocus = (pressed: HTMLElement) => {
    if (document.activeElement !== pressed) return;
    const buttons = Array.from(sectionRef.current?.querySelectorAll<HTMLButtonElement>(".cp-next-picks__row > .cp-btn") ?? []);
    const at = buttons.indexOf(pressed as HTMLButtonElement);
    const open = (button: HTMLButtonElement) => button !== pressed && !button.disabled;
    const target = buttons.slice(at + 1).find(open) ?? buttons.slice(0, at).reverse().find(open);
    (target ?? headingRef.current)?.focus();
  };

  const onRowDoubleClick = (event: MouseEvent<HTMLElement>, row: LibraryTrackRow) => {
    const hit = (event.target as Element).closest(INTERACTIVE);
    if (hit && hit !== event.currentTarget) return;
    void playNow(row);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>, row: LibraryTrackRow) => {
    if (event.key !== "Enter" || event.target !== event.currentTarget) return;
    event.preventDefault();
    void playNow(row);
  };

  if (trackId == null || !available) return null;

  let body;
  if (!canRank) {
    body = <p className="cp-track-detail__none">Needs a key or BPM to suggest a next track.</p>;
  } else if (failedToSuggest || shown?.status === "error") {
    body = <p className="cp-track-detail__none">{couldNot("load next track suggestions")}</p>;
  } else if (shown === null) {
    // Quiet and the height of the list, so the panel does not jump when the rows arrive.
    body = (
      <ul className="cp-next-picks__list" aria-hidden>
        {Array.from({ length: NEXT_PICKS_COUNT }, (_, i) => (
          <li key={i} className="cp-next-picks__row cp-next-picks__row--ghost">
            <span className="cp-next-picks__cover" />
            <span className="cp-next-picks__text">
              <span className="cp-next-picks__title">&nbsp;</span>
              <span className="cp-next-picks__facts">&nbsp;</span>
            </span>
            <Button variant="secondary" size="sm" disabled tabIndex={-1}>
              Play next
            </Button>
          </li>
        ))}
      </ul>
    );
  } else if (shown.candidates.length === 0) {
    body = (
      <p className="cp-track-detail__none">
        {shown.allExcluded ? "Every close match is already queued or played." : "No close matches in your library."}
      </p>
    );
  } else {
    body = (
      <ul className="cp-next-picks__list">
        {shown.candidates.map(({ suggestion, row }) => (
          <li
            key={suggestion.track_id}
            className="cp-next-picks__row"
            tabIndex={0}
            aria-keyshortcuts="Enter"
            onDoubleClick={(event) => onRowDoubleClick(event, row)}
            onKeyDown={(event) => onRowKeyDown(event, row)}
          >
            <span className="cp-next-picks__cover">
              <RowArtwork row={row} />
            </span>
            <span className="cp-next-picks__text">
              <span className="cp-next-picks__title">{row.title}</span>
              <span className="cp-next-picks__facts">
                <KeyChip value={row.effective_key} />
                <span className="cp-data">{formatBpm(effectiveBpm(row))}</span>
                <Marks suggestion={suggestion} />
              </span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canQueue || marks[suggestion.track_id] !== undefined}
              aria-label={`${marks[suggestion.track_id] === "queued" ? "Queued" : "Play next"}: ${row.title}`}
              onClick={(event) => {
                keepFocus(event.currentTarget);
                void queueNext(row);
              }}
            >
              {marks[suggestion.track_id] === "queued" ? "Queued" : "Play next"}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="cp-next-picks"
      aria-labelledby={titleId}
      // The queue panel can reorder what is upcoming without the player pushing anything new, so
      // the upcoming tracks are read again as the person comes to the section to use it.
      onPointerEnter={rereadUpcoming}
      onFocus={rereadUpcoming}
    >
      <div className="cp-next-picks__head">
        <h3 id={titleId} ref={headingRef} tabIndex={-1} className="cp-next-picks__heading">
          Plays well next
        </h3>
        <span className="cp-next-picks__meta">from your library</span>
      </div>
      {body}
    </section>
  );
}
