/* ===========================================================================
   KRONOS CENTRAL — Configurações (chave da API + acesso mobile via Tailscale)
   =========================================================================== */

const Settings = (() => {
  const LS_KEY = "kronos.apiKey";
  const LS_HOST = "kronos.mobileHost";
  const LS_PORT = "kronos.mobilePort";

  let cfgHost = null;
  let cfgPort = null;
  let includeKey = false;

  /* Recebe a chave via fragmento do QR de pareamento (#k=...).
     O fragmento não é enviado ao servidor; após semear, limpamos a URL. */
  function consumePairingHash() {
    const h = location.hash || "";
    const m = h.match(/[#&]k=([^&]+)/);
    if (!m) return;
    try {
      const key = decodeURIComponent(m[1]);
      if (key) localStorage.setItem(LS_KEY, key);
    } catch (_) {}
    history.replaceState(null, "", location.pathname + location.search);
  }

  function loadConfig() {
    // 1) IP Tailscale detectado pelo app nativo (Mac), sem arquivo nem rede
    const native = typeof window !== "undefined" ? window.KRONOS_NATIVE : null;
    if (native && native.tailscaleHost) cfgHost = native.tailscaleHost;
    // 2) ou, no celular, o próprio host de onde a Central foi aberta
    const h = location.hostname;
    if (!cfgHost && h && h !== "localhost" && h !== "127.0.0.1" && h !== "") cfgHost = h;
    cfgPort = 4599;
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
    renderMobile(); // habilita/atualiza o QR de pareamento
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

    // o checkbox de pareamento só vale se houver host e chave salva
    const key = localStorage.getItem(LS_KEY) || "";
    const chk = document.getElementById("pairKeyChk");
    const warn = document.getElementById("pairWarn");
    const canPair = !!url && !!key;
    if (chk) chk.disabled = !canPair;
    const pairing = includeKey && canPair;
    if (warn) warn.hidden = !pairing;

    if (!url) {
      urlEl.textContent = "Informe o host para gerar o QR.";
      urlEl.removeAttribute("href");
      qrEl.innerHTML = `<span class="settings__qrempty">QR</span>`;
      return;
    }
    // a URL visível é sempre sem a chave; só o QR de pareamento a embute (no #)
    urlEl.textContent = url;
    urlEl.href = url;
    const qrData = pairing ? `${url}/#k=${encodeURIComponent(key)}` : url;

    try {
      const qr = qrcode(0, "M");
      qr.addData(qrData);
      qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
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
    consumePairingHash(); // se veio do QR de pareamento, semeia a chave

    document.getElementById("pairKeyChk").addEventListener("change", (e) => {
      includeKey = e.target.checked;
      renderMobile();
    });
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
