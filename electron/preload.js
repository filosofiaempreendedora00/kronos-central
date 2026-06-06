/* ===========================================================================
   KRONOS CENTRAL — preload do Electron
   Ponte segura entre o app web e o processo nativo (reservado para o futuro:
   ex.: armazenamento nativo da chave da API, notificações, IPC).
   Por enquanto, apenas expõe um marcador para o web saber que roda no desktop.
   =========================================================================== */

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("KRONOS_NATIVE", {
  platform: "mac",
  runtime: "electron",
});
