import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WebContents } from "electron";
import {
  EngineClient,
  type ActivityFeed,
  type EngineJobList,
  type LibraryBrowseParams,
  type LibraryFacet,
  type LibraryFilterVocabulary,
  type LibraryImportStarted,
  type LibraryPlaylistTree,
  type LibraryRefreshStarted,
  type LibrarySearchResponse,
  type LibrarySummary,
  type ArtworkSize,
  type LibraryTrackDetail,
  type FilterRuleSet,
  type BatchOperation,
  type BatchOutcome,
  type BatchSelection,
  type CollectionAdded,
  type CollectionEntry,
  type CollectionEntryPage,
  type CollectionNode,
  type CollectionSubtree,
  type CollectionTree,
  type FrozenCollection,
  type Tag,
  type TagVocabulary,
  type TrackHistory,
  type TrackMetadata,
  type ApplyOutcome,
  type ArtworkScanStarted,
  type AttemptCandidates,
  type BatchRevertOutcome,
  type DecisionOutcome,
  type DuplicateGroup,
  type DuplicateGroupList,
  type DuplicateScanStarted,
  type FieldRevert,
  type FileCheckStarted,
  type LibraryHealth,
  type LibraryTrackRow,
  type MatchStarted,
  type ResumableMatches,
  type ReviewExportResult,
  type RekordboxExportHistory,
  type RekordboxExportPreviewAnswer,
  type RekordboxExportStartAnswer,
  type TagPreviewOutcome,
  type TagRestoreStarted,
  type TagWriteRecord,
  type TagWriteStarted,
  type TrackFolder,
  type TrackMatches,
} from "./engineClient";
import { getBundledEnginePath, shouldUseBundledEngine } from "./engineLaunch";
import { stopProcessTree } from "./processTree";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: works from source (`electron/`) and bundle (`electron-dist/`). */
const REPO_ROOT = path.resolve(__dirname, "../../..");

function resolveDevelopmentPython(): string {
  if (process.env.CUEPOINT_PYTHON) return process.env.CUEPOINT_PYTHON;

  const localPython =
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python");
  if (fs.existsSync(localPython)) return localPython;

  return process.platform === "win32" ? "python" : "python3";
}

export interface EngineStatus {
  connected: boolean;
  version?: string;
  sessionId?: string;
  error?: string;
  /**
   * True while a bounded auto-restart is in progress (DEC-028), so the status
   * strip can say "reconnecting" rather than "offline" — they mean different
   * things to someone deciding whether to act.
   */
  reconnecting?: boolean;
  /** Restart attempts made since the engine last ran healthily. */
  restartAttempts?: number;
  /**
   * True while the engine has been spawned but has not yet answered `/health`.
   *
   * Its own state, because "not connected yet" and "not connected any more"
   * ask different things of the person reading the strip: the first is worth
   * waiting out, the second is worth acting on. A packaged macOS engine takes
   * about ten seconds to answer on a cold start (see `HEALTH_TIMEOUT_MS`), and
   * for all of it `getStatus()` used to report `connected: true` — every call
   * made in that window failed while the strip said the engine was there.
   */
  starting?: boolean;
}

/**
 * How long the engine gets to answer `/health` before it is called dead.
 *
 * This was 5 seconds (20 attempts, 250ms apart) and a packaged macOS engine
 * does not cold-start in five seconds. It is a PyInstaller one-file build: the
 * first run of a given build unpacks ~76MB into a temporary directory and
 * imports the whole engine before it can bind a socket, which measured **9.7s**
 * on an M5 Pro — so every engine call in the first ten seconds after launch
 * failed, on the run that matters most, the first one after installing.
 *
 * `scripts/build_engine_sidecar.py` learned this already and allows 90s, with
 * the same reasoning written next to it; the supervisor never did. The number
 * is deliberately generous and matches it: this bound exists to catch an engine
 * that never starts, not to police how long starting takes. The window does
 * not wait on it — `starting` tells the UI what is happening meanwhile — but
 * engine requests do (see `readyClient()`), so the first screen's data arrives
 * when the engine can give it rather than failing before it could.
 */
export const HEALTH_TIMEOUT_MS = 90_000;

/** How often `/health` is asked while waiting. */
export const HEALTH_POLL_MS = 250;

