/**
 * The recovery page's preload (HARDEN-05): two calls and nothing else.
 *
 * `recovery.html` is shown when the window has stopped twice in a minute. It has no app bundle, so
 * it gets none of `preload.cjs`'s bridge; only `reload` (open the app's window again) and `report`
 * (Report a problem, run from main). Neither takes an argument. Kept to one file with no
 * dependencies but Electron's own, so it also runs sandboxed.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cuepointRecovery", {
  reload: () => ipcRenderer.invoke("recovery:reload"),
  report: () => ipcRenderer.invoke("recovery:report"),
});
