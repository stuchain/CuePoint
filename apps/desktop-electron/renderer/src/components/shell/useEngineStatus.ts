import type { EngineStatus } from "../../api/cuepointBridge.types";
import { useEngineOnline } from "../../api/engineOnline";

/**
 * Live engine status, read from the shared online store.
 *
 * The poll itself lives in `api/engineOnline.ts` so the strip, the offline
 * banner and the dimmed page all see one answer. This stays as the strip's
 * reader: `null` until the first read, or with no bridge at all.
 */
export function useEngineStatus(): EngineStatus | null {
  return useEngineOnline().status;
}
