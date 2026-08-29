/* ===========================================================================
   FINANCEIRO — a casa da FabIAna (CFO). Controle UNIFICADO de gastos.
   3 categorias: Mídia (Google+Meta) · Fixos (mensalidades) · Anthropic API (produção).
   Filtro por período. Custo por catálogo e por proposta (ai_generations, exato).
   Lê www/contexto/financeiro.json (CIFRADO). Snapshot: node scripts/ler-financeiro.mjs
   =========================================================================== */
const Financeiro = (() => {
  const PATH = "www/contexto/financeiro.json";
  let DOC = null;
  let period = "mes"; // mes | anterior | 3m | tudo
  const brl = (n) => "R$ " + Math.round(Number(n) || 0).toLocaleString("pt-BR");
  const brl2 = (n) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const since = (iso) => {
    if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return "há " + m + "min"; const h = Math.round(m / 60);
    if (h < 24) return "há " + h + "h"; return "há " + Math.round(h / 24) + "d";
  };
  const mesLabel = (k) => { const [y, m] = (k || "").split("-"); const N = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]; return (N[Number(m)] || k) + "/" + (y || "").slice(2); };

  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return null;
    let res; try { res = await Sync.readJson(PATH); } catch (_) { return null; }
    const env = res && res.json; if (!env) return null;
    try { const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
      return (doc && doc.google) ? doc : null; } catch (_) { return null; }
  }

  // chave YYYY-MM com offset de meses a partir do mês corrente do snapshot
  function monthKey(offset) {
    const [y, m] = (DOC.month.today || "").split("-").map(Number);
    const d = new Date(y, (m - 1) - offset, 1);
    return d.toISOString().slice(0, 7);
  }
  function windowKeys() {
    if (period === "mes") return [monthKey(0)];
    if (period === "anterior") return [monthKey(1)];
    if (period === "3m") return [monthKey(0), monthKey(1), monthKey(2)];
    return (DOC.series || []).map((s) => s.mes); // tudo
  }
  // agrega o período selecionado
  function agg() {
    const keys = new Set(windowKeys());
    const rows = (DOC.series || []).filter((s) => keys.has(s.mes));
    const nMeses = period === "tudo" ? Math.max(1, rows.length) : keys.size;
    let google = 0, meta = 0, apiCat = 0, apiCatN = 0, apiTr = 0, apiTrN = 0, cad = 0, cadG = 0, cadM = 0, googleParcial = false;
    for (const s of rows) {
      if (s.googleSpend == null) { if (s.metaSpend || s.api.catalogN) googleParcial = true; } else google += s.googleSpend;
      meta += s.metaSpend || 0;
      apiCat += s.api.catalogBrl || 0; apiCatN += s.api.catalogN || 0;
      apiTr += s.api.transcriptBrl || 0; apiTrN += s.api.transcriptN || 0;
      cad += s.cad.total || 0; cadG += s.cad.google || 0; cadM += s.cad.meta || 0;
    }
    const fixos = (DOC.fixosTotalMes || 0) * nMeses;
    const midia = google + meta;
    const api = apiCat + apiTr;
    const total = midia + fixos + api;
    return { rows, nMeses, google, meta, midia, fixos, api, apiCat, apiCatN, apiTr, apiTrN, total, cad, cadG, cadM, googleParcial };
  }

  const tile = (n, lbl, sub) => `<div class="fin-kpi"><div class="fin-kpi__n">${n}</div><div class="fin-kpi__l">${lbl}</div>${sub ? `<div class="fin-kpi__s">${sub}</div>` : ""}</div>`;
  const bar = (val, max, cls, label, money) => {
    const pc = max ? Math.round((val / max) * 100) : 0;
    return `<div class="fin-brk__row"><div class="fin-brk__top"><span>${label}</span><b>${money}</b></div><div class="fin-brk__bar"><div class="fin-brk__fill ${cls}" style="width:${pc}%"></div></div></div>`;
  };

  function render() {
    const body = document.getElementById("finBody"); const meta = document.getElementById("finMeta");
    if (!DOC) { if (body) body.innerHTML = `<p class="lead-empty">Sem dados (rode ler-financeiro.mjs).</p>`; return; }
    if (meta) meta.textContent = `atualizado ${since(DOC.updatedAt)}`;

    // ---- 1) medidor de orçamento do Google (guarda de gasto) ----
    const g = DOC.google, b = DOC.budget.google, mo = DOC.month;
    const pct = Math.min(100, Math.round((g.spend / b) * 100));
    const cls = pct < 70 ? "is-ok" : pct < 95 ? "is-warn" : "is-over";
    const budgetDay = b / mo.daysInMonth;
    const subUse = g.dailyRate < budgetDay * 0.7;
    const gauge = `
      <div class="fin-gauge ${cls}">
        <div class="fin-gauge__head"><span>Google — teto de gasto do mês</span><span class="fin-gauge__pct">${pct}%</span></div>
        <div class="fin-gauge__bar"><div class="fin-gauge__fill" style="width:${pct}%"></div></div>
        <div class="fin-gauge__nums"><b>${brl(g.spend)}</b> <span class="fin-gauge__of">de ${brl(b)} / mês</span> <span class="fin-gauge__proj">· projeção ${brl(g.projecaoMes)}</span></div>
      </div>
      ${subUse ? `<div class="fin-note">⚠ O Google gasta ~${brl(g.dailyRate)}/dia, mas o teto permite ~${brl(budgetDay)}/dia. Ele está <b>limitado por volume de busca</b> — subir o teto sozinho não gasta mais. Pra escalar precisa ampliar palavras-chave/segmentação (fala com o TobIAs).</div>` : ""}`;

    // ---- 2) custo unificado do período ----
    const a = agg();
    const perChips = [["mes", "Este mês"], ["anterior", "Mês passado"], ["3m", "Últimos 3 meses"], ["tudo", "Tudo"]]
      .map(([k, l]) => `<button class="lead-chip ${period === k ? "is-active" : ""}" data-per="${k}" type="button">${l}</button>`).join("");
    const maxCat = Math.max(a.midia, a.fixos, a.api, 1);
    const custoCad = a.cad ? a.total / a.cad : 0;

    const unified = `
      <div class="fin-sec">
        <div class="fin-sec__head"><span class="fin-sec__t">Custo total — controle unificado</span>
          <div class="lead-chips fin-perchips">${perChips}</div></div>
        <div class="fin-total">${brl(a.total)} <span class="fin-total__sub">no período (${a.nMeses} ${a.nMeses > 1 ? "meses" : "mês"})</span></div>
        <div class="fin-brk">
          ${bar(a.midia, maxCat, "c-midia", `Mídia (Google ${brl(a.google)}${a.googleParcial ? "*" : ""} + Meta ${brl(a.meta)})`, brl(a.midia))}
          ${bar(a.fixos, maxCat, "c-fixos", `Fixos / mensalidades`, brl(a.fixos))}
          ${bar(a.api, maxCat, "c-api", `Anthropic API (produção)`, brl2(a.api))}
        </div>
      </div>
      <div class="fin-kpis">
        ${tile(brl2(custoCad), "Custo total / cadastro", `${a.cad} cadastros`)}
        ${tile(a.apiCatN ? brl2(a.apiCat / a.apiCatN) : "—", "Custo / catálogo", `${a.apiCatN} gerados`)}
        ${tile(a.apiTrN ? brl2(a.apiTr / a.apiTrN) : "—", "Custo / proposta", `${a.apiTrN} do transcript`)}
      </div>`;

    // ---- 3) fixos detalhado ----
    const fixList = (DOC.fixos || []).length
      ? `<div class="fin-sec"><div class="fin-sec__t">Mensalidades fixas — ${brl(DOC.fixosTotalMes)}/mês</div>
          <div class="fin-fixlist">${DOC.fixos.map((f) => `<div class="fin-fixrow"><span>${f.nome}</span><b>${brl(f.valorMes)}</b></div>`).join("")}</div>
          <p class="fin-foot">Edite em <code>scripts/custos-fixos.json</code> (ex.: Supabase, Vercel, Brevo, domínio…).</p></div>`
      : `<div class="fin-note">Nenhuma mensalidade cadastrada além do que estiver no arquivo. Adicione suas assinaturas (Claude, Supabase, Vercel, Brevo, domínio…) em <code>scripts/custos-fixos.json</code> pra o total ficar real.</div>`;

    // ---- 4) série mensal ----
    const serieRows = (DOC.series || []).map((s) => {
      const mid = (s.googleSpend || 0) + (s.metaSpend || 0);
      const api = (s.api.catalogBrl || 0) + (s.api.transcriptBrl || 0);
      return `<div class="fin-srow"><span class="fin-srow__m">${mesLabel(s.mes)}</span><span>${brl(mid)}${s.googleSpend == null ? " *" : ""}</span><span>${brl2(api)}</span><span>${s.cad.total} cad</span></div>`;
    }).join("");
    const serie = `<div class="fin-sec"><div class="fin-sec__t">Série mensal</div>
      <div class="fin-srow fin-srow--h"><span class="fin-srow__m">mês</span><span>mídia</span><span>API</span><span>cadastros</span></div>
      ${serieRows}</div>`;

    // ---- 5) rodapé ----
    const foot = `<p class="fin-foot">* Google só tem o total da janela atual do relatório (sem histórico por dia) — meses anteriores contam Meta+API+fixos. Câmbio API: US$1 = R$ ${DOC.usdBrl}. Total de cadastros no mês (todas as fontes): ${DOC.cadastros.total}.</p>`;

    body.innerHTML = gauge + unified + fixList + serie + foot;
    body.querySelectorAll("[data-per]").forEach((el) => el.addEventListener("click", () => { period = el.getAttribute("data-per"); render(); }));
  }

  async function render_() { DOC = await load(); render(); }
  async function open() { if (typeof showView === "function") showView("financeiroView"); await render_(); }
  return { open, render: render_ };
})();
