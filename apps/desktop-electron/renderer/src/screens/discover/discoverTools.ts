/**
 * What the Discover page hands its two parts (DISCOVER-10).
 *
 * The page owns everything that outlives a tab: `options` (read once, when the
 * page opens), Beatport's state, and the push, which is a job the page follows
 * whichever tab started it. A part only asks for these.
 */
import type {
  BeatportPlaylistRequest,
  DiscoverBeatportState,
  DiscoverOptions,
  DiscoverRefusal,
} from "../../api/cuepointBridge.types";
import type { ToastVariant } from "../../components/Toast";

export interface DiscoverTools {
  options: DiscoverOptions;
  beatportState: DiscoverBeatportState;
  /** True while a push is running: another would be refused. */
  pushing: boolean;
  push: (request: BeatportPlaylistRequest) => Promise<DiscoverRefusal | null>;
  notify: (text: string, tone?: ToastVariant) => void;
}

/** The message for a bridge this build does not have. */
export const NO_ENGINE = "Discover needs the desktop app with CuePoint's library service running.";
