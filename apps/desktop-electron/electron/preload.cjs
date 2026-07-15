const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cuepoint", {
  getEngineStatus: () => ipcRenderer.invoke("engine:status"),
  startMatchJob: (body) => ipcRenderer.invoke("engine:startMatchJob", body),
  getJob: (jobId) => ipcRenderer.invoke("engine:getJob", jobId),
  getJobResults: (jobId) => ipcRenderer.invoke("engine:getJobResults", jobId),
  openXmlFileDialog: () => ipcRenderer.invoke("dialog:openXml"),
});
