/* ===========================================================================
   KRONOS CENTRAL — Configurações (chave da API + acesso mobile via Tailscale)
   =========================================================================== */

const Settings = (() => {
  const LS_KEY = "kronos.apiKey";
  const LS_HOST = "kronos.mobileHost";
  const LS_PORT = "kronos.mobilePort";

  let cfgHost = null;
  let cfgPort = null;

  async function loadConfig() {
    try {
      const r = await fetch("mobile-config.json", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        cfgHost = j.host || null;
        cfgPort = j.port || null;
      }
    } catch (_) {}
    // se a Central foi aberta a partir de um host Tailscale, sugere-o
    const h = location.hostname;
    if (!cfgHost && h && h !== "localhost" && h !== "127.0.0.1" && h !== "") cfgHost = h;
  }

  const hostDefault = () => localStorage.getItem(LS_HOST) || cfgHost || "";
  const portDefault = () => localStorage.getItem(LS_PORT) || (cfgPort ? String(cfgPort) : "4599");

  /* ------------------------------- Abrir --------------------------------- */
  function open() {
    ["dashboardView", "chatView", "delfosView", "costsView"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) e.hidden = true;
    });
    document.getElementById("settingsView").hidden = false;

    document.getElementById("apiKeyInput").value = localStorage.getItem(LS_KEY) || "";
    updateKeyStatus();

    document.getElementById("mobileHost").value = hostDefault();
    document.getElementById("mobilePort").value = portDefault();
    renderMobile();
  }

  function close() {
    document.getElementById("settingsView").hidden = true;
    document.getElementById("dashboardView").hidden = false;
  }

  /* ----------------------------- Chave da API ---------------------------- */
  function saveKey() {
    const v = document.getElementById("apiKeyInput").value.trim();
    if (v) localStorage.setItem(LS_KEY, v);
    else localStorage.removeItem(LS_KEY);
    updateKeyStatus();
  }
  function updateKeyStatus() {
    const el = document.getElementById("apiKeyStatus");
    const has = !!localStorage.getItem(LS_KEY);
    el.textContent = has ? "Chave configurada ✓" : "Nenhuma chave salva.";
    el.classList.toggle("settings__status--ok", has);
  }

  /* ----------------------------- Acesso mobile --------------------------- */
  function mobileUrl() {
    const h = document.getElementById("mobileHost").value.trim();
    const p = document.getElementById("mobilePort").value.trim() || "4599";
    if (!h) return "";
    return `http://${h}:${p}`;
  }

  function renderMobile() {
    const url = mobileUrl();
    const urlEl = document.getElementById("mobileUrl");
    const qrEl = document.getElementById("mobileQr");

    if (!url) {
      urlEl.textContent = "Informe o host para gerar o QR.";
      urlEl.removeAttribute("href");
      qrEl.innerHTML = `<span class="settings__qrempty">QR</span>`;
      return;
    }
    urlEl.textContent = url;
    urlEl.href = url;

    try {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    } catch (e) {
      qrEl.innerHTML = `<span class="settings__qrempty">erro</span>`;
    }
  }

  function saveMobile() {
    const h = document.getElementById("mobileHost").value.trim();
    const p = document.getElementById("mobilePort").value.trim();
    if (h) localStorage.setItem(LS_HOST, h); else localStorage.removeItem(LS_HOST);
    if (p) localStorage.setItem(LS_PORT, p); else localStorage.removeItem(LS_PORT);
    renderMobile();
  }

  /* ------------------------------- Bind ---------------------------------- */
  function bind() {
    document.getElementById("settingsBtn").addEventListener("click", open);
    document.getElementById("settingsBackBtn").addEventListener("click", close);
    document.getElementById("saveApiKeyBtn").addEventListener("click", saveKey);
    document.getElementById("apiKeyInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveKey();
    });
    ["mobileHost", "mobilePort"].forEach((id) =>
      document.getElementById(id).addEventListener("input", saveMobile)
    );
    document.getElementById("copyUrlBtn").addEventListener("click", () => {
      const u = mobileUrl();
      if (u && navigator.clipboard) navigator.clipboard.writeText(u);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("settingsView").hidden) close();
    });

    loadConfig(); // carrega defaults em segundo plano
  }

  return { open, close, bind };
})();
