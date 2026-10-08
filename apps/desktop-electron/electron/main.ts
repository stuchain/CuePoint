/**
 * Electron main process — Spike S1: spawn engine and expose status to renderer.
 */
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, session, shell, systemPreferences } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EngineSupervisor, resolvePreloadPath } from "./engineSupervisor";
import { resolveAppIconPath } from "./appIcon";
import { beatportPageUrl } from "./externalLinks";
import { MediaKeyBinding } from "./mediaKeys";
import type { PlayerNotice } from "./playbackFailures";
import { PlaybackController } from "./playbackController";
import { queueTruncationMessage, resolveQueueFromView } from "./queueResolver";
import { chooseRekordboxExportDestination } from "./rekordboxExportDialog";
import { currentBuildInfo } from "./buildInfo";
import { ErrorReportingChoice } from "./errorReporting";
import {
  breadcrumb,
  mainReportingDsn,
  markQuitting,
  processReporter,
  reportOnce,
  reportProcessGone,
  setupMainReporting,
  wrapIpcHandler,
} from "./reporting";
import { MAIN_SETTINGS_FILE, MainSettingsStore } from "./mainSettings";
import {
  chooseSetListDestination,
  isFolder,
  rememberSetListFolder,
  setListFolderStore,
  type SetListFolderStore,
} from "./setListDialog";
import type { QueueItemInput, RepeatMode } from "./playbackQueue";
import type { LibraryBrowseParams, SetListDialogRequest } from "./engineClient";
import { resolvePlayerBinary } from "./playerLaunch";
import { PlayerSupervisor } from "./playerSupervisor";
import { quitAfter } from "./quitAfter";
import { E2E_DISPLAY_ENV, displayChoice, testWindowPlacement } from "./testWindowPlacement";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const DEV_URL = process.env.CUEPOINT_RENDERER_URL ?? "http://localhost:5173";

/**
 * Main's own settings, read when first needed: the user-data folder is the
 * app's to name. One store is shared by the set list folder and the
 * error-reporting choice.
 */
let mainSettings: MainSettingsStore | null = null;

function mainSettingsStore(): MainSettingsStore {
  mainSettings ??= new MainSettingsStore(path.join(app.getPath("userData"), MAIN_SETTINGS_FILE));
  return mainSettings;
}

function setListFolders(): SetListFolderStore {
  return setListFolderStore(mainSettingsStore());
}

/**
 * Which build this is: the release, `dist` and environment every process reports (REPORT-07).
 * Handed to the SDK, to the engine's environment and, through `app:buildInfo`, to the page.
 */
const build = currentBuildInfo(app.isPackaged, app.getVersion());

/**
 * Whether error reports may be sent (REPORT-01, DEC-128). Written to the file
 * first, then told to the engine, which also reads it from its environment at
 * launch.
 */
const errorReporting = new ErrorReportingChoice(mainSettingsStore(), (enabled) =>
  engine.setErrorReporting(enabled),
);

// Read before `app.whenReady()`, so a crash during start-up respects the
// choice (DEC-128). `app.getPath("userData")` is available before ready.
errorReporting.enabled();

/**
 * Main reports its own failures (REPORT-04, DEC-126, DEC-127), set up before
 * anything else here can fail and before `app.whenReady()`, which the SDK needs.
 *
 * Nothing is set up, and nothing is sent, without a DSN: a packaged app has the built-in one
 * (DEC-148), a run from source only what `CUEPOINT_SENTRY_DSN` names (DEC-150), and `off` is none.
 * The choice is read at the time
 * of each event, so turning reporting off takes effect at once. The engine's
 * session token is 48 hex characters, which the scrubber removes by shape, and the
 * engine supervisor also hands it over when it makes one (`processReporter.addToken`).
 */
const reportingOn = setupMainReporting({
  dsn: mainReportingDsn(process.env, app.isPackaged),
  build,
  choice: () => errorReporting.enabled(),
  scrubContext: {
    home: safely(() => app.getPath("home")),
    userName: safely(() => os.userInfo().username),
    appRoots: app.isPackaged
      ? [process.resourcesPath, safely(() => path.dirname(app.getPath("exe")))].filter(
          (root): root is string => typeof root === "string" && root !== "",
        )
      : [],
    tokens: [],
  },
});

/** `read()`, or null when it throws (a user with no name, a path not yet known). */
function safely(read: () => string): string | null {
  try {
    return read() || null;
  } catch {
    return null;
  }
}

/**
 * The engine, told where the player's mpv is so it can analyse audio with it
 * (WAVE-01, DEC-123). The same resolution the player uses, so the two can never
 * disagree about which binary is CuePoint's decoder.
 */
const engine: EngineSupervisor = new EngineSupervisor({
  decoderPath: (): string | null =>
    resolvePlayerBinary({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      repoRoot: engine.getRepoRoot(),
    })?.path ?? null,
  // A closure, so `errorReporting` (declared below) is read at launch, not here.
  errorReporting: (): boolean => errorReporting.enabled(),
  build,
  // The engine's exits, restarts and give-ups, once per incident (REPORT-05).
  reporter: processReporter,
});

/**
 * The audio player (PLAYER-03, DEC-050).
 *
 * Constructed eagerly but started lazily: no mpv process exists until
 * something is played, so a session that never plays a track never pays for
 * one. `packaged` and the paths are passed in rather than read inside, which
 * is what keeps the supervisor testable without an Electron runtime.
 */
