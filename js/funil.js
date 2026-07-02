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

  // METAS de ativação — o placar do conselho (editável). Higher-is-better exceto custo.
  const METAS = { ativacao: 0.25, ativacaoReal: 0.20, custoAtivacao: 80, pagantes: 1 };

  const nf = (n) => Number(n).toLocaleString("pt-BR");
  const brl = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const ratio = (a, b) => (b ? a / b : 0);
  const pctInt = (a, b) => Math.round(ratio(a, b) * 100);
  const fmtPct = (a, b) => { const v = ratio(a, b) * 100; return (v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)) + "%"; };
  const fmtDate = (iso) => { if (!iso) return ""; const p = iso.split("-"); return p[2] + "/" + p[1]; };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const since = (iso) => {
    if (!iso) return "";
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return "agora";
    if (min < 60) return "há " + min + "min";
    const h = Math.round(min / 60);
    if (h < 24) return "há " + h + "h";
    return "há " + Math.round(h / 24) + "d";
  };
  const fmtWindow = (w) => { // "20260531..20260630" → "31/05–30/06"
    if (!w) return "";
    const p = w.split("..").map((s) => s.length === 8 ? s.slice(6, 8) + "/" + s.slice(4, 6) : s);
    return p.join("–");
  };

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
    const metaSpend = sumIn(DOC.metaDaily, "spend", from, to);
    const metaReg = sumIn(DOC.metaDaily, "registrations", from, to);
    // Google é resumo da JANELA da campanha (não série diária) → não filtra por data.
    const g = DOC.google || null;
    const googleClicks = g ? g.clicks : 0;
    const googleSpend = g ? g.cost : 0;
    const traffic = state.source === "meta" ? metaClicks : state.source === "google" ? googleClicks : metaClicks + googleClicks;
    const spend = state.source === "meta" ? metaSpend : state.source === "google" ? googleSpend : metaSpend + googleSpend;
    return { cadastros, ativacao, ativacaoReal, metaClicks, metaSpend, metaReg, googleClicks, googleSpend, g, traffic, spend, pagantes: DOC.pagantesTotal || 0 };
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
    const gOn = !!(DOC && DOC.google);
    const srcs = [["todos", "Todos"], ["meta", "Meta"], ["google", "Google"]]
      .map(([v, l]) => chip("source", v, l + (v === "google" && !gOn ? " ·conectar" : ""), state.source === v)).join("");
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
    const gWin = d.g ? fmtWindow(d.g.window) : "";
    const srcNote = state.source === "google"
      ? (d.g ? `cliques · Google · janela ${gWin}` : "leitura do Google não conectada")
      : state.source === "meta" ? "cliques no link · Meta"
      : (d.g ? "cliques · Meta (diário) + Google (janela)" : "cliques no link · Meta (Google em breve)");
    const stages = [
      { label: "Tráfego", value: d.traffic, note: srcNote },
      { label: "Cadastros", value: d.cadastros, verb: "se cadastram" },
      { label: "Ativação · 1ª proposta", value: d.ativacao, verb: "ativam", note: `${d.ativacaoReal} catálogo real · ${d.ativacao - d.ativacaoReal} exemplo` },
      { label: "Pagantes", value: d.pagantes, verb: "assinam" },
    ];

    // Funil de ângulo CONSTANTE: a largura estreita de forma linear e cada trapézio
    // encaixa no próximo (o fundo de um = o topo do seguinte). O topo é trapézio, não
    // retângulo. Os NÚMEROS + as conversões carregam o dado; a forma fica limpa.
    const N = stages.length;
    const wTop = 0.94, wBot = 0.36;
    const edge = (k) => wTop - (wTop - wBot) * (k / N);

    let html = '<div class="fnl">';
    stages.forEach((s, i) => {
      const topF = edge(i);
      const botF = edge(i + 1);
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

    // PLACAR DE METAS (janela freemium inteira — estável, não segue os chips)
    {
      const fmS = DOC.freemiumStart, tdy = DOC.today;
      const cadA = sumIn(DOC.daily, "cadastros", fmS, tdy);
      const atA = sumIn(DOC.daily, "ativacoes", fmS, tdy);
      const atRA = sumIn(DOC.daily, "ativacoesReal", fmS, tdy);
      const spA = sumIn(DOC.metaDaily, "spend", fmS, tdy) + (DOC.google ? DOC.google.cost : 0);
      const pag = DOC.pagantesTotal || 0;
      const custoAt = atA ? spA / atA : 0;
      const heroFill = Math.min(100, Math.round((ratio(atA, cadA) / METAS.ativacao) * 100));
      const faltam = Math.max(0, Math.ceil(METAS.ativacao * cadA) - atA);
      const realOk = ratio(atRA, cadA) >= METAS.ativacaoReal;
      const custoOk = custoAt && custoAt <= METAS.custoAtivacao;
      const metasHtml = `<div class="funil-metas">
        <div class="funil-metas__ttl">Metas de ativação <span class="funil-metas__sub">o placar que importa · janela freemium</span></div>
        <div class="fmk-hero">
          <div class="fmk-hero__top">
            <span class="fmk-hero__k">Ativação · cadastro→1ª proposta</span>
            <span class="fmk-hero__v">${fmtPct(atA, cadA)} <small>/ meta ${Math.round(METAS.ativacao * 100)}%</small></span>
          </div>
          <div class="fmk-bar"><div class="fmk-bar__fill" style="width:${heroFill}%"></div></div>
          <div class="fmk-hero__hint">${atA} de ${cadA} ativaram · ${faltam > 0 ? `faltam <b class="fmk-hero__goal">~${faltam} ativações</b> pra bater ${Math.round(METAS.ativacao * 100)}%` : `<b class="fmk-hero__goal">meta batida 🎯</b>`}</div>
        </div>
        <div class="funil-metas__grid">
          <div class="fmk"><span class="fmk__k">Ativação real</span><span class="fmk__v${realOk ? " fmk__v--ok" : ""}">${fmtPct(atRA, cadA)}</span><div class="fmk__goal">meta ${Math.round(METAS.ativacaoReal * 100)}%</div></div>
          <div class="fmk"><span class="fmk__k">1º pagante · gate</span><span class="fmk__v${pag >= METAS.pagantes ? " fmk__v--ok" : ""}">${pag} / ${METAS.pagantes}</span><div class="fmk__goal">libera escalar verba</div></div>
          <div class="fmk"><span class="fmk__k">Custo / ativação</span><span class="fmk__v${custoOk ? " fmk__v--ok" : ""}">${atA ? brl(custoAt) : "—"}</span><div class="fmk__goal">meta ≤ ${brl(METAS.custoAtivacao)}</div></div>
        </div>
      </div>`;
      grid.insertAdjacentHTML("afterbegin", metasHtml);
    }

    // headline (1 frase) — o gargalo
    if (head) {
      const tA = pctInt(d.ativacao, d.cadastros);
      head.innerHTML = `<span class="funil-headline__dot"></span><span class="funil-headline__text"><b>Gargalo na ativação:</b> só <b>${tA}%</b> dos cadastros geram a 1ª proposta — ${d.cadastros - d.ativacao} de ${d.cadastros} não geram nada.${d.pagantes === 0 ? " Ainda <b>0 pagantes</b> (gate de escala = 1ª assinatura)." : ""}</span>`;
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

    // Comparação de aquisição Meta × Google (quem traz mais barato)
    if (d.g) {
      const rowsCmp = [
        ["Meta", d.metaClicks, d.metaSpend, d.metaReg, d.metaReg ? d.metaSpend / d.metaReg : 0],
        ["Google", d.g.clicks, d.g.cost, d.g.conversions, d.g.costPerConv],
      ];
      const cells = rowsCmp.map(([src, cl, sp, cv, cpc]) => `<div class="funil-cmp__row">
          <span class="funil-cmp__src funil-cmp__src--${src.toLowerCase()}">${src}</span>
          <span class="funil-cmp__n">${nf(cl)}<small>cliques</small></span>
          <span class="funil-cmp__n">${sp ? brl(sp) : "—"}<small>gasto</small></span>
          <span class="funil-cmp__n">${nf(cv)}<small>cadastros</small></span>
          <span class="funil-cmp__n">${cpc ? brl(cpc) : "—"}<small>/cadastro</small></span>
        </div>`).join("");
      grid.insertAdjacentHTML("beforeend", `<div class="funil-cmp"><div class="funil-cmp__ttl">Aquisição · Meta × Google <span class="funil-cmp__win">janela Google ${gWin}</span></div>${cells}</div>`);
    }

    if (state.source !== "todos") {
      grid.insertAdjacentHTML("beforeend", `<p class="funil-src-note">Obs: a fonte filtra só o tráfego. Cadastro→ativação→pagante ainda não são atribuídos por fonte (sem UTM/click-id ligando clique→conta).</p>`);
    }

    if (metaEl) metaEl.textContent = `${state.range === "freemium" ? "Freemium" : state.range} · ${fmtDate(from)}–${fmtDate(to)}${DOC.freemiumCampaign ? " · campanha isolada" : ""}${DOC.updatedAt ? " · atualizado " + since(DOC.updatedAt) : ""}`;
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
