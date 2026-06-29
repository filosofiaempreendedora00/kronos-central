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
    App.showView("settingsView");
    showPane("geral");

    document.getElementById("apiKeyInput").value = localStorage.getItem(LS_KEY) || "";
    updateKeyStatus();

    document.getElementById("ghTokenInput").value = (typeof Sync !== "undefined") ? Sync.token() : "";
    updateGhStatus();

    document.getElementById("mobileHost").value = hostDefault();
    document.getElementById("mobilePort").value = portDefault();
    renderMobile();
  }

  function close() {
    App.navGo("dash");
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

  /* --------------------- Token do GitHub (publicar) --------------------- */
  function saveGhToken() {
    // PAT do GitHub só tem [A-Za-z0-9_]. Remove espaços, quebras e caracteres
    // invisíveis que o teclado/colagem do celular costuma injetar (causa de 401).
    const input = document.getElementById("ghTokenInput");
    const raw = input.value || "";
    const v = raw.replace(/[^A-Za-z0-9_]/g, "");
    if (v !== raw) input.value = v; // reflete o valor limpo de volta no campo
    if (typeof Sync !== "undefined") {
      Sync.setToken(v);
      Sync.load().then(updateGhStatus); // valida o token buscando o arquivo
    }
    updateGhStatus();
  }
  function updateGhStatus() {
    const el = document.getElementById("ghTokenStatus");
    if (!el) return;
    if (typeof Sync === "undefined") { el.textContent = ""; return; }
    const s = Sync.status();
    if (!s.configured) {
      el.textContent = "Sem token — os ajustes do IAgo ficam só neste aparelho.";
      el.classList.remove("settings__status--ok");
      return;
    }
    el.textContent = s.error
      ? ("Token salvo, mas houve um erro de acesso: " + s.error)
      : `Token configurado ✓ · ${s.count} ajuste(s) publicado(s).`;
    el.classList.toggle("settings__status--ok", !s.error);
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

  /* ----------------------------- Sub-abas -------------------------------- */
  function showPane(p) {
    document.querySelectorAll("#settingsNav .settings__navitem").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.pane === p));
    const g = document.getElementById("pane-geral");
    const i = document.getElementById("pane-integracoes");
    if (g) g.hidden = p !== "geral";
    if (i) i.hidden = p !== "integracoes";
  }

  /* ----------------------------- Integrações ----------------------------- */
  const INTEGRATIONS = [
    { name: "Supabase", color: "#3ECF8E", glyph: "db", status: "Conectado · só-leitura", ok: true,
      desc: "Banco do Gerador — o funil de usuários (cadastros, ativação, pagantes).", reads: "Funil do produto", via: "role kronos_ro (read-only) · ler-gerador.mjs" },
    { name: "Meta Ads", color: "#0866FF", glyph: "mega", status: "Conectado · só-leitura", ok: true,
      desc: "Gasto, cliques, cadastros e desempenho por criativo e dispositivo.", reads: "Tráfego pago", via: "token ads_read · ler-metaads.mjs" },
    { name: "Microsoft Clarity", color: "#1E88C7", glyph: "eye", status: "Conectado · só-leitura", ok: true,
      desc: "Comportamento real: rage/dead clicks, quickback, scroll — por página.", reads: "Frustração / sessões", via: "token Data.Export · ler-clarity.mjs" },
    { name: "Brevo", color: "#0B996E", glyph: "mail", status: "Conectado · só-leitura", ok: true,
      desc: "E-mail transacional (deliverability) e base de contatos/leads.", reads: "E-mail & leads", via: "API key (GET) · ler-brevo.mjs" },
    { name: "Google Ads", color: "#4285F4", glyph: "target", status: "Tracking instalado · leitura a conectar", ok: false,
      desc: "Conversões de Cadastro e Ativação instaladas (AW-730378227).", reads: "Conversões (desktop)", via: "tag do Google · leitura read-only pendente" },
    { name: "Kiwify", color: "#04BF7B", glyph: "cart", status: "Pagamento (checkout)", ok: false,
      desc: "Processa o pagamento das assinaturas dos planos.", reads: "—", via: "checkout externo" },
  ];

  function glyphSvg(k) {
    const g = {
      db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
      mega: '<path d="M4 10v4h3l8 4V6l-8 4H4z"/><path d="M18.5 9a4 4 0 0 1 0 6"/>',
      eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
      target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.1" fill="white"/>',
      cart: '<circle cx="9.5" cy="20" r="1.4" fill="white"/><circle cx="17" cy="20" r="1.4" fill="white"/><path d="M3 4h2l2.4 12h10l1.9-8H6.2"/>',
    };
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${g[k] || ""}</svg>`;
  }

  function renderIntegracoes() {
    const el = document.getElementById("integGrid");
    if (!el) return;
    el.innerHTML = INTEGRATIONS.map((it) => `
      <div class="integ-card">
        <div class="integ-card__head">
          <span class="integ-logo" style="--c:${it.color}">${glyphSvg(it.glyph)}</span>
          <span class="integ-card__titlewrap">
            <span class="integ-card__name">${it.name}</span>
            <span class="integ-status ${it.ok ? "integ-status--ok" : "integ-status--pend"}">${it.status}</span>
          </span>
        </div>
        <p class="integ-card__desc">${it.desc}</p>
        <div class="integ-card__meta">
          <span><b>Lê:</b> ${it.reads}</span>
          <span class="integ-card__via">${it.via}</span>
        </div>
      </div>`).join("");
  }

  /* ------------------------------- Bind ---------------------------------- */
  function bind() {
    consumePairingHash(); // se veio do QR de pareamento, semeia a chave

    renderIntegracoes();
    document.querySelectorAll("#settingsNav .settings__navitem").forEach((b) =>
      b.addEventListener("click", () => showPane(b.dataset.pane)));

    document.getElementById("pairKeyChk").addEventListener("change", (e) => {
      includeKey = e.target.checked;
      renderMobile();
    });
    // abertura agora é pela sidebar (nav "Configurar"); aqui só o voltar.
    document.getElementById("settingsBackBtn").addEventListener("click", close);
    document.getElementById("saveApiKeyBtn").addEventListener("click", saveKey);
    document.getElementById("apiKeyInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveKey();
    });
    document.getElementById("saveGhTokenBtn").addEventListener("click", saveGhToken);
    document.getElementById("ghTokenInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveGhToken();
    });
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
      if (typeof Auth !== "undefined" && confirm("Sair e bloquear a Central neste aparelho?")) Auth.logout();
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
