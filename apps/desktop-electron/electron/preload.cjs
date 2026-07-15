const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("cuepoint", {
  getEngineStatus: () => ipcRenderer.invoke("engine:status"),
  startMatchJob: (body) => ipcRenderer.invoke("engine:startMatchJob", body),
  getJob: (jobId) => ipcRenderer.invoke("engine:getJob", jobId),
  getJobResults: (jobId) => ipcRenderer.invoke("engine:getJobResults", jobId),
  exportResults: (body) => ipcRenderer.invoke("engine:exportResults", body),
  getIncrateInventory: (params) => ipcRenderer.invoke("engine:getIncrateInventory", params),
  importIncrateXml: (body) => ipcRenderer.invoke("engine:importIncrateXml", body),
  resetIncrateInventory: () => ipcRenderer.invoke("engine:resetIncrateInventory"),
  getIncrateDiscoverOptions: () => ipcRenderer.invoke("engine:getIncrateDiscoverOptions"),
  runIncrateDiscover: (body) => ipcRenderer.invoke("engine:runIncrateDiscover", body),
  createIncratePlaylist: (body) => ipcRenderer.invoke("engine:createIncratePlaylist", body),
  cancelMatchJob: (jobId) => ipcRenderer.invoke("engine:cancelMatchJob", jobId),
  getBeatportTokenStatus: () => ipcRenderer.invoke("engine:getBeatportTokenStatus"),
  setBeatportToken: (token) => ipcRenderer.invoke("engine:setBeatportToken", token),
  testBeatportToken: (body) => ipcRenderer.invoke("engine:testBeatportToken", body),
  getHistoryRecent: (params) => ipcRenderer.invoke("engine:getHistoryRecent", params),
  loadHistoryCsv: (csvPath) => ipcRenderer.invoke("engine:loadHistoryCsv", csvPath),
  getXmlPlaylists: (xmlPath) => ipcRenderer.invoke("engine:getXmlPlaylists", xmlPath),
  syncTags: (body) => ipcRenderer.invoke("engine:syncTags", body),
  exportSupportBundle: (options) => ipcRenderer.invoke("support:exportBundle", options ?? {}),
  showItemInFolder: (filePath) => ipcRenderer.invoke("shell:showItemInFolder", filePath),
  subscribeJobEvents: (jobId, onEvent) => {
    const eventHandler = (_event, payload) => {
      if (payload?.jobId === jobId) onEvent(payload.event);
    };
    const endHandler = (_event, payload) => {
      if (payload?.jobId !== jobId) return;
      ipcRenderer.removeListener("engine:jobEvent", eventHandler);
      ipcRenderer.removeListener("engine:jobEventEnd", endHandler);
    };
    ipcRenderer.on("engine:jobEvent", eventHandler);
    ipcRenderer.on("engine:jobEventEnd", endHandler);
    void ipcRenderer.invoke("engine:subscribeJobEvents", jobId);
    return () => {
      ipcRenderer.removeListener("engine:jobEvent", eventHandler);
      ipcRenderer.removeListener("engine:jobEventEnd", endHandler);
      void ipcRenderer.invoke("engine:unsubscribeJobEvents", jobId);
    };
  },
  openXmlFileDialog: () => ipcRenderer.invoke("dialog:openXml"),
  openCsvFileDialog: () => ipcRenderer.invoke("dialog:openCsv"),
  openM3uFileDialog: () => ipcRenderer.invoke("dialog:openM3u"),
  resolveDroppedFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  saveExportFileDialog: (options) => ipcRenderer.invoke("dialog:saveExport", options),
});
