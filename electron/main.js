/* ===========================================================================
   KRONOS CENTRAL — Processo principal do Electron (app Mac)
   Sobe um servidor HTTP local (acessível pela rede Tailscale) e carrega o
   web app a partir dele — assim o celular abre a mesma Central pelo Tailscale,
   sem precisar rodar nenhum comando à parte.
   =========================================================================== */

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const ICON = path.join(__dirname, "..", "build", "icon.png");
const WWW = path.join(__dirname, "..", "www");
const PORT = 4599;

// Versão hospedada (GitHub Pages): sempre atualizada. O app do Mac carrega
// daqui quando há internet — assim todo deploy aparece sem precisar rebuildar.
// Sem internet, cai para a cópia local embutida (servidor abaixo / arquivo).
const HOSTED_URL = "https://filosofiaempreendedora00.github.io/kronos-central/";

app.setName("KRONOS Central");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/* Servidor estático simples (sem dependências), ligado a 0.0.0.0 para a rede. */
function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      } catch (_) {
        pathname = "/";
      }
      if (pathname === "/" || pathname === "") pathname = "/index.html";
      const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(WWW, safe);
      if (!filePath.startsWith(WWW)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.on("error", () => resolve(null)); // porta ocupada, etc.
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}

function createWindow(loadUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: "#150C06",
    title: "KRONOS Central",
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // permite o preload usar 'os' p/ detectar o IP Tailscale
    },
  });

  // Carrega a cópia local embutida (offline / fallback).
  const loadLocal = () => {
    if (loadUrl) win.loadURL(loadUrl);
    else win.loadFile(path.join(WWW, "index.html"));
  };

  // Online: carrega a versão hospedada (sempre a mais nova).
  win.loadURL(HOSTED_URL);

  // Se o carregamento do hospedado falhar (sem internet, Pages fora do ar),
  // cai para a cópia local. Ignora -3 (ABORTED, normal em redirecionamentos).
  let usedFallback = false;
  win.webContents.on("did-fail-load", (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || usedFallback) return;
    if (validatedURL && validatedURL.startsWith("https://filosofiaempreendedora00.github.io")) {
      usedFallback = true;
      loadLocal();
    }
  });

  // Links externos (modo Easy → claude.ai) abrem no navegador padrão.
  // O próprio app (hospedado ou local) navega dentro da janela.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const interno =
      url.startsWith(HOSTED_URL) || url.startsWith(`http://localhost:${PORT}`);
    if (/^https?:\/\//.test(url) && !interno) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

app.whenReady().then(async () => {
  app.setAboutPanelOptions({
    applicationName: "KRONOS Central",
    applicationVersion: app.getVersion(),
    copyright: "KRONOS",
  });
  if (process.platform === "darwin" && app.dock) {
    try { app.dock.setIcon(ICON); } catch (_) {}
  }

  const server = await startServer(PORT);
  const loadUrl = server ? `http://localhost:${PORT}/index.html` : null;
  createWindow(loadUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(loadUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
