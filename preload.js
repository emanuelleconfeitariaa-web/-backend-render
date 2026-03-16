const { contextBridge, ipcRenderer } = require("electron");
console.log("[preload] carregado com sucesso");

contextBridge.exposeInMainWorld("electronAPI", {
  openStore: () => ipcRenderer.invoke("open-store"),
});
