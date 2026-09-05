/**
 * Electron main process — Spike S1: spawn engine and expose status to renderer.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EngineSupervisor, resolvePreloadPath } from "./engineSupervisor";
import { PlaybackController } from "./playbackController";
import type { QueueItemInput, RepeatMode } from "./playbackQueue";
import { PlayerSupervisor } from "./playerSupervisor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const DEV_URL = process.env.CUEPOINT_RENDERER_URL ?? "http://localhost:5173";

const engine = new EngineSupervisor();

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
});

/**
 * The queue on top of the player (PLAYER-04, DEC-050).
 *
 * Everything the renderer asks for goes through here rather than at the
 * supervisor directly, so the queue and what mpv is doing cannot disagree.
 */
const playback = new PlaybackController(player);

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

function registerIpcHandlers(): void {
  ipcMain.handle("engine:status", () => engine.getStatus());
  ipcMain.handle("engine:restart", () => engine.restart());
  ipcMain.handle("engine:startMatchJob", (_event, body) => engine.startMatchJob(body));
  ipcMain.handle("engine:searchLibrary", (_event, params) => engine.searchLibrary(params));
  ipcMain.handle("engine:browseLibrary", (_event, params) => engine.browseLibrary(params));
  ipcMain.handle("engine:getLibraryPlaylists", () => engine.getLibraryPlaylists());
  ipcMain.handle("engine:getLibraryFacet", (_event, params) =>
    engine.getLibraryFacet(params),
  );
  ipcMain.handle("engine:getLibraryFilterFields", () => engine.getLibraryFilterFields());
  ipcMain.handle("engine:getLibraryTrack", (_event, params) =>
    engine.getLibraryTrack(params),
  );
  ipcMain.handle("engine:startLibraryImport", (_event, params) =>
    engine.startLibraryImport(params),
  );
  ipcMain.handle("engine:startLibraryRefreshPreview", (_event, params) =>
    engine.startLibraryRefreshPreview(params),
  );
  ipcMain.handle("engine:startLibraryRefreshApply", (_event, params) =>
    engine.startLibraryRefreshApply(params),
  );
  ipcMain.handle("engine:getLibrarySummary", () => engine.getLibrarySummary());
  ipcMain.handle("engine:listJobs", (_event, params) => engine.listJobs(params));
  ipcMain.handle("engine:getRecentActivity", (_event, params) =>
    engine.getRecentActivity(params),
  );
  ipcMain.handle("engine:getJob", (_event, jobId: string) => engine.getJob(jobId));
  ipcMain.handle("engine:getJobResults", (_event, jobId: string) => engine.getJobResults(jobId));
  ipcMain.handle("engine:exportResults", (_event, body) => engine.exportResults(body));
  ipcMain.handle("engine:getIncrateInventory", (_event, params) => engine.getIncrateInventory(params));
  ipcMain.handle("engine:importIncrateXml", (_event, body) => engine.importIncrateXml(body));
  ipcMain.handle("engine:resetIncrateInventory", () => engine.resetIncrateInventory());
  ipcMain.handle("engine:getIncrateDiscoverOptions", () => engine.getIncrateDiscoverOptions());
  ipcMain.handle("engine:runIncrateDiscover", (_event, body) => engine.runIncrateDiscover(body));
  ipcMain.handle("engine:createIncratePlaylist", (_event, body) => engine.createIncratePlaylist(body));
  ipcMain.handle("engine:cancelMatchJob", (_event, jobId: string) => engine.cancelMatchJob(jobId));
  ipcMain.handle("engine:getBeatportTokenStatus", () => engine.getBeatportTokenStatus());
  ipcMain.handle("engine:setBeatportToken", (_event, token: string) => engine.setBeatportToken(token));
  ipcMain.handle("engine:testBeatportToken", (_event, body) => engine.testBeatportToken(body));
  ipcMain.handle("engine:getHistoryRecent", (_event, params) => engine.getHistoryRecent(params));
  ipcMain.handle("engine:loadHistoryCsv", (_event, csvPath: string) => engine.loadHistoryCsv(csvPath));
  ipcMain.handle("engine:getXmlPlaylists", (_event, xmlPath: string) => engine.getXmlPlaylists(xmlPath));
  ipcMain.handle("engine:syncTags", (_event, body) => engine.syncTags(body));
  ipcMain.handle("engine:getLogsDir", () => engine.getLogsDir());
  ipcMain.handle("engine:getCuepointLog", (_event, body) => engine.getCuepointLog(body));
  ipcMain.handle("engine:clearCuepointLogs", () => engine.clearCuepointLogs());
  ipcMain.handle("engine:clearCuepointCache", () => engine.clearCuepointCache());
  ipcMain.handle("privacy:setExitPrefs", (_event, prefs: { clearCacheOnExit?: boolean; clearLogsOnExit?: boolean }) => {
    privacyExitPrefs = {
      clearCacheOnExit: Boolean(prefs?.clearCacheOnExit),
      clearLogsOnExit: Boolean(prefs?.clearLogsOnExit),
    };
    return { ok: true as const };
  });
  ipcMain.handle(
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
  ipcMain.handle("shell:showItemInFolder", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // --- Player (PLAYER-03) ---------------------------------------------------
  // Transport only. There is no queue here: what plays next is PLAYER-04's,
  // which is why there is no `player:next` yet — an endpoint that cannot do
  // anything is worse than an absent one.
  ipcMain.handle("player:getState", () => playback.snapshot());
  /**
   * Play a view's worth of tracks (DEC-012). There is no single-file `play`:
   * everything that plays goes through the queue, so the two cannot disagree
   * about what is playing.
   */
  ipcMain.handle(
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
  ipcMain.handle("player:playNext", (_event, items: QueueItemInput[]) =>
    playback.playNextItems(items ?? []),
  );
  ipcMain.handle("player:addToQueue", (_event, items: QueueItemInput[]) =>
    playback.addToQueue(items ?? []),
  );
  ipcMain.handle("player:next", () => playback.next());
  ipcMain.handle("player:previous", () => playback.previous());
  ipcMain.handle("player:jumpTo", (_event, index: number) => playback.jumpTo(index));
  ipcMain.handle("player:removeFromQueue", (_event, id: string) =>
    playback.removeFromQueue(id),
  );
  ipcMain.handle("player:moveInQueue", (_event, from: number, to: number) =>
    playback.moveInQueue(from, to),
  );
  ipcMain.handle("player:clearQueue", () => playback.clearQueue());
  ipcMain.handle("player:setShuffle", (_event, on: boolean) => playback.setShuffle(on));
  ipcMain.handle("player:setRepeat", (_event, mode: RepeatMode) => playback.setRepeat(mode));
  ipcMain.handle("player:pause", () => playback.pause());
  ipcMain.handle("player:resume", () => playback.resume());
  ipcMain.handle("player:toggle", () => playback.togglePause());
  ipcMain.handle("player:stop", () => playback.stop());
  ipcMain.handle("player:seek", (_event, seconds: number) => playback.seek(seconds));
  ipcMain.handle("player:setVolume", (_event, volume: number) => playback.setVolume(volume));
  ipcMain.handle("player:setMuted", (_event, muted: boolean) => playback.setMuted(muted));
  ipcMain.handle("player:subscribeState", (event) => {
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
  ipcMain.handle("player:unsubscribeState", (event) => {
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
  ipcMain.handle("engine:subscribeJobEvents", (event, jobId: string) => {
    engine.subscribeJobEvents(jobId, event.sender.id, event.sender);
    return { ok: true };
  });
  ipcMain.handle("engine:unsubscribeJobEvents", (event, jobId: string) => {
    engine.unsubscribeJobEvents(jobId, event.sender.id);
    return { ok: true };
  });
  ipcMain.handle("dialog:openXml", async () => {
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
  ipcMain.handle("dialog:openCsv", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await showOpenDialogFor(win, {
      properties: ["openFile"],
      filters: [{ name: "CuePoint CSV", extensions: ["csv"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const };
    }
    return { canceled: false as const, filePath: result.filePaths[0] };
  });
  ipcMain.handle("dialog:openM3u", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await showOpenDialogFor(win, {
      properties: ["openFile"],
      filters: [{ name: "Playlist", extensions: ["m3u", "m3u8"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const };
    }
    return { canceled: false as const, filePath: result.filePaths[0] };
  });
  ipcMain.handle(
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
  const status = await engine.start();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const url = new URL(DEV_URL);
    url.searchParams.set("engine", status.connected ? "1" : "0");
    if (status.version) url.searchParams.set("engineVersion", status.version);
    await win.loadURL(url.toString());
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(path.join(__dirname, "../renderer/dist/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  const tasks: Array<Promise<unknown>> = [];
  if (privacyExitPrefs.clearCacheOnExit) tasks.push(engine.clearCuepointCache());
  if (privacyExitPrefs.clearLogsOnExit) tasks.push(engine.clearCuepointLogs());
  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
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
