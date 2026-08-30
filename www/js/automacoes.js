/* ===========================================================================
   AUTOMAÇÕES WhatsApp — a casa do LucIAno (CRM). Fala com quem travou, no ponto
   exato em que travou. 4 estágios do funil. Envio 1-toque (wa.me) do celular.
   Lê www/contexto/leads.json (CIFRADO) — reaproveita stage/horasInativo/waDigits.
   Config dos fluxos + "já enviei" ficam em localStorage (por dispositivo).
   =========================================================================== */
const Automacoes = (() => {
  const PATH = "www/contexto/leads.json";
  const LINK = "https://gerador.kronos-ias.com.br"; // {link} nas mensagens
  const K_FLOWS = "kronos.wa.flows.v1";
  const K_SENT = "kronos.wa.sent.v1";
  let LEADS = [];
  let byId = {};

  // ---- definição dos 4 estágios (defaults editáveis) ----
  const STAGES = [
    { id: 1, nome: "Chegou e não fez nada", desc: "Criou conta mas não gerou nem o catálogo.", esperaH: 24,
      msg: "Oi {nome}! Vi que você criou conta na Kronos mas ainda não gerou sua primeira proposta. Quer que eu te mande um exemplo pronto do seu segmento pra ver como fica? Leva 2 min 🙂" },
    { id: 2, nome: "Gerou o catálogo e parou", desc: "Montou o catálogo do negócio, mas não virou proposta.", esperaH: 24,
      msg: "Oi {nome}! Você já montou o catálogo do {negocio} aqui na Kronos 👏 Faltou só transformar isso numa proposta. Quer que eu te mostre como fechar em 1 clique?" },
    { id: 3, nome: "Subiu transcript, não baixou", desc: "Catálogo + transcript, mas não chegou na proposta final.", esperaH: 12,
      msg: "Oi {nome}! Sua proposta do {negocio} está praticamente pronta — vi que você já subiu o transcript. Quer ajuda pra finalizar e enviar pro seu cliente ainda hoje?" },
    { id: 4, nome: "Baixou marca-d'água, não pagou", desc: "Viu o resultado (proposta com marca-d'água) e não converteu.", esperaH: 6,
      msg: "Oi {nome}! Vi que você gerou uma proposta no Kronos 🚀 Curtiu o resultado? Posso te liberar a versão sem marca-d'água com uma condição especial. Topa uma conversa rápida?" },
  ];

  // ---- estado persistido ----
  const readLS = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (_) { return def; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  let flows = null, sent = null;
  function loadState() {
    const saved = readLS(K_FLOWS, {});
    flows = {};
    for (const s of STAGES) {
      const sv = saved[s.id] || {};
      flows[s.id] = { esperaH: sv.esperaH != null ? sv.esperaH : s.esperaH, msg: sv.msg != null ? sv.msg : s.msg };
    }
    sent = readLS(K_SENT, {}); // { "orgId|stage": isoDate }
  }
  const saveFlows = () => writeLS(K_FLOWS, flows);
  const saveSent = () => writeLS(K_SENT, sent);
  const sentKey = (id, stage) => id + "|" + stage;
  const isSent = (l, stage) => !!sent[sentKey(l.id, stage)];

  // ---- dados ----
  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return [];
    let res; try { res = await Sync.readJson(PATH); } catch (_) { return []; }
    const env = res && res.json; if (!env) return [];
    try { const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env; return (doc && doc.leads) || []; } catch (_) { return []; }
  }

  const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "";
  function compose(msg, l) {
    return String(msg || "")
      .replace(/\{nome\}/g, firstName(l.name) || "tudo bem")
      .replace(/\{negocio\}/g, l.name || "seu negócio")
      .replace(/\{link\}/g, LINK);
  }
  const waLink = (l, msg) => `https://wa.me/${l.waDigits}?text=${encodeURIComponent(compose(msg, l))}`;
  // fila de um fluxo: no estágio, com wa.me (opt-in+fone real), inativo o suficiente, não enviado
  function fila(id) {
    const f = flows[id];
    return LEADS.filter((l) => l.stage === id && l.waDigits && l.horasInativo >= f.esperaH && !isSent(l, id))
      .sort((a, b) => a.horasInativo - b.horasInativo);
  }
  // enviados de um fluxo: pelo registro (permanece mesmo se o lead mudar de estágio depois)
  function enviados(id) {
    const out = [];
    for (const k of Object.keys(sent)) {
      const [oid, st] = k.split("|");
      if (Number(st) !== id) continue;
      const l = byId[oid]; if (!l) continue;
      out.push({ l, at: sent[k] });
    }
    return out.sort((a, b) => new Date(b.at) - new Date(a.at));
  }
  const semZap = (id) => LEADS.filter((l) => l.stage === id && !l.waDigits).length;
  const hDur = (h) => h < 24 ? h + "h" : Math.floor(h / 24) + "d";
  const hAgo = (iso) => { const h = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)); return hDur(h); };

  function render() {
    const body = document.getElementById("autoBody"); const meta = document.getElementById("autoMeta");
    if (!body) return;
    if (!LEADS.length) { body.innerHTML = `<p class="lead-empty">Sem dados (rode ler-leads.mjs / cron).</p>`; return; }
    const totalFila = STAGES.reduce((s, st) => s + fila(st.id).length, 0);
    if (meta) meta.textContent = totalFila ? `${totalFila} na fila agora` : "fila vazia";

    body.innerHTML = `
      <div class="auto-bar">
        <button class="auto-refresh" id="autoRefreshStages" type="button" title="Reavaliar os estágios com os eventos mais recentes">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.9-3"/><polyline points="4,4 4,8.5 8.5,8.5"/><path d="M4 13a8 8 0 0 0 14.9 3"/><polyline points="20,20 20,15.5 15.5,15.5"/></svg>
          <span>Atualizar estágios do funil</span>
        </button>
      </div>
      <div class="auto-intro">Cada card fala com quem <b>travou naquele estágio</b> e ficou parado tempo suficiente pra ter "saído" (você define a espera). Toque em <b>WhatsApp</b> → a mensagem abre pronta no seu celular; abrir <b>não</b> tira da fila. Só o <b>✓</b> move o contato pra "Enviados". Se um lead avança no funil, ele sai da fila fria sozinho ao <b>Atualizar estágios</b>. Só aparece quem <b>autorizou WhatsApp</b> (LGPD).</div>
      <div class="auto-cards">${STAGES.map(cardHTML).join("")}</div>
      <p class="fin-foot">Envio 1-toque do seu número. "Automático de verdade" (API) é fase 2 e pluga nesta mesma fila. Config, "já enviei" e estágios refletem o último sync (o robô reavalia de 4/4h; toque em Atualizar pra puxar agora).</p>`;

    wire();
  }

  function cardHTML(s) {
    const f = flows[s.id]; const q = fila(s.id); const env = enviados(s.id); const sZ = semZap(s.id); const prev = q[0] || env[0] && env[0].l;
    return `
      <div class="auto-card" data-stage="${s.id}">
        <div class="auto-card__head">
          <span class="auto-badge auto-s${s.id}">Estágio ${s.id}</span>
          <div class="auto-card__ttl"><b>${s.nome}</b><span>${s.desc}</span></div>
        </div>
        <div class="auto-flow">
          <span class="auto-step">🎯 Gatilho</span><span class="auto-arrow">→</span>
          <span class="auto-step">⏱ Espera <input class="auto-h" type="number" min="0" data-act="esperaH" value="${f.esperaH}">h</span>
          <span class="auto-arrow">→</span><span class="auto-step">💬 Mensagem</span>
        </div>
        <textarea class="auto-msg" data-act="msg" rows="5" placeholder="Mensagem… use {nome}, {negocio}, {link}">${f.msg.replace(/</g, "&lt;")}</textarea>
        ${prev ? `<div class="auto-prev"><span>Prévia (${firstName(prev.name) || prev.name}):</span> ${compose(f.msg, prev).replace(/</g, "&lt;")}</div>` : ""}
        <div class="auto-queue">
          <div class="auto-queue__h"><b>Fila agora: ${q.length}</b>${sZ ? `<span class="auto-nozap">${sZ} no estágio sem WhatsApp</span>` : ""}</div>
          ${q.length ? `<div class="auto-list">${q.slice(0, 30).map((l) => rowHTML(l, s.id)).join("")}</div>` : `<div class="auto-empty">Ninguém elegível agora.</div>`}
        </div>
        ${env.length ? `<details class="auto-sent"><summary>Enviados: ${env.length}</summary>
          <div class="auto-list">${env.slice(0, 50).map((e) => sentRowHTML(e, s.id)).join("")}</div></details>` : ""}
      </div>`;
  }
  function rowHTML(l, id) {
    return `<div class="auto-row" data-org="${l.id}">
      <div class="auto-row__i"><b>${(l.name || "—").replace(/</g, "&lt;")}</b><span>parado há ${hDur(l.horasInativo)} · ${l.source}</span></div>
      <a class="auto-wa" href="${waLink(l, flows[id].msg)}" target="_blank" rel="noopener">WhatsApp</a>
      <button class="auto-done" data-done="${id}" title="Marcar como enviado (move pra Enviados)">✓</button>
    </div>`;
  }
  function sentRowHTML(e, id) {
    const l = e.l;
    return `<div class="auto-row is-sent" data-org="${l.id}">
      <div class="auto-row__i"><b>${(l.name || "—").replace(/</g, "&lt;")}</b><span>enviado há ${hAgo(e.at)}${l.stage !== id ? " · já avançou" : ""}</span></div>
      <a class="auto-wa auto-wa--ghost" href="${waLink(l, flows[id].msg)}" target="_blank" rel="noopener">reabrir</a>
      <button class="auto-undo" data-undo="${id}" title="Desmarcar (volta pra fila)">↩</button>
    </div>`;
  }

  function wire() {
    const rb = document.getElementById("autoRefreshStages");
    if (rb) rb.addEventListener("click", async () => {
      rb.disabled = true; rb.classList.add("is-loading");
      const span = rb.querySelector("span"); const old = span ? span.textContent : ""; if (span) span.textContent = "Atualizando…";
      LEADS = await load(); byId = {}; for (const l of LEADS) byId[l.id] = l;
      render();
    });
    document.querySelectorAll(".auto-card").forEach((card) => {
      const id = Number(card.getAttribute("data-stage"));
      const h = card.querySelector('[data-act="esperaH"]');
      h.addEventListener("change", (e) => { flows[id].esperaH = Math.max(0, Number(e.target.value) || 0); saveFlows(); render(); });
      const ta = card.querySelector('[data-act="msg"]');
      ta.addEventListener("input", (e) => { flows[id].msg = e.target.value; saveFlows(); });
      ta.addEventListener("blur", () => render()); // atualiza prévia + links
      card.querySelectorAll("[data-done]").forEach((btn) => btn.addEventListener("click", () => {
        const org = btn.closest("[data-org]").getAttribute("data-org");
        sent[sentKey(org, id)] = new Date().toISOString(); saveSent(); render();
      }));
      card.querySelectorAll("[data-undo]").forEach((btn) => btn.addEventListener("click", () => {
        const org = btn.closest("[data-org]").getAttribute("data-org");
        delete sent[sentKey(org, id)]; saveSent(); render();
      }));
    });
  }

  async function render_() { loadState(); LEADS = await load(); byId = {}; for (const l of LEADS) byId[l.id] = l; render(); }
  async function open() { if (typeof showView === "function") showView("automacoesView"); await render_(); }
  return { open, render: render_ };
})();
