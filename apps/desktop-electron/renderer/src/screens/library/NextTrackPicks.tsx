/**
 * "Plays well next" in Track details (Overview): the three library tracks that mix best out of the
 * track shown, each with a visible Play next button.
 *
 * Data is the Similar page's own: `getSimilarTracks` ranks by the rule Prepare uses for a Set's
 * next track. Asked once per shown track. Rows are read with `getLibraryTrack` lazily: only for the
 * suggestions that pass the filter (`eligibleNextTracks`) and only until three are shown, cached by
 * id for the life of the mount, so a queue change re-filters without re-reading. Only the
 * upcoming tracks (the next 50 after the current one) count as queued. Nothing here is
 * hover-only: Play next is a button and a double-click plays the row now (inserted next, then
 * skipped to, so the queue is kept).
 */
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";

import type { LibraryTrackRow, PlayerSnapshot, SimilarTrack } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { usePlayedTracks, usePlayingTrackId } from "../../components/player/playedTracks";
import { selectQueueRevision } from "../../components/player/playerFormat";
import { usePlayerValue } from "../../components/player/playerStore";
import { KeyChip } from "../../components/wheel/KeyChip";
import { formatBpm } from "../../components/format/bpm";
import { couldNot } from "../../format/words";
import { reportUnexpected } from "../../reporting/reporting";
import { reasonTokens, tempoDeltaText } from "../discover/reasonTokens";
import { describeSimilarReason } from "../discover/similarReasons";
import { RowArtwork } from "./libraryCells";
import { DEFAULT_LIBRARY_QUERY } from "./libraryQuery";
import { NEXT_PICKS_ASK, NEXT_PICKS_COUNT, eligibleNextTracks, hasKeyOrBpm } from "./nextPicksRule";
import { toQueueItem, useLibraryPlayback } from "./useLibraryPlayback";
import "./NextTrackPicks.css";

/** How many tracks after the current one count as "already queued". */
const UPCOMING_COUNT = 50;

/** Where the playing track sits in play order, -1 for none. */
function selectCurrentIndex(state: PlayerSnapshot | null): number {
  return state?.queue.currentIndex ?? -1;
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

type Resolved = { trackId: number; status: "ready" | "error"; candidates: Candidate[] };

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

const NO_IDS: readonly number[] = [];

/**
 * The library ids of the next tracks in play order after the current one, or null while they are
 * being read. A small slice, re-read only when the queue changes shape.
 */
function useUpcomingIds(): readonly number[] | null {
  const revision = usePlayerValue(selectQueueRevision);
  const currentIndex = usePlayerValue(selectCurrentIndex);
  const [read, setRead] = useState<readonly number[] | null>(null);

  useEffect(() => {
    if (revision === null) return;
    let current = true;
    const queueWindow = window.cuepoint?.player?.queueWindow;
    if (!queueWindow) {
      setRead(NO_IDS);
      return;
    }
    queueWindow(currentIndex + 1, UPCOMING_COUNT)
      .then((page) => {
        if (current) setRead(page.items.map((item) => item.trackId).filter((id): id is number => id != null));
      })
      .catch(() => {
        if (current) setRead(NO_IDS);
      });
    return () => {
      current = false;
    };
  }, [revision, currentIndex]);

  // No player state yet: there is no queue to be in.
  return revision === null ? NO_IDS : read;
}

/** The marks of one suggestion, each with its sentence for a screen reader and the hover. */
function Marks({ suggestion }: { suggestion: SimilarTrack }) {
  const tokens = reasonTokens(suggestion.reasons);
  const sentence = (component: string) =>
    suggestion.reasons
      .filter((reason) => reason.component === component)
      .map(describeSimilarReason)
      .join(" ");
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
  onMessage,
}: {
  /** The track Details shows. */
  track: LibraryTrackRow;
  onMessage?: (message: string) => void;
}) {
  const trackId = track.id;
  const titleId = useId();
  const canRank = hasKeyOrBpm(track);
  const available = Boolean(window.cuepoint?.getSimilarTracks && window.cuepoint?.getLibraryTrack);
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const playback = useLibraryPlayback({ query: DEFAULT_LIBRARY_QUERY, onMessage });
  const upcomingIds = useUpcomingIds();
  const playingId = usePlayingTrackId();
  const played = usePlayedTracks();
  // Rows read so far, by track id, for the life of this mount.
  const rows = useRef(new Map<number, Promise<RowRead>>());

  useEffect(() => {
    if (trackId == null || !canRank || !available) return;
    let current = true;
    void suggest(trackId)
      .then((answer) => {
        if (current) setSuggested(answer);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (current) setSuggested({ trackId, status: "error" });
      });
    return () => {
      current = false;
    };
  }, [trackId, canRank, available]);

  const suggestions = suggested && suggested.trackId === trackId && suggested.status === "ready" ? suggested.suggestions : null;

  useEffect(() => {
    if (trackId == null || suggestions === null || upcomingIds === null) return;
    let current = true;
    const eligible = eligibleNextTracks(suggestions, { shownId: trackId, queuedIds: upcomingIds, playingId, playedIds: played });
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
      setResolved({ trackId, status: everyReadFailed ? "error" : "ready", candidates });
    })().catch((cause: unknown) => {
      reportUnexpected(cause);
      if (current) setResolved({ trackId, status: "error", candidates: [] });
    });
    return () => {
      current = false;
    };
  }, [trackId, suggestions, upcomingIds, playingId, played]);

  const shown = resolved && resolved.trackId === trackId ? resolved : null;
  const failedToSuggest = suggested?.trackId === trackId && suggested.status === "error";

  const playNow = useCallback(
    async (row: LibraryTrackRow) => {
      // Insert after the current track and skip to it: the rest of the queue stays.
      const player = window.cuepoint?.player;
      if (!player?.playNext || !player.next) return;
      try {
        await player.playNext([toQueueItem(row)]);
        await player.next();
      } catch {
        onMessage?.(couldNot("play that track"));
      }
    },
    [onMessage],
  );

  const onRowDoubleClick = (event: MouseEvent<HTMLElement>, row: LibraryTrackRow) => {
    if ((event.target as Element).closest(INTERACTIVE)) return;
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
    body = <div className="cp-next-picks__placeholder" aria-hidden />;
  } else if (shown.candidates.length === 0) {
    body = <p className="cp-track-detail__none">No close matches in your library.</p>;
  } else {
    body = (
      <ul className="cp-next-picks__list">
        {shown.candidates.map(({ suggestion, row }) => (
          <li
            key={suggestion.track_id}
            className="cp-next-picks__row"
            onDoubleClick={(event) => onRowDoubleClick(event, row)}
          >
            <span className="cp-next-picks__cover">
              <RowArtwork row={row} />
            </span>
            <span className="cp-next-picks__text">
              <span className="cp-next-picks__title">{row.title}</span>
              <span className="cp-next-picks__facts">
                <KeyChip value={row.effective_key} />
                <span className="cp-data">{formatBpm(row.bpm)}</span>
                <Marks suggestion={suggestion} />
              </span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!playback.available}
              aria-label={`Play next: ${row.title}`}
              onClick={() => void playback.playNext([row])}
            >
              Play next
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="cp-next-picks" aria-labelledby={titleId}>
      <div className="cp-next-picks__head">
        <h3 id={titleId} className="cp-next-picks__heading">
          Plays well next
        </h3>
        <span className="cp-next-picks__meta">from your library</span>
      </div>
      {body}
    </section>
  );
}
