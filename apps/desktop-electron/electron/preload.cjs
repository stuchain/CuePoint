const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cuepoint", {
  getEngineStatus: () => ipcRenderer.invoke("engine:status"),
  startMatchJob: (body) => ipcRenderer.invoke("engine:startMatchJob", body),
  getJob: (jobId) => ipcRenderer.invoke("engine:getJob", jobId),
  getJobResults: (jobId) => ipcRenderer.invoke("engine:getJobResults", jobId),
  exportResults: (body) => ipcRenderer.invoke("engine:exportResults", body),
  getIncrateInventory: (params) => ipcRenderer.invoke("engine:getIncrateInventory", params),
  importIncrateXml: (body) => ipcRenderer.invoke("engine:importIncrateXml", body),
  cancelMatchJob: (jobId) => ipcRenderer.invoke("engine:cancelMatchJob", jobId),
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
  saveExportFileDialog: (options) => ipcRenderer.invoke("dialog:saveExport", options),
});