/**
 * How hard CuePoint tries to bring a dead engine back (DEC-028).
 *
 * Bounded on purpose. Unlimited restarts would hide a crash-looping engine
 * behind a flickering status; three attempts recover the transient case and
 * then stop and say so, leaving the user a Restart engine control.
 */
export const MAX_RESTART_ATTEMPTS = 3;
export const RESTART_BACKOFF_MS = [1000, 2000, 4000];

export class EngineSupervisor {
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private token: string | null = null;
  private sessionId: string = crypto.randomUUID();
  private version: string | undefined;
  /**
   * One SSE stream per renderer per job, shared by everyone watching it.
   *
   * Refcounted, and that is the whole point. Before LIBRARY-11 each subscribe
   * cancelled any earlier one for the same job, because there was only ever one
   * watcher. Now the status strip follows whatever job is running *and* the
   * Library page follows the job it started — the same job, from the same
   * renderer — and the second subscriber was silently killing the first. The
   * symptom was a page waiting forever for a job the engine had already
   * finished.
   */
  private jobStreams = new Map<string, { abort: AbortController; refs: number }>();
  private restartAttempts = 0;
  private reconnecting = false;
  /**
   * Whether `/health` has answered for the child now running.
   *
   * A spawned child is not a reachable engine, and `getStatus()` used to treat
   * the two as one. Set only by a successful health poll, and cleared whenever
   * a child is started or lost.
   */
  private healthy = false;
  /**
   * The start in flight, if any; requests made meanwhile wait for it.
   *
   * The window no longer waits for the engine, so the first screen asks for
   * its data while the engine is still starting. Refused then, the Library
   * read its summary as absent and said "No collection imported yet" to a
   * library that was there — and, having asked once, never asked again.
   */
  private startup: Promise<EngineStatus> | null = null;
  /** Set while `stop()` is deliberate, so quitting is not treated as a crash. */
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;

  getRepoRoot(): string {
    return REPO_ROOT;
  }

  /**
   * Start the engine, and hold every request made until it has answered.
   *
   * Deliberately not `async`: the start is recorded before this returns, so
   * a window created straight after it cannot ask for anything in between.
   */
  start(): Promise<EngineStatus> {
    const run = this.launch();
    this.startup = run;
    void run
      .catch(() => undefined)
      .finally(() => {
        // A restart may have replaced it meanwhile; that one is still running.
        if (this.startup === run) this.startup = null;
      });
    return run;
  }

