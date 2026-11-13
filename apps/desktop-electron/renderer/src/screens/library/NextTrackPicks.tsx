/**
 * "Plays well next" in Track details (Overview): the three library tracks that mix best out of the
 * track shown, each with a visible Play next button.
 *
 * Data is the Similar page's own: `getSimilarTracks` ranks by the rule Prepare uses for a Set's
 * next track, and each suggestion's row is read with `getLibraryTrack`. Asked once per shown track;
 * a queue change only re-filters what was read (`pickNextTracks`). Nothing here is hover-only:
 * Play next is a button and a double-click plays the row now.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { LibraryTrackRow, SimilarTrack } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { usePlayedTracks, usePlayingTrackId } from "../../components/player/playedTracks";
import { useQueueWindow } from "../../components/player/useQueueWindow";
import { KeyChip } from "../../components/wheel/KeyChip";
import { formatBpm } from "../../components/format/bpm";
import { couldNot } from "../../format/words";
import { reportUnexpected } from "../../reporting/reporting";
import { reasonTokens, tempoDeltaText } from "../discover/reasonTokens";
import { describeSimilarReason } from "../discover/similarReasons";
import { RowArtwork } from "./libraryCells";
import { DEFAULT_LIBRARY_QUERY } from "./libraryQuery";
import { NEXT_PICKS_ASK, hasKeyOrBpm, pickNextTracks } from "./nextPicksRule";
import { useLibraryPlayback } from "./useLibraryPlayback";
import "./NextTrackPicks.css";

/** How much of the queue is read to tell what is already in it. */
const QUEUE_READ = 500;

interface Candidate {
  suggestion: SimilarTrack;
  row: LibraryTrackRow;
}

type Read =
  | { trackId: number; status: "ready"; candidates: Candidate[] }
  | { trackId: number; status: "error" };

async function read(trackId: number): Promise<Read> {
  const bridge = window.cuepoint;
  if (!bridge?.getSimilarTracks || !bridge.getLibraryTrack) return { trackId, status: "error" };
  const details = bridge.getLibraryTrack;
  const answer = await bridge.getSimilarTracks({ track_id: trackId, limit: NEXT_PICKS_ASK });
  if (answer.refusal) return { trackId, status: "error" };
  const rows = await Promise.all(
    answer.value.suggestions.map((suggestion) => details({ trackId: suggestion.track_id }).catch(() => null)),
  );
  const candidates: Candidate[] = [];
  answer.value.suggestions.forEach((suggestion, at) => {
    const row = rows[at]?.track;
    // A track gone since the answer was made is left out, not drawn as a hole.
    if (row && row.id != null) candidates.push({ suggestion, row });
  });
  return { trackId, status: "ready", candidates };
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
          <span className="cp-next-picks__mark cp-data" aria-label={mark.words || undefined}>
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
  const canRank = hasKeyOrBpm(track);
  const available = Boolean(window.cuepoint?.getSimilarTracks && window.cuepoint?.getLibraryTrack);
  const [result, setResult] = useState<Read | null>(null);
  const playback = useLibraryPlayback({ query: DEFAULT_LIBRARY_QUERY, onMessage });
  const queue = useQueueWindow(QUEUE_READ);
  const playingId = usePlayingTrackId();
  const played = usePlayedTracks();

  useEffect(() => {
    if (trackId == null || !canRank || !available) return;
    let current = true;
    void read(trackId)
      .then((answer) => {
        if (current) setResult(answer);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (current) setResult({ trackId, status: "error" });
      });
    return () => {
      current = false;
    };
  }, [trackId, canRank, available]);

  const queuedIds = useMemo(
    () => queue.items.map((item) => item.trackId).filter((id): id is number => id != null),
    [queue.items],
  );
  const shown = result && result.trackId === trackId ? result : null;
  const picks = useMemo(() => {
    if (shown?.status !== "ready") return [];
    const byId = new Map(shown.candidates.map((candidate) => [candidate.suggestion.track_id, candidate]));
    return pickNextTracks(
      shown.candidates.map((candidate) => candidate.suggestion),
      { shownId: trackId, queuedIds, playingId, playedIds: played },
    ).flatMap((suggestion) => byId.get(suggestion.track_id) ?? []);
  }, [shown, trackId, queuedIds, playingId, played]);

  const playNow = useCallback((row: LibraryTrackRow) => void playback.playRows([row]), [playback]);

  if (trackId == null || !available) return null;

  let body;
  if (!canRank) {
    body = <p className="cp-track-detail__none">Needs a key or BPM to suggest a next track.</p>;
  } else if (shown === null) {
    // Quiet and the height of the list, so the panel does not jump when the rows arrive.
    body = <div className="cp-next-picks__placeholder" aria-hidden />;
  } else if (shown.status === "error") {
    body = <p className="cp-track-detail__none">{couldNot("load next track suggestions")}</p>;
  } else if (picks.length === 0) {
    body = <p className="cp-track-detail__none">No close matches in your library.</p>;
  } else {
    body = (
      <ul className="cp-next-picks__list">
        {picks.map(({ suggestion, row }) => (
          <li key={suggestion.track_id} className="cp-next-picks__row" onDoubleClick={() => playNow(row)}>
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
    <section className="cp-next-picks" aria-labelledby="cp-next-picks-title">
      <div className="cp-next-picks__head">
        <h3 id="cp-next-picks-title" className="cp-next-picks__heading">
          Plays well next
        </h3>
        <span className="cp-next-picks__meta">from your library</span>
      </div>
      {body}
    </section>
  );
}
