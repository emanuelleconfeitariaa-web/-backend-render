const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

let server;

function createWindow(relPath) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#f6ebe5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const full = path.join(__dirname, relPath);
  console.log("[Electron] Abrindo:", full);
  win.loadFile(full);
  return win;
}

// ✅ janela da loja LOCAL
function createStoreLocalWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#f6ebe5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const full = path.join(__dirname, "app/renderer/store/index.html");
  console.log("[Electron] Abrindo LOJA LOCAL:", full);
  win.loadFile(full);

  return win;
}

app.whenReady().then(async () => {
  // inicia API
  const serverPath = path.join(__dirname, "app/server/server.js");
  console.log("[Electron] Server:", serverPath);

  server = require(serverPath);
  await server.start();

  // abre ADMIN
  createWindow("app/renderer/admin/index.html");

  // ✅ handler ÚNICO: abre loja LOCAL
ipcMain.handle("open-store", async () => {
  createStoreLocalWindow();
  return true;
   });
});

app.on("window-all-closed", async () => {
  if (server) await server.stop();
  app.quit();
});