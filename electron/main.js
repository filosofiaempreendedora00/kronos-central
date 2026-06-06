/* ===========================================================================
   KRONOS CENTRAL — Processo principal do Electron (app Mac)
   Embrulha o mesmo web app estático (index.html) numa janela nativa.
   =========================================================================== */

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const ICON = path.join(__dirname, "..", "build", "icon.png");

// Nome do app (afeta menu/Sobre/notificações; no .app empacotado vem do productName)
app.setName("KRONOS Central");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: "#150C06", // Ônix Quente — evita flash branco ao abrir
    title: "KRONOS Central",
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "www", "index.html"));

  // Links externos (modo Easy → claude.ai) abrem no navegador padrão,
  // não dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: "KRONOS Central",
    applicationVersion: app.getVersion(),
    copyright: "KRONOS",
  });
  // Ícone no Dock (macOS) durante o desenvolvimento
  if (process.platform === "darwin" && app.dock) {
    try { app.dock.setIcon(ICON); } catch (_) {}
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
