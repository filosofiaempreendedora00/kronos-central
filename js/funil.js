/* ===========================================================================
   FUNIL — visualização do funil do SaaS na home (entre Métricas e Custos).

   Lê www/contexto/funil.json (sincronizado, PÚBLICO mas CIFRADO) e decifra com a
   chave do cofre — mesmo padrão do histórico da Delfos (meetings.json). Mostra o
   funil de ponta a ponta (tráfego → cadastro → ativação → pagante) como um funil
   de verdade: número absoluto por fase, a CONVERSÃO e o DROP entre cada fase, e a
   variação vs a leitura anterior (estamos melhorando ou piorando?).

   Snapshots gerados por `node scripts/ler-funil.mjs` (Supabase só-leitura + Meta
   best-effort). Cada execução grava um snapshot do dia e mantém o histórico.
   =========================================================================== */
const Funil = (() => {
  const PATH = "www/contexto/funil.json";

  const ratio = (a, b) => (b ? a / b : 0);
  const pctInt = (a, b) => Math.round(ratio(a, b) * 100);
  const fmtPct = (a, b) => { const v = ratio(a, b) * 100; return (v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)) + "%"; };
  const nf = (n) => Number(n).toLocaleString("pt-BR");
  const brl = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const fmtDate = (iso) => { if (!iso) return ""; const p = iso.split("-"); return p[2] + "/" + p[1]; };

  async function load() {
    if (typeof Sync === "undefined" || typeof Auth === "undefined" || !Auth.decryptJSON) return null;
    let res;
    try { res = await Sync.readJson(PATH); } catch (_) { return null; }
    const env = res && res.json; // Sync.readJson devolve { json, sha } — o envelope está em .json
    if (!env) return null;
    try {
      const doc = (env.v && env.ct) ? await Auth.decryptJSON(env) : env;
      return (doc && Array.isArray(doc.snapshots) && doc.snapshots.length) ? doc : null;
    } catch (_) { return null; }
  }

  /* Selo de variação vs leitura anterior (subir é sempre bom nestas fases). */
  function deltaTag(cur, prev) {
    if (prev == null || cur == null) return "";
    const d = cur - prev;
    if (d === 0) return `<span class="funnel__delta funnel__delta--flat">→</span>`;
    const up = d > 0;
    return `<span class="funnel__delta funnel__delta--${up ? "up" : "down"}">${up ? "▲ +" : "▼ "}${nf(Math.abs(d))}</span>`;
  }

  function render() {
    const grid = document.getElementById("funilGrid");
    const metaEl = document.getElementById("funilMeta");
    const insEl = document.getElementById("funilInsight");
    if (!grid) return;

    load().then((doc) => {
      if (!doc) {
        if (metaEl) metaEl.textContent = "";
        if (insEl) insEl.hidden = true;
        grid.innerHTML = `<p class="funil-empty">Sem leitura do funil ainda. Rode <code>node scripts/ler-funil.mjs</code> para gerar o 1º retrato.</p>`;
        return;
      }
      const cur = doc.snapshots[0];
      const prev = doc.snapshots[1] || null;
      const pMeta = prev && prev.meta;

      // Fases do funil (monotônicas: cada uma ⊆ a anterior). O tráfego entra só
      // se houver Meta; o verbo descreve a conversão PARA aquela fase.
      const stages = [];
      const clicks = cur.meta && cur.meta.clicks;
      if (clicks) stages.push({ label: "Tráfego · cliques pagos", value: clicks, prev: pMeta && pMeta.clicks, note: "Meta Ads · Google em breve" });
      stages.push({ label: "Cadastros", value: cur.cadastros, prev: prev && prev.cadastros, verb: "se cadastram" });
      stages.push({
        label: "Ativação · 1ª proposta", value: cur.ativacao, prev: prev && prev.ativacao, verb: "ativam",
        note: `${cur.ativacaoReal} com catálogo real · ${cur.ativacao - cur.ativacaoReal} com exemplo`,
      });
      stages.push({ label: "Pagantes", value: cur.pagantes, prev: prev && prev.pagantes, verb: "assinam" });

      // Largura da barra: escala sqrt (preserva a ordem e mantém todas as fases
      // visíveis mesmo com tráfego ordens de grandeza acima). Os números e as
      // conversões ao lado são exatos — a barra é só o gestalt do funil.
      const top = stages[0].value || 1;
      const widthOf = (v) => (v > 0 ? Math.max(6, Math.sqrt(v / top) * 100) : 0);

      let html = `<div class="funnel">`;
      stages.forEach((s, i) => {
        if (i > 0) {
          const prevV = stages[i - 1].value;
          const drop = prevV - s.value;
          html += `<div class="funnel__link">
            <span class="funnel__conv">${fmtPct(s.value, prevV)}</span> ${s.verb}
            <span class="funnel__dropsep">·</span>
            <span class="funnel__drop">−${nf(drop)} saem</span>
          </div>`;
        }
        html += `<div class="funnel__stage">
          <div class="funnel__head">
            <span class="funnel__label">${s.label}${s.note ? `<span class="funnel__note">${s.note}</span>` : ""}</span>
            <span class="funnel__numwrap"><span class="funnel__num">${nf(s.value)}</span>${deltaTag(s.value, s.prev == null ? null : s.prev)}</span>
          </div>
          <div class="funnel__track"><div class="funnel__bar" style="width:${widthOf(s.value)}%"></div></div>
        </div>`;
      });
      html += `</div>`;
      grid.innerHTML = html;

      if (metaEl) metaEl.textContent = `leitura de ${fmtDate(cur.date)} · contas de ${fmtDate(cur.period && cur.period.from)} a ${fmtDate(cur.period && cur.period.to)} · ${doc.snapshots.length} ${doc.snapshots.length === 1 ? "registro" : "registros"}`;

      if (insEl) {
        const ins = [];
        const tAtiv = pctInt(cur.ativacao, cur.cadastros);
        ins.push(`<b>Gargalo = ativação:</b> só <b>${tAtiv}%</b> dos cadastros geram a 1ª proposta — ${cur.cadastros - cur.ativacao} de ${cur.cadastros} não geram nada.`);
        if (cur.ativacaoReal < cur.ativacao) ins.push(`Qualidade: das ${cur.ativacao} ativações, só <b>${cur.ativacaoReal}</b> usou catálogo real — o resto gerou proposta de exemplo (lixo).`);
        if (clicks) ins.push(`Topo: ${nf(clicks)} cliques pagos → ${cur.cadastros} cadastros (<b>${fmtPct(cur.cadastros, clicks)}</b>). ⚠️ tráfego é ~97% mobile e o produto é desktop.`);
        if (cur.pagantes === 0) ins.push(`<b>0 pagantes</b> — o funil ainda não fechou. Gate de escala = a 1ª assinatura.`);
        else ins.push(`<b>${cur.pagantes} pagante(s)</b> · ${pctInt(cur.pagantes, cur.cadastros)}% dos cadastros.`);
        if (cur.meta && cur.meta.spend) ins.push(`Custo: ${brl(cur.meta.spend)} gastos → <b>${brl(cur.ativacao ? cur.meta.spend / cur.ativacao : 0)}/ativação</b> · ${brl(cur.cadastros ? cur.meta.spend / cur.cadastros : 0)}/cadastro.`);
        insEl.innerHTML = ins.map((s) => `<span class="funil-insight__line">${s}</span>`).join("");
        insEl.hidden = false;
      }
    });
  }

  return { render };
})();