const player = new PlayerSupervisor({
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  repoRoot: engine.getRepoRoot(),
  reporter: processReporter,
});

/**
 * The queue on top of the player (PLAYER-04, DEC-050).
 *
 * Everything the renderer asks for goes through here rather than at the
 * supervisor directly, so the queue and what mpv is doing cannot disagree.
 */
const playback = new PlaybackController(player);

/**
 * macOS gates global media keys behind the Accessibility permission; Windows
 * and Linux gate nothing, and get no permission object at all.
 *
 * `isTrustedAccessibilityClient(false)` asks without prompting, which is what
 * every focus needs. Passing `true` is what opens the system dialog, and that
 * belongs behind `MediaKeyBinding`'s once-per-session guard rather than here.
 */
const mediaKeyPermission =
  process.platform === "darwin"
    ? {
        granted: () => {
          try {
            return systemPreferences.isTrustedAccessibilityClient(false);
          } catch {
            // Not every macOS build exposes it; assume the keys are worth trying.
            return true;
          }
        },
        request: () => {
          try {
            systemPreferences.isTrustedAccessibilityClient(true);
          } catch {
            // The prompt is a courtesy — its absence is not a failure to report.
          }
        },
      }
    : undefined;

/** Set when the keys could not be taken before any renderer was listening. */
let pendingMediaKeyNotice: PlayerNotice | null = null;
let mediaKeyNoticeSent = false;

function reportMediaKeysUnavailable(): void {
  if (mediaKeyNoticeSent) return;
  mediaKeyNoticeSent = true;
  const notice: PlayerNotice = {
    id: Date.now(),
    kind: "media-keys-unavailable",
    message:
      "Your keyboard's media keys will not control CuePoint until you allow it " +
      "under System Settings → Privacy & Security → Accessibility. Everything " +
      "else about playback works without it.",
    count: 0,
    stopped: false,
  };
  if (noticeWatchers.size > 0) pushPlayerNotice(notice);
  // Unlike a track failure, this is *state* rather than an event: it is still
  // true whenever the renderer gets around to listening, so it is held rather
  // than dropped. That is why it does not contradict `noticeWatchers`' refusal
  // to replay — there is nothing stale about a permission that is still missing.
  else pendingMediaKeyNotice = notice;
}

/**
 * The machine's media keys, held only while CuePoint has focus (PLAYER-12).
 *
 * See `mediaKeys.ts` for why they are borrowed rather than taken: they are
 * global to the operating system, and a player that keeps them while it is in
 * the background swallows the keys meant for whatever the user is actually
 * looking at.
 */
const mediaKeys = new MediaKeyBinding(
  globalShortcut,
  {
    playPause: () => playback.togglePause(),
    next: () => playback.next(),
    previous: () => playback.previous(),
  },
  {
    permission: mediaKeyPermission,
    onStateChange: (state) => {
      if (state === "unavailable") reportMediaKeysUnavailable();
    },
  },
);

/**
 * Renderers watching playback state.
 *
 * Refcounted per renderer the way `subscribeJobEvents` is: a window that
 * reloads must not leave a dead sender being pushed to, and two subscribers in
 * one window must not cancel each other.
 */
const playerWatchers = new Map<number, { sender: Electron.WebContents; refs: number }>();
let playerUnsubscribe: (() => void) | null = null;

function pushPlayerState(snapshot: unknown): void {
  for (const [id, watcher] of playerWatchers) {
    if (watcher.sender.isDestroyed()) {
      playerWatchers.delete(id);
      continue;
    }
    watcher.sender.send("player:state", snapshot);
  }
  if (playerWatchers.size === 0 && playerUnsubscribe) {
    playerUnsubscribe();
    playerUnsubscribe = null;
  }
}

/**
 * Renderers watching for things to tell the user once (PLAYER-10).
 *
 * A separate subscription from the state stream rather than a field on the
 * snapshot: state is replayed to whoever asks for it, and a notice replayed is
 * a toast about a track that failed ten minutes ago appearing in a window that
 * has just opened.
 */
const noticeWatchers = new Map<number, { sender: Electron.WebContents; refs: number }>();
let noticeUnsubscribe: (() => void) | null = null;

function pushPlayerNotice(notice: unknown): void {
  for (const [id, watcher] of noticeWatchers) {
    if (watcher.sender.isDestroyed()) {
      noticeWatchers.delete(id);
      continue;
    }
    watcher.sender.send("player:notice", notice);
  }
  if (noticeWatchers.size === 0 && noticeUnsubscribe) {
    noticeUnsubscribe();
    noticeUnsubscribe = null;
  }
}

let privacyExitPrefs = {
  clearCacheOnExit: false,
  clearLogsOnExit: false,
};

/**
 * Open a native dialog, parented to the focused window when there is one.
 *
 * `dialog.showOpenDialog` has two overloads — with a parent window and
 * without — and passing `undefined` as the parent selects neither. The call
 * sites used to write `win ?? undefined`, which works at runtime (Electron
 * ignores a falsy first argument) but does not type-check, and those five
 * errors were the only thing keeping `electron/` out of CI's typecheck.
 *
 * Choosing the overload explicitly keeps the behaviour identical and lets the
 * gate go on.
 */
