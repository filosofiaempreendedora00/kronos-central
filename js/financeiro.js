/* ===========================================================================
   FINANCEIRO — a casa da FabIAna (CFO). Custo de mídia vs orçamento.
   Foco: Google (métrica principal), teto R$ 1500/mês, custo/cadastro, projeção.
   Lê www/contexto/financeiro.json (CIFRADO). Snapshot: node scripts/ler-financeiro.mjs
   =========================================================================== */
const Financeiro = (() => {
  const PATH = "www/contexto/financeiro.json";
  let DOC = null;
  const brl = (n) => "R$ " + Math.round(Number(n) || 0).toLocaleString("pt-BR");
  const brl2 = (n) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const since = (iso) => {
    if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return "há " + m + "min"; const h = Math.round(m / 60);
    if (h < 24) return "há " + h + "h"; return "há " + Math.round(h / 24) + "d";
  };

  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return null;
    let res; try { res = await Sync.readJson(PATH); } catch (_) { return null; }
    const env = res && res.json; if (!env) return null;
    try { const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
      return (doc && doc.google) ? doc : null; } catch (_) { return null; }
  }

  const tile = (n, lbl, sub) => `<div class="fin-kpi"><div class="fin-kpi__n">${n}</div><div class="fin-kpi__l">${lbl}</div>${sub ? `<div class="fin-kpi__s">${sub}</div>` : ""}</div>`;

  function render() {
    const body = document.getElementById("finBody"); const meta = document.getElementById("finMeta");
    if (!DOC) { if (body) body.innerHTML = `<p class="lead-empty">Sem dados (rode ler-financeiro.mjs).</p>`; return; }
    if (meta) meta.textContent = `atualizado ${since(DOC.updatedAt)}`;
    const g = DOC.google, b = DOC.budget.google, mo = DOC.month;
    const pct = Math.min(100, Math.round((g.spend / b) * 100));
    const cls = pct < 70 ? "is-ok" : pct < 95 ? "is-warn" : "is-over";
    const budgetDay = b / mo.daysInMonth;
    const subUse = g.dailyRate < budgetDay * 0.7;
    body.innerHTML = `
      <div class="fin-gauge ${cls}">
        <div class="fin-gauge__head"><span>Google — gasto (métrica principal)</span><span class="fin-gauge__pct">${pct}%</span></div>
        <div class="fin-gauge__bar"><div class="fin-gauge__fill" style="width:${pct}%"></div></div>
        <div class="fin-gauge__nums"><b>${brl(g.spend)}</b> <span class="fin-gauge__of">de ${brl(b)} / mês</span> <span class="fin-gauge__proj">· projeção ${brl(g.projecaoMes)}</span></div>
      </div>
      <div class="fin-kpis">
        ${tile(brl2(g.custoPorCadastro), "Custo / cadastro", "Google, no mês")}
        ${tile(g.cadMes, "Cadastros", "via Google")}
        ${tile(brl2(g.cpc), "CPC médio")}
        ${tile((Number(g.ctr) || 0).toFixed(1) + "%", "CTR", "cliques / impressões")}
        ${tile(brl(g.dailyRate), "Gasto / dia", "ritmo atual")}
      </div>
      ${subUse ? `<div class="fin-note">⚠ O Google gasta ~${brl(g.dailyRate)}/dia, mas o teto permite até ~${brl(budgetDay)}/dia. Ele está <b>limitado por volume de busca</b> — o nicho não tem cliques suficientes pra queimar o orçamento todo. Subir o teto sozinho não gasta mais; pra escalar precisa ampliar palavras-chave/segmentação (fala com o TobIAs).</div>` : ""}
      <div class="fin-second">
        <div class="fin-second__t">Meta (secundário)</div>
        ${DOC.meta ? `<div class="fin-second__row"><span>${brl(DOC.meta.spend)} no mês</span><span>${DOC.meta.cadMes || 0} cadastros</span><span>${DOC.meta.custoPorCadastro ? brl2(DOC.meta.custoPorCadastro) + "/cad" : "—"}</span></div>` : `<div class="fin-second__row"><span>sem gasto no mês (pausado)</span></div>`}
      </div>
      <p class="fin-foot">Google: janela do relatório ${g.window || ""}. Pra o "do mês" ficar exato, deixe o relatório do Google em "este mês". Total de cadastros no mês (todas as fontes): ${DOC.cadastros.total}.</p>`;
  }

  async function render_() { DOC = await load(); render(); }
  async function open() { if (typeof showView === "function") showView("financeiroView"); await render_(); }
  return { open, render: render_ };
})();
