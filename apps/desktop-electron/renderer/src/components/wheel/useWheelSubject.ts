import { useEffect, useState } from "react";

import type { CompatibleKeys } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";
import { libraryHasNoKeys } from "../../screens/library/libraryKeys";
import { playingKey, sameItem, selectCurrentItem } from "../player/playerFormat";
import { usePlayerValue } from "../player/playerStore";
import { useSelectedTrack } from "../shell/selectedTrack";
import type { WheelSource } from "./wheelStore";

/** The track the wheel lights: which one, how it is named, and its key. */
export interface WheelSubject {
  kind: "selected" | "playing";
  id: number | string | null;
  title: string | null;
  /** Camelot, or null when the track has no Beatport key (DEC-201). */
  key: string | null;
}

/**
 * Which track the wheel is about (DEC-157): from the header, the selected one else
 * the playing one; from the player bar's key, the playing one. A selected track
 * with no key still wins: the wheel says so rather than showing another track's.
 */
export function useWheelSubject(source: WheelSource): WheelSubject | null {
  const selected = useSelectedTrack();
  const playing = usePlayerValue(selectCurrentItem, sameItem);
  const [looked, setLooked] = useState<{ id: number; title: string } | null>(null);

  const picked = source === "header" ? selected : null;
  const needsTitle =
    picked !== null && !picked.title && typeof picked.id === "number" ? picked.id : null;

  // A page that did not bring a title: the library knows it.
  useEffect(() => {
    if (needsTitle === null) return;
    const read = window.cuepoint?.getLibraryTrack;
    if (!read) return;
    let cancelled = false;
    read({ trackId: needsTitle })
      .then((detail) => {
        if (!cancelled) setLooked({ id: needsTitle, title: detail.track.title });
      })
      .catch((error: unknown) => {
        reportUnexpected(error);
      });
    return () => {
      cancelled = true;
    };
  }, [needsTitle]);

  if (picked) {
    const title =
      picked.title || (looked !== null && looked.id === picked.id ? looked.title : null) || null;
    return { kind: "selected", id: picked.id, title, key: picked.key };
  }
  if (playing) {
    return {
      kind: "playing",
      id: playing.trackId,
      title: playing.title || null,
      key: playingKey(playing),
    };
  }
  return null;
}

/**
 * The keys that mix with `key`, from the engine (DEC-133): the renderer keeps no
 * copy of DEC-096's rule. When the engine cannot answer, only the key itself is
 * lit, which is true and which the user can still click.
 */
export function useCompatibleKeys(key: string | null): ReadonlyMap<string, "same" | "adjacent" | "relative"> {
  const [answer, setAnswer] = useState<{ key: string; wheel: CompatibleKeys["wheel"] } | null>(null);

  useEffect(() => {
    if (key === null) return;
    const ask = window.cuepoint?.getCompatibleKeys;
    let cancelled = false;
    const alone: CompatibleKeys["wheel"] = [{ code: key, relation: "same" }];
    if (!ask) {
      setAnswer({ key, wheel: alone });
      return;
    }
    ask({ key })
      .then((result) => {
        if (!cancelled) setAnswer({ key, wheel: result.wheel });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key, wheel: alone });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key === null || answer === null || answer.key !== key) return EMPTY;
  return new Map(answer.wheel.map((entry) => [entry.code, entry.relation]));
}

const EMPTY: ReadonlyMap<string, "same" | "adjacent" | "relative"> = new Map();

/** Whether no track in the library has a key (DEC-201), asked only while `ask` is true. */
export function useLibraryHasNoKeys(ask: boolean): boolean {
  const [none, setNone] = useState(false);
  useEffect(() => {
    if (!ask) return;
    let cancelled = false;
    libraryHasNoKeys()
      .then((answer) => {
        if (!cancelled) setNone(answer === true);
      })
      .catch((error: unknown) => {
        reportUnexpected(error);
      });
    return () => {
      cancelled = true;
    };
  }, [ask]);
  return ask && none;
}
