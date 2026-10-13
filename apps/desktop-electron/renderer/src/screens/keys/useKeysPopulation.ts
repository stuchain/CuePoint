/**
 * The Keys page's counts, asked of the engine (PAGES-16).
 *
 * One read per set of sources: `POST /api/v1/library/keys/population`. A different set of
 * sources is a different question, so the answer to the old one is dropped at once rather than
 * left on screen under the new tick, and an answer that arrives late for a question no one is
 * asking any more is ignored.
 *
 * Nothing is asked until `ready` (the page has read its source trees and pruned what a refresh
 * removed). A source the engine still says is gone (`SOURCE_NOT_FOUND`, a refusal rather than a
 * fault) is handed to `onSourceGone`; when that drops it the sources change and the question is
 * asked again, with no report.
 */
import { useEffect, useMemo, useRef } from "react";

import type { KeySource, KeysPopulation } from "../../api/cuepointBridge.types";
import { bridgeErrorFields } from "../../api/bridgeError";
import { keysPopulation, useOnReadError, useSharedRead } from "../../api/sharedReads";
import { reportUnexpected } from "../../reporting/reporting";

type PopulationStatus = "loading" | "ready" | "error" | "unavailable";

interface KeysPopulationState {
  status: PopulationStatus;
  data: KeysPopulation | null;
  retry: () => void;
}

/**
 * Read through the shared cache (C19d), one entry per set of sources: a page shown again
 * has its counts at once and they are read again when the library announces a change.
 * `reloadToken` is the page's own edit; a new one reads now.
 */
export function useKeysPopulation(
  sources: readonly KeySource[],
  reloadToken: number,
  ready: boolean,
  onSourceGone: (message: string) => boolean,
): KeysPopulationState {
  const asked = JSON.stringify(sources);
  const descriptor = useMemo(() => keysPopulation(JSON.parse(asked) as KeySource[]), [asked]);
  const read = useSharedRead(descriptor, ready);
  const { refresh } = read;

  const gone = useRef(onSourceGone);
  useEffect(() => {
    gone.current = onSourceGone;
  });

  // A refusal about a source that is gone drops it (and the question is asked again, with no
  // report); any other failure is reported. Each failure once: the cache keeps it beside the
  // old counts, and the page shown again must not handle it again.
  useOnReadError(read.error, (cause) => {
    const vanished = bridgeErrorFields(cause).code === "SOURCE_NOT_FOUND";
    if (vanished && gone.current(String((cause as { message?: unknown } | null)?.message ?? ""))) return;
    reportUnexpected(cause);
  });

  const seen = useRef(reloadToken);
  useEffect(() => {
    if (seen.current === reloadToken) return;
    seen.current = reloadToken;
    refresh();
  }, [reloadToken, refresh]);

  const data = read.value ?? null;
  const status: PopulationStatus = read.unavailable
    ? "unavailable"
    : data
      ? "ready"
      : read.error !== undefined && !read.loading
        ? "error"
        : "loading";
  return { status, data, retry: refresh };
}
