/* ===========================================================================
   LEADS — a casa do DamIAno (CRO). Clarity 2.0 dos leads da Kronos.

   Lê www/contexto/leads.json (CIFRADO) e decifra com a chave do cofre. Cada
   lead com granularidade de comportamento (sessões, tempo, visitas, downloads,
   timeline), tags coloridas de temperatura/fonte, e WhatsApp com trava LGPD
   (só clicável se o contato foi autorizado — whatsappOptin). Mobile-first.
   Snapshot: `node scripts/ler-leads.mjs` (Supabase só-leitura + funnel_events).
   =========================================================================== */
const Leads = (() => {
  const PATH = "www/contexto/leads.json";
  let DOC = null, BYID = {};
  const state = { temp: "todos", source: "todos" };

  const TEMP = {
    cliente: { l: "Cliente", c: "lead-t--cliente" }, quente: { l: "Quente", c: "lead-t--quente" },
    morno: { l: "Morno", c: "lead-t--morno" }, frio: { l: "Frio", c: "lead-t--frio" },
  };
  const srcB = (s) => ({
    meta: { l: "Meta", c: "lead-s--meta" }, google: { l: "Google", c: "lead-s--google" },
    direto: { l: "Direto", c: "lead-s--direto" }, direct: { l: "Direto", c: "lead-s--direto" },
  }[s] || { l: s ? s[0].toUpperCase() + s.slice(1) : "—", c: "lead-s--direto" });

  const EVL = {
    landing_view: "Viu a landing", signup_submitted: "Cadastrou", onboarding_view: "Abriu o onboarding",
    business_described: "Descreveu o negócio", catalog_generated: "IA gerou o catálogo",
    proposal_ready: "Proposta pronta", chegou_ao_gerador: "Entrou no gerador",
    fillmode_selected: "Escolheu o modo", transcript_uploaded: "Subiu um transcript",
    transcript_generated: "Gerou por transcript", download_attempt: "Tentou baixar",
    download_blocked: "Baixar bloqueado", download_success: "Baixou ✓", example_downloaded: "Baixou exemplo",
    watermark_download: "Baixou c/ marca d'água", upgrade_prompt_view: "Viu a oferta",
    upgrade_prompt_click: "Clicou na oferta", unlock_click: "Clicou em desbloquear",
  };
  const evl = (e) => EVL[e] || e;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const since = (iso) => {
    if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return "há " + m + "min"; const h = Math.round(m / 60);
    if (h < 24) return "há " + h + "h"; return "há " + Math.round(h / 24) + "d";
  };
  const dt = (iso) => { if (!iso) return "—"; const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
  const waUrl = (n) => "https://wa.me/" + String(n).replace(/\D/g, "");

  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return null;
    let res; try { res = await Sync.readJson(PATH); } catch (_) { return null; }
    const env = res && res.json; if (!env) return null;
    try { const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
      return (doc && Array.isArray(doc.leads)) ? doc : null; } catch (_) { return null; }
  }

  const filtered = () => (DOC.leads || []).filter((l) =>
    (state.temp === "todos" || l.temperature === state.temp) &&
    (state.source === "todos" || l.source === state.source || (state.source === "direto" && l.source === "direct")));

  function renderKpis() {
    const el = document.getElementById("leadsKpis"); if (!el) return;
    const t = DOC.totals || {};
    const tile = (n, lbl, cls, sub) =>
      `<div class="lead-kpi ${cls || ""}"><div class="lead-kpi__n">${n ?? 0}</div><div class="lead-kpi__l">${lbl}</div>${sub ? `<div class="lead-kpi__s">${sub}</div>` : ""}</div>`;
    el.innerHTML =
      tile(t.total, "Leads") +
      tile(t.quente, "Quentes", "lead-t--quente") + tile(t.morno, "Mornos", "lead-t--morno") +
      tile(t.frio, "Frios", "lead-t--frio") + tile(t.baixaram, "Baixaram") +
      tile(t.paywall, "No paywall") + tile(t.voltaram, "Voltaram", "", "≥2 sessões") +
      tile((t.avgSessionMin ?? 0) + "min", "Sessão média") +
      tile(t.comWhatsOptin + "/" + t.comWhats, "WhatsApp", "", "opt-in / total");
  }

  function renderControls() {
    const el = document.getElementById("leadsControls"); if (!el) return;
    const chip = (g, v, l, on) => `<button class="lead-chip${on ? " is-active" : ""}" data-g="${g}" data-v="${v}" type="button">${l}</button>`;
    el.innerHTML =
      `<div class="lead-chips">${["todos", "cliente", "quente", "morno", "frio"].map((v) => chip("temp", v, v === "todos" ? "Todas" : TEMP[v].l, state.temp === v)).join("")}</div>` +
      `<div class="lead-chips">${["todos", "meta", "google", "direto"].map((v) => chip("source", v, v === "todos" ? "Toda fonte" : srcB(v).l, state.source === v)).join("")}</div>`;
    el.querySelectorAll(".lead-chip").forEach((b) => b.addEventListener("click", () => {
      state[b.dataset.g] = b.dataset.v; renderControls(); renderList();
    }));
  }

  function renderList() {
    const el = document.getElementById("leadsList"); if (!el) return;
    const list = filtered();
    if (!list.length) { el.innerHTML = `<p class="lead-empty">Nenhum lead com esse filtro.</p>`; return; }
    el.innerHTML = list.map((l) => {
      const t = TEMP[l.temperature] || TEMP.frio, s = srcB(l.source);
      const b = l.behavior;
      const waDot = l.whatsapp ? `<span class="lead-wadot ${l.whatsappOptin ? "is-ok" : "is-block"}" title="${l.whatsappOptin ? "WhatsApp autorizado" : "WhatsApp sem autorização (LGPD)"}"></span>` : "";
      const back = b && b.sessions >= 2 ? `<span class="lead-back" title="voltou ${b.sessions}×">↻${b.sessions}</span>` : "";
      return `<button class="lead-row" data-id="${esc(l.id)}" type="button">
        <span class="lead-badge ${t.c}">${t.l}</span>
        <span class="lead-id">${esc(l.email || l.name || "—")}</span>
        ${waDot}
        <span class="lead-tag ${s.c}">${s.l}</span>
        <span class="lead-dl">${l.downloads > 0 ? "⬇" + l.downloads : ""}</span>
        ${back}
        <span class="lead-when">${since((b && b.lastSeen) || l.createdAt)}</span>
      </button>`;
    }).join("");
    el.querySelectorAll(".lead-row").forEach((r) => r.addEventListener("click", () => openDetail(r.dataset.id)));
  }

  function whatsBlock(l) {
    if (!l.whatsapp) return `<div class="lead-wa-block is-none">Sem WhatsApp cadastrado</div>`;
    if (l.whatsappOptin)
      return `<a class="lead-wa-block is-ok" href="${waUrl(l.whatsapp)}" target="_blank" rel="noopener">
        <span>💬 ${esc(l.whatsapp)}</span><span class="lead-wa-cta">Abrir no WhatsApp →</span>
        <span class="lead-wa-note">✓ Autorizou contato</span></a>`;
    return `<div class="lead-wa-block is-block">
      <span>🔒 ${esc(l.whatsapp)}</span>
      <span class="lead-wa-note">⚠ Sem autorização de contato (LGPD). Não abrir — o lead não consentiu.</span></div>`;
  }

  function openDetail(id) {
    const l = BYID[id]; if (!l) return;
    const drawer = document.getElementById("leadDrawer"), panel = document.getElementById("leadDrawerPanel");
    if (!drawer || !panel) return;
    const t = TEMP[l.temperature] || TEMP.frio, s = srcB(l.source), b = l.behavior;
    const stat = (n, lbl) => `<div class="lead-d-stat"><div class="lead-d-stat__n">${n}</div><div class="lead-d-stat__l">${lbl}</div></div>`;
    const behaviorHtml = b ? `
      <div class="lead-d-stats">
        ${stat(b.sessions, "Sessões")}${stat(b.visitDays, "Dias distintos")}
        ${stat(b.avgSessionMin + "min", "Sessão média")}${stat(b.totalMin + "min", "Tempo total")}
      </div>
      <div class="lead-d-stats">
        ${stat(b.key.downloads, "Baixou")}${stat(b.key.watermark, "C/ marca")}
        ${stat(b.key.unlockClicks, "Cliques desbloq.")}${stat(b.key.transcripts, "Transcript")}
      </div>
      <div class="lead-d-meta">${(b.devices || []).map((d) => `<span class="lead-tag lead-s--direto">${d}</span>`).join(" ")} · visto ${since(b.lastSeen)}</div>
      <h4 class="lead-d-h">Linha do tempo</h4>
      <div class="lead-d-timeline">${(b.timeline || []).slice().reverse().map((e) =>
        `<div class="lead-d-ev"><span class="lead-d-ev__t">${dt(e.t)}</span><span class="lead-d-ev__e">${esc(evl(e.e))}</span></div>`).join("")}</div>
    ` : `<p class="lead-empty">Sem eventos de comportamento registrados ainda.</p>`;
    panel.innerHTML = `
      <div class="lead-d-head">
        <div>
          <span class="lead-badge ${t.c}">${t.l}</span> <span class="lead-tag ${s.c}">${s.l}</span>
          <h3 class="lead-d-name">${esc(l.email || l.name || "—")}</h3>
          ${l.catalogo ? `<p class="lead-d-cat">${esc(l.catalogo)}</p>` : ""}
          <p class="lead-d-sub">Cadastrou ${since(l.createdAt)} · plano ${esc(l.plan || "—")} · ${l.status === "active" ? "PAGANTE" : "grátis"}</p>
        </div>
        <button class="lead-d-close" id="leadDClose" type="button" aria-label="Fechar">✕</button>
      </div>
      ${whatsBlock(l)}
      ${behaviorHtml}`;
    drawer.hidden = false;
    document.getElementById("leadDClose").addEventListener("click", closeDetail);
  }
  function closeDetail() { const d = document.getElementById("leadDrawer"); if (d) d.hidden = true; }

  async function render() {
    const meta = document.getElementById("leadsMeta");
    DOC = await load();
    if (!DOC) { if (meta) meta.textContent = "sem dados (rode ler-leads.mjs)"; return; }
    BYID = {}; (DOC.leads || []).forEach((l) => { BYID[l.id] = l; });
    if (meta) meta.textContent = `${(DOC.totals || {}).total ?? 0} leads · ${since(DOC.updatedAt)}`;
    renderKpis(); renderControls(); renderList();
    const bd = document.getElementById("leadDrawerBackdrop");
    if (bd && !bd.dataset.wired) { bd.dataset.wired = "1"; bd.addEventListener("click", closeDetail); }
  }

  async function open() { if (typeof showView === "function") showView("leadsView"); await render(); }

  return { open, render };
})();
