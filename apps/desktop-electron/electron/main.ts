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