  private async launch(): Promise<EngineStatus> {
    // `stop()` kills the current child; that exit is ours, not a crash.
    this.stopping = true;
    await this.stop();
    this.stopping = false;
    this.healthy = false;
    this.port = await this.pickPort();
    this.token = crypto.randomBytes(24).toString("hex");

    const baseEnv = {
      ...process.env,
      CUEPOINT_HOST: "127.0.0.1",
      CUEPOINT_PORT: String(this.port),
      CUEPOINT_TOKEN: this.token,
      CUEPOINT_SESSION_ID: this.sessionId,
      CUEPOINT_HEADLESS: "1",
      // This process, not the engine's parent: a packaged engine's parent is
      // its own bootloader. The engine ends itself when this process has gone,
      // however it went (EXPORT-07, `parent_watch.py`).
      CUEPOINT_PARENT_PID: String(process.pid),
    };

    if (shouldUseBundledEngine()) {
      const enginePath = getBundledEnginePath();
      if (!fs.existsSync(enginePath)) {
        return {
          connected: false,
          error: `Bundled engine not found: ${enginePath}`,
        };
      }
      this.child = spawn(enginePath, [], {
        cwd: path.dirname(enginePath),
        env: baseEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      const python = resolveDevelopmentPython();
      this.child = spawn(python, ["-m", "cuepoint.engine"], {
        cwd: REPO_ROOT,
        env: {
          ...baseEnv,
          PYTHONPATH: path.join(REPO_ROOT, "src"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    this.child.on("exit", () => {
      this.child = null;
      this.healthy = false;
      // A deliberate stop is not a crash, and neither is an exit during a
      // restart we are already running.
      if (this.stopping || this.reconnecting) return;
      void this.scheduleRestart();
    });

    const ok = await this.pollHealth();
    if (!ok) {
      return {
        connected: false,
        error: "Engine health check failed or timed out",
      };
    }
    return this.getStatus();
  }

  /**
   * Bring a crashed engine back, up to `MAX_RESTART_ATTEMPTS` times (DEC-028).
   *
   * Each attempt waits longer than the last: an engine that dies instantly on
   * start would otherwise be respawned as fast as the machine allows.
   */
  private async scheduleRestart(): Promise<void> {
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.reconnecting = false;
      return;
    }
    const delay = RESTART_BACKOFF_MS[this.restartAttempts] ?? 4000;
    this.restartAttempts += 1;
    this.reconnecting = true;

    await new Promise<void>((resolve) => {
      this.restartTimer = setTimeout(resolve, delay);
    });
    this.restartTimer = null;
    if (this.stopping) {
      this.reconnecting = false;
      return;
    }

    const status = await this.start();
    this.reconnecting = false;
    if (status.connected) {
      // Healthy again: the next crash gets a full set of attempts of its own,
      // rather than inheriting the count from an unrelated failure.
      this.restartAttempts = 0;
    } else if (this.restartAttempts < MAX_RESTART_ATTEMPTS) {
      void this.scheduleRestart();
    }
  }

  /**
   * Start the engine again at the user's request, from the status strip.
   *
   * Resets the attempt counter: this is a deliberate act, not a continuation
   * of the automatic attempts that already gave up.
   */
  async restart(): Promise<EngineStatus> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartAttempts = 0;
    this.reconnecting = false;
    return this.start();
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    const proc = this.child;
    this.child = null;
    // The tree, not the process: a packaged engine on Windows is a bootloader
    // whose child outlived it, holding the port and the database (CLEAN-14).
    stopProcessTree(proc);
    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      setTimeout(() => {
        stopProcessTree(proc, { force: true });
        resolve();
      }, 2000);
    });
  }

  getStatus(): EngineStatus {
    if (!this.port || !this.child) {
      return {
        connected: false,
        error: this.reconnecting ? "Reconnecting" : "Engine not running",
        reconnecting: this.reconnecting,
        restartAttempts: this.restartAttempts,
      };
    }
    // A child that has not answered `/health` yet is not something to send a
    // request to, and saying so is the difference between a strip a person can
    // trust and one that was connected for ten seconds before anything worked.
    if (!this.healthy) {
      return {
        connected: false,
        starting: true,
        error: "Starting",
        reconnecting: this.reconnecting,
        restartAttempts: this.restartAttempts,
      };
    }
    return {
      connected: true,
      version: this.version,
      sessionId: this.sessionId,
      reconnecting: false,
      restartAttempts: this.restartAttempts,
    };
  }

  private client(): EngineClient {
    if (!this.port || !this.token) {
      throw new Error("Engine not running");
    }
    return new EngineClient(this.port, this.token, this.sessionId);
  }

  /**
   * A client, once any start in flight has finished.
   *
   * Waiting is bounded by the start itself — `HEALTH_TIMEOUT_MS`, or sooner
   * when the child exits — and a start that fails leaves `client()` to report
   * it, as it would have done without waiting.
   */
  private async readyClient(): Promise<EngineClient> {
    while (this.startup) {
      await this.startup.catch(() => undefined);
    }
    return this.client();
  }

  async searchLibrary(params: {
    q: string;
    limit?: number;
    offset?: number;
  }): Promise<LibrarySearchResponse> {
    return (await this.readyClient()).searchLibrary(params);
  }

  async browseLibrary(params: LibraryBrowseParams): Promise<LibrarySearchResponse> {
    return (await this.readyClient()).browseLibrary(params);
  }

  async getLibraryPlaylists(): Promise<LibraryPlaylistTree> {
    return (await this.readyClient()).getLibraryPlaylists();
  }

  async getLibraryFacet(params: {
    field: string;
    q?: string;
    playlistId?: number | null;
    filters?: FilterRuleSet | null;
    limit?: number;
    scope?: "collection" | "smart";
    collectionId?: number | null;
  }): Promise<LibraryFacet> {
    return (await this.readyClient()).getLibraryFacet(params);
  }

  async getLibraryFilterFields(): Promise<LibraryFilterVocabulary> {
    return (await this.readyClient()).getLibraryFilterFields();
  }

  async getLibraryTrack(params: { trackId: number }): Promise<LibraryTrackDetail> {
    return (await this.readyClient()).getLibraryTrack(params);
  }

  async getTrackArtwork(params: {
    trackId: number;
    size: ArtworkSize;
  }): Promise<Uint8Array | null> {
    return (await this.readyClient()).getTrackArtwork(params);
  }

  // CuePoint's own organization (ORG-08). One forward per client method:
  // `main.ts` calls this facade, and a method missing here is an
  // `undefined is not a function` in the packaged app that nothing
  // type-checks — which is why the contract test enumerates them.

  async getCollections(): Promise<CollectionTree> {
    return (await this.readyClient()).getCollections();
  }

  async getCollectionEntries(params: { collectionId: number; limit?: number; offset?: number }): Promise<CollectionEntryPage> {
    return (await this.readyClient()).getCollectionEntries(params);
  }

  async createCollection(params: { kind: "folder" | "collection"; name: string; parent_id?: number | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).createCollection(params);
  }

  async renameCollection(params: { id: number; name: string }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).renameCollection(params);
  }

  async moveCollection(params: { id: number; parent_id?: number | null; position?: number | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).moveCollection(params);
  }

  async deleteCollection(params: { id: number }): Promise<{ removed: CollectionSubtree }> {
    return (await this.readyClient()).deleteCollection(params);
  }

  async previewCollectionDelete(params: { id: number }): Promise<{ removes: CollectionSubtree }> {
    return (await this.readyClient()).previewCollectionDelete(params);
  }

  async addTracksToCollection(params: { collection_id: number; track_ids: number[] }): Promise<CollectionAdded> {
    return (await this.readyClient()).addTracksToCollection(params);
  }

  async insertTrackInCollection(params: { collection_id: number; track_id: number; position: number }): Promise<{ entry: CollectionEntry }> {
    return (await this.readyClient()).insertTrackInCollection(params);
  }

  async removeCollectionEntries(params: { entry_ids: number[] }): Promise<{ removed: number }> {
    return (await this.readyClient()).removeCollectionEntries(params);
  }

  async reorderCollectionEntry(params: { entry_id: number; position: number }): Promise<{ entry: CollectionEntry }> {
    return (await this.readyClient()).reorderCollectionEntry(params);
  }

  async saveSmartCollection(params: { name: string; rules: FilterRuleSet; parent_id?: number | null; sort?: string | null; dir?: "asc" | "desc" | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).saveSmartCollection(params);
  }

  async updateSmartCollection(params: { id: number; rules: FilterRuleSet; sort?: string | null; dir?: "asc" | "desc" | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).updateSmartCollection(params);
  }

  async duplicateSmartCollection(params: { id: number; name?: string | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).duplicateSmartCollection(params);
  }

  async freezeSmartCollection(params: { id: number; name?: string | null }): Promise<FrozenCollection> {
    return (await this.readyClient()).freezeSmartCollection(params);
  }

  async getTags(): Promise<TagVocabulary> {
    return (await this.readyClient()).getTags();
  }

  async createTag(params: { name: string; category?: string | null; colour?: string | null }): Promise<{ tag: Tag }> {
    return (await this.readyClient()).createTag(params);
  }

  async updateTag(params: { id: number; name?: string; category?: string | null; colour?: string | null }): Promise<{ tag: Tag }> {
    return (await this.readyClient()).updateTag(params);
  }

  async deleteTag(params: { id: number }): Promise<{ untagged: number }> {
    return (await this.readyClient()).deleteTag(params);
  }

  async mergeTags(params: { source_id: number; target_id: number }): Promise<{ moved: number }> {
    return (await this.readyClient()).mergeTags(params);
  }

  async assignTag(params: { tag_id: number; track_ids: number[] }): Promise<{ changed: number; track_ids: number[] }> {
    return (await this.readyClient()).assignTag(params);
  }

  async unassignTag(params: { tag_id: number; track_ids: number[] }): Promise<{ changed: number; track_ids: number[] }> {
    return (await this.readyClient()).unassignTag(params);
  }

  async setTrackMetadata(params: { trackId: number; rating?: number | null; favorite?: boolean; notes?: string | null }): Promise<{ metadata: TrackMetadata }> {
    return (await this.readyClient()).setTrackMetadata(params);
  }

  async getTrackHistory(params: { trackId: number; limit?: number }): Promise<TrackHistory> {
    return (await this.readyClient()).getTrackHistory(params);
  }

  async applyBatch(params: { selection: BatchSelection; operation: BatchOperation }): Promise<BatchOutcome> {
    return (await this.readyClient()).applyBatch(params);
  }

  // Clean (CLEAN-11). One forward per client method, for ORG-08's reason: a
  // method missing here is a runtime failure nothing type-checks.

  async startCleanMatch(params: Parameters<EngineClient["startCleanMatch"]>[0]): Promise<MatchStarted> {
    return (await this.readyClient()).startCleanMatch(params);
  }

  async resumeCleanMatch(params: { job_id: string }): Promise<MatchStarted> {
    return (await this.readyClient()).resumeCleanMatch(params);
  }

  async getResumableMatches(): Promise<ResumableMatches> {
    return (await this.readyClient()).getResumableMatches();
  }

  async getTrackMatches(params: { trackId: number }): Promise<TrackMatches> {
    return (await this.readyClient()).getTrackMatches(params);
  }

  async getMatchCandidates(params: { attemptId: number }): Promise<AttemptCandidates> {
    return (await this.readyClient()).getMatchCandidates(params);
  }

  async getTrackFolder(params: { trackId: number }): Promise<TrackFolder> {
    return (await this.readyClient()).getTrackFolder(params);
  }

  async decideMatch(params: Parameters<EngineClient["decideMatch"]>[0]): Promise<DecisionOutcome> {
    return (await this.readyClient()).decideMatch(params);
  }

  async applyMatch(params: Parameters<EngineClient["applyMatch"]>[0]): Promise<ApplyOutcome> {
    return (await this.readyClient()).applyMatch(params);
  }

  async setTrackOverrides(
    params: Parameters<EngineClient["setTrackOverrides"]>[0],
  ): Promise<{ track: LibraryTrackRow }> {
    return (await this.readyClient()).setTrackOverrides(params);
  }

  async revertChange(params: { change_id: number }): Promise<{ revert: FieldRevert }> {
    return (await this.readyClient()).revertChange(params);
  }

  async revertBatch(params: { batch_id: string }): Promise<BatchRevertOutcome> {
    return (await this.readyClient()).revertBatch(params);
  }

  async startFileCheck(params: { selection: BatchSelection }): Promise<FileCheckStarted> {
    return (await this.readyClient()).startFileCheck(params);
  }

  async startDuplicateScan(
    params?: Parameters<EngineClient["startDuplicateScan"]>[0],
  ): Promise<DuplicateScanStarted> {
    return (await this.readyClient()).startDuplicateScan(params);
  }

  async getDuplicateGroups(
    params?: Parameters<EngineClient["getDuplicateGroups"]>[0],
  ): Promise<DuplicateGroupList> {
    return (await this.readyClient()).getDuplicateGroups(params);
  }

  async dismissDuplicateGroup(params: { group_id: number }): Promise<{ group: DuplicateGroup }> {
    return (await this.readyClient()).dismissDuplicateGroup(params);
  }

  async restoreDuplicateGroup(params: { group_id: number }): Promise<{ group: DuplicateGroup }> {
    return (await this.readyClient()).restoreDuplicateGroup(params);
  }

  async startArtworkScan(
    params: Parameters<EngineClient["startArtworkScan"]>[0],
  ): Promise<ArtworkScanStarted> {
    return (await this.readyClient()).startArtworkScan(params);
  }

  async previewTagWrite(
    params: Parameters<EngineClient["previewTagWrite"]>[0],
  ): Promise<TagPreviewOutcome> {
    return (await this.readyClient()).previewTagWrite(params);
  }

  async startTagWrite(params: { preview_id: string }): Promise<TagWriteStarted> {
    return (await this.readyClient()).startTagWrite(params);
  }

  async startTagRestore(
    params: Parameters<EngineClient["startTagRestore"]>[0],
  ): Promise<TagRestoreStarted> {
    return (await this.readyClient()).startTagRestore(params);
  }

  async getTagWrites(params: Parameters<EngineClient["getTagWrites"]>[0]): Promise<TagWriteRecord> {
    return (await this.readyClient()).getTagWrites(params);
  }

  async getLibraryHealth(): Promise<LibraryHealth> {
    return (await this.readyClient()).getLibraryHealth();
  }

  async exportReviewList(
    params: Parameters<EngineClient["exportReviewList"]>[0],
  ): Promise<ReviewExportResult> {
    return (await this.readyClient()).exportReviewList(params);
  }

  async previewRekordboxExport(
    params: Parameters<EngineClient["previewRekordboxExport"]>[0],
  ): Promise<RekordboxExportPreviewAnswer> {
    return (await this.readyClient()).previewRekordboxExport(params);
  }

  async startRekordboxExport(
    params: Parameters<EngineClient["startRekordboxExport"]>[0],
  ): Promise<RekordboxExportStartAnswer> {
    return (await this.readyClient()).startRekordboxExport(params);
  }

  async getRekordboxExportHistory(
    params?: Parameters<EngineClient["getRekordboxExportHistory"]>[0],
  ): Promise<RekordboxExportHistory> {
    return (await this.readyClient()).getRekordboxExportHistory(params);
  }

  async startLibraryImport(params: {
    xml_path: string;
  }): Promise<LibraryImportStarted> {
    return (await this.readyClient()).startLibraryImport(params);
  }

  async startLibraryRefreshPreview(params?: {
    xml_path?: string;
    force?: boolean;
  }): Promise<LibraryRefreshStarted> {
    return (await this.readyClient()).startLibraryRefreshPreview(params);
  }

  async startLibraryRefreshApply(params: {
    diff_id: string;
    confirm_references?: boolean;
  }): Promise<LibraryRefreshStarted> {
    return (await this.readyClient()).startLibraryRefreshApply(params);
  }

  async getLibrarySummary(): Promise<LibrarySummary> {
    return (await this.readyClient()).getLibrarySummary();
  }

  async getRecentActivity(params?: {
    limit?: number;
    type?: string;
  }): Promise<ActivityFeed> {
    return (await this.readyClient()).getRecentActivity(params);
  }

  async listJobs(params?: {
    state?: "active" | "all";
    limit?: number;
  }): Promise<EngineJobList> {
    return (await this.readyClient()).listJobs(params);
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return (await this.readyClient()).getJob(jobId);
  }

  async getJobResults(jobId: string): Promise<{
    id: string;
    state: string;
    /** What the job produced, for a job that produces something. */
    result?: Record<string, unknown>;
  }> {
    return (await this.readyClient()).getJobResults(jobId);
  }

  async getIncrateInventory(params?: {
    limit?: number;
    search?: string;
    demo?: boolean;
  }): Promise<Record<string, unknown>> {
    return (await this.readyClient()).getIncrateInventory(params);
  }

  async importIncrateXml(body: {
    xml_path: string;
    enrich?: boolean;
  }): Promise<Record<string, unknown>> {
    return (await this.readyClient()).importIncrateXml(body);
  }

  async resetIncrateInventory() {
    return (await this.readyClient()).resetIncrateInventory();
  }

  async getIncrateDiscoverOptions(): Promise<Record<string, unknown>> {
    return (await this.readyClient()).getIncrateDiscoverOptions();
  }

  async runIncrateDiscover(body: {
    demo?: boolean;
    genre_ids?: number[];
    charts_from?: string;
    charts_to?: string;
    new_releases_days?: number;
    artist_names?: string[];
    label_names?: string[];
  }): Promise<{ tracks: Record<string, unknown>[]; count: number; demo?: boolean }> {
    return (await this.readyClient()).runIncrateDiscover(body);
  }

  async createIncratePlaylist(body: {
    name: string;
    tracks: Record<string, unknown>[];
  }): Promise<Record<string, unknown>> {
    return (await this.readyClient()).createIncratePlaylist(body);
  }

  async cancelJob(jobId: string): Promise<{ id: string; state: string }> {
    return (await this.readyClient()).cancelJob(jobId);
  }

  async getBeatportTokenStatus(): Promise<{ configured: boolean; masked: string | null }> {
    return (await this.readyClient()).getBeatportTokenStatus();
  }

  async setBeatportToken(token: string): Promise<{ configured: boolean; masked: string | null }> {
    return (await this.readyClient()).setBeatportToken(token);
  }

  async testBeatportToken(body?: {
    token?: string;
  }): Promise<{ ok: boolean; message: string }> {
    return (await this.readyClient()).testBeatportToken(body);
  }

  async exportSupportBundle(body: {
    output_dir: string;
    include_logs?: boolean;
    include_config?: boolean;
    sanitize?: boolean;
  }) {
    return (await this.readyClient()).exportSupportBundle(body);
  }

  async getLogsDir(): Promise<{ logs_dir: string }> {
    return (await this.readyClient()).getLogsDir();
  }

  async getCuepointLog(body?: {
    level?: string;
    search?: string;
    tailLines?: number;
    maxBytes?: number;
    sanitize?: boolean;
  }) {
    return (await this.readyClient()).getCuepointLog(body);
  }

  async clearCuepointLogs(): Promise<{ ok: boolean }> {
    return (await this.readyClient()).clearCuepointLogs();
  }

  async clearCuepointCache(): Promise<{ ok: boolean }> {
    return (await this.readyClient()).clearCuepointCache();
  }

  subscribeJobEvents(jobId: string, senderId: number, sender: WebContents): () => void {
    const key = `${senderId}:${jobId}`;

    // Join the stream if one is already open for this job. Events are
    // broadcast to the renderer, which fans them out to every listener, so a
    // second stream would only duplicate frames — and opening one used to
    // cancel the first.
    const open = this.jobStreams.get(key);
    if (open) {
      open.refs += 1;
      return () => this.unsubscribeJobEvents(jobId, senderId);
    }

    const abort = new AbortController();
    this.jobStreams.set(key, { abort, refs: 1 });

    void this.readyClient()
      .then((client) => client.streamJobEvents(jobId, abort.signal, (event) => {
        if (!sender.isDestroyed()) {
          sender.send("engine:jobEvent", { jobId, event });
        }
      }))
      .then(() => {
        if (!sender.isDestroyed()) {
          sender.send("engine:jobEventEnd", { jobId });
        }
      })
      .catch(() => {
        if (!sender.isDestroyed()) {
          sender.send("engine:jobEventEnd", { jobId });
        }
      })
      .finally(() => {
        // The job reached a terminal state, so the stream is over for everyone
        // watching it however many of them there were.
        this.jobStreams.delete(key);
      });

    return () => this.unsubscribeJobEvents(jobId, senderId);
  }

  unsubscribeJobEvents(jobId: string, senderId: number): void {
    const key = `${senderId}:${jobId}`;
    const entry = this.jobStreams.get(key);
    if (!entry) return;
    entry.refs -= 1;
    // Only the last watcher leaving closes the stream. One watcher going away
    // must not blind the others.
    if (entry.refs > 0) return;
    entry.abort.abort();
    this.jobStreams.delete(key);
  }

  private pickPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Failed to allocate port"));
          return;
        }
        const port = address.port;
        server.close((err) => {
          if (err) reject(err);
          else resolve(port);
        });
      });
    });
  }

  /**
   * Ask `/health` until it answers or the budget runs out.
   *
   * Bounded by elapsed time rather than by a count of attempts, so the budget
   * says what it means and stays right if the poll interval changes. It also
   * stops early when the child has gone: an engine that exited is not going to
   * answer, and waiting out the whole budget for it would delay the restart
   * that should follow.
   */
  private async pollHealth(
    timeoutMs = HEALTH_TIMEOUT_MS,
    delayMs = HEALTH_POLL_MS,
  ): Promise<boolean> {
    if (!this.port) return false;
    const url = `http://127.0.0.1:${this.port}/health`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.child) return false;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const body = (await res.json()) as { version?: string };
          this.version = body.version;
          this.healthy = true;
          return true;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  }
}

/**
 * The runtime preload, beside the bundle that asks for it.
 *
 * `electron/preload.cjs` ships next to `electron-dist/` in both layouts —
 * the source tree and `app.asar` (package.json's `build.files`) — so it is
 * found from the bundle's own folder. It used to be found from the repository
 * root, three folders up, which inside a packaged app is the install folder:
 * the path named nothing, the window got no `window.cuepoint`, and a packaged
 * build never reached its engine (found in CLEAN-14).
 */
export function resolvePreloadPath(bundleDir: string = __dirname): string {
  return path.join(bundleDir, "..", "electron", "preload.cjs");
}
