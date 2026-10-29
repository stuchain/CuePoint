/**
 * Every view reads the library again (HARDEN-01): after a restore the library under the window is a
 * different one. This is the signal an import's end already gives (every cached read of the
 * library, waveforms, Discover and settings goes stale, and the mounted screens read again), plus a
 * fresh look at the running work and at the background process, which came back up.
 */
import { refreshEngineStatus } from "./engineOnline";
import { invalidateReads } from "./engineReads";
import { pollActiveJobsNow } from "./jobsStore";
import { announceLibraryChange } from "./libraryChanges";

export function reloadEveryView(): void {
  invalidateReads(["library", "waveforms", "discover", "settings"]);
  announceLibraryChange();
  pollActiveJobsNow();
  refreshEngineStatus();
}