function showOpenDialogFor(
  win: BrowserWindow | null,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

function showSaveDialogFor(
  win: BrowserWindow | null,
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> {
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
}

/**
 * Every IPC handler goes through here, in one place (REPORT-04): the channel and
 * outcome become a breadcrumb, a handler that throws is reported, and an engine
 * error is rethrown with its status, code and report id (`bridgeError.ts`).
 * `desktopContract.test.ts` reads these calls as it read `ipcMain.handle`.
 */
function handle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, wrapIpcHandler(channel, handler));
}

function registerIpcHandlers(): void {
  handle("engine:status", () => engine.getStatus());
  handle("engine:restart", () => engine.restart());
  handle("engine:searchLibrary", (_event, params) => engine.searchLibrary(params));
  handle("engine:browseLibrary", (_event, params) => engine.browseLibrary(params));
  handle("engine:getLibraryPlaylists", () => engine.getLibraryPlaylists());
  handle("engine:getLibraryFacet", (_event, params) =>
    engine.getLibraryFacet(params),
  );
  handle("engine:getLibraryFilterFields", () => engine.getLibraryFilterFields());
  handle("engine:getLibraryTrack", (_event, params) =>
    engine.getLibraryTrack(params),
  );
  // CLEAN-09: a thumbnail crosses as bytes. The preload turns them into an
  // object URL, so no path and no original image reaches the renderer.
  handle("engine:getTrackArtwork", (_event, params) =>
    engine.getTrackArtwork(params),
  );

  // CuePoint's own organization (ORG-08). Every one of these is a thin
  // forward: the main process supervises and bridges, and every rule
  // about what a Collection may hold or what a rating may be lives in
  // Python.
  handle("engine:getCollections", () => engine.getCollections());
  handle("engine:getCollectionEntries", (_event, params) =>
    engine.getCollectionEntries(params),
  );
  handle("engine:createCollection", (_event, params) =>
    engine.createCollection(params),
  );
  handle("engine:renameCollection", (_event, params) =>
    engine.renameCollection(params),
  );
  handle("engine:moveCollection", (_event, params) =>
    engine.moveCollection(params),
  );
  handle("engine:deleteCollection", (_event, params) =>
    engine.deleteCollection(params),
  );
  handle("engine:previewCollectionDelete", (_event, params) =>
    engine.previewCollectionDelete(params),
  );
  handle("engine:addTracksToCollection", (_event, params) =>
    engine.addTracksToCollection(params),
  );
  handle("engine:insertTrackInCollection", (_event, params) =>
    engine.insertTrackInCollection(params),
  );
  handle("engine:removeCollectionEntries", (_event, params) =>
    engine.removeCollectionEntries(params),
  );
  handle("engine:reorderCollectionEntry", (_event, params) =>
    engine.reorderCollectionEntry(params),
  );
  handle("engine:saveSmartCollection", (_event, params) =>
    engine.saveSmartCollection(params),
  );
  handle("engine:updateSmartCollection", (_event, params) =>
    engine.updateSmartCollection(params),
  );
  handle("engine:duplicateSmartCollection", (_event, params) =>
    engine.duplicateSmartCollection(params),
  );
  handle("engine:freezeSmartCollection", (_event, params) =>
    engine.freezeSmartCollection(params),
  );
  handle("engine:getTags", () => engine.getTags());
  handle("engine:createTag", (_event, params) =>
    engine.createTag(params),
  );
  handle("engine:updateTag", (_event, params) =>
    engine.updateTag(params),
  );
  handle("engine:deleteTag", (_event, params) =>
    engine.deleteTag(params),
  );
  handle("engine:mergeTags", (_event, params) =>
    engine.mergeTags(params),
  );
  handle("engine:assignTag", (_event, params) =>
    engine.assignTag(params),
  );
  handle("engine:unassignTag", (_event, params) =>
    engine.unassignTag(params),
  );
  handle("engine:setTrackMetadata", (_event, params) =>
    engine.setTrackMetadata(params),
  );
  handle("engine:getTrackHistory", (_event, params) =>
    engine.getTrackHistory(params),
  );
  handle("engine:applyBatch", (_event, params) =>
    engine.applyBatch(params),
  );

  // Clean (CLEAN-11). Thin forwards, as ORG-08's are: what a match state, a
  // hand edit or a tag write may be is decided in Python.
  handle("engine:startCleanMatch", (_event, params) =>
    engine.startCleanMatch(params),
  );
  handle("engine:resumeCleanMatch", (_event, params) =>
    engine.resumeCleanMatch(params),
  );
  handle("engine:getResumableMatches", () => engine.getResumableMatches());
  handle("engine:getTrackMatches", (_event, params) =>
    engine.getTrackMatches(params),
  );
  handle("engine:getMatchCandidates", (_event, params) =>
    engine.getMatchCandidates(params),
  );
  // CLEAN-12: the renderer names a track, never a path.
  handle("engine:getTrackFolder", (_event, params) =>
    engine.getTrackFolder(params),
  );
  handle("engine:decideMatch", (_event, params) =>
    engine.decideMatch(params),
  );
  handle("engine:applyMatch", (_event, params) =>
    engine.applyMatch(params),
  );
  handle("engine:setTrackOverrides", (_event, params) =>
    engine.setTrackOverrides(params),
  );
  handle("engine:revertChange", (_event, params) =>
    engine.revertChange(params),
  );
  handle("engine:revertBatch", (_event, params) =>
    engine.revertBatch(params),
  );
  handle("engine:startFileCheck", (_event, params) =>
    engine.startFileCheck(params),
  );
  handle("engine:startDuplicateScan", (_event, params) =>
    engine.startDuplicateScan(params),
  );
  handle("engine:getDuplicateGroups", (_event, params) =>
    engine.getDuplicateGroups(params),
  );
  handle("engine:dismissDuplicateGroup", (_event, params) =>
    engine.dismissDuplicateGroup(params),
  );
  handle("engine:restoreDuplicateGroup", (_event, params) =>
    engine.restoreDuplicateGroup(params),
  );
  handle("engine:startArtworkScan", (_event, params) =>
    engine.startArtworkScan(params),
  );
  handle("engine:previewTagWrite", (_event, params) =>
    engine.previewTagWrite(params),
  );
  handle("engine:startTagWrite", (_event, params) =>
    engine.startTagWrite(params),
  );
  handle("engine:startTagRestore", (_event, params) =>
    engine.startTagRestore(params),
  );
  handle("engine:getTagWrites", (_event, params) =>
    engine.getTagWrites(params),
  );
  handle("engine:getLibraryHealth", () => engine.getLibraryHealth());
  handle("engine:exportReviewList", (_event, params) =>
    engine.exportReviewList(params),
  );
  handle("engine:previewRekordboxExport", (_event, params) =>
    engine.previewRekordboxExport(params),
  );
  handle("engine:startRekordboxExport", (_event, params) =>
    engine.startRekordboxExport(params),
  );
  handle("engine:getRekordboxExportHistory", (_event, params) =>
    engine.getRekordboxExportHistory(params),
  );
  // Discover (DISCOVER-09).
  handle("engine:getDiscoverOptions", () => engine.getDiscoverOptions());
  handle("engine:listDiscoveryRuns", (_event, params) =>
    engine.listDiscoveryRuns(params),
  );
  handle("engine:getDiscoveryRun", (_event, params) =>
    engine.getDiscoveryRun(params),
  );
  handle("engine:getDiscoveryRunTracks", (_event, params) =>
    engine.getDiscoveryRunTracks(params),
  );
  handle("engine:startDiscoveryRun", (_event, params) =>
    engine.startDiscoveryRun(params),
  );
  handle("engine:deleteDiscoveryRun", (_event, params) =>
    engine.deleteDiscoveryRun(params),
  );
  handle("engine:getWantlist", (_event, params) =>
    engine.getWantlist(params),
  );
  handle("engine:addToWantlist", (_event, params) =>
    engine.addToWantlist(params),
  );
  handle("engine:removeFromWantlist", (_event, params) =>
    engine.removeFromWantlist(params),
  );
  handle("engine:setWantlistNote", (_event, params) =>
    engine.setWantlistNote(params),
  );
  handle("engine:setWantlistBought", (_event, params) =>
    engine.setWantlistBought(params),
  );
  handle("engine:startBeatportPlaylistPush", (_event, params) =>
    engine.startBeatportPlaylistPush(params),
  );
  handle("engine:startBeatportResolve", () => engine.startBeatportResolve());
  handle("engine:getEntityPage", (_event, params) =>
    engine.getEntityPage(params),
  );
  handle("engine:getEntityBeatport", (_event, params) =>
    engine.getEntityBeatport(params),
  );
  handle("engine:getSimilarTracks", (_event, params) =>
    engine.getSimilarTracks(params),
  );
  // A Set (PREP-08): every answer is { value, refusal }. A saved set list's
  // folder is where the next set list dialog opens.
  handle("engine:getSetPlan", (_event, params) =>
    engine.getSetPlan(params),
  );
  handle("engine:getSetEntries", (_event, params) =>
    engine.getSetEntries(params),
  );
  handle("engine:getSetAnalysis", (_event, params) =>
    engine.getSetAnalysis(params),
  );
  handle("engine:getSetSuggestions", (_event, params) =>
    engine.getSetSuggestions(params),
  );
  handle("engine:getSetListText", (_event, params) =>
    engine.getSetListText(params),
  );
  handle("engine:createSet", (_event, params) =>
    engine.createSet(params),
  );
  handle("engine:createSetFrom", (_event, params) =>
    engine.createSetFrom(params),
  );
  handle("engine:duplicateSet", (_event, params) =>
    engine.duplicateSet(params),
  );
  handle("engine:setSetNotes", (_event, params) =>
    engine.setSetNotes(params),
  );
  handle("engine:createSetChapter", (_event, params) =>
    engine.createSetChapter(params),
  );
  handle("engine:updateSetChapter", (_event, params) =>
    engine.updateSetChapter(params),
  );
  handle("engine:moveSetChapter", (_event, params) =>
    engine.moveSetChapter(params),
  );
  handle("engine:deleteSetChapter", (_event, params) =>
    engine.deleteSetChapter(params),
  );
  handle("engine:splitSetChapter", (_event, params) =>
    engine.splitSetChapter(params),
  );
  handle("engine:moveSetEntry", (_event, params) =>
    engine.moveSetEntry(params),
  );
  handle("engine:setSetEntryTimes", (_event, params) =>
    engine.setSetEntryTimes(params),
  );
  handle("engine:setSetEntryNote", (_event, params) =>
    engine.setSetEntryNote(params),
  );
  handle("engine:acknowledgeSetWarning", (_event, params) =>
    engine.acknowledgeSetWarning(params),
  );
  handle("engine:unacknowledgeSetWarning", (_event, params) =>
    engine.unacknowledgeSetWarning(params),
  );
  handle("engine:saveSetList", (_event, params) =>
    rememberSetListFolder(engine.saveSetList(params), setListFolders()),
  );
  // The waveform analysis (WAVE-03): each answers { value, refusal }.
  handle("engine:getWaveformAnalysis", () => engine.getWaveformAnalysis());
  handle("engine:pauseWaveformAnalysis", () => engine.pauseWaveformAnalysis());
  handle("engine:resumeWaveformAnalysis", () => engine.resumeWaveformAnalysis());
  // The waveforms themselves (WAVE-05); the engine validates every parameter.
  handle("engine:getWaveforms", (_event, params) => engine.getWaveforms(params));
  handle("engine:requestWaveforms", (_event, params) => engine.requestWaveforms(params));
  handle("engine:deleteWaveformData", () => engine.deleteWaveformData());
  handle("engine:startLibraryImport", (_event, params) =>
    engine.startLibraryImport(params),
  );
  handle("engine:startLibraryRefreshPreview", (_event, params) =>
    engine.startLibraryRefreshPreview(params),
  );
  handle("engine:startLibraryRefreshApply", (_event, params) =>
    engine.startLibraryRefreshApply(params),
  );
  handle("engine:getLibrarySummary", () => engine.getLibrarySummary());
  handle("engine:listJobs", (_event, params) => engine.listJobs(params));
  handle("engine:getRecentActivity", (_event, params) =>
    engine.getRecentActivity(params),
  );
  handle("engine:getJob", (_event, jobId: string) => engine.getJob(jobId));
  handle("engine:getJobResults", (_event, jobId: string) => engine.getJobResults(jobId));
  handle("engine:cancelJob", (_event, jobId: string) => engine.cancelJob(jobId));
  handle("engine:getBeatportTokenStatus", () => engine.getBeatportTokenStatus());
  handle("engine:setBeatportToken", (_event, token: string) => engine.setBeatportToken(token));
  handle("engine:testBeatportToken", (_event, body) => engine.testBeatportToken(body));
  handle("engine:getLogsDir", () => engine.getLogsDir());
  handle("engine:getCuepointLog", (_event, body) => engine.getCuepointLog(body));
  handle("engine:clearCuepointLogs", () => engine.clearCuepointLogs());
  handle("engine:clearCuepointCache", () => engine.clearCuepointCache());
  handle("privacy:setExitPrefs", (_event, prefs: { clearCacheOnExit?: boolean; clearLogsOnExit?: boolean }) => {
    privacyExitPrefs = {
      clearCacheOnExit: Boolean(prefs?.clearCacheOnExit),
      clearLogsOnExit: Boolean(prefs?.clearLogsOnExit),
    };
    return { ok: true as const };
  });
  // `configured` is whether the renderer's reporter has anywhere to send to: main set the SDK up.
  // The app's version and build, for the About dialog (REPORT-07). Nothing in it is secret.
  handle("app:buildInfo", () => build);
  handle("errorReporting:get", () => ({ enabled: errorReporting.enabled(), configured: reportingOn }));
  // End-to-end runs only (they set the display variable): the page may be made to throw.
  handle("testHooks:enabled", () => displayChoice(process.env[E2E_DISPLAY_ENV]) !== null);
  handle("errorReporting:set", (_event, enabled: unknown) => {
    if (typeof enabled !== "boolean") throw new Error("errorReporting:set needs true or false");
    return errorReporting.set(enabled);
  });
  handle(
    "support:exportBundle",
    async (_event, options: { include_logs?: boolean; include_config?: boolean; sanitize?: boolean }) => {
      const win = BrowserWindow.getFocusedWindow();
      const pick = await showOpenDialogFor(win, {
        properties: ["openDirectory", "createDirectory"],
        title: "Choose folder for support bundle",
      });
      if (pick.canceled || pick.filePaths.length === 0) {
        return { canceled: true as const };
      }
      const payload = await engine.exportSupportBundle({
        output_dir: pick.filePaths[0],
        include_logs: options?.include_logs ?? true,
        include_config: options?.include_config ?? true,
        sanitize: options?.sanitize ?? true,
      });
      return { canceled: false as const, ...payload };
    },
  );
  handle("shell:showItemInFolder", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
  /**
   * "Open on Beatport" (DISCOVER-10): a Beatport page in the system browser.
   * Anything that is not an https page on Beatport's website is refused here,
   * whatever the renderer sent, and the answer says whether it opened.
   */
  handle("shell:openBeatportPage", async (_event, url: unknown) => {
    const page = beatportPageUrl(url);
    if (page === null) return false;
    await shell.openExternal(page);
    return true;
  });

  // --- Player (PLAYER-03) ---------------------------------------------------
  // Transport only. There is no queue here: what plays next is PLAYER-04's,
  // which is why there is no `player:next` yet — an endpoint that cannot do
  // anything is worse than an absent one.
  handle("player:getState", () => playback.snapshot());
  /**
   * Whether the media keys are actually working (PLAYER-12, macOS pass row 8).
   *
   * A missing Accessibility permission is durable state, not an event: it is
   * still true an hour after the toast that announced it has faded. Queryable
   * so a screen can say so plainly, and so the E2E suite can assert it without
   * racing a toast that appears during startup.
   */
  handle("player:mediaKeyStatus", () => mediaKeys.status);
  /**
   * Play a view's worth of tracks (DEC-012). There is no single-file `play`:
   * everything that plays goes through the queue, so the two cannot disagree
   * about what is playing.
   */
  handle(
    "player:playQueue",
    async (_event, items: QueueItemInput[], startIndex: number) => {
      try {
        await playback.playQueue(items ?? [], startIndex ?? 0);
        return { ok: true as const };
      } catch (error) {
        // A structured result, not a thrown string: "there is no audio player"
        // is something the UI shows a person, not a stack trace.
        return {
          ok: false as const,
          code: (error as { code?: string }).code ?? "player-error",
          error: (error as Error).message,
        };
      }
    },
  );
  /**
   * Play a whole view (PLAYER-05, DEC-012).
   *
   * The renderer sends the query it is showing, not the rows: with DEC-040's
   * windowed table it only holds a hundred of them, and the queue has to be
   * the whole view in the view's own order. Resolving here also keeps up to
   * fifty thousand rows from crossing IPC twice for a list the renderer never
   * needs to see.
   */
  handle(
    "player:playView",
    async (_event, view: LibraryBrowseParams, startIndex: number) => {
      try {
        const resolved = await resolveQueueFromView(
          (params) => engine.browseLibrary(params),
          view ?? {},
        );
        if (resolved.items.length === 0) {
          return { ok: false as const, code: "empty-view", error: "Nothing to play." };
        }
        await playback.playQueue(resolved.items, startIndex ?? 0);
        return {
          ok: true as const,
          queued: resolved.items.length,
          total: resolved.total,
          truncated: resolved.truncated,
          // Null unless something was actually left out, so the renderer shows
          // a message only when there is one to show.
          message: queueTruncationMessage(resolved),
        };
      } catch (error) {
        return {
          ok: false as const,
          code: (error as { code?: string }).code ?? "player-error",
          error: (error as Error).message,
        };
      }
    },
  );
  /**
   * One page of the queue (PLAYER-08).
   *
   * The pushed snapshot carries the queue's shape, not its contents: at
   * PLAYER-05's 50,000-track cap those are ~14.5 MB, and pushing them at the
   * transport's rate is ~58 MB/s of IPC for a panel showing twenty rows.
   */
  handle("player:queueWindow", (_event, offset: number, limit: number) =>
    playback.queueWindow(offset ?? 0, limit ?? 100),
  );
  handle("player:playNext", (_event, items: QueueItemInput[]) =>
    playback.playNextItems(items ?? []),
  );
  handle("player:addToQueue", (_event, items: QueueItemInput[]) =>
    playback.addToQueue(items ?? []),
  );
  handle("player:next", () => playback.next());
  handle("player:previous", () => playback.previous());
  handle("player:jumpTo", (_event, index: number) => playback.jumpTo(index));
  handle("player:removeFromQueue", (_event, id: string) =>
    playback.removeFromQueue(id),
  );
  handle("player:moveInQueue", (_event, from: number, to: number) =>
    playback.moveInQueue(from, to),
  );
  handle("player:clearQueue", () => playback.clearQueue());
  handle("player:setShuffle", (_event, on: boolean) => playback.setShuffle(on));
  handle("player:setRepeat", (_event, mode: RepeatMode) => playback.setRepeat(mode));
  handle("player:pause", () => playback.pause());
  handle("player:resume", () => playback.resume());
  handle("player:toggle", () => playback.togglePause());
  handle("player:stop", () => playback.stop());
  handle("player:seek", (_event, seconds: number) => playback.seek(seconds));
  handle("player:setVolume", (_event, volume: number) => playback.setVolume(volume));
  handle("player:setMuted", (_event, muted: boolean) => playback.setMuted(muted));
  handle("player:subscribeState", (event) => {
    const id = event.sender.id;
    const existing = playerWatchers.get(id);
    if (existing) {
      existing.refs += 1;
    } else {
      playerWatchers.set(id, { sender: event.sender, refs: 1 });
      event.sender.once("destroyed", () => playerWatchers.delete(id));
    }
    playerUnsubscribe ??= playback.onSnapshot(pushPlayerState);
    // Answer immediately so a subscriber is not blind until the next change.
    event.sender.send("player:state", playback.snapshot());
    return { ok: true };
  });
  handle("player:unsubscribeState", (event) => {
    const id = event.sender.id;
    const existing = playerWatchers.get(id);
    if (!existing) return { ok: true };
    existing.refs -= 1;
    if (existing.refs <= 0) playerWatchers.delete(id);
    if (playerWatchers.size === 0 && playerUnsubscribe) {
      playerUnsubscribe();
      playerUnsubscribe = null;
    }
    return { ok: true };
  });
  /**
   * The devices mpv can see (PLAYER-11, DEC-055).
   *
   * Asked fresh every time the panel opens: interfaces come and go while the
   * app runs, and a cached list offers devices that are no longer there. A
   * structured refusal rather than a throw, because "there is no audio player"
   * is something the settings panel shows a person.
   */
  handle("player:audioDevices", async () => {
    try {
      return { ok: true as const, devices: await playback.listAudioDevices() };
    } catch (error) {
      return {
        ok: false as const,
        code: (error as { code?: string }).code ?? "player-error",
        error: (error as Error).message,
        devices: [] as Array<{ name: string; description: string }>,
      };
    }
  });
  handle(
    "player:setAudioSettings",
    async (_event, settings: { device?: string; exclusive?: boolean }) => {
      try {
        await playback.setAudioSettings(settings ?? {});
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          code: (error as { code?: string }).code ?? "player-error",
          error: (error as Error).message,
        };
      }
    },
  );
  handle("player:subscribeNotices", (event) => {
    const id = event.sender.id;
    const existing = noticeWatchers.get(id);
    if (existing) {
      existing.refs += 1;
    } else {
      noticeWatchers.set(id, { sender: event.sender, refs: 1 });
      event.sender.once("destroyed", () => noticeWatchers.delete(id));
    }
    noticeUnsubscribe ??= playback.onNotice(pushPlayerNotice);
    // Deliberately no replay of the last notice: see `noticeWatchers`. The one
    // exception is the media-key permission, which was decided before any
    // renderer existed and is still true now — see `reportMediaKeysUnavailable`.
    if (pendingMediaKeyNotice) {
      const notice = pendingMediaKeyNotice;
      pendingMediaKeyNotice = null;
      event.sender.send("player:notice", notice);
    }
    return { ok: true };
  });
  handle("player:unsubscribeNotices", (event) => {
    const id = event.sender.id;
    const existing = noticeWatchers.get(id);
    if (!existing) return { ok: true };
    existing.refs -= 1;
    if (existing.refs <= 0) noticeWatchers.delete(id);
    if (noticeWatchers.size === 0 && noticeUnsubscribe) {
      noticeUnsubscribe();
      noticeUnsubscribe = null;
    }
    return { ok: true };
  });
  handle("engine:subscribeJobEvents", (event, jobId: string) => {
    engine.subscribeJobEvents(jobId, event.sender.id, event.sender);
    return { ok: true };
  });
  handle("engine:unsubscribeJobEvents", (event, jobId: string) => {
    engine.unsubscribeJobEvents(jobId, event.sender.id);
    return { ok: true };
  });
  handle("dialog:openXml", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await showOpenDialogFor(win, {
      properties: ["openFile"],
      filters: [{ name: "Rekordbox XML", extensions: ["xml"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const };
    }
    return { canceled: false as const, filePath: result.filePaths[0] };
  });
  /**
   * Where a Rekordbox export goes (EXPORT-06, DEC-083). The dialog chooses a
   * file and nothing else: whether that file may be written is the engine's to
   * say when the export starts, so nothing here judges the path, and nothing
   * here starts an export — a cancelled dialog is simply an answer.
   */
  handle(
    "dialog:saveRekordboxExport",
    (_event, request?: { currentPath?: string | null }) =>
      chooseRekordboxExportDestination(
        {
          history: () => engine.getRekordboxExportHistory({ limit: 1 }),
          fallbackFolder: () => app.getPath("documents"),
          showSaveDialog: (options) =>
            showSaveDialogFor(BrowserWindow.getFocusedWindow(), options),
          now: () => new Date(),
        },
        request,
      ),
  );
  /**
   * Where a set list goes (PREP-08, DEC-110). As the export's dialog: it
   * chooses a file and nothing else. The engine judges the path when it saves,
   * and nothing here saves; a cancelled dialog is simply an answer.
   */
  handle("dialog:saveSetList", (_event, request?: SetListDialogRequest) =>
    chooseSetListDestination(
      {
        store: setListFolders(),
        folderExists: isFolder,
        fallbackFolder: () => app.getPath("documents"),
        showSaveDialog: (options) =>
          showSaveDialogFor(BrowserWindow.getFocusedWindow(), options),
        now: () => new Date(),
      },
      request,
    ),
  );
  handle(
    "dialog:saveExport",
    async (_event, options: { defaultPath?: string; format: string }) => {
      const win = BrowserWindow.getFocusedWindow();
      const format = options.format.toLowerCase();
      const filters =
        format === "json"
          ? [{ name: "JSON", extensions: ["json"] }]
          : format === "xlsx" || format === "excel"
            ? [{ name: "Excel", extensions: ["xlsx"] }]
            : [{ name: "CSV", extensions: ["csv"] }];
      const result = await showSaveDialogFor(win, {
        defaultPath: options.defaultPath,
        filters,
      });
      if (result.canceled || !result.filePath) {
        return { canceled: true as const };
      }
      return { canceled: false as const, filePath: result.filePath };
    },
  );
}

async function createWindow(): Promise<void> {
  /**
   * The engine starts beside the window, not before it.
   *
   * This used to `await engine.start()`, so the app showed nothing at all —
   * no window, no splash — until the engine answered. On a packaged macOS
   * build that is about ten seconds of a dock icon and an empty screen, and
   * once the health budget was raised to cover a real cold start it would have
   * been up to the whole of it for an engine that never came up.
   *
   * The window has nothing to wait for: an engine call made while the engine
   * starts is held by the supervisor until it has answered (`readyClient()`),
   * so the first screen gets its data rather than a refusal it reads as "no
   * library", and the status strip says "Starting engine…" until `getStatus()`
   * says the engine has answered. Showing the
   * shell immediately and saying what is happening is both faster and more
   * honest than hiding the window and claiming, on arrival, that the engine
   * was connected when it was not.
   */
  void engine.start().then(
    (status) => breadcrumb("engine", status.connected ? "started" : "start did not connect"),
    (error: unknown) => {
      // Reached the person through `getStatus()`, which the strip already polls; a
      // rejection here would otherwise be an unhandled one. It is also reported,
      // once per launch (REPORT-04). This is only the start that throws: a start that
      // resolves unhealthy, or with no engine, is the supervisor's to report (REPORT-05).
      breadcrumb("engine", "failed to start");
      reportOnce("engine.start", error, { tags: { "engine.phase": "start" } });
    },
  );

  const size = { width: 1280, height: 800 };
  // An end-to-end run's window goes where it asks and is shown without focus
  // (`testWindowPlacement.ts`); a person's opens as it always has.
  const testDisplay = displayChoice(process.env[E2E_DISPLAY_ENV]);
  const placement = testDisplay
    ? testWindowPlacement(testDisplay, screen.getAllDisplays(), screen.getPrimaryDisplay(), size)
    : null;

  const appIconPath = resolveAppIconPath({
    platform: process.platform,
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });
  const win = new BrowserWindow({
    ...size,
    ...(placement ? { ...placement, show: false } : {}),
    // Windows and Linux show the window's own icon; macOS uses the bundle's (DIST-09).
    ...(appIconPath ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      /**
       * Keep the renderer running while the window is in the background.
       *
       * Chromium throttles timers and delays task delivery in a background
       * renderer, which is right for a web page and wrong for a music player:
       * CuePoint is used with something else in front of it, and a throttled
       * renderer stops the position moving, stops the queue panel updating and
       * delays replies from main until the window is touched again. Found by
       * PLAYER-11's settings test, where an answer main had already sent sat
       * undelivered until the next interaction.
       */
      backgroundThrottling: false,
    },
  });

  // Held on focus and given back on blur, so the keys belong to whatever the
  // user is looking at (PLAYER-12).
  win.on("focus", () => {
    breadcrumb("window", "focus");
    mediaKeys.acquire();
  });
  win.on("blur", () => {
    breadcrumb("window", "blur");
    mediaKeys.release();
  });
  win.on("closed", () => mediaKeys.release());
  if (win.isFocused()) mediaKeys.acquire();
  if (placement) win.showInactive();

  if (isDev) {
    // The `engine` and engine-version query parameters this once carried were
    // read by nothing — searched before removing — and carrying them was the
    // only reason the window had to wait for the engine at all. The renderer
    // asks the bridge, which is the answer that stays right afterwards.
    await win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(path.join(__dirname, "../renderer/dist/index.html"));
  }
}

app.whenReady().then(() => {
  breadcrumb("app", "ready");
  registerIpcHandlers();
  void createWindow();
});

app.on("window-all-closed", () => {
  breadcrumb("app", "window-all-closed");
  if (process.platform !== "darwin") app.quit();
});

// A window's page or a helper process (GPU, utility) that died, with why. A clean
// exit is not reported. The SDK's own `ChildProcess` integration is off, so each
// is reported once, here (REPORT-04).
app.on("render-process-gone", (_event, _contents, details) => {
  reportProcessGone("renderer", details);
});
app.on("child-process-gone", (_event, details) => {
  reportProcessGone(details.type, details);
});

// The player's state, as a trail: running, reconnecting, or why it gave up. Only
// when reporting is set up, and only a change.
if (reportingOn) {
  let lastPlayerStatus = "";
  player.onSnapshot((snapshot) => {
    const { running, reconnecting, error } = snapshot.status;
    const now = `${running ? "running" : "stopped"}${reconnecting ? " reconnecting" : ""}${error ? " failed" : ""}`;
    if (now === lastPlayerStatus) return;
    lastPlayerStatus = now;
    breadcrumb("player", now);
  });
  // A file that would not play is the user's (missing, unreadable): a step, never an event.
  playback.onNotice((notice) => {
    breadcrumb("player", "notice", { kind: notice.kind, count: notice.count, stopped: notice.stopped });
  });
}

// Held until it has finished: Electron does not wait for an async
// `before-quit` listener, and this one used to lose the race to the quit and
// leave the engine running (EXPORT-07).
quitAfter(app, async () => {
  markQuitting();
  breadcrumb("app", "before-quit");
  const tasks: Array<Promise<unknown>> = [];
  if (privacyExitPrefs.clearCacheOnExit) tasks.push(engine.clearCuepointCache());
  if (privacyExitPrefs.clearLogsOnExit) tasks.push(engine.clearCuepointLogs());
  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
  // Chromium commits localStorage to disk on a delay, and a quit inside it
  // loses the last write: a repeat mode changed just before quitting came back
  // as the one before it (PLAYER-07).
  session.defaultSession.flushStorageData();
  // Given back before anything else: an accelerator still registered at quit
  // takes the machine's media keys away from whatever the user turns to next.
  mediaKeys.release();
  // The player first: a leaked mpv still holding an audio device after
  // CuePoint exits is the worst failure this phase can ship.
  playback.dispose();
  await player.dispose();
  await engine.stop();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
