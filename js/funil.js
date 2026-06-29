/* ===========================================================================
   FUNIL — visualização do funil do SaaS na home (entre Métricas e Custos).

   Lê www/contexto/funil.json (sincronizado, CIFRADO) e decifra com a chave do
   cofre. Mostra o funil ponta a ponta (tráfego → cadastro → ativação → pagante)
   como um FUNIL de verdade (trapézios que estreitam), com filtro de DATA e de
   FONTE, focado 100% no Freemium (piso = início da campanha freemium).

   Dados: série DIÁRIA gerada por `node scripts/ler-funil.mjs` (Supabase só-leitura
   + Meta da campanha freemium). O filtro de data soma a série no cliente.
   =========================================================================== */
const Funil = (() => {
  const PATH = "www/contexto/funil.json";
  let DOC = null;
  const state = { range: "freemium", source: "todos" };

  const nf = (n) => Number(n).toLocaleString("pt-BR");
  const brl = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const ratio = (a, b) => (b ? a / b : 0);
  const pctInt = (a, b) => Math.round(ratio(a, b) * 100);
  const fmtPct = (a, b) => { const v = ratio(a, b) * 100; return (v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)) + "%"; };
  const fmtDate = (iso) => { if (!iso) return ""; const p = iso.split("-"); return p[2] + "/" + p[1]; };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return null;
    let res;
    try { res = await Sync.readJson(PATH); } catch (_) { return null; }
    const env = res && res.json;
    if (!env) return null;
    try {
      const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
      return (doc && Array.isArray(doc.daily)) ? doc : null;
    } catch (_) { return null; }
  }

  const sumIn = (series, key, from, to) => (series || []).filter((x) => x.date >= from && x.date <= to).reduce((s, x) => s + (x[key] || 0), 0);

  function bounds(range) {
    const to = DOC.today;
    if (range === "freemium") return [DOC.freemiumStart, to];
    const days = { "7d": 7, "14d": 14, "30d": 30 }[range] || 7;
    let from = addDays(to, -(days - 1));
    if (from < DOC.freemiumStart) from = DOC.freemiumStart;
    return [from, to];
  }

  function compute(from, to) {
    const cadastros = sumIn(DOC.daily, "cadastros", from, to);
    const ativacao = sumIn(DOC.daily, "ativacoes", from, to);
    const ativacaoReal = sumIn(DOC.daily, "ativacoesReal", from, to);
    const metaClicks = sumIn(DOC.metaDaily, "linkClicks", from, to);
    const spend = sumIn(DOC.metaDaily, "spend", from, to);
    const google = 0; // leitura do Google ainda não conectada
    const traffic = state.source === "meta" ? metaClicks : state.source === "google" ? google : metaClicks + google;
    return { cadastros, ativacao, ativacaoReal, metaClicks, google, traffic, spend, pagantes: DOC.pagantesTotal || 0 };
  }

  /* ----- controles (data + fonte) ----- */
  function chip(group, val, label, active, extra) {
    return `<button type="button" class="funil-chip${active ? " funil-chip--on" : ""}" data-g="${group}" data-v="${val}"${extra || ""}>${label}</button>`;
  }
  function buildControls() {
    const el = document.getElementById("funilControls");
    if (!el) return;
    const dates = [["freemium", "Freemium"], ["30d", "30d"], ["14d", "14d"], ["7d", "7d"]]
      .map(([v, l]) => chip("range", v, l, state.range === v)).join("");
    const srcs = [["todos", "Todos"], ["meta", "Meta"], ["google", "Google"]]
      .map(([v, l]) => chip("source", v, l + (v === "google" ? " ·conectar" : ""), state.source === v)).join("");
    el.innerHTML = `<div class="funil-ctlgroup">${dates}</div><div class="funil-ctlgroup funil-ctlgroup--src">${srcs}</div>`;
    el.querySelectorAll(".funil-chip").forEach((b) => b.addEventListener("click", () => {
      state[b.dataset.g === "range" ? "range" : "source"] = b.dataset.v;
      buildControls(); draw();
    }));
  }

  function draw() {
    const grid = document.getElementById("funilGrid");
    const head = document.getElementById("funilHeadline");
    const stats = document.getElementById("funilStats");
    const metaEl = document.getElementById("funilMeta");
    if (!grid) return;
    const [from, to] = bounds(state.range);
    const d = compute(from, to);

    // fases do funil (monotônicas)
    const srcNote = state.source === "google" ? "leitura do Google não conectada" : state.source === "meta" ? "cliques no link · Meta" : "cliques no link · Meta (Google em breve)";
    const stages = [
      { label: "Tráfego", value: d.traffic, note: srcNote },
      { label: "Cadastros", value: d.cadastros, verb: "se cadastram" },
      { label: "Ativação · 1ª proposta", value: d.ativacao, verb: "ativam", note: `${d.ativacaoReal} catálogo real · ${d.ativacao - d.ativacaoReal} exemplo` },
      { label: "Pagantes", value: d.pagantes, verb: "assinam" },
    ];

    const top = stages[0].value || stages[1].value || 1;
    const frac = (v) => (v > 0 ? Math.min(0.96, Math.max(0.18, 0.18 + 0.80 * Math.sqrt(v / top))) : 0.12);

    let html = '<div class="fnl">';
    stages.forEach((s, i) => {
      const topF = i === 0 ? frac(stages[0].value) : frac(stages[i - 1].value);
      const botF = frac(s.value);
      const poly = `polygon(${50 - topF * 50}% 0, ${50 + topF * 50}% 0, ${50 + botF * 50}% 100%, ${50 - botF * 50}% 100%)`;
      html += `<div class="fnl__stage">
        <div class="fnl__caption"><span class="fnl__label">${s.label}</span>${s.note ? ` <span class="fnl__note">${s.note}</span>` : ""}</div>
        <div class="fnl__band${s.value === 0 ? " fnl__band--zero" : ""}">
          <div class="fnl__shape" style="clip-path:${poly};-webkit-clip-path:${poly}"></div>
          <div class="fnl__c"><span class="fnl__num">${nf(s.value)}</span></div>
        </div>
      </div>`;
      if (i < stages.length - 1) {
        const n = stages[i + 1];
        html += `<div class="fnl__conv"><b>${fmtPct(n.value, s.value)}</b> ${n.verb}<span class="fnl__conv-sep">·</span><span class="fnl__conv-drop">−${nf(s.value - n.value)} saem</span></div>`;
      }
    });
    html += "</div>";
    grid.innerHTML = html;

    // headline (1 frase) — o gargalo
    if (head) {
      const tA = pctInt(d.ativacao, d.cadastros);
      head.innerHTML = `<span class="funil-headline__dot"></span> <b>Gargalo na ativação:</b> só <b>${tA}%</b> dos cadastros geram a 1ª proposta — ${d.cadastros - d.ativacao} de ${d.cadastros} não geram nada.${d.pagantes === 0 ? " Ainda <b>0 pagantes</b> (gate de escala = 1ª assinatura)." : ""}`;
      head.hidden = false;
    }

    // stats compactos (refletem o filtro)
    if (stats) {
      const chips = [
        ["Gasto", d.spend ? brl(d.spend) : "—"],
        ["Custo / ativação", d.ativacao ? brl(d.spend / d.ativacao) : "—"],
        ["Custo / cadastro", d.cadastros ? brl(d.spend / d.cadastros) : "—"],
        ["Ativação real", `${d.ativacaoReal} de ${d.ativacao}`],
      ];
      stats.innerHTML = chips.map(([k, v]) => `<div class="funil-stat"><span class="funil-stat__k">${k}</span><span class="funil-stat__v">${v}</span></div>`).join("");
    }

    if (state.source !== "todos") {
      grid.insertAdjacentHTML("beforeend", `<p class="funil-src-note">Obs: a fonte filtra só o tráfego. Cadastro→ativação→pagante ainda não são atribuídos por fonte (sem UTM/click-id ligando clique→conta).</p>`);
    }

    if (metaEl) metaEl.textContent = `${state.range === "freemium" ? "Freemium" : state.range} · ${fmtDate(from)}–${fmtDate(to)}${DOC.freemiumCampaign ? " · campanha isolada" : ""}`;
  }

  function render() {
    load().then((doc) => {
      const grid = document.getElementById("funilGrid");
      if (!doc) {
        if (grid) grid.innerHTML = `<p class="funil-empty">Sem leitura do funil ainda. Rode <code>node scripts/ler-funil.mjs</code> para gerar.</p>`;
        return;
      }
      DOC = doc;
      buildControls();
      draw();
    });
  }

  return { render };
})();
