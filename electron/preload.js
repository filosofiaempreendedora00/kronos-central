/* ===========================================================================
   KRONOS CENTRAL — preload do Electron
   Expõe ao app, de forma segura, um marcador de runtime e o IP Tailscale
   detectado localmente (para autopreencher o acesso mobile). Nada é gravado
   em disco nem servido pela rede.
   =========================================================================== */

const { contextBridge } = require("electron");
const os = require("os");

function tailscaleHost() {
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const ni of ifaces[name] || []) {
        // Tailscale usa a faixa CGNAT 100.64.0.0/10
        if (ni.family === "IPv4" && !ni.internal && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ni.address)) {
          return ni.address;
        }
      }
    }
  } catch (_) {}
  return null;
}

contextBridge.exposeInMainWorld("KRONOS_NATIVE", {
  platform: "mac",
  runtime: "electron",
  tailscaleHost: tailscaleHost(),
});
