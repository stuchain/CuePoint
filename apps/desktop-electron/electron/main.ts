/**
 * Electron main process — Spike S1: spawn engine and expose status to renderer.
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EngineSupervisor, resolvePreloadPath } from "./engineSupervisor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const DEV_URL = process.env.CUEPOINT_RENDERER_URL ?? "http://localhost:5173";

const engine = new EngineSupervisor();

function registerIpcHandlers(): void {
  ipcMain.handle("engine:status", () => engine.getStatus());
  ipcMain.handle("engine:startMatchJob", (_event, body) => engine.startMatchJob(body));
  ipcMain.handle("engine:getJob", (_event, jobId: string) => engine.getJob(jobId));
  ipcMain.handle("engine:getJobResults", (_event, jobId: string) => engine.getJobResults(jobId));
  ipcMain.handle("engine:exportResults", (_event, body) => engine.exportResults(body));
  ipcMain.handle("engine:getIncrateInventory", (_event, params) => engine.getIncrateInventory(params));
  ipcMain.handle("engine:importIncrateXml", (_event, body) => engine.importIncrateXml(body));
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
    const result = await dialog.showOpenDialog(win ?? undefined, {
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
    const result = await dialog.showOpenDialog(win ?? undefined, {
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
    const result = await dialog.showOpenDialog(win ?? undefined, {
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
      const result = await dialog.showSaveDialog(win ?? undefined, {
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
  void engine.stop().finally(() => {
    if (process.platform !== "darwin") app.quit();
  });
});

app.on("before-quit", () => {
  void engine.stop();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
