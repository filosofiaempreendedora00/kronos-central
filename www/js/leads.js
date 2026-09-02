/* ===========================================================================
   LEADS — a casa do DamIAno (CRO). Um sinal só: TEMPERATURA (dinâmica).

   Lê www/contexto/leads.json (CIFRADO) e decifra com a chave do cofre. A
   temperatura já é engajamento (proximidade do dinheiro) DECAÍDO pela recência
   — então é a própria propensão-agora. Quente que some vira morno e depois frio
   sozinho (o cron reavalia de 4/4h). WhatsApp com trava LGPD. Mobile-first.
   =========================================================================== */
const Leads = (() => {
  const PATH = "www/contexto/leads.json";
  let DOC = null, BYID = {};
  const state = { temp: "todos", source: "todos", sort: "recente" };

  const TEMP = {
    cliente: { l: "Cliente", c: "lead-t--cliente" }, quente: { l: "Quente", c: "lead-t--quente" },
    morno: { l: "Morno", c: "lead-t--morno" }, frio: { l: "Frio", c: "lead-t--frio" },
  };
  const TRANK = { cliente: 4, quente: 3, morno: 2, frio: 1 };
  // Setup que o lead configurou (espelha o painel do gerador): logo · solução · contato · plano
  const SETUP = [["logo", "logo"], ["solucao", "solução"], ["contato", "contato"], ["plano", "plano"]];
  const setupTags = (l) => l.setup ? SETUP.filter(([k]) => l.setup[k]).map(([, lbl]) => `<span class="lead-setup">${lbl}</span>`).join("") : "";
  const SITL = { esfriando: "esfriando", dormente: "dormente", novo: "novo", ativo: "ativo", espiou: "só espiou", sumiu: "sumiu", cliente: "cliente" };
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
  const WA_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2zm5.5-5.8c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.8 1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.8-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.2-.5.1-.2 0-.4 0-.5l-.8-2c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1 0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.4.5.6.2 1.2.2 1.6.1.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.2-.3-.2-.5-.3z"/></svg>`;
  const lastOf = (l) => (l.behavior && l.behavior.lastSeen) || l.createdAt;
  const shortLink = (u) => { try { return new URL(u).pathname || u; } catch (_) { return String(u).slice(0, 40); } };
  const evLabel = (e) => e.ch === "email"
    ? (e.e === "email_click" ? "📧 Clicou no link" + (e.link ? ": " + shortLink(e.link) : "") : "📧 Abriu o e-mail" + (e.subject ? ": " + e.subject : ""))
    : evl(e.e);

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
      tile(t.esfriando, "Esfriando", "sit--esfriando", "reengajar") +
      tile(t.comWhatsOptin + "/" + t.comWhats, "WhatsApp", "", "opt-in / total");
  }

  function renderControls() {
    const el = document.getElementById("leadsControls"); if (!el) return;
    const chip = (g, v, l, on) => `<button class="lead-chip${on ? " is-active" : ""}" data-g="${g}" data-v="${v}" type="button">${l}</button>`;
    el.innerHTML =
      `<div class="lead-cgroup"><span class="lead-cg__lbl">Ordenar</span><div class="lead-chips">${[["recente", "Recentes"], ["quente", "Mais quentes"]].map(([v, l]) => chip("sort", v, l, state.sort === v)).join("")}</div></div>` +
      `<div class="lead-cgroup"><span class="lead-cg__lbl">Temperatura</span><div class="lead-chips">${["todos", "cliente", "quente", "morno", "frio"].map((v) => chip("temp", v, v === "todos" ? "Todas" : TEMP[v].l, state.temp === v)).join("")}</div></div>` +
      `<div class="lead-cgroup"><span class="lead-cg__lbl">Fonte</span><div class="lead-chips">${["todos", "meta", "google", "direto"].map((v) => chip("source", v, v === "todos" ? "Todas" : srcB(v).l, state.source === v)).join("")}</div></div>`;
    el.querySelectorAll(".lead-chip").forEach((b) => b.addEventListener("click", () => {
      state[b.dataset.g] = b.dataset.v; renderControls(); renderList();
    }));
  }

  function renderList() {
    const el = document.getElementById("leadsList"); if (!el) return;
    const list = filtered().slice();
    if (state.sort === "quente")
      list.sort((a, b) => (TRANK[b.temperature] - TRANK[a.temperature]) || (new Date(lastOf(b)) - new Date(lastOf(a))));
    else list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (!list.length) { el.innerHTML = `<p class="lead-empty">Nenhum lead com esse filtro.</p>`; return; }
    el.innerHTML = list.map((l) => {
      const t = TEMP[l.temperature] || TEMP.frio, s = srcB(l.source), b = l.behavior;
      const waDigits = l.whatsapp ? String(l.whatsapp).replace(/\D/g, "") : "";
      const wa = l.whatsapp
        ? (l.whatsappOptin
          ? `<span class="lead-wabtn" data-wa="${waDigits}" role="button" title="Chamar no WhatsApp — ${esc(l.whatsapp)}">${WA_SVG}</span>`
          : `<span class="lead-walock" title="WhatsApp sem autorização de contato (LGPD)">🔒</span>`)
        : "";
      const dl = l.downloads > 0 ? `<span class="lead-tag lead-mini">⬇${l.downloads}</span>` : "";
      const back = b && b.sessions >= 2 ? `<span class="lead-tag lead-mini">↻${b.sessions}</span>` : "";
      return `<button class="lead-row" data-id="${esc(l.id)}" type="button">
        <span class="lead-lead"><span class="lead-badge ${t.c}">${t.l}</span></span>
        <span class="lead-row__main">
          <span class="lead-row__top"><span class="lead-id">${esc(l.email || l.name || "—")}</span>${wa}<span class="lead-when">${since(lastOf(l))}</span></span>
          <span class="lead-row__tags"><span class="lead-tag ${s.c}">${s.l}</span>${l.adGroup ? `<span class="lead-tag lead-adgroup">🎯 ${esc(l.adGroup)}</span>` : ""}${dl}${back}${setupTags(l)}</span>
        </span>
      </button>`;
    }).join("");
    el.querySelectorAll(".lead-row").forEach((r) => r.addEventListener("click", (e) => {
      const w = e.target.closest("[data-wa]");
      if (w) { e.stopPropagation(); window.open("https://wa.me/" + w.dataset.wa, "_blank", "noopener"); return; }
      openDetail(r.dataset.id);
    }));
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

  function openDetail(id) { const l = BYID[id]; if (l) drawLead(l); }
  function drawLead(l) {
    if (!l) return;
    const drawer = document.getElementById("leadDrawer"), panel = document.getElementById("leadDrawerPanel");
    if (!drawer || !panel) return;
    const t = TEMP[l.temperature] || TEMP.frio, s = srcB(l.source), b = l.behavior;
    const stat = (n, lbl) => `<div class="lead-d-stat"><div class="lead-d-stat__n">${n}</div><div class="lead-d-stat__l">${lbl}</div></div>`;
    const sitTxt = l.situation === "novo" ? `cadastrou há ${l.daysSince}d`
      : (b ? `sem atividade há ${l.daysSince}d` : "sem eventos");
    const statsHtml = b ? `
      <div class="lead-d-stats">
        ${stat(b.sessions, "Sessões")}${stat(b.visitDays, "Dias distintos")}
        ${stat(b.avgSessionMin + "min", "Sessão média")}${stat(b.totalMin + "min", "Tempo total")}
      </div>
      <div class="lead-d-stats">
        ${stat(b.key.downloads, "Baixou")}${stat(b.key.unlockClicks, "Desbloq.")}
        ${stat(b.key.transcripts, "Transcript")}${stat(l.emailClicks || 0, "Cliques e-mail")}
      </div>
      <div class="lead-d-meta">${(b.devices || []).map((d) => `<span class="lead-tag lead-s--direto">${d}</span>`).join(" ")} · visto ${since(b.lastSeen)}${(l.emailOpens || l.emailClicks) ? ` · 📧 ${l.emailOpens || 0} aberturas, ${l.emailClicks || 0} cliques` : ""}</div>` : "";
    const tl = (l.timeline && l.timeline.length) ? l.timeline : ((b && b.timeline) || []);
    const timelineHtml = tl.length ? `
      <h4 class="lead-d-h">Histórico <span class="lead-d-h__sub">produto + e-mail</span></h4>
      <div class="lead-d-timeline">${tl.slice().reverse().map((e) =>
        `<div class="lead-d-ev ${e.ch === "email" ? "is-email" : ""}"><span class="lead-d-ev__t">${dt(e.t)}</span><span class="lead-d-ev__e">${esc(evLabel(e))}</span></div>`).join("")}</div>`
      : `<p class="lead-empty">Sem eventos registrados ainda.</p>`;
    const behaviorHtml = statsHtml + timelineHtml;
    panel.innerHTML = `
      <div class="lead-d-head">
        <div>
          <span class="lead-badge ${t.c}">${t.l}</span> <span class="lead-tag ${s.c}">${s.l}</span>${l.adGroup ? ` <span class="lead-tag lead-adgroup">🎯 ${esc(l.adGroup)}</span>` : ""}${l.adKw ? ` <span class="lead-tag lead-adkw">🔑 ${esc(l.adKw)}</span>` : ""}
          <h3 class="lead-d-name">${esc(l.email || l.name || "—")}</h3>
          ${l.catalogo ? `<p class="lead-d-cat">${esc(l.catalogo)}</p>` : ""}
          <p class="lead-d-sub">Cadastrou ${since(l.createdAt)} · plano ${esc(l.plan || "—")} · ${l.status === "active" ? "PAGANTE" : "grátis"}</p>
          <p class="lead-d-sit ${SITL[l.situation] ? "sit-txt--" + l.situation : ""}">${(SITL[l.situation] || l.situation)} · ${sitTxt}</p>
          ${l.setup ? `<p class="lead-d-setup">Configurou: ${SETUP.map(([k, lbl]) => `<span class="lead-setup ${l.setup[k] ? "is-on" : "is-off"}">${lbl}</span>`).join("")}</p>` : ""}
        </div>
        <button class="lead-d-close" id="leadDClose" type="button" aria-label="Fechar">✕</button>
      </div>
      ${whatsBlock(l)}
      ${behaviorHtml}`;
    // move o drawer pra RAIZ (body) — escapa de qualquer contexto de empilhamento
    // do #app; só assim o z-index vence a tabbar no mobile.
    if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
    drawer.hidden = false;
    document.getElementById("app")?.classList.add("is-locked");
    document.body.classList.add("lead-locked");
    panel.scrollTop = 0;
    document.getElementById("leadDClose").addEventListener("click", closeDetail);
    const bd = document.getElementById("leadDrawerBackdrop");
    if (bd && !bd.dataset.wired) { bd.dataset.wired = "1"; bd.addEventListener("click", closeDetail); }
  }
  function closeDetail() {
    const d = document.getElementById("leadDrawer"); if (d) d.hidden = true;
    document.getElementById("app")?.classList.remove("is-locked");
    document.body.classList.remove("lead-locked");
  }

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

  return { open, render, openDrawer: drawLead };
})();
